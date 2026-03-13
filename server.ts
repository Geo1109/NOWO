import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---
  
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Example proxy for Nominatim (Search)
  app.get("/api/search", async (req, res) => {
    const { q, lat, lon, viewbox } = req.query;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q as string)}&limit=5&lat=${lat}&lon=${lon}&viewbox=${viewbox}&bounded=1&email=stangeorgian38@gmail.com`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'SafeWalk-App' }
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Search API error:", error);
      res.status(500).json({ error: "Failed to fetch search results" });
    }
  });

  // Example proxy for OSRM (Routing)
  app.get("/api/route", async (req, res) => {
    const { points, radiuses } = req.query;
    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${points}?overview=full&geometries=geojson&alternatives=true&steps=true&radiuses=${radiuses}&continue_straight=false`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Routing API error:", error);
      res.status(500).json({ error: "Failed to fetch route" });
    }
  });

  // Example proxy for Overpass (Safe Spaces)
  app.get("/api/safe-spaces", async (req, res) => {
    const { lat, lon } = req.query;
    const query = `[out:json];node["amenity"~"pharmacy|hospital|police"](around:3000,${lat},${lon});out;`;
    const endpoints = [
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) continue;
        const data = await response.json();
        res.json(data);
        return;
      } catch (e) {
        console.warn(`Failed to fetch from ${url}:`, e);
      }
    }
    res.status(500).json({ error: "All safe spaces endpoints failed" });
  });

  // --- Vite Middleware ---
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
