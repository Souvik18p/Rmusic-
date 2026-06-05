import { Track, Playlist } from "./types";

/**
 * Searches for a folder with a specific name in Google Drive.
 * Return folder ID if found, null otherwise.
 */
export async function findFolderByName(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string | null> {
  try {
    let query = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("UNAUTHENTICATED");
      }
      const errDetail = await res.text();
      throw new Error(`Failed to find folder: ${res.statusText}. Detail: ${errDetail}`);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  } catch (error: any) {
    if (error.message === "UNAUTHENTICATED") {
      throw error;
    }
    console.error(`Error finding folder "${name}":`, error);
    return null;
  }
}

/**
 * Creates a folder inside Google Drive.
 */
export async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  try {
    const body: { name: string; mimeType: string; parents?: string[] } = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) {
      body.parents = [parentId];
    }

    const res = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("UNAUTHENTICATED");
      }
      const errDetail = await res.text();
      throw new Error(`Failed to create folder: ${res.statusText}. Detail: ${errDetail}`);
    }

    const data = await res.json();
    return data.id;
  } catch (error: any) {
    if (error.message !== "UNAUTHENTICATED") {
      console.error(`Error creating folder "${name}":`, error);
    }
    throw error;
  }
}

/**
 * Uploads a text or JSON file inside a specific Google Drive folder.
 */
export async function uploadJsonFile(
  accessToken: string,
  filename: string,
  data: any,
  parentFolderId: string
): Promise<string> {
  try {
    // Step 1: Create metadata
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: filename,
        parents: [parentFolderId],
        mimeType: "application/json",
      }),
    });

    if (!createRes.ok) {
      if (createRes.status === 401) {
        throw new Error("UNAUTHENTICATED");
      }
      const errDetail = await createRes.text();
      throw new Error(`Failed to create file metadata: ${createRes.statusText}. Detail: ${errDetail}`);
    }

    const fileMeta = await createRes.json();
    const fileId = fileMeta.id;

    // Step 2: Upload content using PATCH to write media data
    const contentBlob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: contentBlob,
      }
    );

    if (!uploadRes.ok) {
      if (uploadRes.status === 401) {
        throw new Error("UNAUTHENTICATED");
      }
      throw new Error(`Failed to upload file content: ${uploadRes.statusText}`);
    }

    return fileId;
  } catch (error: any) {
    if (error.message !== "UNAUTHENTICATED") {
      console.error(`Error uploading file "${filename}":`, error);
    }
    throw error;
  }
}

/**
 * Searches for an existing file with a specific name in Google Drive folder.
 * Return file ID if exists, null otherwise.
 */
export async function findFileInFolder(
  accessToken: string,
  filename: string,
  folderId: string
): Promise<string | null> {
  try {
    const query = `name = '${filename.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("UNAUTHENTICATED");
      }
      return null;
    }
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  } catch (e: any) {
    if (e.message === "UNAUTHENTICATED") {
      throw e;
    }
    console.error("Error looking up file:", e);
  }
  return null;
}

/**
 * Downloads audio file and uploads to Google Drive using standard two-step pipeline.
 * Runs in background state.
 */
export async function uploadAudioToDrive(
  accessToken: string,
  track: Track,
  parentFolderId: string,
  onStatusUpdate?: (status: string) => void
): Promise<string> {
  const filename = `${track.title.replace(/[\/\\?%*:|"<>]/g, "-")}.mp3`;

  try {
    onStatusUpdate?.("checking_exist");
    const existingFileId = await findFileInFolder(accessToken, filename, parentFolderId);
    if (existingFileId) {
      onStatusUpdate?.("instant_success");
      return existingFileId;
    }

    onStatusUpdate?.("fetching_source");
    // Fetch streaming link from Cobalt
    const cobaltRes = await fetch(`/api/get-audio?id=${track.id}`);
    if (!cobaltRes.ok) {
      throw new Error(`Server returned ${cobaltRes.status} fetching cobalt info`);
    }
    const cobaltData = await cobaltRes.json();
    if (!cobaltData.url) {
      throw new Error(cobaltData.text || "Failed to find audio streaming URL from Cobalt");
    }

    onStatusUpdate?.("downloading");
    // Download the MP3 through the proxy route to bypass CORS limitation
    const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(cobaltData.url)}`;
    const audioStreamRes = await fetch(proxyUrl);
    if (!audioStreamRes.ok) {
      throw new Error(`Proxy streaming route returned ${audioStreamRes.status}`);
    }

    const audioBlob = await audioStreamRes.blob();
    if (audioBlob.size === 0) {
      throw new Error("Downloaded audio file is empty.");
    }

    onStatusUpdate?.("uploading");
    // Step 1: Create metadata
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: filename,
        parents: [parentFolderId],
        mimeType: "audio/mpeg",
      }),
    });

    if (!createRes.ok) {
      if (createRes.status === 401) {
        throw new Error("UNAUTHENTICATED");
      }
      const errText = await createRes.text();
      throw new Error(`Drive file initialization failed: ${errText}`);
    }

    const fileMeta = await createRes.json();
    const fileId = fileMeta.id;

    // Step 2: Upload MP3 binary content
    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "audio/mpeg",
        },
        body: audioBlob,
      }
    );

    if (!uploadRes.ok) {
      if (uploadRes.status === 401) {
        throw new Error("UNAUTHENTICATED");
      }
      throw new Error(`Failed to upload audio binary: ${uploadRes.statusText}`);
    }

    onStatusUpdate?.("success");
    return fileId;
  } catch (error: any) {
    if (error.message !== "UNAUTHENTICATED") {
      console.error("Failed to complete audio sync to Drive:", error);
    }
    onStatusUpdate?.(error.message === "UNAUTHENTICATED" ? "error: UNAUTHENTICATED" : `error: ${error.message || "process error"}`);
    throw error;
  }
}
