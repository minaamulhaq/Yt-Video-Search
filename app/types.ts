export interface Chunk {
  text: string;
  start: number;
  end: number;
  score?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number; // target time in seconds
  clipStart?: number; // optional clip range start
  clipEnd?: number;   // optional clip range end
  type?: 'relevant' | 'fallback';
  chunks?: Chunk[];
}

export interface TranscriptSegment {
  text: string;
  start: number;      // in seconds
  duration: number;   // in seconds
}

export interface VideoItem {
  id: string;         // local unique identifier or YouTube ID
  youtubeId: string;  // extracted 11-char YouTube ID
  title: string;
  thumbnail: string;
  status: 'processing' | 'ready';
  addedAt: string;
  duration: number;   // in seconds
  transcript: TranscriptSegment[];
  chatHistory: Message[];
}
