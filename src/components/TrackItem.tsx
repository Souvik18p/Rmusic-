import React, { useState } from "react";
import { Play, Pause, Trash2, Cloud, Check, Loader2, ListPlus } from "lucide-react";
import { Track, Playlist } from "../types";

interface TrackItemProps {
  track: Track;
  isPlaying: boolean;
  isActive: boolean;
  onPlayClick: () => void;
  onSaveToDrive?: () => void;
  onRemoveFromPlaylist?: () => void;
  playlists: Playlist[];
  onAddToPlaylist?: (playlistId: string, track: Track) => void;
  isLoggedIn: boolean;
  driveSyncStatus?: string;
}

export const TrackItem: React.FC<TrackItemProps> = ({
  track,
  isPlaying,
  isActive,
  onPlayClick,
  onSaveToDrive,
  onRemoveFromPlaylist,
  playlists,
  onAddToPlaylist,
  isLoggedIn,
  driveSyncStatus,
}) => {
  const [showPlaylistsDropdown, setShowPlaylistsDropdown] = useState(false);

  // Parse driveSyncStatus
  const isSyncing = driveSyncStatus === "fetching_source" || driveSyncStatus === "downloading" || driveSyncStatus === "uploading";
  const isSynced = driveSyncStatus === "success" || driveSyncStatus === "instant_success" || track.savedToDrive;

  return (
    <div
      id={`track-${track.id}`}
      className={`group flex items-center gap-4 p-4 rounded-xl transition-all duration-200 border border-slate-800/40 hover:border-emerald-500/30 hover:bg-slate-900/40 ${
        isActive ? "bg-slate-900/60 border-emerald-500/30" : "bg-slate-950/20"
      }`}
    >
      {/* Album Art / Thumbnail Container */}
      <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800 shadow-md">
        {track.thumbnail ? (
          <img
            src={track.thumbnail}
            alt={track.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-900 text-emerald-400">
            ♪
          </div>
        )}
        <button
          onClick={onPlayClick}
          id={`play-btn-${track.id}`}
          className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity duration-200 ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
          }`}
        >
          {isActive ? (
            isPlaying ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Dancing Equalizer Bars when NOT hovered */}
                <div className="group-hover:hidden flex items-end gap-[3px] h-6 justify-center pb-1">
                  <div className="w-[3px] bg-emerald-400 rounded-full animate-eq-1"></div>
                  <div className="w-[3px] bg-emerald-400 rounded-full animate-eq-2"></div>
                  <div className="w-[3px] bg-emerald-400 rounded-full animate-eq-3"></div>
                </div>
                {/* Pause Button shown ON hover */}
                <Pause className="hidden group-hover:block w-5 h-5 text-emerald-400 fill-emerald-400 animate-fade-in" />
              </div>
            ) : (
              <Play className="w-5 h-5 text-emerald-400 fill-emerald-400" />
            )
          ) : (
            <Play className="w-5 h-5 text-white fill-white" />
          )}
        </button>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={onPlayClick} style={{ cursor: "pointer" }}>
        <h4
          className={`font-semibold text-sm truncate font-sans tracking-tight ${
            isActive ? "text-emerald-400" : "text-slate-100"
          }`}
        >
          {track.title}
        </h4>
        <p className="text-xs text-slate-400 truncate mt-1">{track.uploader}</p>
      </div>

      {/* Duration */}
      <span className="text-xs font-mono text-slate-500 hidden sm:block shrink-0">{track.duration}</span>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 relative">
        {/* Playlists Adder Dropdown */}
        {onAddToPlaylist && playlists.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowPlaylistsDropdown(!showPlaylistsDropdown)}
              onBlur={() => setTimeout(() => setShowPlaylistsDropdown(false), 200)}
              id={`playlist-add-btn-${track.id}`}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              title="Add to playlist..."
            >
              <ListPlus className="w-4 h-4" />
            </button>

            {showPlaylistsDropdown && (
              <div className="absolute right-0 bottom-10 z-30 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 animate-fade-in origin-bottom-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-2 py-1">
                  Add Track to:
                </p>
                <div className="max-h-40 overflow-y-auto mt-1 custom-scrollbar">
                  {playlists.map((playlist) => {
                    const alreadyIn = playlist.songs.some((s) => s.id === track.id);
                    return (
                      <button
                        key={playlist.id}
                        onClick={() => onAddToPlaylist(playlist.id, track)}
                        className={`w-full text-left font-medium text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                          alreadyIn
                            ? "text-slate-500 bg-slate-950/20 cursor-default"
                            : "text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-400"
                        }`}
                        disabled={alreadyIn}
                      >
                        <span className="truncate">{playlist.name}</span>
                        {alreadyIn && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Save to Drive */}
        {isLoggedIn && onSaveToDrive && (
          <button
            onClick={onSaveToDrive}
            disabled={isSyncing}
            id={`drive-sync-btn-${track.id}`}
            className={`p-2 rounded-lg transition-colors relative ${
              isSynced
                ? "text-emerald-400"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
            title={
              isSynced
                ? "Saved to Google Drive r music folder"
                : isSyncing
                ? "Exporting to Google Drive..."
                : "Save Track directly to Google Drive"
            }
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : isSynced ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Cloud className="w-4 h-4" />
            )}
          </button>
        )}

        {/* Remove Button for Playlist management */}
        {onRemoveFromPlaylist && (
          <button
            onClick={onRemoveFromPlaylist}
            id={`remove-playlist-track-btn-${track.id}`}
            className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove from Playlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
