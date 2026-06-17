import { VideoItem } from '../types';

export const DEFAULT_VIDEOS: VideoItem[] = [
  {
    id: 'nextjs-masterclass',
    youtubeId: 'y52EkGTvyxs',
    title: 'Next.js App Router & Server Components Masterclass',
    thumbnail: 'https://img.youtube.com/vi/y52EkGTvyxs/mqdefault.jpg',
    status: 'ready',
    addedAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(), // 3 days ago
    duration: 580,
    transcript: [
      { start: 0, duration: 15, text: 'Introduction to Next.js App Router and Server Components.' },
      { start: 75, duration: 20, text: 'Understanding how Server Components render on the server to reduce bundle sizes.' },
      { start: 150, duration: 25, text: 'Client Components and how the use client directive acts as a boundary.' },
      { start: 240, duration: 30, text: 'Dynamic routing, slug parameters, and file-based routing conventions.' },
      { start: 345, duration: 25, text: 'Fetching data directly on the server with fetch and async await syntax.' },
      { start: 435, duration: 30, text: 'Optimizing application performance using the React Suspense boundary.' },
      { start: 530, duration: 25, text: 'Caching strategies: static versus dynamic routing behavior.' }
    ],
    chatHistory: [
      {
        id: 'msg-init',
        role: 'assistant',
        content: 'Hi! Ask me anything about this Next.js Masterclass video. I can pinpoint answers with timestamps like [01:15] or [04:00], and even generate custom clips for you.'
      }
    ]
  },
  {
    id: 'react19-deepdive',
    youtubeId: 'Ke90Tje7VS0',
    title: 'React 19 Deep Dive: Hooks, Compiler & Actions',
    thumbnail: 'https://img.youtube.com/vi/Ke90Tje7VS0/mqdefault.jpg',
    status: 'ready',
    addedAt: new Date(Date.now() - 3600000 * 24 * 2).toISOString(), // 2 days ago
    duration: 610,
    transcript: [
      { start: 0, duration: 12, text: 'Welcome to the React 19 feature walkthrough and major changes.' },
      { start: 65, duration: 25, text: 'Introducing the new use hook for loading promises and context inline.' },
      { start: 140, duration: 30, text: 'React Server Actions and native form handling to simplify data mutations.' },
      { start: 250, duration: 25, text: 'Form state hooks: useActionState and useFormStatus for pending feedback.' },
      { start: 350, duration: 35, text: 'Understanding the React Compiler and automated component memoization.' },
      { start: 455, duration: 25, text: 'Optimizations with asset loading, stylesheets, and document metadata.' },
      { start: 550, duration: 30, text: 'Summary of major React 19 breaking changes and migration guide.' }
    ],
    chatHistory: [
      {
        id: 'msg-init',
        role: 'assistant',
        content: 'Welcome! I am ready to answer questions about React 19. Try asking about the new "use hook", "Server Actions", or "React Compiler".'
      }
    ]
  },
  {
    id: 'tailwind-v4-intro',
    youtubeId: 'zjkBMFhNj_g',
    title: 'Tailwind CSS v4.0: CSS-First Configuration & Rust Engine',
    thumbnail: 'https://img.youtube.com/vi/zjkBMFhNj_g/mqdefault.jpg',
    status: 'ready',
    addedAt: new Date(Date.now() - 3600000 * 24 * 1).toISOString(), // 1 day ago
    duration: 520,
    transcript: [
      { start: 0, duration: 10, text: 'What is new in Tailwind CSS v4.0 and why it is a major update.' },
      { start: 60, duration: 25, text: 'The new high-performance compiler engine rewritten in Rust for 10x speeds.' },
      { start: 135, duration: 30, text: 'CSS-first configuration using @theme directive directly in stylesheet.' },
      { start: 220, duration: 25, text: 'First-class container queries and container size utilities natively supported.' },
      { start: 300, duration: 30, text: 'New default gradients, dynamic text wraps, and build-in transition presets.' },
      { start: 390, duration: 25, text: 'Automatic source code detection and optimized file importing.' },
      { start: 465, duration: 25, text: 'Upgrading guidelines and automatic codemod for Tailwind v3 projects.' }
    ],
    chatHistory: [
      {
        id: 'msg-init',
        role: 'assistant',
        content: 'Hi! Let me know what you want to learn about Tailwind CSS v4. Ask about the Rust engine, @theme configuration, or new utilities.'
      }
    ]
  }
];

