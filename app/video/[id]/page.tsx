'use client';

import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEFAULT_VIDEOS, getSimulatedAIResponse } from '../../data/videos';
import { VideoItem, Message } from '../../types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

export default function VideoChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  // Local state for the selected video
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Player state
  const [player, setPlayer] = useState<any>(null);
  const [playerState, setPlayerState] = useState<number>(-1); // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [activeClip, setActiveClip] = useState<{ start: number; end: number } | null>(null);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  // Load video from localStorage or defaults
  // Load video from MongoDB with local fallback
  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/videos/${id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.video) {
            const v = data.video;
            const mappedVideo: VideoItem = {
              id: v.videoId || v._id,
              youtubeId: v.youtubeId,
              title: v.title,
              thumbnail: v.thumbnail,
              status: v.status,
              addedAt: v.createdAt || v.addedAt || new Date().toISOString(),
              duration: v.duration || 0,
              transcript: v.transcript || [],
              chatHistory: v.chatHistory || []
            };
            setVideo(mappedVideo);
            if (mappedVideo.duration) {
              setDuration(mappedVideo.duration);
            }
            setHasHydrated(true);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to load video from MongoDB', err);
      }

      // Fallback to local default videos if database call fails or isn't populated
      const currentVideo = DEFAULT_VIDEOS.find((v) => v.id === id || v.youtubeId === id);
      if (currentVideo) {
        setVideo(currentVideo);
        if (currentVideo.duration) {
          setDuration(currentVideo.duration);
        }
      } else {
        // Fallback for new raw ID
        const newRawVideo: VideoItem = {
          id: id,
          youtubeId: id,
          title: `Processed Video (${id})`,
          thumbnail: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
          status: 'ready',
          addedAt: new Date().toISOString(),
          duration: 300,
          transcript: [
            { start: 0, duration: 15, text: 'Welcome to this video presentation and walkthrough.' },
            { start: 60, duration: 20, text: 'We begin by setting up the project requirements and initial configuration.' },
            { start: 120, duration: 25, text: 'Next, let us dive into the core implementation details and main functions.' },
            { start: 180, duration: 30, text: 'Now we demonstrate the primary search capabilities and layout details.' },
            { start: 240, duration: 25, text: 'Let us discuss performance optimizations and caching strategies.' }
          ],
          chatHistory: [
            {
              id: `msg-${Date.now()}-init`,
              role: 'assistant',
              content: 'Hi! I am ready to help you analyze this video. Ask me anything, and I will search the transcript for you.'
            }
          ]
        };
        setVideo(newRawVideo);
      }
      setHasHydrated(true);
    };

    fetchVideo();
  }, [id]);

  // Sync chat history changes back to MongoDB
  const updateChatHistory = async (updatedMessages: Message[]) => {
    if (!video) return;
    const updatedVideo = { ...video, chatHistory: updatedMessages };
    setVideo(updatedVideo);

    try {
      await fetch(`/api/videos/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatHistory: updatedMessages })
      });
    } catch (e) {
      console.error('Error saving chat history to DB', e);
    }
  };

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [video?.chatHistory, isAiLoading]);

  // Initialize YouTube Player
  useEffect(() => {
    if (!video || !hasHydrated) return;

    let activePlayer: any = null;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return;

      // Clean up any existing iframe before creating a new one
      const container = document.getElementById('yt-player-container');
      if (container) {
        container.innerHTML = '<div id="youtube-player"></div>';
      }

      activePlayer = new window.YT.Player('youtube-player', {
        videoId: video.youtubeId,
        playerVars: {
          autoplay: 0,
          controls: 0, // Disable native YT controls
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          showinfo: 0,
          fs: 0,
          iv_load_policy: 3
        },
        events: {
          onReady: (event: any) => {
            setPlayer(event.target);
            setDuration(event.target.getDuration() || video.duration || 300);
          },
          onStateChange: (event: any) => {
            setPlayerState(event.data);
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      // Inject script if not loaded
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    }

    return () => {
      if (activePlayer && activePlayer.destroy) {
        activePlayer.destroy();
      }
    };
  }, [video?.youtubeId, hasHydrated]);

  // Watch playback position
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (player && playerState === 1) { // 1 = playing
      timer = setInterval(() => {
        const curr = player.getCurrentTime();
        setCurrentTime(curr);

        // Check if out of active clip range
        if (activeClip && (curr < activeClip.start || curr > activeClip.end)) {
          // Loop back to start of clip
          player.seekTo(activeClip.start, true);
          setCurrentTime(activeClip.start);
        }
      }, 200);
    }
    return () => clearInterval(timer);
  }, [player, playerState, activeClip]);

  // Seek and Play controls
  const handleSeek = (seconds: number) => {
    setCurrentTime(seconds);
    if (player) {
      player.seekTo(seconds, true);
    }
  };

  const handlePlayPause = () => {
    if (!player) return;
    if (playerState === 1) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  // Convert seconds to format MM:SS
  const formatTime = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle timestamp click
  const handleTimestampClick = (seconds: number) => {
    handleSeek(seconds);
    if (player) {
      player.playVideo();
    }
  };

  // Multi-chunk selection state and clip download handlers
  const [selectedChunks, setSelectedChunks] = useState<Record<string, any[]>>({});
  const [downloadingClipId, setDownloadingClipId] = useState<string | null>(null);

  const handleDownloadClip = async (segments: { start: number; end: number; text?: string }[]) => {
    if (!video) return;
    setDownloadingClipId(segments.map(s => `${s.start}-${s.end}`).join(','));
    try {
      const res = await fetch(`/api/videos/${video.youtubeId || video.id}/download-clip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ segments })
      });

      if (!res.ok) {
        throw new Error(`Failed to download clip: ${res.statusText}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const isMerged = segments.length > 1;
      const fileExt = video.status === 'ready' ? '.mp4' : '.webm';
      a.download = `${isMerged ? 'merged-clip' : 'clip'}-${Math.round(segments[0].start)}-to-${Math.round(segments[segments.length - 1].end)}${fileExt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert(`Clip download failed: ${err.message || err}. Ensure FFmpeg is running on the backend.`);
    } finally {
      setDownloadingClipId(null);
    }
  };

  // Handle AI question submission
  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !video || isAiLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: chatInput.trim()
    };

    const historyWithUser = [...video.chatHistory, userMessage];
    setVideo(prev => prev ? { ...prev, chatHistory: historyWithUser } : null);
    setChatInput('');
    setIsAiLoading(true);

    try {
      const res = await fetch(`/api/videos/${video.youtubeId || video.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: userMessage })
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch AI reply: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.success && data.video) {
        const v = data.video;
        const mappedVideo: VideoItem = {
          id: v.videoId || v._id,
          youtubeId: v.youtubeId,
          title: v.title,
          thumbnail: v.thumbnail,
          status: v.status,
          addedAt: v.createdAt || v.addedAt || new Date().toISOString(),
          duration: v.duration || 0,
          transcript: v.transcript || [],
          chatHistory: v.chatHistory || []
        };
        setVideo(mappedVideo);
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-ai-err`,
        role: 'assistant',
        content: `Error connecting to video intelligence model: ${err.message || err}`
      };
      setVideo(prev => prev ? { ...prev, chatHistory: [...historyWithUser, errorMessage] } : null);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Generate and highlight a clip from message metadata
  const handleHighlightClip = (msg: Message) => {
    if (msg.clipStart !== undefined && msg.clipEnd !== undefined) {
      setActiveClip({ start: msg.clipStart, end: msg.clipEnd });
      handleSeek(msg.clipStart);
      if (player) {
        player.playVideo();
      }
    }
  };

  // Parse text content to render clickable [MM:SS] timestamps
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(\[\d{2}:\d{2}\])/g);
    return parts.map((part, i) => {
      const isTimestamp = /^\[\d{2}:\d{2}\]$/.test(part);
      if (isTimestamp) {
        const timeStr = part.slice(1, -1); // Remove "[" and "]"
        const [m, s] = timeStr.split(':').map(Number);
        const totalSeconds = m * 60 + s;
        return (
          <button
            key={i}
            onClick={() => handleTimestampClick(totalSeconds)}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 font-mono text-xs transition-all duration-200 font-semibold cursor-pointer active:scale-95 shadow-sm"
          >
            <svg className="w-3 h-3 text-indigo-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            {timeStr}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  if (!hasHydrated || !video) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#080b11]">
        <svg className="animate-spin h-10 w-10 text-indigo-500 mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm font-semibold text-zinc-400">Loading analysis studio...</span>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#080b11]">
      <style dangerouslySetInnerHTML={{ __html: `
        #yt-player-container iframe {
          width: 100% !important;
          height: 100% !important;
          position: absolute;
          top: 0;
          left: 0;
          border: none;
        }
      `}} />
      {/* Top Banner layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Panel - Chat interface (35% Width) */}
        <aside className="w-full lg:w-[35%] flex flex-col border-r border-white/5 bg-slate-950/40 backdrop-blur-md h-full relative">
          
          {/* Header */}
          <div className="p-4 border-b border-white/5 flex flex-col gap-3 shrink-0">
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors w-fit font-semibold"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </button>
            <h1 className="text-base font-bold text-white line-clamp-2 leading-snug" title={video.title}>
              {video.title}
            </h1>
          </div>

          {/* Message Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {video.chatHistory.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                {/* Role indicator */}
                <span className="text-[10px] text-zinc-500 font-semibold mb-1 uppercase tracking-wider">
                  {msg.role === 'user' ? 'User' : 'VidSearch AI'}
                </span>

                {/* Message bubble */}
                <div
                  className={`p-3.5 rounded-2xl text-sm leading-relaxed border ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white border-indigo-500/20 rounded-tr-none'
                      : 'glass-panel text-zinc-200 border-white/5 rounded-tl-none'
                  }`}
                >
                  <p className="space-y-2">{renderMessageContent(msg.content)}</p>
                </div>

                {/* AI Auxiliary Actions */}
                {msg.role === 'assistant' && (
                  <div className="w-full mt-3 flex flex-col gap-2.5">

                    {/* Semantic / Fallback Chunk Cards */}
                    {msg.chunks && msg.chunks.length > 0 && (
                      <div className="w-full flex flex-col gap-2 p-3 rounded-xl bg-zinc-950/40 border border-white/5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${msg.type === 'relevant' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                            {msg.type === 'relevant' ? 'Relevant Segments Found' : 'Suggested Timeline Fallback'}
                          </span>
                        </div>

                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {msg.chunks.map((chunk, cIdx) => {
                            const isSelected = (selectedChunks[msg.id] || []).some(
                              s => s.start === chunk.start && s.end === chunk.end
                            );
                            return (
                              <div key={cIdx} className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex flex-col gap-2 hover:bg-white/10 transition-colors">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs text-zinc-300 leading-normal font-medium">{chunk.text}</span>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const current = selectedChunks[msg.id] || [];
                                      let next;
                                      if (e.target.checked) {
                                        next = [...current, chunk];
                                      } else {
                                        next = current.filter(s => s.start !== chunk.start || s.end !== chunk.end);
                                      }
                                      setSelectedChunks({ ...selectedChunks, [msg.id]: next });
                                    }}
                                    className="w-4 h-4 rounded border-white/10 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0 mt-0.5"
                                  />
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                                  <span className="flex items-center gap-1 font-semibold">
                                    {formatTime(chunk.start)} - {formatTime(chunk.end)}
                                    {chunk.score !== undefined && chunk.score > 0 && (
                                      <span className="text-emerald-400 ml-1">({Math.round(chunk.score * 100)}% match)</span>
                                    )}
                                  </span>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleTimestampClick(chunk.start)}
                                      className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors cursor-pointer"
                                    >
                                      Seek & Play
                                    </button>
                                    <span className="text-zinc-600">|</span>
                                    <button
                                      onClick={() => handleDownloadClip([chunk])}
                                      disabled={downloadingClipId === `${chunk.start}-${chunk.end}`}
                                      className="text-purple-400 hover:text-purple-300 font-bold transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                      {downloadingClipId === `${chunk.start}-${chunk.end}` ? 'Downloading...' : 'Download Clip'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Merging Multi-clip Actions */}
                        {(selectedChunks[msg.id] || []).length > 1 && (
                          <button
                            onClick={() => handleDownloadClip(selectedChunks[msg.id])}
                            disabled={!!downloadingClipId}
                            className="w-full mt-1.5 py-2 px-3 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-xs hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                            {downloadingClipId ? 'Merging & Downloading...' : `Download Merged Clip (${(selectedChunks[msg.id] || []).length} segments)`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* AI thinking state */}
            {isAiLoading && (
              <div className="flex flex-col items-start max-w-[80%] mr-auto">
                <span className="text-[10px] text-zinc-500 font-semibold mb-1 uppercase tracking-wider">VidSearch AI</span>
                <div className="glass-panel p-4 rounded-2xl rounded-tl-none border border-white/5 flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-zinc-400 font-medium ml-1">Analyzing transcripts...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Bottom Chat Input */}
          <form onSubmit={handleSendQuestion} className="p-4 border-t border-white/5 bg-slate-950/20 shrink-0">
            <div className="relative flex items-center rounded-xl overflow-hidden border border-white/5 focus-within:border-indigo-500/35 transition-colors bg-zinc-950/60 pr-2">
              <input
                type="text"
                placeholder="Ask a question about this video..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isAiLoading}
                className="w-full bg-transparent px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isAiLoading || !chatInput.trim()}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
                  chatInput.trim() && !isAiLoading
                    ? 'bg-indigo-500 hover:bg-indigo-600 text-white cursor-pointer active:scale-95'
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </form>
        </aside>

        {/* Right Panel - Video Player and Custom Control Dashboard (65% Width) */}
        <main className="w-full lg:w-[65%] flex flex-col bg-slate-950 h-full p-4 sm:p-8 justify-center items-center">
          
          <div className="w-full max-w-4xl flex flex-col gap-6">
            
            {/* Active Clip Banner */}
            {activeClip && (
              <div className="w-full py-2.5 px-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between animate-fade-in shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  <span className="text-xs font-semibold text-indigo-300">
                    Active Clip Range Locked: {formatTime(activeClip.start)} - {formatTime(activeClip.end)}
                  </span>
                </div>
                <button
                  onClick={() => setActiveClip(null)}
                  className="text-[10px] font-bold text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors border border-white/5 cursor-pointer"
                >
                  Clear Clip Limit
                </button>
              </div>
            )}

            {/* Video Player Box Frame */}
            <div className="w-full aspect-video rounded-3xl overflow-hidden glass-panel-heavy border border-white/5 shadow-2xl relative">
              {/* YouTube Player Iframe Target */}
              <div id="yt-player-container" className="w-full h-full">
                <div id="youtube-player"></div>
              </div>

              {/* Overlay Loader prior to player ready */}
              {!player && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3">
                  <svg className="animate-spin h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-xs text-zinc-500 font-semibold tracking-wide">Syncing player stream...</span>
                </div>
              )}
            </div>

            {/* Custom Control Deck Board */}
            <div className="w-full glass-panel rounded-2xl p-5 border border-white/5 flex flex-col gap-4 shadow-xl">
              
              {/* Custom Range Timeline Bar */}
              <div className="flex flex-col gap-1.5 w-full">
                <div className="relative w-full h-2 bg-zinc-900 rounded-full flex items-center">
                  
                  {/* Clip range highlighted overlay */}
                  {activeClip && duration > 0 && (
                    <div
                      className="absolute h-full bg-indigo-500/35 border-l border-r border-indigo-400/50 rounded-sm"
                      style={{
                        left: `${(activeClip.start / duration) * 100}%`,
                        width: `${((activeClip.end - activeClip.start) / duration) * 100}%`
                      }}
                    />
                  )}

                  {/* Playhead progress overlay */}
                  <div
                    className="absolute h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full pointer-events-none"
                    style={{
                      width: `${(currentTime / (duration || 1)) * 100}%`
                    }}
                  />

                  {/* Seek Control range slider input overlay */}
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => handleSeek(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-125 cursor-grab active:cursor-grabbing"
                  />
                </div>

                {/* Timestamps status indicator */}
                <div className="flex items-center justify-between text-xs text-zinc-500 font-mono font-semibold pt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Bottom buttons panel */}
              <div className="flex items-center justify-between">
                
                {/* Left control: Play/Pause */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePlayPause}
                    disabled={!player}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                      player
                        ? 'bg-white text-zinc-950 hover:bg-zinc-200 active:scale-95 shadow-md shadow-white/5 cursor-pointer'
                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-white/5'
                    }`}
                  >
                    {playerState === 1 ? (
                      // Pause Icon
                      <svg className="w-5 h-5 text-current fill-current" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      // Play Icon
                      <svg className="w-5 h-5 text-current fill-current ml-0.5" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  <div className="flex flex-col">
                    <span className="text-xs text-white font-bold">
                      {playerState === 1 ? 'Streaming' : playerState === 2 ? 'Paused' : 'Ready'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium">Custom Player API</span>
                  </div>
                </div>

                {/* Right controls: Playback speeds */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSeek(Math.max(0, currentTime - 10))}
                    disabled={!player}
                    title="Rewind 10 seconds"
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-colors cursor-pointer active:scale-95"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleSeek(Math.min(duration, currentTime + 10))}
                    disabled={!player}
                    title="Forward 10 seconds"
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-colors cursor-pointer active:scale-95"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.934 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z" />
                    </svg>
                  </button>
                </div>

              </div>

            </div>

          </div>

        </main>

      </div>
    </div>
  );
}
