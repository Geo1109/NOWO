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
    const { q, lat, lon, viewbox } = req.query;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q as string)}&limit=5&lat=${lat}&lon=${lon}&viewbox=${viewbox}&bounded=1&email=stangeorgian38@gmail.com`;
      const r = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "SafeWalk-App" } });
      res.json(await r.json());
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
  // Uses Stadia Maps (Valhalla) with exclude_polygons.
  //
  // STRATEGY — always returns up to 3 genuinely different routes:
  //
  //   1. SAFEST   — all corridor zones excluded (radius ×1.5 buffer)
  //   2. FASTEST  — no exclusions at all, pure shortest path
  //   3. DETOUR   — forced via-point that nudges Valhalla onto a different
  //                 street network regardless of zone weights. This is the
  //                 key to getting a 3rd distinct route even when all zones
  //                 have the same weight.
  //
  // The via-point for DETOUR is the midpoint of origin→destination shifted
  // 90° left by 15% of the route length. This is enough to make Valhalla
  // pick a different set of streets without making the route absurdly long.
  //
  // Deduplication uses coordinate fingerprinting (first+mid+last coord hash)
  // rather than distance comparison, so routes that happen to be the same
  // length but use different streets are both kept.
  // ---------------------------------------------------------------------------
  app.post("/api/walking-route", async (req, res) => {
    const STADIA_KEY = process.env.STADIA_API_KEY;
    if (!STADIA_KEY) { res.status(500).json({ error: "STADIA_API_KEY not set" }); return; }

    const { origin, destination, dangerZones } = req.body;
    if (!origin || !destination) { res.status(400).json({ error: "origin and destination required" }); return; }

    const allZones: Array<{ lat: number; lng: number; weight: number; radiusMeters: number }> = dangerZones ?? [];
    const cos = cosLat((origin[0] + destination[0]) / 2);

    // Filter zones to corridor around the route
    const routeDist = distM(origin[0], origin[1], destination[0], destination[1], cos);
    const corridor  = Math.max(routeDist / 2, 400);
    const midLat    = (origin[0] + destination[0]) / 2;
    const midLng    = (origin[1] + destination[1]) / 2;
    const zones     = allZones.filter(z => distM(z.lat, z.lng, midLat, midLng, cos) < corridor + z.radiusMeters);

    console.log("─".repeat(50));
    console.log(`[route] ${origin[0].toFixed(5)},${origin[1].toFixed(5)} → ${destination[0].toFixed(5)},${destination[1].toFixed(5)}`);
    console.log(`[route] ${allZones.length} zones total → ${zones.length} in corridor`);

    const STADIA_URL = `https://api.stadiamaps.com/route/v1?api_key=${STADIA_KEY}`;

    // All zones excluded (with buffer), used for SAFEST
    const safestPolys = zones.map(z => circleToPolygon(z.lat, z.lng, z.radiusMeters * 1.5, cos));

    // -----------------------------------------------------------------------
    // Compute a via-point 90° left of the path for the DETOUR route.
    // We shift the midpoint perpendicularly by 15% of route length.
    // This forces Valhalla to route through a different part of the street
    // network, giving a genuinely distinct 3rd option.
    // -----------------------------------------------------------------------
    const DEG = 111320;
    const dLatDeg = destination[0] - origin[0];
    const dLngDeg = destination[1] - origin[1];
    // Convert to metric to get true perpendicular
    const dLatM = dLatDeg * DEG;
    const dLngM = dLngDeg * DEG * cos;
    const len   = Math.sqrt(dLatM * dLatM + dLngM * dLngM);
    const shift = len * 0.18; // 18% of route length sideways
    // Perpendicular left unit vector (rotate 90° CCW)
    const perpLatM = -dLngM / len;
    const perpLngM =  dLatM / len;
    const viaLat = midLat + (perpLatM * shift) / DEG;
    const viaLng = midLng + (perpLngM * shift) / (DEG * cos);

    // Also try right side
    const viaLatR = midLat - (perpLatM * shift) / DEG;
    const viaLngR = midLng - (perpLngM * shift) / (DEG * cos);

    function buildBody(excludePolygons: [number, number][][], via?: [number, number]) {
      const locations: any[] = [
        { lat: origin[0],      lon: origin[1],      type: "break" },
      ];
      if (via) locations.push({ lat: via[0], lon: via[1], type: "through" });
      locations.push({ lat: destination[0], lon: destination[1], type: "break" });

      const body: any = {
        locations,
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
      // Stadia returns one shape per leg; concat all legs for multi-via routes
      const allCoords: number[][] = [];
      for (const leg of data.trip.legs ?? []) {
        if (!leg.shape) continue;
        const decoded = decodePolyline6(leg.shape);
        // Avoid duplicating the junction point between legs
        if (allCoords.length > 0) decoded.shift();
        allCoords.push(...decoded);
      }
      if (!allCoords.length) return null;

      const { score, hits } = scoreCoords(allCoords, zones, cos);
      const distance = (data.trip.summary?.length ?? 0) * 1000;
      const duration = data.trip.summary?.time ?? 0;
      console.log(`[route] ${label}: ${(distance / 1000).toFixed(2)}km score=${score} hits=${hits.length}/${zones.length}`);
      if (hits.length) hits.forEach(h => console.log(`  !! zone w=${h.weight} @ ${h.lat.toFixed(5)},${h.lng.toFixed(5)}`));

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

    // -----------------------------------------------------------------------
    // Fingerprint a route by sampling coords at 0%, 25%, 50%, 75%, 100%
    // Rounds to ~11m grid. Two routes are "same" if all 5 samples match.
    // This is much more accurate than distance-based deduplication.
    // -----------------------------------------------------------------------
    function fingerprint(coords: number[][]): string {
      if (!coords.length) return "";
      const indices = [0, 0.25, 0.5, 0.75, 1].map(f => Math.floor(f * (coords.length - 1)));
      return indices.map(i => {
        const [lng, lat] = coords[i];
        return `${(lat * 1e4).toFixed(0)},${(lng * 1e4).toFixed(0)}`;
      }).join("|");
    }

    // Fire all requests in parallel
    console.log(`[route] safestPolys=${safestPolys.length} via=(${viaLat.toFixed(5)},${viaLng.toFixed(5)})`);

    const [safeData, fastData, detourLData, detourRData] = await Promise.all([
      fetchValhalla(buildBody(safestPolys),                        "SAFEST"),
      fetchValhalla(buildBody([]),                                 "FASTEST"),
      fetchValhalla(buildBody(safestPolys, [viaLat,  viaLng ]),   "DETOUR-L"),
      fetchValhalla(buildBody(safestPolys, [viaLatR, viaLngR]),   "DETOUR-R"),
    ]);

    const candidates = [
      normalise(safeData,    "SAFEST"),
      normalise(fastData,    "FASTEST"),
      normalise(detourLData, "DETOUR-L"),
      normalise(detourRData, "DETOUR-R"),
    ].filter(Boolean) as NonNullable<ReturnType<typeof normalise>>[];

    // Deduplicate by coordinate fingerprint — keep safest among identical paths
    const seen = new Map<string, typeof candidates[0]>();
    for (const c of candidates) {
      const fp = fingerprint(c.geometry.coordinates as number[][]);
      const existing = seen.get(fp);
      if (!existing || c.safetyScore > existing.safetyScore) seen.set(fp, c);
    }

    const deduped = [...seen.values()];
    deduped.sort((a, b) => b.safetyScore - a.safetyScore);
    const final = deduped.slice(0, 3);

    console.log(`[route] → ${final.length} routes: ${final.map(r => `score=${r.safetyScore} ${(r.distance/1000).toFixed(2)}km`).join(" | ")}`);
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