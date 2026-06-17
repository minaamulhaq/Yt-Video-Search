import { serve } from "inngest/next";
import { inngest } from "../../inngest/client";
import { helloWorld, videoIngestionPipeline } from "../../inngest/functions";

// Expose GET, POST, and PUT handlers to connect with Inngest
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    videoIngestionPipeline,
  ],
});
