import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ytSearch from "yt-search";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q as string;

    if (!query) {
      return res.status(400).json({
        error: "Missing search query",
      });
    }

    const result = await ytSearch(query);

    const videos = result.videos.slice(0, 20).map((video) => ({
      id: video.videoId,
      title: video.title,
      uploader: video.author.name,
      duration: video.timestamp,
      thumbnail: video.thumbnail,
      url: video.url,
    }));

    res.json({
      results: videos,
    });
  } catch (error) {
    console.error("Search API error:", error);

    res.status(500).json({
      error: "Failed to search songs",
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] running on http://0.0.0.0:${PORT}`);
});