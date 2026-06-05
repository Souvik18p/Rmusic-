declare global {
  interface Window {
    google: any;
  }
}

export interface CustomUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

// Global cached values during app lifecycle
let cachedAccessToken: string | null = null;
let cachedUser: CustomUser | null = null;

// Dynamic script loader for the Google GIS SDK
export function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.getElementById("gsi-sdk");
    if (existing) {
      const interval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      return;
    }
    const script = document.createElement("script");
    script.id = "gsi-sdk";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = (err) => {
      reject(new Error("Failed to load Google Identity Services SDK script."));
    };
    document.head.appendChild(script);
  });
}

// Fetch details from the Google Userinfo API
async function fetchUserInfo(accessToken: string): Promise<CustomUser> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error("Failed to load user profile info from Google Userinfo API");
  }
  const data = await response.json();
  return {
    uid: data.sub || data.email || "gsi-user",
    email: data.email || null,
    displayName: data.name || data.given_name || "Google User",
    photoURL: data.picture || null,
  };
}

// Initialize the Auth state listener (must be called once during App initialization)
export const initAuth = (
  onAuthSuccess?: (user: CustomUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  const savedToken = sessionStorage.getItem("gdrive_access_token");
  const savedUserString = sessionStorage.getItem("gdrive_user_profile");

  if (savedToken && savedUserString) {
    try {
      const user = JSON.parse(savedUserString) as CustomUser;
      cachedAccessToken = savedToken;
      cachedUser = user;
      if (onAuthSuccess) {
        setTimeout(() => {
          onAuthSuccess(user, savedToken);
        }, 0);
      }
    } catch (e) {
      sessionStorage.removeItem("gdrive_access_token");
      sessionStorage.removeItem("gdrive_user_profile");
      if (onAuthFailure) {
        setTimeout(() => onAuthFailure(), 0);
      }
    }
  } else if (savedToken) {
    fetchUserInfo(savedToken)
      .then((user) => {
        cachedAccessToken = savedToken;
        cachedUser = user;
        sessionStorage.setItem("gdrive_user_profile", JSON.stringify(user));
        if (onAuthSuccess) onAuthSuccess(user, savedToken);
      })
      .catch(() => {
        sessionStorage.removeItem("gdrive_access_token");
        sessionStorage.removeItem("gdrive_user_profile");
        if (onAuthFailure) onAuthFailure();
      });
  } else {
    cachedAccessToken = null;
    cachedUser = null;
    if (onAuthFailure) {
      setTimeout(() => onAuthFailure(), 0);
    }
  }

  // Returns unsubscribe/noop function to match standard pattern
  return () => {};
};

// Start Google sign-in flow
export const googleSignIn = async (): Promise<{ user: CustomUser; accessToken: string } | null> => {
  await loadGsiScript();

  return new Promise((resolve, reject) => {
    try {
      const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID || "";
      if (!clientId) {
        reject(
          new Error("VITE_GOOGLE_CLIENT_ID environment variable is missing. Check your .env.local configuration.")
        );
        return;
      }

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(`Google login failed: ${response.error_description || response.error}`));
            return;
          }

          const accessToken = response.access_token;
          if (!accessToken) {
            reject(new Error("No access token returned from Google Identity Services."));
            return;
          }

          try {
            const user = await fetchUserInfo(accessToken);
            cachedAccessToken = accessToken;
            cachedUser = user;

            sessionStorage.setItem("gdrive_access_token", accessToken);
            sessionStorage.setItem("gdrive_user_profile", JSON.stringify(user));

            resolve({ user, accessToken });
          } catch (err: any) {
            reject(err);
          }
        },
        error_callback: (err: any) => {
          reject(new Error(err.message || "Failed to initialize Google OAuth flow"));
        },
      });

      client.requestAccessToken();
    } catch (e: any) {
      reject(e);
    }
  });
};

// Retrieve current access token
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  return sessionStorage.getItem("gdrive_access_token");
};

// Sign out user and clear caches
export const logoutUser = async () => {
  cachedAccessToken = null;
  cachedUser = null;
  sessionStorage.removeItem("gdrive_access_token");
  sessionStorage.removeItem("gdrive_user_profile");
};
