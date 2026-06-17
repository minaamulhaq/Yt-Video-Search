import { inngest } from "./client";
import dbConnect from "../lib/mongodb";
import Video from "../models/Video";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";

// Helper to extract YouTube Video ID
function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

// Hello World Inngest Function
export const helloWorld = inngest.createFunction(
  { id: "hello-world", name: "Hello World", triggers: [{ event: "test/hello.world" }] },
  async ({ event, step }) => {
    await step.sleep("wait-a-moment", "1s");
    const name = event.data?.name || "World";
    return {
      message: `Hello ${name}! Welcome to Inngest background execution.`
    };
  }
);

// Video Ingestion Pipeline Function
export const videoIngestionPipeline = inngest.createFunction(
  { id: "video-ingestion-pipeline", name: "Video Ingestion Pipeline", triggers: [{ event: "video/uploaded" }] },
  async ({ event, step }) => {
    const { youtubeUrl, title } = event.data;
    if (!youtubeUrl) {
      throw new Error("Missing youtubeUrl in event data");
    }

    // STEP 0 — STORE METADATA IN MONGODB
    const meta = await step.run("store-metadata", async () => {
      await dbConnect();
      const youtubeId = getYouTubeId(youtubeUrl) || `yt-${Date.now()}`;

      let video = null;
      if (event.data.videoId && mongoose.Types.ObjectId.isValid(event.data.videoId)) {
        video = await Video.findById(event.data.videoId);
      }

      if (!video) {
        video = await Video.findOne({ youtubeId });
      }

      if (!video) {
        const thumbnail = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
        video = await Video.create({
          youtubeId,
          youtubeUrl,
          title: title || `YouTube Video (${youtubeId})`,
          thumbnail,
          status: "processing",
          createdAt: new Date(),
          addedAt: new Date(),
          duration: 0,
          transcript: [],
          chatHistory: [
            {
              id: `msg-${Date.now()}-init`,
              role: "assistant",
              content: `Hi! I have started processing this video. The transcription and index are being generated.`
            }
          ]
        });
      } else {
        if (video.status !== "processing" && video.status !== "ready") {
          video.status = "processing";
          await video.save();
        }
      }

      return {
        videoId: video._id.toString(),
        youtubeId: video.youtubeId,
        title: video.title
      };
    });

    const { videoId, youtubeId } = meta;
    const targetQuery = mongoose.Types.ObjectId.isValid(videoId)
      ? { _id: videoId }
      : { youtubeId };

    // STEP 1 — DOWNLOAD AND CONVERT VIDEO
    const paths = await step.run("download-and-convert-video", async () => {
      const tmpDir = path.join(process.cwd(), "tmp");
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      const outputPath = path.join(tmpDir, `${youtubeId}.webm`);
      const cleanUrl = youtubeUrl;

      try {
        console.log(`Downloading audio for ${youtubeId}...`);
        execSync(
          `python -m yt_dlp -f bestaudio -o "${outputPath}" "${cleanUrl}"`,
          { stdio: "inherit" }
        );
      } catch (err) {
        console.error("yt-dlp audio download failed:", err);
        throw err;
      }

      // Store local audio path in MongoDB
      await dbConnect();
      await Video.updateOne(targetQuery, { localFilePath: outputPath });

      return { audioPath: outputPath };
    });

    const { audioPath } = paths;

    // STEP 2 — TRANSCRIBE VIDEO (DEEPGRAM)
    const transcriptSegments = await step.run("transcribe-video", async () => {
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Local audio file not found: ${audioPath}`);
      }
      const fileBuffer = fs.readFileSync(audioPath);

      const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&detect_language=true&smart_format=true&punctuation=true", {
        method: "POST",
        headers: {
          "Authorization": `Token ${process.env.DEEPGRAM_API}`,
          "Content-Type": "audio/webm"
        },
        body: fileBuffer
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Deepgram API failed with code ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const words = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];

      // Reconstruct sentence-level segments from word timestamps
      const sentences: { text: string; start: number; end: number; duration: number }[] = [];
      let currentWords: string[] = [];
      let start = 0;

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (currentWords.length === 0) {
          start = w.start;
        }
        currentWords.push(w.punctuated_word || w.word);

        const isSentenceEnd = /[.!?]$/.test(w.punctuated_word || w.word);
        if (isSentenceEnd || i === words.length - 1) {
          sentences.push({
            text: currentWords.join(" "),
            start,
            end: w.end,
            duration: w.end - start
          });
          currentWords = [];
        }
      }

      // Store full transcript in MongoDB
      await dbConnect();
      await Video.updateOne(
        targetQuery,
        {
          transcript: sentences,
          duration: sentences.length > 0 ? sentences[sentences.length - 1].end : 0
        }
      );

      return sentences;
    });

    // STEP 3 — CHUNKING STRATEGY (Hybrid with overlap, keeping sentences intact)
    const chunks = await step.run("chunk-transcript", async () => {
      const chunksList: { text: string; start: number; end: number; videoId: string }[] = [];
      let currentChunkSentences: typeof transcriptSegments = [];

      for (let i = 0; i < transcriptSegments.length; i++) {
        const sentence = transcriptSegments[i];
        currentChunkSentences.push(sentence);

        const chunkStart = currentChunkSentences[0].start;
        const chunkEnd = sentence.end;
        const chunkDuration = chunkEnd - chunkStart;
        const chunkText = currentChunkSentences.map(s => s.text).join(" ");

        // Estimate token count (1 word ≈ 1.35 tokens)
        const wordCount = chunkText.split(/\s+/).length;
        const tokenEstimate = Math.ceil(wordCount * 1.35);

        // Merge into chunks of: 20-40 seconds max duration OR 200-400 tokens max
        if (chunkDuration >= 35 || tokenEstimate >= 300 || i === transcriptSegments.length - 1) {
          chunksList.push({
            text: chunkText,
            start: chunkStart,
            end: chunkEnd,
            videoId
          });

          // Add 2-5 seconds overlap (e.g. 3 seconds target)
          const overlapTarget = 3;
          let overlapSentences: typeof transcriptSegments = [];
          let overlapDuration = 0;

          for (let j = currentChunkSentences.length - 1; j >= 0; j--) {
            const s = currentChunkSentences[j];
            if (overlapDuration + (s.end - s.start) <= overlapTarget) {
              overlapSentences.unshift(s);
              overlapDuration += (s.end - s.start);
            } else {
              break;
            }
          }

          currentChunkSentences = overlapSentences;
        }
      }

      return chunksList;
    });

    // STEP 4 — CREATE EMBEDDINGS (OpenAI)
    const embeddedChunks = await step.run("create-embeddings", async () => {
      if (chunks.length === 0) return [];

      const texts = chunks.map(c => c.text);

      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: texts,
          model: "text-embedding-3-small"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embeddings API failed: ${response.status} ${errorText}`);
      }

      const resData = await response.json();
      const embeddings = resData.data.map((d: any) => d.embedding);

      return chunks.map((chunk, index) => ({
        ...chunk,
        vector: embeddings[index]
      }));
    });

    // STEP 5 — STORE IN QDRANT
    await step.run("store-qdrant", async () => {
      if (embeddedChunks.length === 0) return;

      const collectionName = "youtube_chunks";
      const qdrantBaseUrl = "http://localhost:6333";

      // 1. Create collection with dimension 1536 (text-embedding-3-small output)
      try {
        await fetch(`${qdrantBaseUrl}/collections/${collectionName}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vectors: {
              size: 1536,
              distance: "Cosine"
            }
          })
        });
      } catch (err) {
        console.warn("Could not check/create Qdrant collection, might exist", err);
      }

      // 2. Prepare points
      const points = embeddedChunks.map((chunk) => {
        const pointId = crypto.randomUUID();
        return {
          id: pointId,
          vector: chunk.vector,
          payload: {
            videoId: chunk.videoId,
            youtubeId: youtubeId,
            text: chunk.text,
            start: chunk.start,
            end: chunk.end
          }
        };
      });

      // 3. Upsert
      const response = await fetch(`${qdrantBaseUrl}/collections/${collectionName}/points?wait=true`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qdrant upsert failed: ${response.status} ${errorText}`);
      }
    });

    // FINAL UPDATE - UPDATE STATUS IN MONGO
    await step.run("finalize-status", async () => {
      await dbConnect();
      await Video.updateOne(
        targetQuery,
        {
          status: "ready",
          chatHistory: [
            {
              id: `msg-${Date.now()}-done`,
              role: "assistant",
              content: `Hi! I have successfully ingested this video and indexed its transcript. Ask me anything and I will search the timeline for you!`
            }
          ]
        }
      );
    });

    return {
      videoId,
      status: "ready",
      message: "Video processed and indexed successfully"
    };
  }
);
