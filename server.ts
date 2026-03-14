import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEG = 111320;
function cosLat(lat: number) { return Math.cos((lat * Math.PI) / 180); }

function distM(lat1: number, lng1: number, lat2: number, lng2: number, cos: number) {
  return Math.sqrt(Math.pow((lat2 - lat1) * DEG, 2) + Math.pow((lng2 - lng1) * DEG * cos, 2));
}

function interpolate(coords: number[][], cos: number, maxStepM = 8): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < coords.length; i++) {
    out.push(coords[i]);
    if (i === coords.length - 1) break;
    const [lng1, lat1] = coords[i], [lng2, lat2] = coords[i + 1];
    const steps = Math.ceil(distM(lat1, lng1, lat2, lng2, cos) / maxStepM);
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      out.push([lng1 + (lng2 - lng1) * f, lat1 + (lat2 - lat1) * f]);
    }
  }
  return out;
}

function scoreCoords(
  coords: number[][],
  zones: Array<{ lat: number; lng: number; radiusMeters: number; weight: number }>,
  cos: number,
) {
  if (!coords.length) return { score: 100, hits: [] as typeof zones };
  const dense = interpolate(coords, cos);
  let penalty = 0;
  const hitZones: typeof zones = [];
  const hitSet = new Set<number>();
  for (const [lng, lat] of dense) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (!hitSet.has(i) && distM(lat, lng, z.lat, z.lng, cos) < z.radiusMeters) {
        penalty += z.weight >= 8 ? 4 : z.weight >= 5 ? 2 : 1;
        hitSet.add(i);
        hitZones.push(z);
      }
    }
  }
  return {
    score: Math.round(Math.max(0, 100 - (penalty / Math.max(dense.length, 1)) * 600)),
    hits: hitZones,
  };
}

function circleToPolygon(lat: number, lng: number, radiusM: number, cos: number, sides = 16): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * 2 * Math.PI;
    ring.push([lng + (Math.cos(a) * radiusM) / (DEG * cos), lat + (Math.sin(a) * radiusM) / DEG]);
  }
  return ring;
}

