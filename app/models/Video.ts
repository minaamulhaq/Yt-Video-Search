import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDbChunk {
  text: string;
  start: number;
  end: number;
  score?: number;
}

export interface IDbMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  clipStart?: number;
  clipEnd?: number;
  type?: 'relevant' | 'fallback';
  chunks?: IDbChunk[];
}

export interface IDbTranscriptSegment {
  text: string;
  start: number;
  end?: number;
  duration?: number;
}

export interface IVideoDocument extends Document {
  youtubeId: string;
  youtubeUrl?: string;
  title: string;
  thumbnail: string;
  status: string;
  localFilePath?: string;
  addedAt: Date;
  createdAt?: Date;
  duration: number;
  transcript: IDbTranscriptSegment[];
  chatHistory: IDbMessage[];
}

const MessageSchema = new Schema<IDbMessage>({
  id: { type: String, required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Number },
  clipStart: { type: Number },
  clipEnd: { type: Number },
  type: { type: String, enum: ['relevant', 'fallback'] },
  chunks: [
    {
      text: { type: String },
      start: { type: Number },
      end: { type: Number },
      score: { type: Number }
    }
  ]
});

const TranscriptSegmentSchema = new Schema<IDbTranscriptSegment>({
  text: { type: String, required: true },
  start: { type: Number, required: true },
  end: { type: Number },
  duration: { type: Number },
});

const VideoSchema = new Schema<IVideoDocument>({
  youtubeId: { type: String, required: true, unique: true },
  youtubeUrl: { type: String },
  title: { type: String, required: true },
  thumbnail: { type: String, required: true },
  status: { type: String, default: 'ready' },
  localFilePath: { type: String },
  addedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  duration: { type: Number, default: 0 },
  transcript: [TranscriptSegmentSchema],
  chatHistory: [MessageSchema],
});

// Avoid compiling the model multiple times, but reload schema in development hot-reload
if (process.env.NODE_ENV === 'development') {
  delete (mongoose.models as any).Video;
}
const Video: Model<IVideoDocument> = mongoose.models.Video || mongoose.model<IVideoDocument>('Video', VideoSchema);

// Programmatically drop obsolete unique videoId_1 index if it exists in the database
Video.on('index', (err) => {
  if (err) {
    console.error('Mongoose indexing error:', err);
  }
  Video.collection.dropIndex('videoId_1').then(() => {
    console.log('Successfully dropped obsolete unique videoId_1 index.');
  }).catch((e) => {
    // Ignore error if the index does not exist in the collection
    if (e.codeName !== 'IndexNotFound' && e.code !== 27) {
      console.warn('Could not drop index videoId_1:', e.message);
    }
  });
});

export default Video;
