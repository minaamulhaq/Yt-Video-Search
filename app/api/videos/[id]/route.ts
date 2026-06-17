import { NextResponse } from "next/server";
import dbConnect from "../../../lib/mongodb";
import Video from "../../../models/Video";
import mongoose from "mongoose";

// Helper to construct query
function getQuery(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { youtubeId: id }] }
    : { youtubeId: id };
}

// GET /api/videos/[id] - Retrieve video details (metadata + transcript + chat)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await dbConnect();

    const video = await Video.findOne(getQuery(id));

    if (!video) {
      return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, video });
  } catch (error: any) {
    console.error("Error retrieving video:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function formatSecondsToMMSS(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// POST /api/videos/[id] - Save/Append message to chat history in MongoDB and generate AI reply
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { message, chatHistory } = await req.json();
    await dbConnect();

    // If direct chat history replacement (e.g. clearing or syncing)
    if (chatHistory && Array.isArray(chatHistory)) {
      const updatedVideo = await Video.findOneAndUpdate(
        getQuery(id),
        { $set: { chatHistory } },
        { new: true }
      );
      if (!updatedVideo) {
        return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, video: updatedVideo });
    }

    if (!message) {
      return NextResponse.json({ success: false, error: "Missing message or chatHistory in body" }, { status: 400 });
    }

    // Load the video document
    const video = await Video.findOne(getQuery(id));
    if (!video) {
      return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
    }

    // Append the user's message
    video.chatHistory.push(message);

    // If it's a user message, trigger the semantic search + AI response generation
    if (message.role === "user") {
      let userVector: number[] = [];
      try {
        const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            input: message.content,
            model: "text-embedding-3-small"
          })
        });

        if (embedRes.ok) {
          const embedData = await embedRes.json();
          userVector = embedData.data[0].embedding;
        } else {
          console.warn("OpenAI Embedding endpoint failed:", await embedRes.text());
        }
      } catch (embedErr) {
        console.error("Error calling OpenAI Embeddings API:", embedErr);
      }

      let qdrantChunks: any[] = [];
      if (userVector.length > 0) {
        try {
          const qdrantRes = await fetch("http://localhost:6333/collections/youtube_chunks/points/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vector: userVector,
              limit: 4,
              filter: {
                should: [
                  { key: "videoId", match: { value: video._id.toString() } },
                  { key: "videoId", match: { value: video.youtubeId } },
                  { key: "youtubeId", match: { value: video.youtubeId } }
                ]
              },
              with_payload: true
            })
          });

          if (qdrantRes.ok) {
            const qdrantData = await qdrantRes.json();
            const hits = qdrantData.result || [];
            qdrantChunks = hits.map((h: any) => ({
              text: h.payload.text,
              start: h.payload.start,
              end: h.payload.end,
              score: h.score
            }));
          } else {
            console.warn("Qdrant search endpoint failed:", await qdrantRes.text());
          }
        } catch (qdrantErr) {
          console.error("Error calling Qdrant search API:", qdrantErr);
        }
      }

      // Check similarity score against threshold (lowered to 0.20 for robust cross-lingual embeddings)
      const scoreThreshold = 0.20;
      const relevantChunks = qdrantChunks.filter(c => c.score >= scoreThreshold);
      const isRelevant = relevantChunks.length > 0;

      let responseText = "";
      let finalChunks: any[] = [];
      let bestChunk: any = null;

      if (isRelevant) {
        finalChunks = relevantChunks;
        bestChunk = relevantChunks[0];

        try {
          const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `You are an AI video intelligence assistant.
Answer the user's question about the video based on these matching transcribed chunks:
${relevantChunks.map((c, idx) => `[Chunk ${idx + 1}] (Time: ${c.start}s to ${c.end}s): "${c.text}"`).join("\n")}

Guidelines:
1. Provide a direct, concise, and accurate answer based ONLY on the provided chunks.
2. You MUST mention specific timestamps in [MM:SS] format (e.g. [01:45]) to reference when the information occurs in the video.
3. Keep the answer under 4 sentences.
4. You MUST respond in the same language as the user's question (e.g. if the user asks in Hindi, reply in Hindi; if in Spanish, reply in Spanish; if in Arabic, reply in Arabic).`
                },
                {
                  role: "user",
                  content: message.content
                }
              ]
            })
          });

          if (completionRes.ok) {
            const compData = await completionRes.json();
            responseText = compData.choices[0].message.content;
          } else {
            responseText = `Relevant information was found in the video. Check the timestamps starting around [${formatSecondsToMMSS(bestChunk.start)}].`;
          }
        } catch (compErr) {
          responseText = `Relevant information was found in the video. Check the timestamps starting around [${formatSecondsToMMSS(bestChunk.start)}].`;
        }
      } else {
        // Fallback chunks from transcript
        const fallbackChunks = video.transcript.slice(0, 3).map(t => ({
          text: t.text,
          start: t.start,
          end: t.end || (t.start + (t.duration || 10)),
          score: 0
        }));
        finalChunks = fallbackChunks;
        bestChunk = fallbackChunks[0] || { start: 0, end: 30 };

        try {
          const completionRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `You are an AI video intelligence assistant.
The user asked a question about a video, but no direct matching segments were found in the transcript.
Here are the first few segments of the video transcript:
${fallbackChunks.map((c, idx) => `[Part ${idx + 1}] (Time: ${c.start}s to ${c.end}s): "${c.text}"`).join("\n")}

Guidelines:
1. Politely state that no direct answer was found for their query.
2. Provide a brief general summary or insight of what is discussed in these fallback parts.
3. Suggest the user watches the full video or browse the timeline manually.
4. Reference the timestamps of these fallback parts in [MM:SS] format.`
                },
                {
                  role: "user",
                  content: message.content
                }
              ]
            })
          });

          if (completionRes.ok) {
            const compData = await completionRes.json();
            responseText = compData.choices[0].message.content;
          } else {
            responseText = "No relevant information found for your query. Showing related parts of the video. Suggestion: Watch the full video or browse the timeline manually.";
          }
        } catch (compErr) {
          responseText = "No relevant information found for your query. Showing related parts of the video. Suggestion: Watch the full video or browse the timeline manually.";
        }
      }

      // Append assistant message
      const assistantMessage = {
        id: `msg-${Date.now()}-ai`,
        role: "assistant" as const,
        content: responseText,
        timestamp: bestChunk?.start || 0,
        clipStart: bestChunk?.start || 0,
        clipEnd: bestChunk?.end || 30,
        type: isRelevant ? ("relevant" as const) : ("fallback" as const),
        chunks: finalChunks
      };

      video.chatHistory.push(assistantMessage);
    }

    await video.save();
    return NextResponse.json({ success: true, video });

  } catch (error: any) {
    console.error("Error updating chat:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/videos/[id] - Delete a video from database
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await dbConnect();

    const deletedVideo = await Video.findOneAndDelete(getQuery(id));

    if (!deletedVideo) {
      return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Video deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting video:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
