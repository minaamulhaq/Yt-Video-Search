import { NextResponse } from "next/server";
import dbConnect from "../../lib/mongodb";
import Video from "../../models/Video";
import { inngest } from "../../inngest/client";
import crypto from "crypto";

// Helper to extract YouTube Video ID
function getYouTubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

// GET /api/videos - Retrieve all videos from database
export async function GET() {
  try {
    await dbConnect();
    const videos = await Video.find({}).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, videos });
  } catch (error: any) {
    console.error("Error fetching videos:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/videos - Add video to queue & trigger Inngest
export async function POST(req: Request) {
  try {
    const { youtubeUrl, title } = await req.json();
    if (!youtubeUrl) {
      return NextResponse.json({ success: false, error: "Missing youtubeUrl" }, { status: 400 });
    }

    const youtubeId = getYouTubeId(youtubeUrl);
    if (!youtubeId) {
      return NextResponse.json({ success: false, error: "Invalid YouTube URL" }, { status: 400 });
    }

    await dbConnect();

    // Check if video already exists in database
    let existingVideo = await Video.findOne({ youtubeId });
    if (existingVideo) {
      return NextResponse.json({
        success: true,
        alreadyExists: true,
        videoId: existingVideo._id.toString(),
        video: existingVideo
      });
    }

    const thumbnail = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
    const videoTitle = title || `YouTube Video (${youtubeId})`;
    
    // Create the video metadata in MongoDB with status "processing"
    const video = await Video.create({
      youtubeId,
      youtubeUrl,
      title: videoTitle,
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

    const videoId = video._id.toString();

    // Invoke the Inngest pipeline function by sending the video/uploaded event
    await inngest.send({
      name: "video/uploaded",
      data: {
        youtubeUrl,
        title: videoTitle,
        videoId,
        youtubeId
      }
    });

    return NextResponse.json({ success: true, videoId, video });
  } catch (error: any) {
    console.error("Error creating video:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
