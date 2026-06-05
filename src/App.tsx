import React, { useEffect, useState } from "react";
import {
  Search,
  Cloud,
  Check,
  FolderOpen,
  LogOut,
  Sparkles,
  Music,
  Disc,
  Play,
  Heart,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Plus,
} from "lucide-react";
import { initAuth, googleSignIn, logoutUser, CustomUser } from "./auth";
import { findFolderByName, createFolder, uploadAudioToDrive, uploadJsonFile } from "./driveService";
import { Track, Playlist } from "./types";

// Component imports
import { GsiButton } from "./components/GsiButton";
import { TrackItem } from "./components/TrackItem";
import { MiniPlayer } from "./components/MiniPlayer";
import { PlaylistsSidebar } from "./components/PlaylistsSidebar";

// YouTube search
import * as yt from "yt-search";

// Default tracks to fill in on startup for a beautiful rich UI
const SUGGESTED_QUERIES = ["Chill Lofi Beats", "Synthwave Retro", "Acoustic Pop Acoustic Coffee", "Ambient Sleep"];

export default function App() {
  // Auth state
  const [user, setUser] = useState<CustomUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Drive state
  const [musicFolderId, setMusicFolderId] = useState<string | null>(null);
  const [isFolderCreating, setIsFolderCreating] = useState(false);

  // Playback/Playlist states
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Player controls state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Drive background sync statuses
  const [individualSyncStatuses, setIndividualSyncStatuses] = useState<Record<string, string>>({});
  const [playlistSyncStates, setPlaylistSyncStates] = useState<
    Record<string, { current: number; total: number; status: string }>
  >({});

  // Bootstrap authentication and playlists on first launch
  useEffect(() => {
    // 1. Init Firebase Auth listener
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAuthToken(token);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setAuthToken(null);
        setNeedsAuth(true);
      }
    );

    // 2. Load playlists from local storage
    const savedPlaylists = localStorage.getItem("r_music_playlists_v1");
    if (savedPlaylists) {
      try {
        setPlaylists(JSON.parse(savedPlaylists));
      } catch (e) {
        console.error("Failed to parse playlists:", e);
      }
    }

    // 3. Trigger a quick initial suggestions search
    const randomDefault = SUGGESTED_QUERIES[Math.floor(Math.random() * SUGGESTED_QUERIES.length)];
    triggerSearch(randomDefault);

    return () => unsubscribe();
  }, []);

  // Save playlists locally whenever modified
  useEffect(() => {
    localStorage.setItem("r_music_playlists_v1", JSON.stringify(playlists));
  }, [playlists]);

  // Synchronize 'r music' folder structure when GDrive access token becomes active
  useEffect(() => {
    if (!authToken) {
      setMusicFolderId(null);
      return;
    }

    const initGDriveFolder = async () => {
      try {
        console.log("Checking folder 'r music' in Google Drive...");
        const existingId = await findFolderByName(authToken, "r music");
        if (existingId) {
          console.log("Google Drive 'r music' folder found with ID:", existingId);
          setMusicFolderId(existingId);
        } else {
          console.log("Creating new 'r music' parent folder in Google Drive...");
          setIsFolderCreating(true);
          const newId = await createFolder(authToken, "r music");
          setMusicFolderId(newId);
          console.log("Google Drive 'r music' folder created with ID:", newId);
        }
      } catch (err: any) {
        if (err.message === "UNAUTHENTICATED") {
          console.warn("Google Drive session expired or invalid. Access cleared.");
          handleLogout();
        } else {
          console.error("Failed to initialize main GDrive directory 'r music':", err);
        }
      } finally {
        setIsFolderCreating(false);
      }
    };

    initGDriveFolder();
  }, [authToken]);

  // Actions: User authentication
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAuthToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error("OAuth sign-in failed:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setUser(null);
      setAuthToken(null);
      setNeedsAuth(true);
      setMusicFolderId(null);
    } catch (err) {
      console.error("Sign-out failure:", err);
    }
  };

  // Actions: YouTube feeds search (Browser-based using yt-search)
  const triggerSearch = async (
    query: string,
    autoPlayFirst = false
  ) => {
    if (!query.trim()) return;

    setIsSearching(true);

    try {
      console.log("Searching YouTube for:", query);
      const results = await yt(query);
      
      if (!results || !results.videos) {
        throw new Error("No results found");
      }

      // Convert YouTube results to Track format
      const tracks: Track[] = results.videos.slice(0, 20).map((video: any) => ({
        id: video.videoId,
        title: video.title,
        uploader: video.author?.name || "Unknown Artist",
        duration: video.duration?.seconds || 0,
        url: video.url,
        thumbnail: video.thumbnail,
      }));

      setSearchResults(tracks);

      if (autoPlayFirst && tracks.length > 0) {
        setCurrentTrack(tracks[0]);
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Search failed:", err);
      alert("Search failed. Please try again.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerSearch(searchQuery, true);
  };

  // Actions: Playlists local state management
  const handleCreatePlaylist = (name: string) => {
    // Check duplication
    if (playlists.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      alert(`A playlist with the name "${name}" already exists.`);
      return;
    }

    const newPlaylist: Playlist = {
      id: `pl-${Date.now()}`,
      name: name,
      songs: [],
      dateCreated: new Date().toLocaleDateString(),
    };

    setPlaylists((prev) => [newPlaylist, ...prev]);
  };

  const handleDeletePlaylist = (playlistId: string) => {
    const confirmation = window.confirm("Are you sure you want to delete this playlist? This won't affect files previously exported to Google Drive.");
    if (!confirmation) return;

    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId(null);
    }
  };

  const handleAddTrackToPlaylist = (playlistId: string, track: Track) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        // Avoid duplicates within the same list
        if (pl.songs.some((s) => s.id === track.id)) return pl;
        return {
          ...pl,
          songs: [...pl.songs, track],
        };
      })
    );
  };

  const handleRemoveTrackFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        return {
          ...pl,
          songs: pl.songs.filter((s) => s.id !== trackId),
        };
      })
    );
  };

  // Actions: Music streaming sequence coordinators (Next / Prev)
  const getActiveTracklist = (): Track[] => {
    if (selectedPlaylistId === null) {
      return searchResults;
    }
    return playlists.find((p) => p.id === selectedPlaylistId)?.songs || [];
  };

  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentTrack(track);
      setIsPlaying(true);
    }
  };

  const handleNextTrack = () => {
    const list = getActiveTracklist();
    if (list.length === 0) return;

    if (isShuffle) {
      const randIdx = Math.floor(Math.random() * list.length);
      setCurrentTrack(list[randIdx]);
    } else {
      const currentIdx = list.findIndex((t) => t.id === currentTrack?.id);
      if (currentIdx === -1 || currentIdx === list.length - 1) {
        setCurrentTrack(list[0]);
      } else {
        setCurrentTrack(list[currentIdx + 1]);
      }
    }
    setIsPlaying(true);
  };

  const handlePrevTrack = () => {
    const list = getActiveTracklist();
    if (list.length === 0 || !currentTrack) return;

    const currentIdx = list.findIndex((t) => t.id === currentTrack.id);
    if (currentIdx === -1 || currentIdx === 0) {
      setCurrentTrack(list[list.length - 1]);
    } else {
      setCurrentTrack(list[currentIdx - 1]);
    }
    setIsPlaying(true);
  };

  // Actions: Google Drive sync
  const handleSaveTrackToDriveDirectly = async (track: Track) => {
    if (!authToken || !musicFolderId) {
      alert("Please sign in with Google to use the Google Drive cloud save feature.");
      return;
    }

    // Explicit confirmation for saving a single audio track
    const confirmSave = window.confirm(`Save "${track.title}" as an MP3 file directly into your Google Drive "r music" directory?`);
    if (!confirmSave) return;

    try {
      await uploadAudioToDrive(authToken, track, musicFolderId, (status) => {
        setIndividualSyncStatuses((prev) => ({
          ...prev,
          [track.id]: status,
        }));
      });
    } catch (e: any) {
      console.error(e);
      if (e.message === "UNAUTHENTICATED") {
        alert("Your Google Drive session has expired. Please sign in again.");
        handleLogout();
      } else {
        alert(`Cloud sync failed: ${e.message || "Unknown error"}`);
      }
    }
  };

  const handleSyncPlaylistToDrive = async (playlistId: string) => {
    if (!authToken || !musicFolderId) {
      alert("Please sign in with Google to enable organized playlist exports.");
      return;
    }

    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist || playlist.songs.length === 0) return;

    // Explicit validation & confirmation for folder mutations/write
    const confirmSync = window.confirm(
      `Synchronize playlist "${playlist.name}" into organized subfolders inside Google Drive? This will create a folder named "r music/${playlist.name}" and save all track files inside.`
    );
    if (!confirmSync) return;

    try {
      // 1. Create subfolder inside "r music"
      setPlaylistSyncStates((prev) => ({
        ...prev,
        [playlistId]: { current: 0, total: playlist.songs.length, status: "syncing" },
      }));

      console.log(`Locating playlist folder "${playlist.name}"...`);
      let playlistFolderId = await findFolderByName(authToken, playlist.name, musicFolderId);

      if (!playlistFolderId) {
        console.log(`Creating folder "r music/${playlist.name}"...`);
        playlistFolderId = await createFolder(authToken, playlist.name, musicFolderId);
      }

      // 2. Upload playlist definition metadata file
      console.log(`Exporting "playlist_metadata.json" into Google Drive...`);
      const meta = {
        playlistName: playlist.name,
        playlistId: playlist.id,
        createdDate: playlist.dateCreated,
        synchronizedDate: new Date().toLocaleDateString(),
        tracks: playlist.songs.map((s) => ({
          id: s.id,
          title: s.title,
          uploader: s.uploader,
          duration: s.duration,
          url: s.url,
        })),
      };

      await uploadJsonFile(authToken, "playlist_metadata.json", meta, playlistFolderId);

      // 3. Sync individual songs in background sequence
      for (let i = 0; i < playlist.songs.length; i++) {
        const song = playlist.songs[i];
        console.log(`Saving track [${i + 1}/${playlist.songs.length}]: ${song.title}`);

        try {
          await uploadAudioToDrive(authToken, song, playlistFolderId, (status) => {
            setIndividualSyncStatuses((prev) => ({ ...prev, [song.id]: status }));
          });
        } catch (songErr) {
          console.error(`Failed to export specific song: ${song.title}`, songErr);
        }

        setPlaylistSyncStates((prev) => ({
          ...prev,
          [playlistId]: {
            current: i + 1,
            total: playlist.songs.length,
            status: i + 1 === playlist.songs.length ? "success" : "syncing",
          },
        }));
      }

      alert(`Successfully synchronized "${playlist.name}" playlist folder inside Google Drive!`);
    } catch (error: any) {
      console.error(`Playlist export failed for ${playlist.name}:`, error);
      setPlaylistSyncStates((prev) => ({
        ...prev,
        [playlistId]: { current: 0, total: playlist.songs.length, status: `error: ${error.message}` },
      }));
      if (error.message === "UNAUTHENTICATED") {
        alert("Your Google Drive session has expired. Please sign in again.");
        handleLogout();
      } else {
        alert(`Playlist sync failed: ${error.message}`);
      }
    }
  };

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);
  const activeTracks = getActiveTracklist();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-28 relative overflow-x-hidden select-none">
      {/* Decorative ambient radial glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute top-[40%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-blue-500/3 blur-[140px] pointer-events-none"></div>

      {/* Main Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 md:px-12 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Disc className="w-5 h-5 text-slate-950 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white font-sans flex items-center gap-1.5 leading-none">
              r music
            </h1>
            <span className="text-[10px] text-emerald-400/80 font-mono tracking-widest mt-1 inline-block uppercase font-bold">
              Google Drive Cloud Streamer
            </span>
          </div>
        </div>

        {/* Authentication Right Actions bar */}
        <div className="flex items-center gap-4">
          {needsAuth ? (
            <div className="w-48">
              <GsiButton onClick={handleLogin} disabled={isLoggingIn} />
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-slate-900/60 p-2 rounded-xl border border-slate-800">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "Google Avatar"}
                  className="w-8 h-8 rounded-lg object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                  {user?.displayName?.substring(0, 1) || "User"}
                </div>
              )}
              <div className="hidden md:block max-w-[120px] text-xs">
                <p className="font-semibold text-slate-200 truncate leading-tight">
                  {user?.displayName || "Google User"}
                </p>
                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-emerald-400 font-mono truncate">
                  {musicFolderId ? (
                    <>
                      <Check className="w-3 h-3" /> Drive Linked
                    </>
                  ) : isFolderCreating ? (
                    "Connecting Drive..."
                  ) : (
                    "Init Sync..."
                  )}
                </div>
              </div>
              <button
                onClick={handleLogout}
                id="header-logout-btn"
                className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                title="Logout of Google Account"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 md:px-12 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Navigation / Playlists Sidebar */}
        <section className="lg:col-span-1 flex flex-col gap-6">
          <PlaylistsSidebar
            playlists={playlists}
            selectedPlaylistId={selectedPlaylistId}
            onSelectPlaylist={setSelectedPlaylistId}
            onCreatePlaylist={handleCreatePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onSyncPlaylistToDrive={handleSyncPlaylistToDrive}
            isLoggedIn={!!authToken}
            playlistSyncStates={playlistSyncStates}
          />

          {/* Quick Guide card if not logged in to Drive */}
          {needsAuth && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col gap-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg w-fit">
                <Cloud className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-200 leading-none">
                Unlock Google Drive Cloud Sync
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Sign in with Google to initialize the <strong>r music</strong> folder. Save individual track MP3s or synchronize whole playlists structure in one-click!
              </p>
              <button
                onClick={handleLogin}
                className="mt-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors origin-left hover:translate-x-1"
              >
                Connect Drive Now <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Dashboard Quick Stats Card if logged in */}
          {!needsAuth && musicFolderId && (
            <div className="bg-gradient-to-br from-slate-900/60 to-slate-950/60 p-5 rounded-2xl border border-slate-800/80 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-300">Google Drive Status</span>
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Target Directory</span>
                  <span className="font-semibold text-slate-200 bg-slate-950 px-2 py-0.5 rounded font-mono text-[10px]">
                    /r music
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Playlists Synced</span>
                  <span className="font-semibold text-slate-200 font-mono">
                    {playlists.filter((p) => playlistSyncStates[p.id]?.status === "success").length} /{" "}
                    {playlists.length}
                  </span>
                </div>
              </div>
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noreferrer"
                className="mt-1 text-center py-2.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-[11px] font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Browse Google Drive</span> <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </section>

        {/* Content Feeds Area */}
        <section className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Top Row search bar (only visible if we are on global view) */}
          {selectedPlaylistId === null ? (
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" /> Search YouTube Live Music Audio
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Type your favorite track, artist name, or vibes to explore YouTube audio feeds.
                </p>
              </div>

              <form onSubmit={handleSearchSubmit} className="flex gap-3" id="main-search-form">
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3 focus-within:border-emerald-500/50 transition-colors">
                  <Search className="w-5 h-5 text-slate-500 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search songs, artists, soundtracks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-550 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  id="search-button-submit"
                  disabled={isSearching}
                  className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer flex items-center gap-2"
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
              </form>

              {/* Suggested query fast tags */}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mr-1">
                  Pop Vibes:
                </span>
                {SUGGESTED_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setSearchQuery(q);
                      triggerSearch(q, true);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 hover:text-emerald-400 text-slate-400 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Playlist Header Detailed View
            <div className="bg-gradient-to-r from-emerald-950/20 to-slate-950 border border-slate-800/60 rounded-2xl p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-emerald-600 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
                  <FolderOpen className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold text-emerald-400 font-mono tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      Custom Playlist
                    </span>
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5" /> Created {selectedPlaylist?.dateCreated}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-white mt-1.5 tracking-tight">
                    {selectedPlaylist?.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 leading-none">
                    {selectedPlaylist?.songs.length || 0} tracks organized inside this compilation
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto self-end md:self-center justify-end">
                {authToken && selectedPlaylist && selectedPlaylist.songs.length > 0 && (
                  <button
                    onClick={() => handleSyncPlaylistToDrive(selectedPlaylist.id)}
                    className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <FolderOpen className="w-4 h-4" /> Export Playlist to Drive Subfolder
                  </button>
                )}
                <button
                  onClick={() => setSelectedPlaylistId(null)}
                  className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-350 text-xs font-semibold hover:text-slate-100 transition-colors"
                >
                  Return to Global Search
                </button>
              </div>
            </div>
          )}

          {/* Tracks feed header & count */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
              <h3 className="font-bold text-slate-300 flex items-center gap-2">
                <Music className="w-4 h-4 text-emerald-400 animate-pulse" />
                {selectedPlaylistId === null ? "YouTube Feed Results" : "Playlist Content Tracklist"}
              </h3>
              <span className="text-xs text-slate-500 font-mono">{activeTracks.length} items listed</span>
            </div>

            {/* Empty list placeholders */}
            {activeTracks.length === 0 ? (
              <div className="text-center py-20 bg-slate-950/20 border border-dashed border-slate-850 rounded-2xl">
                <span className="text-3xl text-slate-700 block mb-3">💽</span>
                <p className="font-semibold text-slate-300">
                  {selectedPlaylistId === null ? "Feed is empty." : "This playlist is currently empty."}
                </p>
                <p className="text-xs text-slate-550 max-w-sm mx-auto mt-2 leading-relaxed">
                  {selectedPlaylistId === null
                    ? "Enter search keywords in the search panel above to fetch real-time music audio items."
                    : "No songs have been added yet. Switch to 'All Search Results', find beautiful songs, and add them!"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1 gap-3">
                {activeTracks.map((track) => {
                  const syncStatus = individualSyncStatuses[track.id];
                  return (
                    <TrackItem
                      key={track.id}
                      track={track}
                      isActive={currentTrack?.id === track.id}
                      isPlaying={isPlaying}
                      onPlayClick={() => handlePlayTrack(track)}
                      onSaveToDrive={authToken ? () => handleSaveTrackToDriveDirectly(track) : undefined}
                      onRemoveFromPlaylist={
                        selectedPlaylistId
                          ? () => handleRemoveTrackFromPlaylist(selectedPlaylistId, track.id)
                          : undefined
                      }
                      playlists={playlists}
                      onAddToPlaylist={handleAddTrackToPlaylist}
                      isLoggedIn={!!authToken}
                      driveSyncStatus={syncStatus}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Global MiniPlayer sticky footer */}
      <MiniPlayer
        track={currentTrack}
        isPlaying={isPlaying}
        onPlayPauseToggle={setIsPlaying}
        onNextTrack={handleNextTrack}
        onPrevTrack={handlePrevTrack}
        isShuffle={isShuffle}
        onShuffleToggle={() => setIsShuffle(!isShuffle)}
        isRepeat={isRepeat}
        onRepeatToggle={() => setIsRepeat(!isRepeat)}
      />
    </div>
  );
}