function decodePolyline6(encoded: string): number[][] {
  const coords: number[][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.get("/api/search", async (req, res) => {
    const { q, lat, lon } = req.query;
    const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;

    // ── Google Places Autocomplete (primary) ──────────────────────────────
    // Much better than Nominatim: finds cities, streets, businesses by name
    // anywhere in Romania (and worldwide), with proper Romanian diacritics.
    if (GOOGLE_KEY) {
      try {
        const params = new URLSearchParams({
          input:      q as string,
          key:        GOOGLE_KEY,
          language:   'ro',
          components: 'country:ro',           // restrict to Romania
          location:   `${lat},${lon}`,        // bias toward user location
          radius:     '50000',                // 50km bias radius (not a hard limit)
        });
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (r.ok) {
          const data = await r.json();
          if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
            // For each prediction, fetch coordinates via Place Details
            const predictions = (data.predictions ?? []).slice(0, 5);
            const results = await Promise.all(
              predictions.map(async (p: any) => {
                try {
                  const detailParams = new URLSearchParams({
                    place_id: p.place_id,
                    key:      GOOGLE_KEY,
                    fields:   'geometry,formatted_address,name',
                    language: 'ro',
                  });
                  const dr = await fetch(
                    `https://maps.googleapis.com/maps/api/place/details/json?${detailParams}`,
                    { signal: AbortSignal.timeout(5000) }
                  );
                  if (!dr.ok) return null;
                  const dd = await dr.json();
                  const loc = dd.result?.geometry?.location;
                  if (!loc) return null;
                  return {
                    display_name: p.description,
                    lat:  String(loc.lat),
                    lon:  String(loc.lng),
                    name: dd.result?.name ?? p.description,
                  };
                } catch { return null; }
              })
            );
            res.json(results.filter(Boolean));
            return;
          }
        }
      } catch (e) {
        console.warn('[search] Google Places failed, falling back to Nominatim:', e);
      }
    }

    // ── Nominatim fallback (if no Google key or Google failed) ────────────
    // Removed bounded=1 so it searches all of Romania, not just the viewbox.
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q as string)}&limit=5&lat=${lat}&lon=${lon}&countrycodes=ro&accept-language=ro&email=stangeorgian38@gmail.com`;
      const r = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "SafeWalk-App" } });
      const data: any[] = await r.json();
      res.json(data.map(d => ({
        display_name: d.display_name,
        lat:  d.lat,
        lon:  d.lon,
        name: d.name,
      })));
    } catch { res.status(500).json({ error: "Failed to fetch search results" }); }
  });

  app.get("/api/safe-spaces", async (req, res) => {
    const { lat, lon, radius = "800" } = req.query;
    const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!GOOGLE_KEY) { res.status(500).json({ error: "GOOGLE_PLACES_API_KEY not set" }); return; }
    try {
      const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": ["places.id","places.displayName","places.location","places.types","places.primaryType","places.currentOpeningHours","places.regularOpeningHours","places.formattedAddress","places.nationalPhoneNumber","places.websiteUri","places.businessStatus"].join(",") },
        body: JSON.stringify({ includedTypes: ["pharmacy","hospital","police","supermarket","convenience_store","cafe","bar","restaurant","doctor","drugstore"], maxResultCount: 20, locationRestriction: { circle: { center: { latitude: parseFloat(lat as string), longitude: parseFloat(lon as string) }, radius: parseFloat(radius as string) } } }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { const e = await response.text(); res.status(500).json({ error: "Google Places failed", detail: e }); return; }
      const data = await response.json();
      const typeMap: Record<string,string> = { pharmacy:"pharmacy",drugstore:"pharmacy",hospital:"hospital",doctor:"doctors",police:"police",supermarket:"supermarket",convenience_store:"convenience",cafe:"convenience",bar:"convenience",restaurant:"convenience" };
      const places = (data.places||[]).filter((p:any) => { if (p.businessStatus && p.businessStatus!=="OPERATIONAL") return false; if (p.currentOpeningHours) return p.currentOpeningHours.openNow===true; return true; })
        .map((p:any) => { const types:string[]=p.types||[]; const pt=p.primaryType||types[0]||"other"; return { id:p.id, name:p.displayName?.text||"Unknown", type:typeMap[pt]||typeMap[types.find((t:string)=>typeMap[t])||""]||"convenience", lat:p.location?.latitude, lng:p.location?.longitude, details:p.formattedAddress||"", address:p.formattedAddress||"", phone:p.nationalPhoneNumber||"", openingHours:p.regularOpeningHours?.weekdayDescriptions?.join(" | ")||"", openNow:true, website:p.websiteUri||"" }; })
        .filter((p:any) => p.lat && p.lng);
      res.json({ places });
    } catch { res.status(500).json({ error: "Failed to fetch safe spaces" }); }
  });

  // ---------------------------------------------------------------------------
  // POST /api/walking-route
  //
  // Stadia Maps (Valhalla) cu exclude_polygons.
  // NU folosim via/through waypoints — cauzează loop-uri când punctul
  // calculat nu e pe o stradă reală.
  //
  // Generăm 4 request-uri simple origin→destinație cu buffere diferite:
  //   SAFEST  — buffer 1.5× (ocolire maximă)
  //   NORMAL  — buffer 1.0×
  //   TIGHT   — buffer 0.6× (drum mai scurt, trece mai aproape)
  //   FASTEST — fără excluderi
  // ---------------------------------------------------------------------------
  app.post("/api/walking-route", async (req, res) => {
    const STADIA_KEY = process.env.STADIA_API_KEY;
    if (!STADIA_KEY) { res.status(500).json({ error: "STADIA_API_KEY not set" }); return; }

    const { origin, destination, dangerZones } = req.body;
    if (!origin || !destination) { res.status(400).json({ error: "origin and destination required" }); return; }

    const allZones: Array<{ lat: number; lng: number; weight: number; radiusMeters: number }> = dangerZones ?? [];
    const cos = cosLat((origin[0] + destination[0]) / 2);

    const routeDist = distM(origin[0], origin[1], destination[0], destination[1], cos);
    const corridor  = Math.max(routeDist / 2, 400);
    const midLat    = (origin[0] + destination[0]) / 2;
    const midLng    = (origin[1] + destination[1]) / 2;
    const zones     = allZones.filter(z => distM(z.lat, z.lng, midLat, midLng, cos) < corridor + z.radiusMeters);

    console.log("─".repeat(50));
    console.log(`[route] ${origin[0].toFixed(5)},${origin[1].toFixed(5)} → ${destination[0].toFixed(5)},${destination[1].toFixed(5)}`);
    console.log(`[route] ${allZones.length} zone total → ${zones.length} în coridor (±${corridor.toFixed(0)}m)`);
    zones.forEach((z, i) => console.log(`  Zona ${i}: w=${z.weight} r=${z.radiusMeters}m @ ${z.lat.toFixed(5)},${z.lng.toFixed(5)}`));

    const STADIA_URL = `https://api.stadiamaps.com/route/v1?api_key=${STADIA_KEY}`;

    const safestPolys = zones.map(z => circleToPolygon(z.lat, z.lng, z.radiusMeters * 1.5, cos));
    const normalPolys = zones.map(z => circleToPolygon(z.lat, z.lng, z.radiusMeters * 1.0, cos));
    const tightPolys  = zones.map(z => circleToPolygon(z.lat, z.lng, z.radiusMeters * 0.6, cos));

    function buildBody(excludePolygons: [number, number][][]) {
      const body: any = {
        locations: [
          { lat: origin[0],      lon: origin[1],      type: "break" },
          { lat: destination[0], lon: destination[1], type: "break" },
        ],
        costing: "pedestrian",
        costing_options: { pedestrian: { walking_speed: 4.5 } },
        directions_options: { language: "en-US" },
        units: "km",
      };
      if (excludePolygons.length > 0) body.exclude_polygons = excludePolygons;
      return body;
    }

    async function fetchValhalla(body: object, label: string): Promise<any | null> {
      try {
        const r = await fetch(STADIA_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) { console.warn(`[route] ${label}:`, (await r.text()).slice(0, 200)); return null; }
        return await r.json();
      } catch (e) { console.warn(`[route] ${label} failed:`, (e as Error).message); return null; }
    }

    function normalise(data: any, label: string) {
      if (!data?.trip) return null;
      const allCoords: number[][] = [];
      for (const leg of data.trip.legs ?? []) {
        if (!leg.shape) continue;
        const decoded = decodePolyline6(leg.shape);
        if (allCoords.length > 0) decoded.shift();
        allCoords.push(...decoded);
      }
      if (!allCoords.length) return null;

      const { score, hits } = scoreCoords(allCoords, zones, cos);
      const distance = (data.trip.summary?.length ?? 0) * 1000;
      const duration = data.trip.summary?.time ?? 0;
      console.log(`[route] ${label}: ${(distance / 1000).toFixed(2)}km scor=${score} pericole=${hits.length}/${zones.length}`);
      if (hits.length) hits.forEach(h => console.log(`  !! zona w=${h.weight} @ ${h.lat.toFixed(5)},${h.lng.toFixed(5)}`));

      return {
        distance, duration,
        geometry: { type: "LineString", coordinates: allCoords },
        safetyScore: score,
        steps: (data.trip.legs ?? []).flatMap((leg: any) =>
          (leg.maneuvers ?? []).map((m: any) => ({
            instruction: m.instruction ?? "",
            distance:    (m.length ?? 0) * 1000,
            duration:    m.time ?? 0,
            streetName:  m.street_names?.[0] ?? "",
          }))
        ),
      };
    }

    function fingerprint(coords: number[][]): string {
      if (!coords.length) return "";
      const indices = [0, 0.25, 0.5, 0.75, 1].map(f => Math.floor(f * (coords.length - 1)));
      return indices.map(i => {
        const [lng, lat] = coords[i];
        return `${(lat * 1e4).toFixed(0)},${(lng * 1e4).toFixed(0)}`;
      }).join("|");
    }

    console.log(`[route] SAFEST=${safestPolys.length} | NORMAL=${normalPolys.length} | TIGHT=${tightPolys.length} | FASTEST=0`);

    const [safeData, normalData, tightData, fastData] = await Promise.all([
      fetchValhalla(buildBody(safestPolys), "SAFEST"),
      fetchValhalla(buildBody(normalPolys), "NORMAL"),
      fetchValhalla(buildBody(tightPolys),  "TIGHT"),
      fetchValhalla(buildBody([]),          "FASTEST"),
    ]);

    const candidates = [
      normalise(safeData,   "SAFEST"),
      normalise(normalData, "NORMAL"),
      normalise(tightData,  "TIGHT"),
      normalise(fastData,   "FASTEST"),
    ].filter(Boolean) as NonNullable<ReturnType<typeof normalise>>[];

    const seen = new Map<string, typeof candidates[0]>();
    for (const c of candidates) {
      const fp = fingerprint(c.geometry.coordinates as number[][]);
      const existing = seen.get(fp);
      if (!existing || c.safetyScore > existing.safetyScore) seen.set(fp, c);
    }

    const deduped = [...seen.values()];
    deduped.sort((a, b) => b.safetyScore - a.safetyScore);
    const final = deduped.slice(0, 3);

    console.log(`[route] → ${final.length} trasee: ${final.map(r => `scor=${r.safetyScore} ${(r.distance/1000).toFixed(2)}km`).join(" | ")}`);
    res.json({ routes: final });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();