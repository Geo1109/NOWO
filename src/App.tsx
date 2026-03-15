import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X, Crosshair, Navigation } from 'lucide-react';
import { Language, Report, SafeSpace, RouteInfo, SearchResult } from './types';
import { translations } from './translations';
import { auth, db, OperationType, handleFirestoreError, onForegroundMessage } from "./firebase";
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, onSnapshot, updateDoc, doc, setDoc, query, where, Timestamp,
  getDocs, serverTimestamp,
} from "firebase/firestore";
import { MOCK_SAFE_SPACES, COLORS } from './constants';
import { API_URL } from './config/api';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

import { BottomNav } from './components/BottomNav';
import { EmergencyButton } from './components/EmergencyButton';
import { ErrorFallback } from './components/ErrorFallback';
import { RoutePlannerScreen, DANGER_ZONE_RADIUS_M } from './components/RoutePlannerScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { MenuScreen } from './components/MenuScreen';
import { ReportModal } from './components/ReportModal';
import { ZoneDetailsModal } from './components/ZoneDetailsModal';
import { SpaceDetailsModal } from './components/SpaceDetailsModal';
import { AuthScreen } from './components/AuthScreen';
import { LoadingScreen } from './components/LoadingScreen';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const REPORT_EXPIRE_MS     = 20 * 60 * 1000;
const REPORT_COOLDOWN_MS   = 4 * 60 * 1000;
const DEDUP_RADIUS_M       = 40;
const MAX_REPORTS_NEW_ACCT = 2;
const NEW_ACCT_WINDOW_MS   = 24 * 60 * 60 * 1000;
const REPORT_RANGE_M       = 100;
const USER_MARKER_SIZE     = 36;

const makeExpiresAt = () => new Date(Date.now() + REPORT_EXPIRE_MS).toISOString();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function haversineM(a: [number, number], b: [number, number]): number {
  const cos = Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(
    Math.pow((a[0] - b[0]) * 111320, 2) +
    Math.pow((a[1] - b[1]) * 111320 * cos, 2)
  );
}

