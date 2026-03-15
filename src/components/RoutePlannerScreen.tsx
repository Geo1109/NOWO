import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Footprints, AlertTriangle, Shield, ChevronRight, Zap, Users, Navigation2, ChevronUp, X } from 'lucide-react';
import { RouteInfo, SearchResult, Report } from '../types';
import { API_URL } from '../config/api';

interface RoutePlannerScreenProps {
  onClose: () => void; t: any; userLocation: [number, number]; reports: Report[];
  onDrawRoute: (r: RouteInfo) => void; onStartNav: (route?: RouteInfo, dest?: SearchResult) => void;
  initialDest?: SearchResult | null; isNavigating: boolean; activeRoute: RouteInfo | null;
  onStopNav: () => void; distanceRemaining?: number;
  onSnapChange?: (snap: 'SEARCH' | 'ROUTES' | 'FULL') => void;
  autoNavigate?: boolean;
  /** Called when the component triggers a reroute — parent should call onDrawRoute + onStartNav */
  onReroute?: (dest: SearchResult) => void;
  /** Whether a reroute is currently in progress (shows spinner in nav bar) */
  isRerouting?: boolean;
}

interface ZoneHit { reportId: string; weight: number; label: string; }
interface ScoredRoute extends RouteInfo {
  routeLabel: 'safest' | 'balanced' | 'fastest';
  zoneHits: ZoneHit[]; zonesAvoided: number; totalZones: number;
}

// ── Snap constants ───────────────────────────────────────────────────────────
const NAV_BASE_H       = 64;   // BottomNav min-height
const HANDLE_SEARCH_H  = 116;  // handle + search bar + padding
const SEARCH_H         = NAV_BASE_H + HANDLE_SEARCH_H;
const SNAP_ROUTES_FRAC = 0.55;
// FULL is capped to leave at least 100px at the top so the header is always visible
// and the user can always swipe the sheet back down
const SNAP_FULL_MAX_FROM_TOP = 100; // px from top of screen

/** Shared danger zone radius in metres — must match App.tsx visual circles */
export const DANGER_ZONE_RADIUS_M = 20;

// ── Geometry helpers ─────────────────────────────────────────────────────────
function reportRadius(_weight: number) { return DANGER_ZONE_RADIUS_M; }
function reportLabel(r: Report) {
  if (!r.categories?.length) return 'Pericol';
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
function computeZoneHits(geometry: any, reports: Report[], midLat: number): ZoneHit[] {
  if (!geometry?.coordinates?.length) return [];
  const cos = cosLat(midLat);
  const coords = interpolate(geometry.coordinates, cos);
  const seen = new Set<string>(); const result: ZoneHit[] = [];
  for (const [lng, lat] of coords) {
    for (const r of reports) {
      if (seen.has(r.id)) continue;
      if (distM(lat, lng, r.lat, r.lng, cos) < reportRadius(r.weight)) {
        seen.add(r.id); result.push({ reportId: r.id, weight: r.weight, label: reportLabel(r) });
      }
    }
  }
  return result;
}

async function fetchWalkingRoutes(origin: [number, number], destination: [number, number], reports: Report[]): Promise<RouteInfo[] | null> {
  const dangerZones = reports.map(r => ({ lat: r.lat, lng: r.lng, weight: r.weight, radiusMeters: reportRadius(r.weight) }));
  try {
    const res = await fetch(`${API_URL}/api/walking-route`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin, destination, dangerZones }) });
    const data = await res.json();
    if (!res.ok) { console.error('[fetchWalkingRoutes]', data.error); return null; }
    if (!data.routes?.length) return null;
    return data.routes.map((r: any, idx: number) => ({ distance: r.distance, duration: Math.round(r.duration / 60), geometry: r.geometry, safetyScore: r.safetyScore, type: (idx === 0 ? 'safe' : 'fastest') as RouteInfo['type'], steps: r.steps ?? [] }));
  } catch (err) { console.error('[fetchWalkingRoutes]', err); return null; }
}

