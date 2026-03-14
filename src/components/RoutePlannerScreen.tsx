import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform, animate } from 'motion/react';
import {
  X, Search, MapPin, Footprints, AlertTriangle, Shield,
  ChevronRight, Zap, Users, Eye, Navigation2, ChevronUp,
} from 'lucide-react';
import { RouteInfo, SearchResult, Report } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RoutePlannerScreenProps {
  onClose: () => void;
  t: any;
  userLocation: [number, number];
  reports: Report[];
  onDrawRoute: (r: RouteInfo) => void;
  onStartNav: (route?: RouteInfo) => void;
  initialDest?: SearchResult | null;
}

interface ZoneHit { reportId: string; weight: number; label: string; }

interface ScoredRoute extends RouteInfo {
  routeLabel: 'safest' | 'balanced' | 'fastest';
  zoneHits: ZoneHit[];
  zonesAvoided: number;
  totalZones: number;
}

// ---------------------------------------------------------------------------
// Sheet snap points (as fraction of viewport height from bottom)
// FULL   = full screen (search mode)
// ROUTES = half screen (routes visible, map visible above)
// PEEK   = tiny nav bar at bottom (navigating)
// ---------------------------------------------------------------------------
const SNAP = {
  FULL:   0.92,   // 92% of screen height
  ROUTES: 0.55,   // 55% — map visible above, routes list below
  PEEK:   0.12,   // just the nav bar
} as const;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function reportRadius(weight: number) { return Math.max(40, weight * 20); }
function reportLabel(r: Report) {
  if (!r.categories?.length) return 'Hazard';
  return r.categories.map(c => c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ')).join(', ');
}
function cosLat(lat: number) { return Math.cos((lat * Math.PI) / 180); }
function distM(lat1: number, lng1: number, lat2: number, lng2: number, cos: number) {
  return Math.sqrt(Math.pow((lat2 - lat1) * 111320, 2) + Math.pow((lng2 - lng1) * 111320 * cos, 2));
}
function interpolate(coords: number[][], cos: number, step = 8): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < coords.length; i++) {
    out.push(coords[i]);
    if (i === coords.length - 1) break;
    const [lng1, lat1] = coords[i], [lng2, lat2] = coords[i + 1];
    const steps = Math.ceil(distM(lat1, lng1, lat2, lng2, cos) / step);
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      out.push([lng1 + (lng2 - lng1) * f, lat1 + (lat2 - lat1) * f]);
    }
  }
  return out;
}
function computeZoneHits(
  geometry: { type: string; coordinates: number[][] } | null | undefined,
  reports: Report[], midLat: number,
): ZoneHit[] {
  if (!geometry?.coordinates?.length) return [];
  const cos = cosLat(midLat);
  const coords = interpolate(geometry.coordinates, cos);
  const seen = new Set<string>();
  const result: ZoneHit[] = [];
  for (const [lng, lat] of coords) {
    for (const r of reports) {
      if (seen.has(r.id)) continue;
      if (distM(lat, lng, r.lat, r.lng, cos) < reportRadius(r.weight)) {
        seen.add(r.id);
        result.push({ reportId: r.id, weight: r.weight, label: reportLabel(r) });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function fetchWalkingRoutes(
  origin: [number, number], destination: [number, number], reports: Report[],
): Promise<RouteInfo[] | null> {
  const dangerZones = reports.map(r => ({ lat: r.lat, lng: r.lng, weight: r.weight, radiusMeters: reportRadius(r.weight) }));
  try {
    const res = await fetch('/api/walking-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, dangerZones }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('[fetchWalkingRoutes]', data.error); return null; }
    if (!data.routes?.length) return null;
    return data.routes.map((r: any, idx: number) => ({
      distance:    r.distance,
      duration:    Math.round(r.duration / 60),
      geometry:    r.geometry,
      safetyScore: r.safetyScore,
      type:        (idx === 0 ? 'safe' : 'fastest') as RouteInfo['type'],
      steps:       r.steps ?? [],
    }));
  } catch (err) { console.error('[fetchWalkingRoutes]', err); return null; }
}

// ---------------------------------------------------------------------------
// ZonePill
// ---------------------------------------------------------------------------
const ZonePill: React.FC<{ hit: ZoneHit }> = ({ hit }) => {
  const cls = hit.weight >= 8 ? 'bg-rose-100 text-rose-700 border-rose-200' : hit.weight >= 5 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}><AlertTriangle size={10} />{hit.label}</span>;
};

// ---------------------------------------------------------------------------
// RouteCard — tapping highlights + previews, button starts nav
// ---------------------------------------------------------------------------
interface RouteCardProps {
  route: ScoredRoute; idx: number;
  isActive: boolean;       // currently previewed/selected
  isNavigating: boolean;   // nav started on this one
  onTap: () => void;       // preview on map
  onStart: () => void;     // start navigation
}

const RouteCard: React.FC<RouteCardProps> = ({ route, idx, isActive, isNavigating, onTap, onStart }) => {
  const [expanded, setExpanded] = useState(false);
  const safetyColor = route.safetyScore >= 80 ? 'text-emerald-600' : route.safetyScore >= 50 ? 'text-amber-500' : 'text-rose-500';
  const safetyBadge = route.safetyScore >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : route.safetyScore >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200';

  const ringColor = isNavigating
    ? 'ring-2 ring-primary'
    : isActive
      ? route.routeLabel === 'safest' ? 'ring-2 ring-emerald-400' : route.routeLabel === 'balanced' ? 'ring-2 ring-amber-400' : 'ring-2 ring-slate-400'
      : '';

  const RouteIcon = route.routeLabel === 'safest' ? Shield : route.routeLabel === 'balanced' ? Users : Zap;
  const routeTitle = route.routeLabel === 'safest' ? 'Safest' : route.routeLabel === 'balanced' ? 'Balanced' : 'Fastest';

  return (
    <div
      onClick={onTap}
      className={`bg-white rounded-2xl p-4 cursor-pointer transition-all shadow-sm border border-slate-100 ${ringColor}`}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
            route.routeLabel === 'safest' ? 'bg-emerald-50 text-emerald-600' :
            route.routeLabel === 'balanced' ? 'bg-amber-50 text-amber-600' :
            'bg-slate-100 text-slate-600'
          }`}>
            <RouteIcon size={16} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">{routeTitle}</p>
            <p className={`text-[10px] font-bold ${safetyColor}`}>
              {route.safetyScore >= 80 ? `${route.safetyScore}% safe` : route.safetyScore >= 50 ? `${route.safetyScore}% caution` : `${route.safetyScore}% risk`}
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${safetyBadge}`}>
          {route.safetyScore >= 80 ? (idx === 0 ? 'Best' : 'Safe') : route.safetyScore >= 50 ? 'Caution' : 'Risk'}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-3">
        <div className="text-center">
          <p className="text-lg font-black text-slate-900 leading-none">{route.duration}</p>
          <p className="text-[10px] text-slate-400 font-bold">min</p>
        </div>
        <div className="w-px bg-slate-100" />
        <div className="text-center">
          <p className="text-lg font-black text-slate-900 leading-none">{(route.distance / 1000).toFixed(1)}</p>
          <p className="text-[10px] text-slate-400 font-bold">km</p>
        </div>
        <div className="w-px bg-slate-100" />
        <div className="text-center">
          <p className={`text-lg font-black leading-none ${route.zoneHits.length > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
            {route.zoneHits.length}
          </p>
          <p className="text-[10px] text-slate-400 font-bold">hazards</p>
        </div>
        <div className="flex-1" />
        {/* Hazard expand button */}
        {route.zoneHits.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5 hover:text-slate-600"
          >
            <ChevronRight size={10} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>

      {/* Zone hits */}
      <AnimatePresence>
        {expanded && route.zoneHits.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
            <div className="flex flex-wrap gap-1 pt-1 pb-2 border-t border-slate-50">
              {route.zoneHits.slice().sort((a, b) => b.weight - a.weight).map(hit => <ZonePill key={hit.reportId} hit={hit} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {route.zoneHits.length === 0 && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 mb-3">
          <Shield size={10} /> Clear of all reported hazards
        </div>
      )}

      {/* Start button — only show when this card is active */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <button
              onClick={e => { e.stopPropagation(); onStart(); }}
              className={`w-full mt-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                isNavigating
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                  : 'bg-primary text-white shadow-lg shadow-primary/20'
              }`}
            >
              {isNavigating ? '✓ Navigating — tap to resume' : 'Start Navigation'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main — bottom sheet with 3 snap points
// ---------------------------------------------------------------------------
export const RoutePlannerScreen = ({
  onClose, t, userLocation, reports, onDrawRoute, onStartNav, initialDest,
}: RoutePlannerScreenProps) => {
  const [query, setQuery]                 = useState(initialDest?.display_name ?? '');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedDest, setSelectedDest]   = useState<SearchResult | null>(initialDest ?? null);
  const [loading, setLoading]             = useState(false);
  const [searchError, setSearchError]     = useState<string | null>(null);
  const [routeError, setRouteError]       = useState<string | null>(null);
  const [routes, setRoutes]               = useState<ScoredRoute[]>([]);
  const [activeIdx, setActiveIdx]         = useState(0);   // previewed route
  const [navIdx, setNavIdx]               = useState(-1);  // navigating route
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]); 
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sheet drag state ────────────────────────────────────────────────────
  // snapFrac: current snap point as fraction of vh
  const [snapFrac, setSnapFrac] = useState(SNAP.FULL);
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  // y = distance from top of viewport to top of sheet
  // snapFrac=0.92 → y = vh*(1-0.92) = 0.08*vh (almost full screen)
  // snapFrac=0.12 → y = vh*0.88 (peek)
  const sheetY = useMotionValue(vh * (1 - SNAP.FULL));
  const dragStartY = useRef(0);
  const dragStartSheetY = useRef(0);
  const isDragging = useRef(false);

  function snapTo(frac: typeof SNAP[keyof typeof SNAP]) {
    setSnapFrac(frac);
    animate(sheetY, vh * (1 - frac), { type: 'spring', stiffness: 400, damping: 40 });
  }

  // When routes arrive → snap to ROUTES
  useEffect(() => {
    if (routes.length > 0 && !loading) snapTo(SNAP.ROUTES);
  }, [routes.length, loading]);

  // Search mode → snap to FULL
  useEffect(() => {
    if (!selectedDest && routes.length === 0) snapTo(SNAP.FULL);
  }, [selectedDest]);

  // Drag handlers on the handle pill
  function onDragHandlePointerDown(e: React.PointerEvent) {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartSheetY.current = sheetY.get();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDragHandlePointerMove(e: React.PointerEvent) {
    if (!isDragging.current) return;
    const delta = e.clientY - dragStartY.current;
    const newY = Math.max(vh * (1 - SNAP.FULL), Math.min(vh * (1 - SNAP.PEEK), dragStartSheetY.current + delta));
    sheetY.set(newY);
  }
  function onDragHandlePointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const currentY = sheetY.get();
    const currentFrac = 1 - currentY / vh;
    // Snap to nearest
    const snaps = [SNAP.PEEK, SNAP.ROUTES, SNAP.FULL] as const;
    const nearest = snaps.reduce((a, b) => Math.abs(b - currentFrac) < Math.abs(a - currentFrac) ? b : a);
    snapTo(nearest);
  }

  // ── Search ───────────────────────────────────────────────────────────────
  useEffect(() => {
  if (initialDest) computeRoutes(initialDest);

  const saved = localStorage.getItem("recentSearches");
  if (saved) {
    try {
      setRecentSearches(JSON.parse(saved));
    } catch {}
  }
}, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3 || (selectedDest && query === selectedDest.display_name)) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => doSearch(query), 600);
  }, [query]);

  const doSearch = async (val: string) => {
    setSearchError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(val)}&lat=${userLocation[0]}&lon=${userLocation[1]}&viewbox=${userLocation[1]-0.1},${userLocation[0]+0.1},${userLocation[1]+0.1},${userLocation[0]-0.1}`);
      if (!res.ok) { setSearchError('Search service unavailable.'); return; }
      setSearchResults(await res.json());
    } catch { setSearchError('Network error. Check your connection.'); }
  };

  function saveRecent(dest: SearchResult) {
  setRecentSearches(prev => {
    const filtered = prev.filter(p => p.display_name !== dest.display_name);
    const updated = [dest, ...filtered].slice(0, 3);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
    return updated;
  });
}

  const computeRoutes = async (dest: SearchResult) => {
  setSelectedDest(dest);
  setSearchResults([]);
  setRoutes([]);
  setRouteError(null);
  setNavIdx(-1);
  setActiveIdx(0);
  setLoading(true);

  saveRecent(dest);

  try {
    const rawRoutes = await fetchWalkingRoutes(
      [userLocation[0], userLocation[1]],
      [parseFloat(dest.lat), parseFloat(dest.lon)],
      reports
    );

    if (!rawRoutes?.length) throw new Error('Could not calculate a walking route.');

    const midLat = (userLocation[0] + parseFloat(dest.lat)) / 2;

    const enriched: ScoredRoute[] = rawRoutes.map((r) => {
      const hits = computeZoneHits(r.geometry as any, reports, midLat);

      return {
        ...r,
        zoneHits: hits,
        zonesAvoided: reports.length - hits.length,
        totalZones: reports.length,
        routeLabel: "fastest"
      };
    });

    const safest = [...enriched].sort((a,b)=>b.safetyScore-a.safetyScore)[0];
    const fastest = [...enriched].sort((a,b)=>a.duration-b.duration)[0];
    const balanced = enriched.find(r => r !== safest && r !== fastest) ?? fastest;

    const labeled = enriched.map(r => {
      if (r === safest) return { ...r, routeLabel: "safest" };
      if (r === fastest) return { ...r, routeLabel: "fastest" };
      return { ...r, routeLabel: "balanced" };
    });

    setRoutes(labeled);
    setActiveIdx(labeled.findIndex(r => r.routeLabel === "safest"));
    onDrawRoute(labeled.find(r => r.routeLabel === "safest")!);

  } catch (err: any) {
    setRouteError(err.message ?? 'Failed to calculate routes.');
  } finally {
    setLoading(false);
  }
};

  const handleTapRoute = useCallback((route: ScoredRoute, idx: number) => {
    setActiveIdx(idx);
    onDrawRoute(route);
    // If sheet is at PEEK, expand back to ROUTES so user can see the card
    if (snapFrac === SNAP.PEEK) snapTo(SNAP.ROUTES);
  }, [onDrawRoute, snapFrac]);

  const handleStartNav = useCallback((route: ScoredRoute, idx: number) => {
    setActiveIdx(idx);
    setNavIdx(idx);
    onDrawRoute(route);
    onStartNav(route);
    // Collapse to PEEK — map fully visible, tiny bar at bottom
    snapTo(SNAP.PEEK);
  }, [onDrawRoute, onStartNav]);

  const handleClose = () => {
    animate(sheetY, vh, { type: 'spring', stiffness: 400, damping: 40, onComplete: onClose });
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const isNavigating = navIdx >= 0;
  const navRoute = isNavigating ? routes[navIdx] : null;

  return (
    // Backdrop — only shown at FULL, fades out at other snaps
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Sheet */}
      <motion.div
        className="absolute left-0 right-0 bottom-0 pointer-events-auto"
        style={{ top: sheetY, borderRadius: '24px 24px 0 0', background: 'white', boxShadow: '0 -4px 40px rgba(0,0,0,0.12)' }}
      >
        {/* ── Drag handle ── */}
        <div
          className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onDragHandlePointerDown}
          onPointerMove={onDragHandlePointerMove}
          onPointerUp={onDragHandlePointerUp}
        >
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* ── PEEK mode: compact nav bar ── */}
        {snapFrac === SNAP.PEEK && navRoute && (
          <div
            className="flex items-center gap-4 px-6 py-3 cursor-pointer"
            onClick={() => snapTo(SNAP.ROUTES)}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Navigation2 size={20} className="animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-primary uppercase tracking-widest">Navigating</p>
              <p className="text-sm font-bold text-slate-900 truncate">{selectedDest?.display_name}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-lg font-black text-slate-900 leading-none">{navRoute.duration}</p>
                <p className="text-[10px] text-slate-400 font-bold">min</p>
              </div>
              <ChevronUp size={18} className="text-slate-400" />
            </div>
          </div>
        )}

        {/* ── PEEK mode without nav ── */}
        {snapFrac === SNAP.PEEK && !navRoute && (
          <div className="flex items-center justify-between px-6 py-3 cursor-pointer" onClick={() => snapTo(SNAP.ROUTES)}>
            <p className="text-sm font-bold text-slate-600">Tap to see routes</p>
            <ChevronUp size={18} className="text-slate-400" />
          </div>
        )}

        {/* ── ROUTES / FULL mode content ── */}
        {snapFrac !== SNAP.PEEK && (
          <div className="flex flex-col h-[calc(100%-44px)]"> {/* 44px = handle + padding */}

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              {selectedDest ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <MapPin size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest">To</p>
                    <p className="text-sm font-bold text-slate-900 truncate">{selectedDest.display_name}</p>
                  </div>
                  {!loading && routes.length > 0 && (
                    <button
                      onClick={() => { setSelectedDest(null); setRoutes([]); setNavIdx(-1); setQuery(''); snapTo(SNAP.FULL); }}
                      className="shrink-0 text-[10px] font-black text-slate-400 hover:text-slate-600 px-2 py-1"
                    >
                      Change
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Footprints size={14} />
                  </div>
                  <h2 className="text-base font-black text-slate-900">{t?.safeRoute ?? 'Safe Route'}</h2>
                </div>
              )}
              <button onClick={handleClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 ml-3 shrink-0">
                <X size={14} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 flex flex-col gap-4">

              {/* Search box */}
{!selectedDest && (
  <>
    {recentSearches.length > 0 && (
      <div className="flex flex-col gap-2 mb-2">
        <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest">
          Recent
        </p>

        {recentSearches.map((r, i) => (
          <button
            key={i}
            onClick={() => computeRoutes(r)}
            className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition"
          >
            <MapPin size={14} className="text-slate-400" />
            <span className="text-sm font-bold text-slate-700 truncate">
              {r.display_name}
            </span>
          </button>
        ))}
      </div>
    )}

    <div className="relative">
      <Search
        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        size={16}
      />

      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedDest(null);
        }}
        placeholder={t?.whereGoing ?? "Where are you going?"}
        autoFocus
        className="w-full h-12 bg-slate-50 rounded-xl pl-11 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-900"
      />

      {searchError && (
        <div className="mt-2 bg-rose-50 text-rose-600 p-3 rounded-xl text-xs font-bold border border-rose-100">
          {searchError}
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="mt-1 bg-white rounded-xl overflow-hidden shadow-lg border border-slate-100">
          {searchResults.map((result, i) => (
            <button
              key={i}
              onClick={() => {
                setQuery(result.display_name);
                computeRoutes(result);
              }}
              className="w-full p-4 text-left hover:bg-slate-50 flex items-start gap-3 border-b border-slate-50 last:border-0 transition-colors"
            >
              <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
              <span className="text-sm font-bold text-slate-700 leading-tight">
                {result.display_name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  </>
)}

              {/* Loading */}
              {loading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-bold text-slate-400">Finding safe routes…</p>
                </div>
              )}

              {/* Error */}
              {routeError && !loading && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p className="text-sm font-bold">{routeError}</p>
                </div>
              )}

              {/* Hazard legend */}
              {reports.length > 0 && !loading && routes.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest">{reports.length} hazard{reports.length !== 1 ? 's' : ''} nearby</p>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />Critical</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Moderate</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-500"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />Minor</span>
                </div>
              )}

              {/* Route cards */}
              {!loading && routes.length > 0 && (
                <div className="flex flex-col gap-3">
                  {routes.map((route, idx) => (
                    <RouteCard
                      key={`${route.routeLabel}-${idx}`}
                      route={route} idx={idx}
                      isActive={idx === activeIdx}
                      isNavigating={idx === navIdx}
                      onTap={() => handleTapRoute(route, idx)}
                      onStart={() => handleStartNav(route, idx)}
                    />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!loading && !routeError && routes.length === 0 && !selectedDest && (
                <div className="flex flex-col items-center py-12 gap-3 text-slate-300">
                  <Footprints size={40} />
                  <p className="text-sm font-bold text-center">Search for a destination</p>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};