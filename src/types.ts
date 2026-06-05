export interface Track {
  id: string;
  title: string;
  uploader: string;
  duration: string;
  durationSeconds?: number;
  url: string;
  thumbnail?: string;
  savedToDrive?: boolean;
  driveFileId?: string;
}

export interface Playlist {
  id: string;
  name: string;
  songs: Track[];
  driveFolderId?: string;
  isSyncing?: boolean;
  dateCreated: string;
}

export interface DriveFolderInfo {
  id: string;
  name: string;
}