function createSafeSpaceIconHtml(type: string): string {
  const configs: Record<string, { color: string; path: string }> = {
    pharmacy:    { color: '#10b981', path: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 5v14M5 12h14"/>' },
    hospital:    { color: '#3b82f6', path: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 5v14M5 12h14"/>' },
    police:      { color: '#6366f1', path: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>' },
    supermarket: { color: '#f97316', path: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 2m12-2l2 2M9 21a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z"/>' },
    convenience: { color: '#f59e0b', path: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 2m12-2l2 2M9 21a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z"/>' },
    doctors:     { color: '#14b8a6', path: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 5v14M5 12h14"/>' },
    clinic:      { color: '#06b6d4', path: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 5v14M5 12h14"/>' },
  };
  const cfg = configs[type] || { color: '#64748b', path: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>' };
  return `<div style="width:36px;height:36px;background:white;border-radius:50%;border:2.5px solid ${cfg.color};box-shadow:0 2px 8px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${cfg.color}">${cfg.path}</svg></div>`;
}

function createUserMarkerHtml(heading: number): string {
  const S = USER_MARKER_SIZE, H = S / 2;
  return `<div style="width:${S}px;height:${S}px;pointer-events:none;">
    <svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg"
      style="transform:rotate(${heading}deg);transform-origin:center;overflow:visible;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.22));">
      <circle cx="${H}" cy="${H}" r="${H - 2}" fill="rgba(59,73,223,0.14)"/>
      <circle cx="${H}" cy="${H}" r="${H / 2 - 1}" fill="#3B49DF" stroke="white" stroke-width="2.5"/>
      <path d="M${H} 4 L${H - 4} ${H + 3} L${H} ${H + 1} L${H + 4} ${H + 3} Z"
        fill="#3B49DF" stroke="white" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  </div>`;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Route geometry helpers
// ---------------------------------------------------------------------------

/** Find the index of the closest coordinate in a GeoJSON LineString to a point */
function closestCoordIndex(coords: number[][], lat: number, lng: number): number {
  const cos = Math.cos((lat * Math.PI) / 180);
  let minDist = Infinity, minIdx = 0;
  for (let i = 0; i < coords.length; i++) {
    const d = Math.sqrt(
      Math.pow((lat - coords[i][1]) * 111320, 2) +
      Math.pow((lng - coords[i][0]) * 111320 * cos, 2)
    );
    if (d < minDist) { minDist = d; minIdx = i; }
  }
  return minIdx;
}

/** Distance from a point to the closest point on a LineString */
function distToRoute(coords: number[][], lat: number, lng: number): number {
  if (!coords.length) return Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  let minDist = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i], [lng2, lat2] = coords[i + 1];
    // Project point onto segment
    const dx = (lng2 - lng1) * 111320 * cos, dy = (lat2 - lat1) * 111320;
    const len2 = dx * dx + dy * dy;
    const px = (lng - lng1) * 111320 * cos, py = (lat - lat1) * 111320;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
    const nearDist = Math.sqrt(Math.pow(px - t * dx, 2) + Math.pow(py - t * dy, 2));
    if (nearDist < minDist) minDist = nearDist;
  }
  return minDist;
}

export default function App() {
  return <ErrorBoundary FallbackComponent={ErrorFallback}><AppContent /></ErrorBoundary>;
}

function AppContent() {
  const [lang] = useState<Language>(navigator.language.startsWith('ro') ? 'ro' : 'en');
  const t = translations[lang];

  // Loading screen — rendered outside AnimatePresence to avoid flash
  const [appReady, setAppReady] = useState(false);

  const [activeTab, setActiveTab]                   = useState('home');
  const [showReportModal, setShowReportModal]       = useState(false);
  const [showSafeSpaces, setShowSafeSpaces]         = useState(false);
  const [selectedZone, setSelectedZone]             = useState<Report | null>(null);
  const [selectedSpace, setSelectedSpace]           = useState<SafeSpace | null>(null);
  const [reports, setReports]                       = useState<Report[]>([]);
  const [safeSpaces, setSafeSpaces]                 = useState<SafeSpace[]>([]);

  // ── Start with null so we know when real GPS arrives ──────────────────────
  const [userLocation, setUserLocation]             = useState<[number, number] | null>(null);
  const [gpsReady, setGpsReady]                     = useState(false);

  const [reportLocation, setReportLocation]         = useState<[number, number] | null>(null);
  const [isNavigating, setIsNavigating]             = useState(false);
  const [activeRoute, setActiveRoute]               = useState<RouteInfo | null>(null);
  const [proximityAlert, setProximityAlert]         = useState<string | null>(null);
  const [initialDestination, setInitialDestination] = useState<SearchResult | null>(null);
  const [autoNavigate, setAutoNavigate]             = useState(false);
  const [safeSpacesLoading, setSafeSpacesLoading]   = useState(false);
  const [timerActive, setTimerActive]               = useState(false);
  const [showAuth, setShowAuth]                     = useState(false);
  const [currentUser, setCurrentUser]               = useState(auth.currentUser);
  const [sheetSnap, setSheetSnap]                   = useState<'SEARCH' | 'ROUTES' | 'FULL'>('SEARCH');
  const [mapPanned, setMapPanned]                   = useState(false);
  const [isRerouting, setIsRerouting]               = useState(false);
  const [navDestination, setNavDestination]         = useState<SearchResult | null>(null);
  const [navResetKey, setNavResetKey] = useState(0);
  const [reportFeedback, setReportFeedback]         = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => { setCurrentUser(user); if (user) setShowAuth(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onForegroundMessage((payload) => {
      const { body } = payload.notification || {}, type = payload.data?.type;
      if (type === 'emergency_alert') setProximityAlert(`🚨 ${body || 'Alertă de urgență primită!'}`);
      else if (type === 'danger_zone') setProximityAlert(`⚠️ ${body || 'Zonă periculoasă raportată în apropiere!'}`);
    });
    return () => unsub();
  }, []);

  const mapRef                  = useRef<any>(null);
  const mapContainerRef         = useRef<HTMLDivElement>(null);
  const routeLayerRef           = useRef<any>(null);
  const userMarkerRef           = useRef<any>(null);
  const reportsLayerRef         = useRef<any>(null);
  const safeSpacesLayerRef      = useRef<any>(null);
  const reportLocationMarkerRef = useRef<any>(null);
  const walkedPolylineRef       = useRef<any>(null);
  const remainingLayerRef       = useRef<any>(null);  // colored remaining-route layer
  const walkedCoordsRef         = useRef<[number, number][]>([]);
  const lastRerouteRef          = useRef<number>(0);  // timestamp of last reroute
  const REROUTE_COOLDOWN_MS     = 12_000;             // min 12s between reroutes
  const OFF_ROUTE_THRESHOLD_M   = 35;                 // metres off-route to trigger reroute
  const activeRouteRef          = useRef<RouteInfo | null>(null);
  const navDestinationRef       = useRef<SearchResult | null>(null);
  const isReroutingRef          = useRef(false);
  const gpsReadyRef             = useRef(false);       // avoids stale closure on gpsReady
  const showSafeSpacesRef       = useRef(showSafeSpaces); // avoids stale closure on showSafeSpaces
  const reportingActiveRef      = useRef(false);
  const lastSafeSpacesFetchRef  = useRef('');
  const geoWatchIdRef           = useRef<string | null>(null);
  const geoPollRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportsRef              = useRef<Report[]>([]);
  const isNavigatingRef         = useRef(isNavigating);
  const mapPannedRef            = useRef(false);
  const userLocationRef         = useRef<[number, number] | null>(null);
  const displayHeadingRef       = useRef(0);
  const headingThrottleRef      = useRef<number | null>(null);
  const mapInitializedRef       = useRef(false);

  useEffect(() => { reportsRef.current = reports; }, [reports]);
  useEffect(() => { reportingActiveRef.current = showReportModal; }, [showReportModal]);
  useEffect(() => { isNavigatingRef.current = isNavigating; }, [isNavigating]);
  useEffect(() => { mapPannedRef.current = mapPanned; }, [mapPanned]);
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
  useEffect(() => { activeRouteRef.current = activeRoute; }, [activeRoute]);
  useEffect(() => { navDestinationRef.current = navDestination; }, [navDestination]);
  useEffect(() => { isReroutingRef.current = isRerouting; }, [isRerouting]);
  useEffect(() => { showSafeSpacesRef.current = showSafeSpaces; }, [showSafeSpaces]);

  // ── Heading with dead-zone smoothing ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const raw = (e as any).webkitCompassHeading ??
        (e.alpha !== null ? (360 - (e.alpha ?? 0)) % 360 : null);
      if (raw === null) return;
      const diff = Math.abs(((raw - displayHeadingRef.current) + 540) % 360 - 180);
      if (diff < 8) return; // ignore tiny jitter
      displayHeadingRef.current = raw;
      if (headingThrottleRef.current) return;
      headingThrottleRef.current = window.setTimeout(() => {
        headingThrottleRef.current = null;
        const L = (window as any).L;
        if (L && userMarkerRef.current) {
          try {
            userMarkerRef.current.setIcon(L.divIcon({
              className: '', html: createUserMarkerHtml(Math.round(displayHeadingRef.current)),
              iconSize: [USER_MARKER_SIZE, USER_MARKER_SIZE],
              iconAnchor: [USER_MARKER_SIZE / 2, USER_MARKER_SIZE / 2],
            }));
          } catch {}
        }
      }, 200);
    };
    window.addEventListener('deviceorientationabsolute', handler as EventListener, true);
    window.addEventListener('deviceorientation', handler as EventListener, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler as EventListener, true);
      window.removeEventListener('deviceorientation', handler as EventListener, true);
      if (headingThrottleRef.current) clearTimeout(headingThrottleRef.current);
    };
  }, []);

  // ── Firestore reports ─────────────────────────────────────────────────────
  useEffect(() => {
    const loc = userLocation ?? [45.7489, 21.2087] as [number, number];
    const latDelta = 0.18, lngDelta = 0.25;
    const minLat = loc[0] - latDelta, maxLat = loc[0] + latDelta;
    const minLng = loc[1] - lngDelta, maxLng = loc[1] + lngDelta;
    const q = query(collection(db, "reports"), where("lat", ">=", minLat), where("lat", "<=", maxLat));
    const unsub = onSnapshot(q, snap => {
      const now = new Date(), data: Report[] = [];
      snap.forEach(d => {
        const r = d.data();
        if (r.lng < minLng || r.lng > maxLng) return;
        if (r.expired === true) return;
        if (r.expiresAt && new Date(r.expiresAt) <= now) return;
        data.push({ id: d.id, ...r, timestamp: r.timestamp instanceof Timestamp ? r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : r.timestamp } as Report);
      });
      setReports(data);
    }, err => handleFirestoreError(err, OperationType.LIST, "reports"));
    return () => unsub();
  }, [userLocation]);

  // ── Safe spaces ────────────────────────────────────────────────────────────
  const fetchSafeSpaces = async (lat: number, lon: number) => {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (key === lastSafeSpacesFetchRef.current) return;
    lastSafeSpacesFetchRef.current = key; setSafeSpacesLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/safe-spaces?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error('err');
      const data = await res.json();
      setSafeSpaces((data.places || [])
        .map((p: any) => ({ ...p, distance: Math.round(haversineM([lat, lon], [p.lat, p.lng])) }))
        .sort((a: any, b: any) => a.distance - b.distance));
    } catch { setSafeSpaces(MOCK_SAFE_SPACES); }
    finally { setSafeSpacesLoading(false); }
  };

  useEffect(() => {
    if (!userLocation) return;
    if (showSafeSpaces) fetchSafeSpaces(userLocation[0], userLocation[1]);
    else safeSpacesLayerRef.current?.clearLayers();
  }, [showSafeSpaces, userLocation]);

  // ── Position handler ──────────────────────────────────────────────────────
  // We store the latest handler in a ref so watchPosition always calls the
  // current version — avoids the stale-closure bug where gpsReady / showSafeSpaces
  // change but the watch still uses the old captured function.
  const handlePositionRef = useRef<(lat: number, lng: number) => void>(() => {});

  useEffect(() => {
    handlePositionRef.current = (lat: number, lng: number) => {
      const newPos: [number, number] = [lat, lng];
      setUserLocation(newPos);

      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      const icon = L.divIcon({
        className: '',
        html: createUserMarkerHtml(Math.round(displayHeadingRef.current)),
        iconSize: [USER_MARKER_SIZE, USER_MARKER_SIZE],
        iconAnchor: [USER_MARKER_SIZE / 2, USER_MARKER_SIZE / 2],
      });

      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(newPos);
        userMarkerRef.current.setIcon(icon);
      } else {
        userMarkerRef.current = L.marker(newPos, { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
      }

      // Fly to real location on the very first GPS fix
      if (!gpsReadyRef.current) {
        gpsReadyRef.current = true;
        setGpsReady(true);
        mapRef.current.setView(newPos, 16, { animate: false });
      }

      if (isNavigatingRef.current && !mapPannedRef.current) {
        mapRef.current.panTo(newPos);
      }

      if (isNavigatingRef.current) {
        walkedCoordsRef.current = [...walkedCoordsRef.current, newPos];
        if (walkedPolylineRef.current) {
          walkedPolylineRef.current.setLatLngs(walkedCoordsRef.current);
        } else {
          walkedPolylineRef.current = L.polyline(walkedCoordsRef.current, {
            color: '#94a3b8', weight: 7, opacity: 0.7, lineCap: 'round', lineJoin: 'round',
          }).addTo(mapRef.current);
        }

        const routeCoords: number[][] = activeRouteRef.current?.geometry?.coordinates ?? [];
        if (routeCoords.length > 1 && remainingLayerRef.current) {
          const closestIdx = closestCoordIndex(routeCoords, lat, lng);
          const remaining = routeCoords.slice(closestIdx);
          if (remaining.length >= 2) {
            remainingLayerRef.current.setLatLngs(remaining.map(([rLng, rLat]) => [rLat, rLng]));
          }
        }

        const now = Date.now();
        if (
          activeRouteRef.current &&
          navDestinationRef.current &&
          !isReroutingRef.current &&
          now - lastRerouteRef.current > REROUTE_COOLDOWN_MS
        ) {
          const offDist = distToRoute(routeCoords, lat, lng);
          if (offDist > OFF_ROUTE_THRESHOLD_M) {
            triggerReroute(newPos);
          }
        }

        routeLayerRef.current?.bringToFront?.();
      }

      const cu = auth.currentUser;
      if (cu) updateDoc(doc(db, 'users', cu.uid), { lastLat: lat, lastLng: lng }).catch(() => {});

      reportsRef.current.forEach(report => {
        const dist = haversineM(newPos, [report.lat, report.lng]);
        if (dist < 100) {
          const msg = `⚠️ Zonă periculoasă la ${Math.round(dist)} m (${report.categories[0] || ''})`;
          setProximityAlert(prev => prev === msg ? prev : msg);
        }
      });

      if (showSafeSpacesRef.current) fetchSafeSpaces(lat, lng);
    };
  }); // no deps — always up-to-date on every render

  // ── Geolocation — polling + watch hybrid ─────────────────────────────────
  // watchPosition on Android can silently stop delivering callbacks (FusedLocationProvider
  // throttling, battery saver, etc.). We add a setInterval poll as a guaranteed fallback.
  const startGeoWatch = useCallback(async () => {
    const onPos = (lat: number, lng: number) => handlePositionRef.current(lat, lng);

    if (Capacitor.isNativePlatform()) {
      try {
        const { location } = await Geolocation.requestPermissions();
        if (location !== 'granted') {
          console.warn('[GPS] Permission denied');
          return;
        }

        // Immediate first fix
        const first = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        onPos(first.coords.latitude, first.coords.longitude);

        // watchPosition — fires when device reports movement
        try {
          geoWatchIdRef.current = await Geolocation.watchPosition(
            { enableHighAccuracy: true },
            (p, e) => {
              if (e) { console.warn('[GPS] watch error', e); return; }
              if (!p) return;
              onPos(p.coords.latitude, p.coords.longitude);
            }
          );
        } catch (watchErr) {
          console.warn('[GPS] watchPosition failed, using poll only', watchErr);
        }

        // Poll every 3 seconds as guaranteed fallback
        geoPollRef.current = setInterval(async () => {
          try {
            const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
            onPos(p.coords.latitude, p.coords.longitude);
          } catch (e) {
            console.warn('[GPS] poll error', e);
          }
        }, 3000);

      } catch (e) { console.error('[GPS] init error', e); }

    } else {
      // Web browser
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        p => onPos(p.coords.latitude, p.coords.longitude),
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );

      navigator.geolocation.watchPosition(
        p => onPos(p.coords.latitude, p.coords.longitude),
        err => console.warn('[GPS] web watch error', err),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );

      // Also poll on web for devices where watchPosition is unreliable
      geoPollRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          p => onPos(p.coords.latitude, p.coords.longitude),
          () => {},
          { enableHighAccuracy: true, maximumAge: 2000 }
        );
      }, 3000);
    }
  }, []); // stable

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInitializedRef.current) return;
    const L = (window as any).L; if (!L) return;
    mapInitializedRef.current = true;

    // Start at a default location; startGeoWatch will fly to real position
    mapRef.current = L.map(mapContainerRef.current, {
      center: [45.7489, 21.2087], zoom: 13,
      zoomControl: false, attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(mapRef.current);
    reportsLayerRef.current    = L.layerGroup().addTo(mapRef.current);
    safeSpacesLayerRef.current = L.layerGroup().addTo(mapRef.current);

    mapRef.current.on('click', (e: any) => {
      if (reportingActiveRef.current) setReportLocation([e.latlng.lat, e.latlng.lng]);
    });
    mapRef.current.on('dragstart', () => setMapPanned(true));

    startGeoWatch();

    return () => {
      if (geoWatchIdRef.current && Capacitor.isNativePlatform()) {
        Geolocation.clearWatch({ id: geoWatchIdRef.current! });
      }
      if (geoPollRef.current) {
        clearInterval(geoPollRef.current);
        geoPollRef.current = null;
      }
    };
  }, [startGeoWatch]);

  // ── Map markers ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L; if (!L) return;
    reportsLayerRef.current?.clearLayers();
    safeSpacesLayerRef.current?.clearLayers();
    if (reportLocationMarkerRef.current) {
      mapRef.current.removeLayer(reportLocationMarkerRef.current);
      reportLocationMarkerRef.current = null;
    }

    reports.forEach(report => {
      const color = report.weight >= 5 ? COLORS.danger : report.weight >= 2 ? '#F97316' : '#FACC15';
      const textColor = report.weight >= 5 ? '#fff' : '#1e293b';

      // Category emoji for the pin label
      const EMOJI_MAP: Record<string, string> = {
        suspicious: '👤', dogs: '🐕', intoxicated: '🍺',
        gathering: '👥', lighting: '💡', blocked: '🚫',
        harassment: '🆘', other: '⚠️',
      };
      const emoji = EMOJI_MAP[report.categories?.[0]] ?? '⚠️';
      const extraCount = report.categories.length > 1 ? `+${report.categories.length - 1}` : '';

      // Visual circle — 20m, not interactive
      L.circle([report.lat, report.lng], {
        radius: DANGER_ZONE_RADIUS_M,
        fillColor: color, fillOpacity: 0.35, color, weight: 2,
        interactive: false,
      }).addTo(reportsLayerRef.current);

      // Pin label — a small floating badge above the circle, easy to tap with a finger.
      // Uses a DivIcon so it scales with the map but stays a fixed pixel size.
      const pinHtml = `
        <div style="
          display:flex; flex-direction:column; align-items:center;
          pointer-events:auto; cursor:pointer;
        ">
          <!-- Badge -->
          <div style="
            background:${color};
            color:${textColor};
            font-size:12px; font-weight:700; line-height:1;
            padding:4px 7px; border-radius:12px;
            box-shadow:0 2px 8px rgba(0,0,0,0.22);
            border:2px solid white;
            display:flex; align-items:center; gap:3px;
            white-space:nowrap;
          ">
            <span style="font-size:14px; line-height:1;">${emoji}</span>
            ${report.weight > 1 ? `<span style="color:${textColor};opacity:0.85">${report.weight}×</span>` : ''}
            ${extraCount ? `<span style="color:${textColor};opacity:0.75">${extraCount}</span>` : ''}
          </div>
          <!-- Stem arrow -->
          <div style="
            width:0; height:0;
            border-left:5px solid transparent;
            border-right:5px solid transparent;
            border-top:6px solid ${color};
            margin-top:-1px;
          "></div>
        </div>`;

      const pinIcon = L.divIcon({
        className: '',
        html: pinHtml,
        // anchor at bottom-centre of the stem so it points exactly at the zone
        iconSize: [60, 40],
        iconAnchor: [30, 40],
      });

      const pinMarker = L.marker([report.lat, report.lng], {
        icon: pinIcon,
        zIndexOffset: 500,
      }).addTo(reportsLayerRef.current);

      pinMarker.on('click', () => setSelectedZone(report));
    });

    if (showSafeSpaces) {
      safeSpaces.forEach(space => {
        const icon = L.divIcon({ className: '', html: createSafeSpaceIconHtml(space.type), iconSize: [36, 36], iconAnchor: [18, 18] });
        L.marker([space.lat, space.lng], { icon }).addTo(safeSpacesLayerRef.current).on('click', () => setSelectedSpace(space));
      });
    }

    if (reportLocation) {
      reportLocationMarkerRef.current = L.marker(reportLocation, {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:32px;height:32px;background:#ef4444;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
          iconSize: [32, 32], iconAnchor: [16, 32],
        }),
      }).addTo(mapRef.current);
    }
  }, [reports, safeSpaces, showSafeSpaces, reportLocation]);

  // ── Route / navigation ─────────────────────────────────────────────────────
  const drawRoute = (route: RouteInfo) => {
    const L = (window as any).L;
    if (!mapRef.current) return;

    // Remove old layers
    if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);
    if (remainingLayerRef.current) mapRef.current.removeLayer(remainingLayerRef.current);

    const color = route.type === 'safe' ? COLORS.safe : COLORS.primary;

    // Full route as GeoJSON (for initial display and walked-trail splitting)
    routeLayerRef.current = L.geoJSON(route.geometry, {
      style: { color: '#cbd5e1', weight: 8, opacity: 0.5, lineCap: 'round', lineJoin: 'round' },
    }).addTo(mapRef.current);

    // Remaining-route overlay (starts as full route, shrinks as user walks)
    const coords = (route.geometry?.coordinates ?? []) as number[][];
    remainingLayerRef.current = L.polyline(
      coords.map(([lng, lat]) => [lat, lng]),
      { color, weight: 8, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }
    ).addTo(mapRef.current);

    mapRef.current.fitBounds(remainingLayerRef.current.getBounds(), { padding: [80, 80] });
    setActiveRoute(route);
  };

  // Silent background reroute — doesn't disrupt navigation UI
  const triggerReroute = useCallback(async (currentPos: [number, number]) => {
    const dest = navDestinationRef.current;
    if (!dest || isReroutingRef.current) return;

    lastRerouteRef.current = Date.now();
    setIsRerouting(true);
    isReroutingRef.current = true;

    try {
      const res = await fetch(`${API_URL}/api/walking-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: currentPos,
          destination: [parseFloat(dest.lat), parseFloat(dest.lon)],
          dangerZones: reportsRef.current.map(r => ({
            lat: r.lat, lng: r.lng, weight: r.weight, radiusMeters: 20,
          })),
        }),
      });
      if (!res.ok) throw new Error('Reroute failed');
      const data = await res.json();
      if (!data.routes?.length) throw new Error('No routes');

      const best = data.routes[0];
      const newRoute: RouteInfo = {
        distance: best.distance,
        duration: Math.round(best.duration / 60),
        geometry: best.geometry,
        safetyScore: best.safetyScore ?? 80,
        type: 'safe',
        steps: best.steps ?? [],
      };

      // Reset walked trail since we're on a new route
      walkedCoordsRef.current = [currentPos];
      if (walkedPolylineRef.current) walkedPolylineRef.current.setLatLngs([currentPos]);

      drawRoute(newRoute);
      setActiveRoute(newRoute);
    } catch (e) {
      console.warn('Reroute error:', e);
    } finally {
      setIsRerouting(false);
      isReroutingRef.current = false;
    }
  }, []);

  const startNavigation = (route?: RouteInfo, dest?: SearchResult) => {
    const r = route ?? activeRoute; if (!r) return;
    setActiveRoute(r); setIsNavigating(true);
    walkedCoordsRef.current = []; setMapPanned(false);
    if (dest) setNavDestination(dest);
    if (userLocation) mapRef.current?.setView(userLocation, 18);
  };

  const stopNavigation = () => {
    setIsNavigating(false); setActiveRoute(null); setNavDestination(null); setIsRerouting(false);
    isReroutingRef.current = false; lastRerouteRef.current = 0;
    if (routeLayerRef.current) { mapRef.current?.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    if (remainingLayerRef.current) { mapRef.current?.removeLayer(remainingLayerRef.current); remainingLayerRef.current = null; }
    if (walkedPolylineRef.current) { mapRef.current?.removeLayer(walkedPolylineRef.current); walkedPolylineRef.current = null; }
    walkedCoordsRef.current = [];
  };

  const handleNavigateToSafeSpace = (space: SafeSpace) => {
    const dest: SearchResult = { display_name: space.name, lat: space.lat.toString(), lon: space.lng.toString() };
    setSelectedSpace(null); setAutoNavigate(true);
    setNavDestination(dest);
    setInitialDestination(dest);
    setActiveTab('home');
  };

  const goToMyLocation = useCallback(() => {
    if (!userLocation) return;
    mapRef.current?.setView(userLocation, 17); setMapPanned(false);
  }, [userLocation]);

  const handleTabChange = (tab: string) => {
    if (tab === 'report') {
      if (!currentUser) { setShowAuth(true); return; }
      setShowReportModal(true); return;
    }
    if (tab === 'alerts' && !currentUser) { setShowAuth(true); return; }
    if (timerActive && tab !== 'home') return;
    if (tab !== 'home' && isNavigating) stopNavigation();
    // When leaving home, increment key so RoutePlannerScreen remounts fresh when user returns
    if (tab !== 'home' && activeTab === 'home') setNavResetKey(k => k + 1);
    setActiveTab(tab);
  };

  // ── Spam-aware report submission ──────────────────────────────────────────
  const handleReportSubmit = async (categories: string[], details: string, isLive: boolean) => {
    const user = auth.currentUser;

    // Check auth
    if (!user) {
      setReportFeedback('Trebuie să fii autentificat pentru a raporta.');
      setShowReportModal(false); setReportLocation(null);
      setShowAuth(true);
      return;
    }

    // Need a marked location
    if (!reportLocation) {
      setReportFeedback('Marchează mai întâi locația pe hartă.');
      return;
    }

    // Need GPS fix
    if (!userLocation) {
      setReportFeedback('Se obține locația GPS... încearcă din nou în câteva secunde.');
      return;
    }

    const [rLat, rLng] = reportLocation;

    // Distance check — must be within 100m
    const userDistToReport = haversineM(userLocation, reportLocation);
    if (userDistToReport > REPORT_RANGE_M) {
      setReportFeedback(`Poți raporta doar zone la mai puțin de ${REPORT_RANGE_M} m de tine. Ești la ${Math.round(userDistToReport)} m.`);
      return;
    }

    try {
      // Rate limiting — read user doc (gracefully skip if doc missing)
      let userData: any = null;
      try {
        const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
        if (!userSnap.empty) userData = userSnap.docs[0].data();
      } catch {}

      const now = Date.now();

      if (userData) {
        // Cooldown check
        if (userData.lastReportAt) {
          const lastMs = userData.lastReportAt.toMillis ? userData.lastReportAt.toMillis() : Number(userData.lastReportAt);
          if (now - lastMs < REPORT_COOLDOWN_MS) {
            const waitSec = Math.ceil((REPORT_COOLDOWN_MS - (now - lastMs)) / 1000);
            setReportFeedback(`Poți raporta din nou în ${waitSec} secunde.`);
            return;
          }
        }

        // New account throttle
        const createdMs = userData.createdAt?.toMillis ? userData.createdAt.toMillis() : null;
        if (createdMs && now - createdMs < NEW_ACCT_WINDOW_MS) {
          const reportCount = userData.reportCount || 0;
          if (reportCount >= MAX_REPORTS_NEW_ACCT) {
            setReportFeedback('Conturile noi pot raporta maxim 2 incidente în prima zi.');
            return;
          }
        }
      }

      // Geographic deduplication — bounding box only, no expired filter
      // (expired filter fails on old documents that don't have the field)
      const latDelta = 0.001;
      let existingDoc: any = null;
      try {
        const nearbySnap = await getDocs(
          query(collection(db, 'reports'),
            where('lat', '>=', rLat - latDelta), where('lat', '<=', rLat + latDelta)
          )
        );
        const nowDate = new Date();
        nearbySnap.forEach(d => {
          if (existingDoc) return;
          const r = d.data();
          if (r.expired === true) return;
          if (r.expiresAt && new Date(r.expiresAt) <= nowDate) return;
          const dist = haversineM([rLat, rLng], [r.lat, r.lng]);
          if (dist > DEDUP_RADIUS_M) return;
          // Only deduplicate if same category AND user hasn't already reported
          const overlap = categories.some(c => (r.categories || []).includes(c));
          if (overlap) {
            if ((r.reportedBy || []).includes(user.uid)) {
              existingDoc = { id: d.id, data: r, alreadyReported: true };
            } else {
              existingDoc = { id: d.id, data: r, alreadyReported: false };
            }
          }
        });
      } catch (e) {
        console.warn('Dedup query failed, will create new report:', e);
      }

      if (existingDoc?.alreadyReported) {
        setReportFeedback('Ai raportat deja această zonă. Poți confirma din hartă.');
        setShowReportModal(false); setReportLocation(null);
        return;
      }

      if (existingDoc && !existingDoc.alreadyReported) {
        // Merge into existing report
        await updateDoc(doc(db, 'reports', existingDoc.id), {
          weight: (existingDoc.data?.weight || 1) + 1,
          expiresAt: makeExpiresAt(),
          reportedBy: [...(existingDoc.data?.reportedBy || []), user.uid],
        });
      } else {
        // Create new report
        const reportId = `${user.uid.slice(0, 6)}_${Date.now().toString(36)}`;
        await setDoc(doc(db, 'reports', reportId), {
          id: reportId, lat: rLat, lng: rLng,
          categories, details,
          timestamp: new Date().toISOString(),
          isLive, weight: 1,
          expiresAt: makeExpiresAt(),
          expired: false,
          reportedBy: [user.uid],
          declineCount: 0,
          reporterId: user.uid,
        });
      }

      // Update user's rate-limiting counters (best-effort)
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
          lastReportAt: serverTimestamp(),
          reportCount: (userData?.reportCount || 0) + 1,
        });
      } catch {}

      setShowReportModal(false); setReportLocation(null);

    } catch (error) {
      console.error('Report submission error:', error);
      setReportFeedback('Eroare la trimiterea raportului. Încearcă din nou.');
      handleFirestoreError(error, OperationType.CREATE, 'reports');
    }
  };

  const handleDecline = async (zone: Report) => {
    try {
      const newDeclineCount = (zone.declineCount || 0) + 1;
      const shouldExpire = newDeclineCount >= (zone.weight || 1) * 1.5;
      await updateDoc(doc(db, 'reports', zone.id), {
        declineCount: newDeclineCount,
        ...(shouldExpire ? { expired: true } : {}),
      });
      setSelectedZone(null);
    } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `reports/${zone.id}`); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col bg-slate-50">

      {/*
        Loading screen — rendered OUTSIDE AnimatePresence on purpose.
        AnimatePresence would try to run exit animations that conflict with
        the component's own CSS fade-out, causing flashes. We simply render
        it conditionally; it handles its own unmount timing via onFinish.
      */}
      {!appReady && (
        <LoadingScreen onFinish={() => setAppReady(true)} duration={1.5} />
      )}

      {/* Proximity + feedback banners */}
      <AnimatePresence>
        {proximityAlert && (
          <motion.div initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            className="fixed top-24 left-6 right-6 z-[100] p-4 bg-danger text-white rounded-2xl shadow-2xl flex items-center justify-between">
            <div className="flex items-center gap-3"><AlertTriangle size={20} /><p className="text-xs font-bold">{proximityAlert}</p></div>
            <button onClick={() => setProximityAlert(null)}><X size={18} /></button>
          </motion.div>
        )}
        {reportFeedback && (
          <motion.div initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            className="fixed top-24 left-6 right-6 z-[100] p-4 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center justify-between">
            <p className="text-xs font-bold flex-1 mr-3">{reportFeedback}</p>
            <button onClick={() => setReportFeedback(null)}><X size={18} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 px-5 z-30 flex items-center justify-between pointer-events-none"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)', paddingBottom: 12 }}>

        {/* Logo pill */}
        <div className="glass rounded-2xl pointer-events-auto flex items-center gap-2 shadow-xl border-white/60"
          style={{ paddingLeft: 10, paddingRight: 14, paddingTop: 7, paddingBottom: 7 }}>
          <img
            src="/logo.png"
            alt="NoWo"
            style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }}
          />
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', fontFamily: 'inherit', letterSpacing: '-0.3px' }}>
            NoWo
          </span>
        </div>

        {/* Safe spaces toggle */}
        <div className="flex gap-2 pointer-events-auto">
          <button
            onClick={() => setShowSafeSpaces(!showSafeSpaces)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl relative ${showSafeSpaces ? 'bg-safe text-white scale-105' : 'glass text-slate-600'}`}
          >
            {/* Plus-in-circle icon for safe spaces */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M12 8v8M8 12h8"/>
            </svg>
            {safeSpacesLoading && (
              <div className="absolute -top-1 -right-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin bg-safe" />
            )}
          </button>
        </div>
      </header>

      {/* Map */}
      <div ref={mapContainerRef} className="flex-1 w-full z-0" />

      {/* Reposition button — stacked below the emergency button on the right */}
      {activeTab === 'home' && sheetSnap !== 'FULL' && (
        <div className="fixed right-5 z-40" style={{ top: 'calc(env(safe-area-inset-top) + 160px)' }}>
          <button onClick={goToMyLocation}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-90"
            style={{ background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
            {mapPanned
              ? <Navigation size={20} style={{ color: '#3B49DF' }} />
              : <Crosshair size={20} style={{ color: '#64748b' }} />}
          </button>
        </div>
      )}

      {/* Emergency button — always visible on home tab */}
      {activeTab === 'home' && sheetSnap !== 'FULL' && (
        <EmergencyButton t={t} userLocation={userLocation} onTimerActive={setTimerActive} />
      )}

      <AnimatePresence>
        {activeTab === 'home' && (
          <motion.div key="home-overlay">
            {!isNavigating && sheetSnap !== 'FULL' && (
              <BottomNav activeTab={activeTab} setActiveTab={handleTabChange} t={t} />
            )}
            {/* key on the wrapper Fragment forces RoutePlannerScreen to remount when navResetKey changes */}
            <React.Fragment key={navResetKey}>
            <RoutePlannerScreen
              onClose={() => { setInitialDestination(null); setAutoNavigate(false); }}
              t={t}
              userLocation={userLocation ?? [45.7489, 21.2087]}
              reports={reports}
              onDrawRoute={drawRoute}
              onStartNav={(route, dest) => {
                if (dest) setNavDestination(dest);
                startNavigation(route, dest);
              }}
              initialDest={initialDestination}
              isNavigating={isNavigating}
              activeRoute={activeRoute}
              onStopNav={stopNavigation}
              onSnapChange={setSheetSnap}
              autoNavigate={autoNavigate}
              isRerouting={isRerouting}
            />
            </React.Fragment>
          </motion.div>
        )}

        {activeTab === 'alerts' && <SettingsScreen onClose={() => setActiveTab('home')} t={t} onOpenMenu={() => setActiveTab('settings')} />}
        {activeTab === 'settings' && <MenuScreen onClose={() => setActiveTab('alerts')} t={t} />}

        {showAuth && (
          <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150]">
            <AuthScreen onSuccess={() => setShowAuth(false)} onClose={() => setShowAuth(false)} />
          </motion.div>
        )}

        {showReportModal && (
          <ReportModal
            onClose={() => { setShowReportModal(false); setReportLocation(null); }}
            onSubmit={handleReportSubmit}
            t={t}
            reportLocation={reportLocation}
          />
        )}

        {selectedZone && (
          <ZoneDetailsModal
            zone={selectedZone}
            onClose={() => setSelectedZone(null)}
            userLocation={userLocation ?? [45.7489, 21.2087]}
            onConfirm={async () => {
              try {
                await updateDoc(doc(db, 'reports', selectedZone.id), {
                  weight: (selectedZone.weight || 1) + 1,
                  expiresAt: makeExpiresAt(),
                  expired: false,
                  reportedBy: [...(selectedZone.reportedBy || []), currentUser?.uid].filter(Boolean),
                });
                setSelectedZone(null);
              } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `reports/${selectedZone.id}`); }
            }}
            onDecline={() => handleDecline(selectedZone)}
            t={t}
          />
        )}

        {selectedSpace && (
          <SpaceDetailsModal
            space={selectedSpace}
            onClose={() => setSelectedSpace(null)}
            onNavigate={() => handleNavigateToSafeSpace(selectedSpace)}
            t={t}
          />
        )}
      </AnimatePresence>
    </div>
  );
}