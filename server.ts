import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/search", async (req, res) => {
    const { q, lat, lon, viewbox } = req.query;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q as string)}&limit=5&lat=${lat}&lon=${lon}&viewbox=${viewbox}&bounded=1&email=stangeorgian38@gmail.com`;
      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "SafeWalk-App" },
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Search API error:", error);
      res.status(500).json({ error: "Failed to fetch search results" });
    }
  });

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

  // Google Places API (New) — real open_now data
  app.get("/api/safe-spaces", async (req, res) => {
    const { lat, lon, radius = "800" } = req.query;
    const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;

    if (!GOOGLE_KEY) {
      res.status(500).json({ error: "GOOGLE_PLACES_API_KEY not set" });
      return;
    }

    // Types we care about for safety: pharmacies, hospitals, police, supermarkets,
    // convenience stores, cafes, bars, restaurants (places with people = safer)
    const includedTypes = [
      "pharmacy", "hospital", "police", "supermarket", "convenience_store",
      "cafe", "bar", "restaurant", "doctor", "drugstore"
    ];

    try {
      const response = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            // Only request fields we need (reduces cost)
            "X-Goog-FieldMask": [
              "places.id",
              "places.displayName",
              "places.location",
              "places.types",
              "places.primaryType",
              "places.currentOpeningHours",
              "places.regularOpeningHours",
              "places.formattedAddress",
              "places.nationalPhoneNumber",
              "places.websiteUri",
              "places.businessStatus",
            ].join(","),
          },
          body: JSON.stringify({
            includedTypes,
            maxResultCount: 20,
            locationRestriction: {
              circle: {
                center: { latitude: parseFloat(lat as string), longitude: parseFloat(lon as string) },
                radius: parseFloat(radius as string),
              },
            },
          }),
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        console.error("Google Places error:", err);
        res.status(500).json({ error: "Google Places API failed", detail: err });
        return;
      }

      const data = await response.json();

      // Normalize to our SafeSpace shape and filter: only OPERATIONAL + open now
      const places = (data.places || [])
        .filter((p: any) => {
          if (p.businessStatus && p.businessStatus !== "OPERATIONAL") return false;
          // If we have currentOpeningHours, use it; otherwise include (no data = show it)
          if (p.currentOpeningHours) return p.currentOpeningHours.openNow === true;
          return true;
        })
        .map((p: any) => {
          const types: string[] = p.types || [];
          const primaryType = p.primaryType || types[0] || "other";

          // Map Google type → our internal type
          const typeMap: Record<string, string> = {
            pharmacy: "pharmacy",
            drugstore: "pharmacy",
            hospital: "hospital",
            doctor: "doctors",
            police: "police",
            supermarket: "supermarket",
            convenience_store: "convenience",
            cafe: "convenience",
            bar: "convenience",
            restaurant: "convenience",
          };
          const ourType = typeMap[primaryType] || typeMap[types.find((t: string) => typeMap[t]) || ""] || "convenience";

          return {
            id: p.id,
            name: p.displayName?.text || "Unknown",
            type: ourType,
            lat: p.location?.latitude,
            lng: p.location?.longitude,
            details: p.formattedAddress || "",
            address: p.formattedAddress || "",
            phone: p.nationalPhoneNumber || "",
            openingHours: p.regularOpeningHours?.weekdayDescriptions?.join(" | ") || "",
            openNow: true, // already filtered above
            website: p.websiteUri || "",
          };
        })
        .filter((p: any) => p.lat && p.lng); // safety check

      res.json({ places });
    } catch (e) {
      console.error("Google Places fetch error:", e);
      res.status(500).json({ error: "Failed to fetch safe spaces" });
    }
  });

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