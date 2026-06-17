'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DEFAULT_VIDEOS } from './data/videos';
import { VideoItem } from './types';

// Helper to extract YouTube Video ID
function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export default function Dashboard() {
  const [urlInput, setUrlInput] = useState('');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0); // 0 to 4
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null);

  // Steps description
  const processingSteps = [
    { label: 'Downloading video source...', progress: 20 },
    { label: 'Extracting audio track...', progress: 45 },
    { label: 'Transcribing speech to text...', progress: 70 },
    { label: 'Generating AI search index & embeddings...', progress: 95 },
    { label: 'Indexing complete!', progress: 100 }
  ];

  // Fetch videos from database on mount
  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.videos)) {
          // Map MongoDB video documents to VideoItem interface
          const mappedVideos: VideoItem[] = data.videos.map((v: any) => ({
            id: v.videoId || v._id,
            youtubeId: v.youtubeId,
            title: v.title,
            thumbnail: v.thumbnail,
            status: v.status,
            addedAt: v.createdAt || v.addedAt || new Date().toISOString(),
            duration: v.duration || 0,
            transcript: v.transcript || [],
            chatHistory: v.chatHistory || []
          }));
          setVideos(mappedVideos);
        }
      }
    } catch (err) {
      console.error('Failed to load videos from database', err);
    }
    setHasHydrated(true);
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  // Poll videos every 3 seconds if there are any videos with status "processing"
  useEffect(() => {
    const hasProcessing = videos.some((v) => v.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/videos');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.videos)) {
            const mappedVideos: VideoItem[] = data.videos.map((v: any) => ({
              id: v.videoId || v._id,
              youtubeId: v.youtubeId,
              title: v.title,
              thumbnail: v.thumbnail,
              status: v.status,
              addedAt: v.createdAt || v.addedAt || new Date().toISOString(),
              duration: v.duration || 0,
              transcript: v.transcript || [],
              chatHistory: v.chatHistory || []
            }));
            setVideos(mappedVideos);
          }
        }
      } catch (err) {
        console.warn('Polling error', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [videos]);

  const handleProcessVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const ytId = getYouTubeId(urlInput);
    if (!ytId) {
      setErrorMsg('Please enter a valid YouTube URL (e.g. https://www.youtube.com/watch?v=...)');
      return;
    }

    // Check if video already exists
    if (videos.some((v) => v.youtubeId === ytId)) {
      setErrorMsg('This video is already in your library!');
      return;
    }

    setIsProcessing(true);
    setProcessingStep(0);
    setProcessingVideoId(ytId);

    // Fetch video title via noembed
    let videoTitle = `YouTube Video (${ytId})`;
    try {
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.title) {
          videoTitle = data.title;
        }
      }
    } catch (err) {
      console.warn('Could not fetch title, using default', err);
    }

    // Step simulation intervals for UI submission transition
    let currentStep = 0;
    const progressInterval = setInterval(() => {
      currentStep += 1;
      if (currentStep < processingSteps.length - 1) {
        setProcessingStep(currentStep);
      }
    }, 800);

    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: urlInput, title: videoTitle })
      });
      
      const data = await res.json();
      clearInterval(progressInterval);

      if (data.success) {
        setProcessingStep(4); // completed submission step
        setTimeout(() => {
          setIsProcessing(false);
          setUrlInput('');
          setProcessingVideoId(null);
          fetchVideos(); // reload dashboard list instantly
        }, 500);
      } else {
        setIsProcessing(false);
        setProcessingVideoId(null);
        setErrorMsg(data.error || 'Failed to process video link.');
      }
    } catch (err) {
      clearInterval(progressInterval);
      setIsProcessing(false);
      setProcessingVideoId(null);
      setErrorMsg('Network error while processing link.');
    }
  };

  const handleDeleteVideo = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setVideos(videos.filter((v) => v.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete video', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-6 sm:p-12">
      {/* Header */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between pb-8 border-b border-white/5 mb-16">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">VidSearch</span>
            <span className="text-xs block text-zinc-500 font-medium tracking-wide uppercase">AI Video Intelligence</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 font-semibold">v1.0.0 Stable</span>
        </div>
      </header>

      {/* Hero & Input Section */}
      <main className="w-full max-w-4xl mx-auto flex-1 flex flex-col items-center">
        <div className="text-center mb-10 max-w-xl">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            Chat with any <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">YouTube Video</span>
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg">
            Paste a link to extract transcripts, search through spoken words instantly, and chat with an AI model trained specifically on the video contents.
          </p>
        </div>

        {/* Input box form */}
        <form onSubmit={handleProcessVideo} className="w-full max-w-2xl mb-8">
          <div className="relative flex flex-col sm:flex-row gap-3 p-2 rounded-2xl glass-panel shadow-2xl">
            <div className="flex-1 flex items-center gap-3 px-3 min-h-12">
              <svg className="w-5 h-5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <input
                type="text"
                placeholder="Paste YouTube video link here... (e.g. https://youtube.com/watch?v=...)"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={isProcessing}
                className="w-full bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isProcessing || !urlInput.trim()}
              className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 shrink-0 ${
                isProcessing || !urlInput.trim()
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/20 active:scale-98 cursor-pointer'
              }`}
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download & Process
                </>
              )}
            </button>
          </div>
          {errorMsg && (
            <div className="mt-3 text-red-400 text-xs text-center flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {errorMsg}
            </div>
          )}
        </form>

        {/* Processing Loading Stepper */}
        {isProcessing && (
          <div className="w-full max-w-xl glass-panel p-6 rounded-2xl border-pulse border border-indigo-500/30 shadow-2xl mb-12 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-zinc-300">Processing Video Pipeline</span>
              <span className="text-xs text-indigo-400 font-mono font-semibold">{processingSteps[processingStep].progress}%</span>
            </div>
            
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden mb-6">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-700 ease-out"
                style={{ width: `${processingSteps[processingStep].progress}%` }}
              />
            </div>

            {/* Steps list */}
            <div className="space-y-3">
              {processingSteps.map((step, idx) => {
                const isCompleted = idx < processingStep;
                const isActive = idx === processingStep;
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] font-bold ${
                      isCompleted 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : isActive 
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 animate-pulse'
                        : 'bg-zinc-900/50 text-zinc-600 border-white/5'
                    }`}>
                      {isCompleted ? (
                        <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span className={`text-xs font-medium ${
                      isCompleted 
                        ? 'text-zinc-400 line-through decoration-zinc-800' 
                        : isActive 
                        ? 'text-zinc-100 font-semibold' 
                        : 'text-zinc-600'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Video Library Grid Section */}
        <section className="w-full mt-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                My Video Library
              </h2>
              <p className="text-xs text-zinc-500 font-medium mt-1">Select a video to play and begin analysis</p>
            </div>
            <span className="text-xs bg-white/5 border border-white/5 text-zinc-400 px-3 py-1 rounded-lg font-mono font-semibold">
              {hasHydrated ? videos.length : 0} {videos.length === 1 ? 'Video' : 'Videos'}
            </span>
          </div>

          {!hasHydrated ? (
            // Skeleton Loader
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-64 rounded-2xl bg-slate-950/40 border border-white/5 animate-pulse" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            // Empty State
            <div className="glass-panel p-16 rounded-3xl text-center border border-white/5 max-w-xl mx-auto flex flex-col items-center">
              <div className="w-16 h-16 bg-zinc-950 rounded-2xl flex items-center justify-center border border-white/5 text-zinc-600 mb-6">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No videos processed yet</h3>
              <p className="text-zinc-500 text-xs max-w-xs mb-6">
                Paste a YouTube link in the input field above to analyze transcripts and begin chatting.
              </p>
            </div>
          ) : (
            // Grid of Video Cards
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <Link
                  key={video.id}
                  href={`/video/${video.id}`}
                  className="group relative rounded-2xl overflow-hidden glass-panel border border-white/5 transition-all duration-300 hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/5 hover:-translate-y-1 flex flex-col h-full cursor-pointer"
                >
                  {/* Thumbnail Container */}
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-60" />

                    {/* Status Badge */}
                    <div className="absolute top-3 right-3">
                      {video.status === 'ready' ? (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          Ready
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-md animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          Processing
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Info Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-white text-sm line-clamp-2 leading-snug group-hover:text-indigo-400 transition-colors duration-200">
                        {video.title}
                      </h3>
                      <p className="text-[11px] text-zinc-500 font-medium mt-2">
                        Added {new Date(video.addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-white/5">
                      <button
                        onClick={(e) => handleDeleteVideo(video.id, e)}
                        title="Delete video"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all duration-200"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 transition-colors duration-200">
                        Open Video
                        <svg className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto text-center py-8 border-t border-white/5 text-xs text-zinc-600 font-medium mt-24">
        &copy; {new Date().getFullYear()} VidSearch App. Created with Next.js and Tailwind CSS.
      </footer>
    </div>
  );
}
