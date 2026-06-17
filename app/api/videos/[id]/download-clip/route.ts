import { NextResponse } from "next/server";
import dbConnect from "../../../../lib/mongodb";
import Video from "../../../../models/Video";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";

// Helper to construct query
function getQuery(id: string) {
  return mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { youtubeId: id }] }
    : { youtubeId: id };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { segments } = await req.json();

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json({ success: false, error: "Missing or invalid segments array" }, { status: 400 });
    }

    await dbConnect();
    const video = await Video.findOne(getQuery(id));
    if (!video) {
      return NextResponse.json({ success: false, error: "Video not found in database" }, { status: 404 });
    }

    if (!video.localFilePath || !fs.existsSync(video.localFilePath)) {
      return NextResponse.json({ success: false, error: "Video source file not found on server. Please ensure video ingestion has completed successfully." }, { status: 404 });
    }

    const inputFile = video.localFilePath;
    const ext = path.extname(inputFile); // .mp4, .webm, etc.
    const isVideo = [".mp4", ".mkv", ".avi", ".mov"].includes(ext.toLowerCase());
    const isWebm = ext.toLowerCase() === ".webm";

    const tmpDir = path.join(process.cwd(), "tmp", "clips");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const outputFilename = `clip-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const outputPath = path.join(tmpDir, outputFilename);

    // Sort segments chronologically
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start);

    // Merge continuous or overlapping segments (within 1.5 seconds gap)
    const mergedSegments: { start: number; end: number }[] = [];
    if (sortedSegments.length > 0) {
      let current = { start: sortedSegments[0].start, end: sortedSegments[0].end };
      for (let i = 1; i < sortedSegments.length; i++) {
        const next = sortedSegments[i];
        if (next.start <= current.end + 1.5) {
          current.end = Math.max(current.end, next.end);
        } else {
          mergedSegments.push(current);
          current = { start: next.start, end: next.end };
        }
      }
      mergedSegments.push(current);
    }

    if (mergedSegments.length === 1) {
      // Single chunk extraction
      const { start, end } = mergedSegments[0];
      const duration = end - start;
      
      console.log(`Extracting single clip from ${start}s to ${end}s`);
      // Use FFmpeg to extract segment -c copy is fast and preserves quality
      try {
        execSync(`ffmpeg -y -ss ${start} -i "${inputFile}" -to ${duration} -c copy "${outputPath}"`, { stdio: "ignore" });
      } catch (cmdErr) {
        console.warn("Fast copy slice failed, trying with re-encoding fallback...", cmdErr);
        // Fallback re-encode if copy fails due to container alignment
        if (isVideo) {
          execSync(`ffmpeg -y -ss ${start} -i "${inputFile}" -to ${duration} -c:v libx264 -c:a aac "${outputPath}"`, { stdio: "ignore" });
        } else if (isWebm) {
          execSync(`ffmpeg -y -ss ${start} -i "${inputFile}" -to ${duration} -c:a libopus "${outputPath}"`, { stdio: "ignore" });
        } else {
          execSync(`ffmpeg -y -ss ${start} -i "${inputFile}" -to ${duration} -acodec libmp3lame "${outputPath}"`, { stdio: "ignore" });
        }
      }
    } else {
      // Multiple chunks extraction and merge
      const tempFiles: string[] = [];
      const listFilePath = path.join(tmpDir, `list-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.txt`);

      try {
        for (let i = 0; i < mergedSegments.length; i++) {
          const { start, end } = mergedSegments[i];
          const duration = end - start;
          const tempOut = path.join(tmpDir, `temp-${i}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
          
          console.log(`Extracting segment ${i}: ${start}s to ${end}s`);
          try {
            execSync(`ffmpeg -y -ss ${start} -i "${inputFile}" -to ${duration} -c copy "${tempOut}"`, { stdio: "ignore" });
          } catch (cmdErr) {
            console.warn(`Fast copy segment ${i} failed, trying with re-encoding fallback...`);
            if (isVideo) {
              execSync(`ffmpeg -y -ss ${start} -i "${inputFile}" -to ${duration} -c:v libx264 -c:a aac "${tempOut}"`, { stdio: "ignore" });
            } else if (isWebm) {
              execSync(`ffmpeg -y -ss ${start} -i "${inputFile}" -to ${duration} -c:a libopus "${tempOut}"`, { stdio: "ignore" });
            } else {
              execSync(`ffmpeg -y -ss ${start} -i "${inputFile}" -to ${duration} -acodec libmp3lame "${tempOut}"`, { stdio: "ignore" });
            }
          }
          tempFiles.push(tempOut);
        }

        // Create list file for concat
        const listContent = tempFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
        fs.writeFileSync(listFilePath, listContent);

        console.log("Merging segments...");
        execSync(`ffmpeg -y -f concat -safe 0 -i "${listFilePath}" -c copy "${outputPath}"`, { stdio: "ignore" });
      } finally {
        // Clean up temp files
        if (fs.existsSync(listFilePath)) {
          fs.unlinkSync(listFilePath);
        }
        tempFiles.forEach(f => {
          if (fs.existsSync(f)) {
            try {
              fs.unlinkSync(f);
            } catch (cleanupErr) {
              console.warn("Could not delete temp clip segment:", f, cleanupErr);
            }
          }
        });
      }
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error("FFmpeg clip generation failed or output file not found");
    }

    const fileBuffer = fs.readFileSync(outputPath);
    
    // Clean up final output file after reading it into memory
    try {
      fs.unlinkSync(outputPath);
    } catch (cleanupErr) {
      console.warn("Could not delete final output clip:", outputPath, cleanupErr);
    }

    const contentType = isVideo ? "video/mp4" : "audio/mpeg";

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${outputFilename}"`,
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error: any) {
    console.error("Error generating clip:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