const ZonePill: React.FC<{ hit: ZoneHit }> = ({ hit }) => {
  const cls = hit.weight >= 8 ? 'bg-rose-100 text-rose-700 border-rose-200' : hit.weight >= 5 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200';
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}><AlertTriangle size={10} />{hit.label}</span>;
};

const RouteCard: React.FC<{ route: ScoredRoute; idx: number; isActive: boolean; isNavigating: boolean; onTap: () => void; onStart: () => void; }> = ({ route, idx, isActive, isNavigating, onTap, onStart }) => {
  const [expanded, setExpanded] = useState(false);
  const safetyColor = route.safetyScore >= 80 ? 'text-emerald-600' : route.safetyScore >= 50 ? 'text-amber-500' : 'text-rose-500';
  const safetyBadge = route.safetyScore >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : route.safetyScore >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200';
  const ringColor = isNavigating ? 'ring-2 ring-primary' : isActive ? route.routeLabel === 'safest' ? 'ring-2 ring-emerald-400' : route.routeLabel === 'balanced' ? 'ring-2 ring-amber-400' : 'ring-2 ring-slate-400' : '';
  const RouteIcon = route.routeLabel === 'safest' ? Shield : route.routeLabel === 'balanced' ? Users : Zap;
  const routeTitle = route.routeLabel === 'safest' ? 'Cel mai sigur' : route.routeLabel === 'balanced' ? 'Echilibrat' : 'Cel mai rapid';
  return (
    <div onClick={onTap} className={`bg-white rounded-2xl p-4 cursor-pointer transition-all shadow-sm border border-slate-100 ${ringColor}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${route.routeLabel === 'safest' ? 'bg-emerald-50 text-emerald-600' : route.routeLabel === 'balanced' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}><RouteIcon size={16} /></div>
          <div>
            <p className="text-sm font-black text-slate-900">{routeTitle}</p>
            <p className={`text-[10px] font-bold ${safetyColor}`}>{route.safetyScore >= 80 ? `${route.safetyScore}% sigur` : route.safetyScore >= 50 ? `${route.safetyScore}% atenție` : `${route.safetyScore}% risc`}</p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${safetyBadge}`}>{route.safetyScore >= 80 ? (idx === 0 ? 'Recomandat' : 'Sigur') : route.safetyScore >= 50 ? 'Atenție' : 'Risc'}</span>
      </div>
      <div className="flex gap-4 mb-3">
        <div className="text-center"><p className="text-lg font-black text-slate-900 leading-none">{route.duration}</p><p className="text-[10px] text-slate-400 font-bold">min</p></div>
        <div className="w-px bg-slate-100" />
        <div className="text-center"><p className="text-lg font-black text-slate-900 leading-none">{(route.distance / 1000).toFixed(1)}</p><p className="text-[10px] text-slate-400 font-bold">km</p></div>
        <div className="w-px bg-slate-100" />
        <div className="text-center"><p className={`text-lg font-black leading-none ${route.zoneHits.length > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{route.zoneHits.length}</p><p className="text-[10px] text-slate-400 font-bold">pericole</p></div>
        <div className="flex-1" />
        {route.zoneHits.length > 0 && <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }} className="text-slate-400 flex items-center hover:text-slate-600"><ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} /></button>}
      </div>
      <AnimatePresence>
        {expanded && route.zoneHits.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
            <div className="flex flex-wrap gap-1 pt-1 pb-2 border-t border-slate-50">{route.zoneHits.slice().sort((a, b) => b.weight - a.weight).map(hit => <ZonePill key={hit.reportId} hit={hit} />)}</div>
          </motion.div>
        )}
      </AnimatePresence>
      {route.zoneHits.length === 0 && <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 mb-3"><Shield size={10} /> Fără zone periculoase</div>}
      <AnimatePresence>
        {isActive && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <button onClick={e => { e.stopPropagation(); onStart(); }}
              className={`w-full mt-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isNavigating ? 'bg-emerald-500 text-white' : 'bg-primary text-white shadow-lg shadow-primary/20'}`}>
              {isNavigating ? '✓ Navighez — apasă pentru a relua' : 'Pornește navigarea'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NavigationBar: React.FC<{
  route: RouteInfo; destination: string; userLocation: [number, number];
  onStop: () => void; onExpand: () => void; isRerouting?: boolean;
}> = ({ route, destination, userLocation, onStop, onExpand, isRerouting }) => {
  const destCoord = route.geometry?.coordinates?.[(route.geometry?.coordinates?.length ?? 1) - 1];
  const remainingDist = destCoord ? distM(userLocation[0], userLocation[1], destCoord[1], destCoord[0], cosLat(userLocation[0])) : route.distance;
  const remainingMin = Math.round(remainingDist / (4.5 * 1000 / 60));
  return (
    <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-0 left-0 right-0 z-[70]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
      <div className="mx-3 mb-3 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3" onClick={onExpand}>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            {isRerouting
              ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              : <Navigation2 size={20} className="animate-pulse" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: isRerouting ? '#f97316' : undefined }} >
              {isRerouting ? 'Recalculez traseul…' : 'Navighez'}
            </p>
            <p className="text-sm font-bold text-slate-900 truncate">{destination}</p>
          </div>
          {!isRerouting && (
            <div className="text-right shrink-0 mr-2">
              <p className="text-xl font-black text-slate-900 leading-none">{remainingMin}</p>
              <p className="text-[10px] text-slate-400 font-bold">min rămas</p>
            </div>
          )}
          <ChevronUp size={16} className="text-slate-400 shrink-0" />
        </div>
        <button onClick={e => { e.stopPropagation(); onStop(); }} className="w-full py-2.5 border-t border-slate-100 text-xs font-black text-rose-500 uppercase tracking-widest">
          Oprește navigarea
        </button>
      </div>
    </motion.div>
  );
};

export const RoutePlannerScreen = ({
  onClose, t, userLocation, reports, onDrawRoute, onStartNav,
  initialDest, isNavigating, activeRoute, onStopNav, onSnapChange, autoNavigate,
  onReroute, isRerouting,
}: RoutePlannerScreenProps) => {
  const [query, setQuery]                   = useState(initialDest?.display_name ?? '');
  const [searchResults, setSearchResults]   = useState<SearchResult[]>([]);
  const [selectedDest, setSelectedDest]     = useState<SearchResult | null>(initialDest ?? null);
  const [loading, setLoading]               = useState(false);
  const [searchError, setSearchError]       = useState<string | null>(null);
  const [routeError, setRouteError]         = useState<string | null>(null);
  const [routes, setRoutes]                 = useState<ScoredRoute[]>([]);
  const [activeIdx, setActiveIdx]           = useState(0);
  const [navIdx, setNavIdx]                 = useState(-1);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [isFocused, setIsFocused]           = useState(false);
  const [contentReady, setContentReady]     = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure safe-area-inset-bottom once
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);
  useEffect(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom);width:1px;pointer-events:none;opacity:0;';
    document.body.appendChild(el);
    setSafeAreaBottom(el.offsetHeight);
    document.body.removeChild(el);
  }, []);

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const snapPx = {
    SEARCH: SEARCH_H + safeAreaBottom,
    ROUTES: Math.round(vh * SNAP_ROUTES_FRAC),
    // FULL: at most 90% of vh, but never closer than 100px to the top of the screen
    FULL: Math.min(Math.round(vh * 0.90), vh - SNAP_FULL_MAX_FROM_TOP),
  };

  const [sheetHeight, setSheetHeight] = useState(snapPx.SEARCH);
  const [snapState, setSnapState]     = useState<'SEARCH' | 'ROUTES' | 'FULL'>('SEARCH');
  const snapPxRef                     = useRef(snapPx);
  useEffect(() => { snapPxRef.current = snapPx; }, [snapPx.SEARCH, snapPx.ROUTES, snapPx.FULL]);

  function snapTo(state: 'SEARCH' | 'ROUTES' | 'FULL') {
    setSnapState(state);
    onSnapChange?.(state);
    setSheetHeight(snapPxRef.current[state]);
    if (state === 'FULL' || state === 'ROUTES') {
      setContentReady(false);
      setTimeout(() => setContentReady(true), 380);
    }
  }

  // ── Drag ─────────────────────────────────────────────────────────────────
  const handleRef  = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0), dragStartH = useRef(0);
  const isDragging = useRef(false), lastY = useRef(0), velocity = useRef(0), lastTime = useRef(0);

  function onPointerDown(e: React.PointerEvent) {
    isDragging.current = true; dragStartY.current = e.clientY; dragStartH.current = sheetHeight;
    lastY.current = e.clientY; lastTime.current = Date.now(); velocity.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging.current) return;
    const now = Date.now(), dt = now - lastTime.current;
    velocity.current = dt > 0 ? (e.clientY - lastY.current) / dt : 0;
    lastY.current = e.clientY; lastTime.current = now;
    const { SEARCH, FULL } = snapPxRef.current;
    setSheetHeight(Math.max(SEARCH, Math.min(FULL, dragStartH.current + (dragStartY.current - e.clientY))));
  }
  function onPointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const h = sheetHeight, vel = velocity.current, px = snapPxRef.current;
    const states: ('SEARCH' | 'ROUTES' | 'FULL')[] = ['SEARCH', 'ROUTES', 'FULL'];
    let target: 'SEARCH' | 'ROUTES' | 'FULL';
    if (Math.abs(vel) > 0.5) {
      target = vel > 0 ? (h > px.ROUTES ? 'ROUTES' : 'SEARCH') : (h < px.ROUTES ? 'ROUTES' : 'FULL');
    } else {
      target = states.reduce((a, b) => Math.abs(px[b] - h) < Math.abs(px[a] - h) ? b : a);
    }
    snapTo(target);
  }

  useEffect(() => {
    try { const s = localStorage.getItem('recentSearches'); if (s) setRecentSearches(JSON.parse(s)); } catch {}
  }, []);

  const prevInitialDest = useRef<SearchResult | null | undefined>(null);
  useEffect(() => {
    if (initialDest && initialDest !== prevInitialDest.current) {
      prevInitialDest.current = initialDest;
      setQuery(initialDest.display_name);
      computeRoutes(initialDest, autoNavigate);
    }
  }, [initialDest]);

  useEffect(() => { if (routes.length > 0 && !loading) snapTo('ROUTES'); }, [routes.length, loading]);
  useEffect(() => { if (isFocused && !selectedDest) snapTo('FULL'); }, [isFocused, selectedDest]);
  useEffect(() => {
    if (isNavigating) { setSheetHeight(0); setSnapState('SEARCH'); onSnapChange?.('SEARCH'); }
    else if (navIdx >= 0 && routes.length > 0) snapTo('ROUTES');
  }, [isNavigating]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3 || (selectedDest && query === selectedDest.display_name)) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => doSearch(query), 600);
  }, [query]);

  const doSearch = async (val: string) => {
    setSearchError(null);
    try {
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(val)}&lat=${userLocation[0]}&lon=${userLocation[1]}`);
      if (!res.ok) { setSearchError('Serviciu indisponibil.'); return; }
      setSearchResults(await res.json());
    } catch { setSearchError('Eroare de rețea.'); }
  };

  function saveRecent(dest: SearchResult) {
    setRecentSearches(prev => {
      const updated = [dest, ...prev.filter(p => p.display_name !== dest.display_name)].slice(0, 3);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
      return updated;
    });
  }

  const computeRoutes = async (dest: SearchResult, autoNav = false) => {
    setSelectedDest(dest); setSearchResults([]); setRoutes([]); setRouteError(null);
    setNavIdx(-1); setActiveIdx(0); setLoading(true);
    saveRecent(dest); inputRef.current?.blur(); setIsFocused(false);
    try {
      const rawRoutes = await fetchWalkingRoutes([userLocation[0], userLocation[1]], [parseFloat(dest.lat), parseFloat(dest.lon)], reports);
      if (!rawRoutes?.length) throw new Error('Nu s-a putut calcula un traseu.');
      const midLat = (userLocation[0] + parseFloat(dest.lat)) / 2;
      const enriched: ScoredRoute[] = rawRoutes.map(r => ({ ...r, zoneHits: computeZoneHits(r.geometry, reports, midLat), zonesAvoided: 0, totalZones: reports.length, routeLabel: 'fastest' as ScoredRoute['routeLabel'] }));
      enriched.forEach(r => { r.zonesAvoided = reports.length - r.zoneHits.length; });
      const safest  = [...enriched].sort((a, b) => b.safetyScore - a.safetyScore)[0];
      const fastest = [...enriched].sort((a, b) => a.duration - b.duration)[0];
      const labeled = enriched.map(r => ({ ...r, routeLabel: (r === safest ? 'safest' : r === fastest ? 'fastest' : 'balanced') as ScoredRoute['routeLabel'] }));
      const safestIdx = labeled.findIndex(r => r.routeLabel === 'safest');
      const fastestIdx = labeled.findIndex(r => r.routeLabel === 'fastest');
      setRoutes(labeled);
      if (autoNav) {
        const idx = fastestIdx >= 0 ? fastestIdx : 0;
        setActiveIdx(idx); setNavIdx(idx); onDrawRoute(labeled[idx]); onStartNav(labeled[idx]);
      } else {
        setActiveIdx(safestIdx >= 0 ? safestIdx : 0); onDrawRoute(labeled[safestIdx >= 0 ? safestIdx : 0]);
      }
    } catch (err: any) { setRouteError(err.message ?? 'Eroare la calculul traseului.'); }
    finally { setLoading(false); }
  };

  const handleTapRoute = useCallback((route: ScoredRoute, idx: number) => {
    setActiveIdx(idx); onDrawRoute(route); if (snapState === 'SEARCH') snapTo('ROUTES');
  }, [onDrawRoute, snapState]);

  const handleStartNav = useCallback((route: ScoredRoute, idx: number) => {
    setActiveIdx(idx); setNavIdx(idx); onDrawRoute(route);
    onStartNav(route, selectedDest ?? undefined);
    snapTo('SEARCH');
  }, [onDrawRoute, onStartNav, selectedDest]);

  const handleStopNav = () => { setNavIdx(-1); onStopNav(); if (routes.length > 0) snapTo('ROUTES'); };

  return (
    <>
      <div className="fixed left-0 right-0 bottom-0 pointer-events-none"
        style={{
          height: `calc(${sheetHeight}px + env(safe-area-inset-bottom))`,
          zIndex: snapState === 'FULL' ? 55 : 45,
          pointerEvents: isNavigating ? 'none' : undefined,
          visibility: isNavigating ? 'hidden' : 'visible',
          transition: isDragging.current ? 'none' : 'height 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
        <div className="absolute inset-0 bg-white pointer-events-auto flex flex-col"
          style={{ borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 32px rgba(0,0,0,0.10)' }}>

          {/* ── Drag handle — LARGE HITBOX so it's easy to grab ───────────── */}
          <div
            ref={handleRef}
            className="flex justify-center items-center select-none shrink-0"
            style={{
              // Big vertical padding = large touch target; pill looks the same visually
              paddingTop: 18,
              paddingBottom: 18,
              cursor: 'grab',
              touchAction: 'none',
              // Extend hit area left/right too
              marginLeft: -16,
              marginRight: -16,
              paddingLeft: 16,
              paddingRight: 16,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-200" />
          </div>

          {/* Search bar — onClick to avoid accidental history taps */}
          <div className="px-4 pb-3 shrink-0" style={{ touchAction: 'auto' }}>
            <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 border border-slate-200" style={{ height: 52 }}
              onClick={() => { if (snapState === 'SEARCH') snapTo('FULL'); }}>
              <Search size={18} className="text-slate-400 shrink-0" />
              <input ref={inputRef} type="text" value={query}
                onFocus={() => { setIsFocused(true); if (snapState === 'SEARCH') snapTo('FULL'); }}
                onBlur={() => setTimeout(() => setIsFocused(false), 150)}
                onChange={e => { setQuery(e.target.value); setSelectedDest(null); }}
                placeholder="Unde vrei să mergi?" style={{ touchAction: 'auto' }}
                className="flex-1 bg-transparent text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-400 placeholder:font-normal" />
              {(query || selectedDest) && (
                <button onClick={e => { e.stopPropagation(); setQuery(''); setSelectedDest(null); setRoutes([]); setNavIdx(-1); snapTo('SEARCH'); }}
                  className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                  <X size={12} className="text-slate-500" />
                </button>
              )}
            </div>
          </div>

          {/* Content — pointer-events blocked during open animation */}
          {snapState !== 'SEARCH' && (
            <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col gap-4"
              style={{ pointerEvents: contentReady ? 'auto' : 'none' }}>

              {!selectedDest && !loading && routes.length === 0 && recentSearches.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest mb-2">Recente</p>
                  <div className="flex flex-col gap-1.5">
                    {recentSearches.map((r, i) => (
                      <button key={i} onClick={() => { setQuery(r.display_name); computeRoutes(r); }}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition text-left">
                        <MapPin size={14} className="text-slate-400 shrink-0" />
                        <span className="text-sm font-bold text-slate-700 truncate">{r.display_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="bg-white rounded-xl overflow-hidden shadow border border-slate-100">
                  {searchResults.map((result, i) => (
                    <button key={i} onClick={() => { setQuery(result.display_name); computeRoutes(result); }}
                      className="w-full p-4 text-left hover:bg-slate-50 flex items-start gap-3 border-b border-slate-50 last:border-0 transition-colors">
                      <MapPin size={15} className="text-primary mt-0.5 shrink-0" />
                      <span className="text-sm font-bold text-slate-700 leading-tight">{result.display_name}</span>
                    </button>
                  ))}
                </div>
              )}

              {searchError && <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs font-bold text-rose-600">{searchError}</div>}

              {loading && (
                <div className="flex flex-col items-center py-10 gap-3">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-bold text-slate-400">Calculez trasee sigure…</p>
                </div>
              )}

              {routeError && !loading && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex gap-3 text-rose-700">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /><p className="text-sm font-bold">{routeError}</p>
                </div>
              )}

              {reports.length > 0 && !loading && routes.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest">{reports.length} pericol{reports.length !== 1 ? 'e' : ''} în zonă</p>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />Critic</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Moderat</span>
                </div>
              )}

              {!loading && routes.length > 0 && (
                <div className="flex flex-col gap-3">
                  {routes.map((route, idx) => (
                    <RouteCard key={`${route.routeLabel}-${idx}`} route={route} idx={idx} isActive={idx === activeIdx} isNavigating={idx === navIdx} onTap={() => handleTapRoute(route, idx)} onStart={() => handleStartNav(route, idx)} />
                  ))}
                </div>
              )}

              {!loading && !routeError && routes.length === 0 && !selectedDest && snapState === 'FULL' && (
                <div className="flex flex-col items-center py-10 gap-3 text-slate-300">
                  <Footprints size={40} />
                  <p className="text-sm font-bold text-center">Caută o destinație</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {navIdx >= 0 && activeRoute && selectedDest && (
          <NavigationBar route={activeRoute} destination={selectedDest.display_name} userLocation={userLocation} onStop={handleStopNav} onExpand={() => snapTo('ROUTES')} isRerouting={isRerouting} />
        )}
      </AnimatePresence>
    </>
  );
};