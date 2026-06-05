import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import ytSearch from "yt-search";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API router/routes

  // Route: Search YouTube tracks
  app.get("/api/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Missing query parameter 'q'" });
      }

      console.log(`[YouTube Search] Query: "${query}"`);
      const searchResult = await ytSearch(query);
      const videos = searchResult.videos.slice(0, 15).map((v) => ({
        id: v.videoId,
        title: v.title,
        uploader: v.author.name,
        duration: v.timestamp || `${Math.floor(v.seconds / 60)}:${(v.seconds % 60).toString().padStart(2, "0")}`,
        durationSeconds: v.seconds,
        url: v.url,
        thumbnail: v.thumbnail || v.image,
      }));

      return res.json({ results: videos });
    } catch (error: any) {
      console.error("YouTube search error:", error);
      return res.status(500).json({ error: "Failed to search YouTube tracks" });
    }
  });

  // Route: Retrieve streaming URL from Cobalt
  app.get("/api/get-audio", async (req, res) => {
    try {
      const videoId = req.query.id as string;
      if (!videoId) {
        return res.status(400).json({ error: "Missing parameter 'id'" });
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`[Cobalt Fetch] Requesting audio stream for: ${youtubeUrl}`);

      let success = false;
      let data: any = null;
      let lastError: any = null;

      const cobaltInstances = [
        "https://cobalt.canine.tools",
        "https://cobalt.meowing.de",
        "https://cobalt.colb.cc",
        "https://cobalt.momoka.ooo",
        "https://cobalt.rootonline.de",
        "https://cobalt.kwiat.xyz"
      ];

      // Prepare target candidates with both modern (v10) and legacy (v7) payloadd formats
      const candidates: Array<{ url: string; body: any }> = [];
      for (const instance of cobaltInstances) {
        // 1. Try modern Cobalt v10 format at / (downloadMode, audioFormat)
        candidates.push({
          url: instance,
          body: {
            url: youtubeUrl,
            downloadMode: "audio",
            audioFormat: "mp3",
          }
        });
        // 2. Try legacy Cobalt v7 format at /api/json (isAudioOnly, aFormat)
        candidates.push({
          url: `${instance}/api/json`,
          body: {
            url: youtubeUrl,
            isAudioOnly: true,
            aFormat: "mp3",
          }
        });
      }

      for (const cand of candidates) {
        try {
          console.log(`[Cobalt Fetch] Trying candidate endpoint: ${cand.url}`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5 seconds connection timeout

          const response = await fetch(cand.url, {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(cand.body),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            data = await response.json();
            if (data && (data.url || data.picker)) {
              console.log(`[Cobalt Fetch] Success from candidate ${cand.url}!`);
              success = true;
              break;
            } else {
              console.log(`[Cobalt Fetch] Candidate ${cand.url} response didn't contain direct stream URL:`, data);
              lastError = new Error(data.text || "No target stream found in response");
            }
          } else {
            const errText = await response.text().catch(() => "Unknown error response body");
            console.log(`[Cobalt Fetch] Candidate ${cand.url} returned status ${response.status}: ${errText.slice(0, 150)}`);
            lastError = new Error(`Status ${response.status}: ${errText}`);
          }
        } catch (err: any) {
          if (err.name === "AbortError") {
            console.log(`[Cobalt Fetch] Candidate ${cand.url} timed out (3.5s limit reached)`);
            lastError = new Error("Connection request timed out");
          } else {
            console.log(`[Cobalt Fetch] Failed to fetch from candidate ${cand.url}:`, err.message || err);
            lastError = err;
          }
        }
      }

      if (!success) {
        throw lastError || new Error("All public play stream instances failed to fetch stream path");
      }

      return res.json(data);
    } catch (error: any) {
      console.error("Cobalt API overall search fetch error:", error);
      return res.status(500).json({ error: "Failed to locate active play streams on any mirror candidates" });
    }
  });

  // Route: Proxy audio streams from Cobalt to browser to bypass CORS and headers issues
  app.get("/api/proxy-audio", async (req, res) => {
    try {
      const audioUrl = req.query.url as string;
      if (!audioUrl) {
        return res.status(400).json({ error: "Missing parameter 'url'" });
      }

      console.log(`[Proxy] Streaming audio track from url: ${audioUrl}`);
      const audioRes = await fetch(audioUrl);

      if (!audioRes.ok) {
        console.error(`[Proxy] Cobalt source responded with failure status ${audioRes.status}`);
        return res.status(audioRes.status).send("Failed to retrieve audio stream track from primary source");
      }

      // Relay headers to enable range seeking and type compatibility
      res.setHeader("Content-Type", "audio/mpeg");
      const contentLength = audioRes.headers.get("content-length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
      res.setHeader("Accept-Ranges", "bytes");

      if (!audioRes.body) {
        console.error("[Proxy] Audio stream response content-body is empty or missing");
        return res.status(500).send("No readable stream body in audio response from source");
      }

      const reader = audioRes.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            res.write(Buffer.from(value));
          }
        }
      } catch (streamErr) {
        console.error("[Proxy] Stream transfer connection interrupted:", streamErr);
      } finally {
        res.end();
      }
    } catch (error: any) {
      console.error("Proxy audio stream error:", error);
      if (!res.headersSent) {
        res.status(500).send("Proxy error streaming audio track");
      }
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
