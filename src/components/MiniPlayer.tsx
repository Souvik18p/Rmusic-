import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, VolumeX, Loader2 } from "lucide-react";
import { Track } from "../types";

interface MiniPlayerProps {
  track: Track | null;
  isPlaying: boolean;
  onPlayPauseToggle: (isPlayingState: boolean) => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  isShuffle: boolean;
  onShuffleToggle: () => void;
  isRepeat: boolean;
  onRepeatToggle: () => void;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  track,
  isPlaying,
  onPlayPauseToggle,
  onNextTrack,
  onPrevTrack,
  isShuffle,
  onShuffleToggle,
  isRepeat,
  onRepeatToggle,
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const [ytReady, setYtReady] = useState(false);

  const playerContainerId = "youtube-player-element";

  // Load YouTube Iframe API Script once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYtReady(true);
      return;
    }

    const existingScript = document.getElementById("youtube-iframe-api-script");
    if (!existingScript) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousCallback) previousCallback();
      setYtReady(true);
    };
  }, []);

  // Sync state & events on track update
  useEffect(() => {
    if (!track || !ytReady) return;

    let destroyed = false;

    const createPlayer = () => {
      if (destroyed) return;

      // If player already exists, cue/load the video directly
      if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
        setIsLoading(true);
        try {
          ytPlayer.loadVideoById({
            videoId: track.id,
            suggestedQuality: "tiny",
          });
          if (isPlaying) {
            ytPlayer.playVideo();
          } else {
            ytPlayer.pauseVideo();
          }
        } catch (e) {
          console.warn("Cue video error, re-instantiating:", e);
        }
        return;
      }

      // Check if player container element is available in DOM
      const elementExists = document.getElementById(playerContainerId);
      if (!elementExists) return;

      try {
        const playerInstance = new window.YT.Player(playerContainerId, {
          height: "0",
          width: "0",
          videoId: track.id,
          playerVars: {
            autoplay: isPlaying ? 1 : 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (destroyed) {
                event.target.destroy();
                return;
              }
              setYtPlayer(event.target);
              event.target.setVolume(isMuted ? 0 : volume * 100);
              if (isPlaying) {
                event.target.playVideo();
              }
            },
            onStateChange: (event: any) => {
              if (destroyed) return;
              const state = event.data;
              // 0: ENDED, 1: PLAYING, 2: PAUSED, 3: BUFFERING, -1: UNSTARTED, 5: CUED
              if (state === 0) {
                if (isRepeat) {
                  event.target.seekTo(0);
                  event.target.playVideo();
                } else {
                  onNextTrack();
                }
              } else if (state === 1) {
                setIsLoading(false);
              } else if (state === 3) {
                setIsLoading(true);
              }
            },
            onError: (event: any) => {
              console.error("YouTube embedded player error:", event.data);
              setIsLoading(false);
              onNextTrack();
            },
          },
        });
      } catch (err) {
        console.error("Failed to create YT Player instance:", err);
      }
    };

    // Instantiate with a short paint delay so DOM container is ready
    const timer = setTimeout(() => {
      createPlayer();
    }, 150);

    return () => {
      destroyed = true;
      clearTimeout(timer);
    };
  }, [track, ytReady]);

  // Handle Play/Pause side-effects
  useEffect(() => {
    if (!ytPlayer || typeof ytPlayer.playVideo !== "function") return;
    try {
      if (isPlaying) {
        ytPlayer.playVideo();
      } else {
        ytPlayer.pauseVideo();
      }
    } catch (e) {
      console.warn("PlayPause sync error:", e);
    }
  }, [isPlaying, ytPlayer]);

  // Sync mute state & volume level
  useEffect(() => {
    if (!ytPlayer || typeof ytPlayer.setVolume !== "function") return;
    try {
      if (isMuted) {
        ytPlayer.setVolume(0);
      } else {
        ytPlayer.setVolume(volume * 100);
      }
    } catch (e) {
      console.warn("Volume sync error:", e);
    }
  }, [volume, isMuted, ytPlayer]);

  // Periodically query current position & duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (ytPlayer && isPlaying && !isLoading) {
      interval = setInterval(() => {
        try {
          if (typeof ytPlayer.getCurrentTime === "function") {
            setCurrentTime(ytPlayer.getCurrentTime());
          }
          if (typeof ytPlayer.getDuration === "function") {
            setDuration(ytPlayer.getDuration());
          }
        } catch (e) {
          // Player reference could be unmounted/stale
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [ytPlayer, isPlaying, isLoading]);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (ytPlayer && typeof ytPlayer.seekTo === "function") {
      try {
        ytPlayer.seekTo(val, true);
      } catch (err) {
        console.warn("Seeking error:", err);
      }
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!track) return null;

  return (
    <div
      id="main-mini-player"
      className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 border-t border-slate-800 backdrop-blur-xl py-4 px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl transition-all duration-300"
    >
      {/* Embedded YouTube Iframe Target Container */}
      <div className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none">
        <div id={playerContainerId}></div>
      </div>

      {/* Track info block */}
      <div className="flex items-center gap-4 w-full md:w-1/4">
        {track.thumbnail && (
          <img
            src={track.thumbnail}
            alt={track.title}
            className={`w-12 h-12 rounded-lg object-cover bg-slate-900 border border-slate-800 shadow-md ${
              isPlaying ? "animate-pulse" : ""
            }`}
            referrerPolicy="no-referrer"
          />
        )}
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-white truncate font-sans tracking-tight">{track.title}</h4>
          <p className="text-xs text-slate-400 truncate mt-1">{track.uploader}</p>
        </div>
      </div>

      {/* Main audio controls */}
      <div className="flex flex-col items-center gap-2 w-full md:w-2/4">
        <div className="flex items-center gap-4">
          {/* Shuffle Mode */}
          <button
            onClick={onShuffleToggle}
            id="player-shuffle-btn"
            className={`p-2 rounded-lg transition-colors ${
              isShuffle ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          {/* Prev Track */}
          <button
            onClick={onPrevTrack}
            id="player-prev-btn"
            className="p-2 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          {/* Play/Pause center toggle */}
          <button
            onClick={() => onPlayPauseToggle(!isPlaying)}
            disabled={isLoading}
            id="player-play-pause-btn"
            className="w-11 h-11 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 disabled:bg-slate-700 shadow-lg shadow-emerald-500/20"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current text-slate-950" />
            ) : (
              <Play className="w-5 h-5 fill-current text-slate-950 translate-x-[1px]" />
            )}
          </button>

          {/* Next Track */}
          <button
            onClick={onNextTrack}
            id="player-next-btn"
            className="p-2 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          {/* Repeat Mode */}
          <button
            onClick={onRepeatToggle}
            id="player-repeat-btn"
            className={`p-2 rounded-lg transition-colors ${
              isRepeat ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Progress seek bar */}
        <div className="flex items-center gap-3 w-full max-w-md">
          <span className="text-[10px] font-mono text-slate-500 w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeekChange}
            id="player-seek"
            className="flex-1 accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer max-w-md focus:outline-none"
          />
          <span className="text-[10px] font-mono text-slate-500 w-10">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Volume control right rail */}
      <div className="flex items-center gap-3 w-full md:w-1/4 justify-end md:visible">
        <button
          onClick={() => setIsMuted(!isMuted)}
          id="player-mute-btn"
          className="text-slate-400 hover:text-white transition-colors"
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            setVolume(parseFloat(e.target.value));
            setIsMuted(false);
          }}
          id="player-volume-slider"
          className="w-20 accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer focus:outline-none"
        />

        {/* Custom Visualizer Bars as micro-animation */}
        <div className="flex items-end gap-[3px] h-5 w-6 pl-2 self-center pb-0.5">
          <div
            className={`w-[2.5px] bg-emerald-500 rounded-full ${
              isPlaying && !isLoading ? "animate-eq-1" : "h-1"
            }`}
          ></div>
          <div
            className={`w-[2.5px] bg-emerald-400 rounded-full ${
              isPlaying && !isLoading ? "animate-eq-2" : "h-1"
            }`}
          ></div>
          <div
            className={`w-[2.5px] bg-emerald-500 rounded-full ${
              isPlaying && !isLoading ? "animate-eq-3" : "h-1"
            }`}
          ></div>
        </div>
      </div>
    </div>
  );
};