export function getSimulatedAIResponse(video: VideoItem, question: string): { content: string; clipStart?: number; clipEnd?: number } {
  const query = question.toLowerCase();

  // Next.js video
  if (video.youtubeId === 'y52EkGTvyxs') {
    if (query.includes('component') || query.includes('server') || query.includes('client')) {
      return {
        content: 'In this masterclass, React Server Components are explained starting at [01:15]. The speaker discusses how they render purely on the server to strip JS from the bundles. They then transition to Client Components at [02:30], detailing the "@use client" directive which establishes the boundary between server and client execution.',
        clipStart: 75,
        clipEnd: 175
      };
    }
    if (query.includes('route') || query.includes('routing') || query.includes('slug')) {
      return {
        content: 'Dynamic routing and file-based layout structure are covered at [04:00]. Next.js utilizes folder naming conventions (like [slug] or [...slug]) to map URL segments. The speaker goes on to explain server data fetching in these routes at [05:45].',
        clipStart: 240,
        clipEnd: 370
      };
    }
    if (query.includes('fetch') || query.includes('data') || query.includes('async')) {
      return {
        content: 'Direct server-side data fetching using async/await inside Server Components is demonstrated at [05:45]. The speaker explains how standard fetch requests are automatically cached and deduplicated. At [07:15], they show how to wrap this loading state in a Suspense boundary.',
        clipStart: 345,
        clipEnd: 465
      };
    }
    if (query.includes('suspense') || query.includes('loading') || query.includes('stream')) {
      return {
        content: 'The application of React Suspense boundaries for streaming UI is covered at [07:15]. This allows Next.js to send the static shell instantly, then stream dynamic components as they finish fetching. Check [08:50] to see how this caching impacts static vs dynamic outputs.',
        clipStart: 435,
        clipEnd: 555
      };
    }
  }

  // React 19 video
  if (video.youtubeId === 'Ke90Tje7VS0') {
    if (query.includes('use hook') || query.includes('use(') || query.includes('promise') || query.includes('context')) {
      return {
        content: 'The new "use" hook is detailed starting at [01:05]. Unlike traditional React hooks, "use" can be called conditionally and inside loops, allowing you to load promises or context dynamically. This works hand-in-hand with Suspense boundaries.',
        clipStart: 65,
        clipEnd: 95
      };
    }
    if (query.includes('action') || query.includes('form') || query.includes('mutation')) {
      return {
        content: 'React 19 Server Actions and native form integrations are explained at [02:20]. The speaker highlights how form submissions automatically trigger transition pending states. At [04:10], they introduce the auxiliary hooks: useActionState and useFormStatus.',
        clipStart: 140,
        clipEnd: 275
      };
    }
    if (query.includes('compiler') || query.includes('memo') || query.includes('usememo')) {
      return {
        content: 'The React Compiler (React Forget) is introduced at [05:50]. It runs at compile-time to automatically memoize values and dependencies, meaning developers no longer need to write useMemo or useCallback boilerplate. The speaker shows performance diffs of complex UI rendering.',
        clipStart: 350,
        clipEnd: 420
      };
    }
    if (query.includes('asset') || query.includes('meta') || query.includes('head')) {
      return {
        content: 'React 19 adds first-class support for document metadata (title, meta, link) and asset loading at [07:35]. Stylesheets and scripts are preloaded and deduped automatically when you place them in any component, ensuring optimal rendering order.',
        clipStart: 455,
        clipEnd: 510
      };
    }
  }

  // Tailwind v4 video
  if (video.youtubeId === 'zjkBMFhNj_g') {
    if (query.includes('rust') || query.includes('compiler') || query.includes('speed') || query.includes('engine')) {
      return {
        content: 'The new Rust-based compiler engine in Tailwind v4 is discussed starting at [01:00]. The speaker demonstrates how the build time drops by 10x because of the Rust rewrite, removing the need for heavy Node processes during incremental styling.',
        clipStart: 60,
        clipEnd: 110
      };
    }
    if (query.includes('theme') || query.includes('config') || query.includes('css')) {
      return {
        content: 'CSS-first configuration is explained at [02:15]. Instead of writing a tailwind.config.js JavaScript file, you now define custom themes directly in your CSS using the @theme directive. This makes configuration much more visual and standard-aligned.',
        clipStart: 135,
        clipEnd: 200
      };
    }
    if (query.includes('container') || query.includes('query')) {
      return {
        content: 'First-class container queries are highlighted at [03:40]. Tailwind v4 supports styling elements based on their container size rather than the viewport size, enabling widgets like "@min-[320px]:grid-cols-2" without extra plugins.',
        clipStart: 220,
        clipEnd: 275
      };
    }
    if (query.includes('gradient') || query.includes('preset') || query.includes('wrap')) {
      return {
        content: 'Tailwind v4 comes with enhanced design systems detailed at [05:00], including beautiful 3D gradients, built-in text-wrap utilities, and ready-to-use transitions that make designing micro-animations incredibly easy.',
        clipStart: 300,
        clipEnd: 360
      };
    }
  }

  // Custom / dynamic pasted links & generic fallback responses
  const segments = video.transcript;
  if (segments.length > 0) {
    // Attempt keyword matches in transcript segments
    for (const segment of segments) {
      if (query.split(' ').some(word => word.length > 3 && segment.text.toLowerCase().includes(word))) {
        const minStr = Math.floor(segment.start / 60).toString().padStart(2, '0');
        const secStr = Math.floor(segment.start % 60).toString().padStart(2, '0');
        return {
          content: `According to the video transcript at [${minStr}:${secStr}], the speaker mentions: "${segment.text}". This directly answers your query about the subject. Let me know if you would like me to generate a clip around this.`,
          clipStart: Math.max(0, segment.start - 5),
          clipEnd: Math.min(video.duration, segment.start + segment.duration + 5)
        };
      }
    }

    // Default to the second segment if it exists, otherwise the first
    const segment = segments[Math.min(1, segments.length - 1)];
    const minStr = Math.floor(segment.start / 60).toString().padStart(2, '0');
    const secStr = Math.floor(segment.start % 60).toString().padStart(2, '0');
    return {
      content: `I searched the video for your query. Around [${minStr}:${secStr}], they explain: "${segment.text}". Let me know if you want to explore other parts of the video transcript!`,
      clipStart: segment.start,
      clipEnd: segment.start + segment.duration
    };
  }

  return {
    content: 'I could not find matching transcript details for your question in this video. Please try another phrase or click play on the player to browse the video sections manually.'
  };
}
