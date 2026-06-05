import React, { useState } from "react";
import { Folder, Plus, Trash2, FolderSync, Loader2, Play, Music } from "lucide-react";
import { Playlist } from "../types";

interface PlaylistsSidebarProps {
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  onSelectPlaylist: (playlistId: string | null) => void;
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onSyncPlaylistToDrive?: (playlistId: string) => void;
  isLoggedIn: boolean;
  playlistSyncStates?: Record<string, { current: number; total: number; status: string }>;
}

export const PlaylistsSidebar: React.FC<PlaylistsSidebarProps> = ({
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onSyncPlaylistToDrive,
  isLoggedIn,
  playlistSyncStates = {},
}) => {
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    onCreatePlaylist(newPlaylistName.trim());
    setNewPlaylistName("");
  };

  return (
    <div id="playlists-sidebar" className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-5 flex flex-col gap-6">
      {/* Create custom playlist */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Create Playlist
        </h3>
        <form onSubmit={handleSubmit} className="flex gap-2" id="create-playlist-form">
          <input
            type="text"
            placeholder="e.g. Chill Beats, Lo-Fi"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            type="submit"
            id="create-playlist-submit"
            className="p-1.5 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Playlist selections */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            My Playlists
          </h3>
          <span className="text-[10px] bg-slate-800/60 text-slate-400 px-2 py-0.5 rounded-full font-mono">
            {playlists.length}
          </span>
        </div>

        {playlists.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-850 rounded-xl bg-slate-950/20">
            <span className="text-xl inline-block text-slate-750 mb-2">♪</span>
            <p className="text-xs text-slate-500 px-4 font-sans leading-relaxed">
              No playlists created yet. Set up one above to begin organizing tracks!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
            {/* Global View / Search Results option */}
            <button
              onClick={() => onSelectPlaylist(null)}
              id="playlist-select-all"
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors ${
                selectedPlaylistId === null
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent"
              }`}
            >
              <Music className="w-3.5 h-3.5 text-emerald-500" />
              <span>All Search Results</span>
            </button>

            {playlists.map((playlist) => {
              const works = playlistSyncStates[playlist.id];
              const isSyncing = works && works.status === "syncing";
              const percent = works && works.total > 0 ? Math.round((works.current / works.total) * 100) : 0;
              const isSelected = selectedPlaylistId === playlist.id;

              return (
                <div
                  key={playlist.id}
                  id={`playlist-item-${playlist.id}`}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl transition-all border ${
                    isSelected
                      ? "bg-slate-900 border-slate-800 text-slate-100"
                      : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950/40"
                  }`}
                >
                  <button
                    onClick={() => onSelectPlaylist(playlist.id)}
                    className="flex-1 text-left flex items-center gap-2.5 min-w-0"
                  >
                    <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-emerald-400" : ""}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate leading-none">
                        {playlist.name}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 inline-block">
                        {playlist.songs.length} tracks
                      </span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {/* Sync option */}
                    {isLoggedIn && onSyncPlaylistToDrive && playlist.songs.length > 0 && (
                      <button
                        onClick={() => onSyncPlaylistToDrive(playlist.id)}
                        disabled={isSyncing}
                        className={`p-1 rounded-md text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors ${
                          isSyncing ? "text-emerald-400" : ""
                        }`}
                        title="Sync playlist folder to Google Drive"
                      >
                        {isSyncing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderSync className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {/* Delete option */}
                    <button
                      onClick={() => onDeletePlaylist(playlist.id)}
                      className="p-1 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                      title="Delete playlist"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Synchronizing process status logs */}
      {isLoggedIn &&
        Object.values(playlistSyncStates as Record<string, { current: number; total: number; status: string }>).some(
          (v) => v.status === "syncing"
        ) && (
          <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/80">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">
                Export Syncing
              </span>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            </div>
            {Object.entries(
              playlistSyncStates as Record<string, { current: number; total: number; status: string }>
            ).map(([id, state]) => {
              if (state.status !== "syncing") return null;
              const p = playlists.find((x) => x.id === id);
              return (
                <div key={id} className="mt-2 text-xs">
                  <div className="flex justify-between text-slate-300 font-sans truncate pr-1">
                    <span>{p?.name}</span>
                    <span className="font-mono text-[10px]">
                      {state.current}/{state.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-850 h-1 rounded-full mt-1 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${Math.round((state.current / state.total) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};
