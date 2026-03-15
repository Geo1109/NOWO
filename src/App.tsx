import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Shield, X, Crosshair, Navigation } from 'lucide-react';
import { Language, Report, SafeSpace, RouteInfo, SearchResult } from './types';
import { translations } from './translations';
import { auth, db, OperationType, handleFirestoreError, onForegroundMessage } from "./firebase";
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, updateDoc, doc, setDoc, query, where, Timestamp } from "firebase/firestore";
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
// Helpers
// ---------------------------------------------------------------------------
const makeExpiresAt = () => new Date(Date.now() + 20 * 60 * 1000).toISOString();

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

/** Creates the SVG HTML for the directional user location dot */
function createUserArrowHtml(heading: number): string {
  return `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
    <svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(${heading}deg);transform-origin:center;overflow:visible;">
      <!-- Accuracy pulse ring -->
      <circle cx="13" cy="13" r="12" fill="rgba(59,73,223,0.12)" stroke="none"/>
      <!-- Dot -->
      <circle cx="13" cy="13" r="7" fill="#3B49DF" stroke="white" stroke-width="2.5"/>
      <!-- Direction arrow -->
      <path d="M13 1 L10 8 L13 6.5 L16 8 Z" fill="#3B49DF" stroke="white" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  </div>`;
}

// ---------------------------------------------------------------------------
export default function App() {
  return <ErrorBoundary FallbackComponent={ErrorFallback}><AppContent /></ErrorBoundary>;
}

function AppContent() {
  const [lang] = useState<Language>(navigator.language.startsWith('ro') ? 'ro' : 'en');
  const t = translations[lang];
  const [appReady, setAppReady] = useState(false);

  const [activeTab, setActiveTab]                   = useState('home');
  const [showReportModal, setShowReportModal]       = useState(false);
  const [showSafeSpaces, setShowSafeSpaces]         = useState(false);
  const [selectedZone, setSelectedZone]             = useState<Report | null>(null);
  const [selectedSpace, setSelectedSpace]           = useState<SafeSpace | null>(null);
  const [reports, setReports]                       = useState<Report[]>([]);
  const [safeSpaces, setSafeSpaces]                 = useState<SafeSpace[]>([]);
  const [userLocation, setUserLocation]             = useState<[number, number]>([45.7489, 21.2087]);
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
  // Reposition: true when user has panned away from current location
  const [mapPanned, setMapPanned]                   = useState(false);

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
  const walkedCoordsRef         = useRef<[number, number][]>([]);
  const reportingActiveRef      = useRef(false);
  const lastSafeSpacesFetchRef  = useRef('');
  const geoWatchIdRef           = useRef<string | null>(null);
  const reportsRef              = useRef<Report[]>([]);
  const isNavigatingRef         = useRef(isNavigating);
  const headingRef              = useRef(0);
  const mapPannedRef            = useRef(false);
  const headingTimerRef         = useRef<number | null>(null);

  useEffect(() => { reportsRef.current = reports; }, [reports]);
  useEffect(() => { reportingActiveRef.current = showReportModal; }, [showReportModal]);
  useEffect(() => { isNavigatingRef.current = isNavigating; }, [isNavigating]);
  useEffect(() => { mapPannedRef.current = mapPanned; }, [mapPanned]);

  // ── Device orientation → compass heading ──────────────────────────────────
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const compassHeading = (e as any).webkitCompassHeading ?? (e.alpha !== null ? (360 - (e.alpha ?? 0)) % 360 : 0);
      headingRef.current = compassHeading;
      // Throttle marker updates to 150ms
      if (headingTimerRef.current) return;
      headingTimerRef.current = window.setTimeout(() => {
        headingTimerRef.current = null;
        const L = (window as any).L;
        if (L && userMarkerRef.current && mapRef.current) {
          try {
            userMarkerRef.current.setIcon(L.divIcon({
              className: '', html: createUserArrowHtml(headingRef.current),
              iconSize: [26, 26], iconAnchor: [13, 13],
            }));
          } catch {}
        }
      }, 150);
    };
    window.addEventListener('deviceorientationabsolute', handler as EventListener);
    window.addEventListener('deviceorientation', handler as EventListener);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler as EventListener);
      window.removeEventListener('deviceorientation', handler as EventListener);
      if (headingTimerRef.current) clearTimeout(headingTimerRef.current);
    };
  }, []);

  // ── Firestore reports ──────────────────────────────────────────────────────
  useEffect(() => {
    const latDelta = 0.18, lngDelta = 0.25;
    const minLat = userLocation[0] - latDelta, maxLat = userLocation[0] + latDelta;
    const minLng = userLocation[1] - lngDelta, maxLng = userLocation[1] + lngDelta;
    const q = query(collection(db, "reports"), where("lat", ">=", minLat), where("lat", "<=", maxLat));
    const unsub = onSnapshot(q, snap => {
      const now = new Date(), data: Report[] = [];
      snap.forEach(d => {
        const r = d.data();
        if (r.lng < minLng || r.lng > maxLng) return;
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
      setSafeSpaces((data.places || []).map((p: any) => ({ ...p, distance: Math.round(Math.sqrt(Math.pow(p.lat - lat, 2) + Math.pow(p.lng - lon, 2)) * 111000) })).sort((a: any, b: any) => a.distance - b.distance));
    } catch { setSafeSpaces(MOCK_SAFE_SPACES); }
    finally { setSafeSpacesLoading(false); }
  };

  useEffect(() => {
    if (showSafeSpaces) fetchSafeSpaces(userLocation[0], userLocation[1]);
    else safeSpacesLayerRef.current?.clearLayers();
  }, [showSafeSpaces]);

  // ── Geolocation + user marker update ──────────────────────────────────────
  const startGeolocationWatch = async (L: any) => {
    const handle = (lat: number, lng: number) => {
      const newPos: [number, number] = [lat, lng];
      setUserLocation(newPos);

      // Update or create the directional arrow marker
      const iconHtml = createUserArrowHtml(headingRef.current);
      const icon = L.divIcon({ className: '', html: iconHtml, iconSize: [26, 26], iconAnchor: [13, 13] });

      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(newPos);
        userMarkerRef.current.setIcon(icon);
      } else {
        userMarkerRef.current = L.marker(newPos, { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
      }

      // Auto-follow when navigating (unless user has panned away)
      if (isNavigatingRef.current && !mapPannedRef.current) {
        mapRef.current.panTo(newPos);
      }

      // Navigation walked trail
      if (isNavigatingRef.current) {
        walkedCoordsRef.current = [...walkedCoordsRef.current, newPos];
        if (walkedPolylineRef.current) {
          walkedPolylineRef.current.setLatLngs(walkedCoordsRef.current);
        } else {
          walkedPolylineRef.current = L.polyline(walkedCoordsRef.current, {
            color: '#94a3b8', weight: 7, opacity: 0.75, lineCap: 'round', lineJoin: 'round',
          }).addTo(mapRef.current);
          // Route layer should render on top of the walked trail
          if (routeLayerRef.current) routeLayerRef.current.bringToFront();
        }
      }

      const cu = auth.currentUser;
      if (cu) updateDoc(doc(db, 'users', cu.uid), { lastLat: lat, lastLng: lng }).catch(() => {});

      // Proximity alert at 100m
      reportsRef.current.forEach(report => {
        const cos = Math.cos((newPos[0] * Math.PI) / 180);
        const dist = Math.sqrt(Math.pow((newPos[0] - report.lat) * 111320, 2) + Math.pow((newPos[1] - report.lng) * 111320 * cos, 2));
        if (dist < 100) {
          const msg = `⚠️ Atenție: Zonă periculoasă (${report.categories.join(', ')})`;
          setProximityAlert(prev => prev === msg ? prev : msg);
        }
      });

      if (showSafeSpaces) fetchSafeSpaces(lat, lng);
    };

    if (Capacitor.isNativePlatform()) {
      try {
        const { location } = await Geolocation.requestPermissions();
        if (location !== 'granted') return;
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        handle(pos.coords.latitude, pos.coords.longitude);
        geoWatchIdRef.current = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000 }, (p, e) => { if (e || !p) return; handle(p.coords.latitude, p.coords.longitude); });
      } catch (e) { console.error(e); }
    } else {
      navigator.geolocation?.watchPosition(p => handle(p.coords.latitude, p.coords.longitude), console.error, { enableHighAccuracy: true });
    }
  };

  // ── Map init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const L = (window as any).L; if (!L) return;
    mapRef.current = L.map(mapContainerRef.current, { center: userLocation, zoom: 15, zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(mapRef.current);
    reportsLayerRef.current    = L.layerGroup().addTo(mapRef.current);
    safeSpacesLayerRef.current = L.layerGroup().addTo(mapRef.current);
    mapRef.current.on('click', (e: any) => { if (reportingActiveRef.current) setReportLocation([e.latlng.lat, e.latlng.lng]); });
    // Track panning so we can show the reposition button
    mapRef.current.on('dragstart', () => setMapPanned(true));
    startGeolocationWatch(L);
    return () => {
      if (geoWatchIdRef.current && Capacitor.isNativePlatform()) Geolocation.clearWatch({ id: geoWatchIdRef.current! });
    };
  }, []);

  // ── Map markers ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L; if (!L) return;
    reportsLayerRef.current?.clearLayers(); safeSpacesLayerRef.current?.clearLayers();
    if (reportLocationMarkerRef.current) { mapRef.current.removeLayer(reportLocationMarkerRef.current); reportLocationMarkerRef.current = null; }

    reports.forEach(report => {
      // Fixed 20m radius, color based on weight only — matches DANGER_ZONE_RADIUS_M
      const color = report.weight >= 5 ? COLORS.danger : report.weight >= 2 ? '#F97316' : '#FACC15';
      const circle = L.circle([report.lat, report.lng], {
        radius: DANGER_ZONE_RADIUS_M,
        fillColor: color, fillOpacity: 0.40, color, weight: 2,
      }).addTo(reportsLayerRef.current);
      circle.on('click', () => setSelectedZone(report));
    });

    if (showSafeSpaces) safeSpaces.forEach(space => {
      const icon = L.divIcon({ className: '', html: createSafeSpaceIconHtml(space.type), iconSize: [36, 36], iconAnchor: [18, 18] });
      L.marker([space.lat, space.lng], { icon }).addTo(safeSpacesLayerRef.current).on('click', () => setSelectedSpace(space));
    });

    if (reportLocation) {
      reportLocationMarkerRef.current = L.marker(reportLocation, {
        icon: L.divIcon({ className: '', html: `<div style="width:32px;height:32px;background:#ef4444;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`, iconSize: [32, 32], iconAnchor: [16, 32] })
      }).addTo(mapRef.current);
    }
  }, [reports, safeSpaces, showSafeSpaces, reportLocation]);

  // ── Route / navigation actions ─────────────────────────────────────────────
  const drawRoute = (route: RouteInfo) => {
    const L = (window as any).L;
    if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);
    routeLayerRef.current = L.geoJSON(route.geometry, { style: { color: route.type === 'safe' ? COLORS.safe : COLORS.primary, weight: 8, opacity: 0.9, lineCap: 'round', lineJoin: 'round' } }).addTo(mapRef.current);
    mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [80, 80] });
    setActiveRoute(route);
  };

  const startNavigation = (route?: RouteInfo) => {
    const r = route ?? activeRoute; if (!r) return;
    setActiveRoute(r); setIsNavigating(true);
    walkedCoordsRef.current = []; // reset trail
    mapRef.current?.setView(userLocation, 18);
    setMapPanned(false);
  };

  const stopNavigation = () => {
    setIsNavigating(false); setActiveRoute(null);
    if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);
    if (walkedPolylineRef.current) { mapRef.current.removeLayer(walkedPolylineRef.current); walkedPolylineRef.current = null; }
    walkedCoordsRef.current = [];
  };

  const handleNavigateToSafeSpace = (space: SafeSpace) => {
    setSelectedSpace(null); setAutoNavigate(true);
    setInitialDestination({ display_name: space.name, lat: space.lat.toString(), lon: space.lng.toString() });
    setActiveTab('home');
  };

  const goToMyLocation = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(userLocation, 17);
    setMapPanned(false);
  }, [userLocation]);

  // ── Tab navigation — stop nav when switching away from home ───────────────
  const handleTabChange = (tab: string) => {
    if (tab === 'report') { setShowReportModal(true); return; }
    if (tab === 'alerts' && !currentUser) { setShowAuth(true); return; }
    if (timerActive && tab !== 'home') return;
    // Stop navigation when user explicitly goes to another tab
    if (tab !== 'home' && isNavigating) stopNavigation();
    setActiveTab(tab);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col bg-slate-50">

      {/* Loading screen */}
      <AnimatePresence>
        {!appReady && <LoadingScreen onFinish={() => setAppReady(true)} duration={2} />}
      </AnimatePresence>

      {/* Proximity alert */}
      <AnimatePresence>
        {proximityAlert && (
          <motion.div initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            className="fixed top-24 left-6 right-6 z-[100] p-4 bg-danger text-white rounded-2xl shadow-2xl flex items-center justify-between">
            <div className="flex items-center gap-3"><AlertTriangle size={20} /><p className="text-xs font-bold">{proximityAlert}</p></div>
            <button onClick={() => setProximityAlert(null)}><X size={18} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-6 z-30 flex items-center justify-between pointer-events-none">
        <div className="glass px-5 py-3 rounded-2xl pointer-events-auto flex items-center gap-3 shadow-2xl border-white/60">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-lg transition-colors duration-500 ${proximityAlert ? 'bg-danger' : 'bg-primary'}`}><Shield size={18} /></div>
          <h1 className="text-lg font-display font-black tracking-tight text-slate-900">{t.appName}</h1>
        </div>
        <div className="flex gap-2 pointer-events-auto">
          <button onClick={() => setShowSafeSpaces(!showSafeSpaces)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl relative ${showSafeSpaces ? 'bg-safe text-white scale-105' : 'glass text-slate-600'}`}>
            <Shield size={20} />
            {safeSpacesLoading && <div className="absolute -top-1 -right-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin bg-safe" />}
          </button>
        </div>
      </header>

      {/* Map */}
      <div ref={mapContainerRef} className="flex-1 w-full z-0" />

      {/* ── Floating location / reposition buttons ── */}
      {activeTab === 'home' && sheetSnap !== 'FULL' && (
        <div className="fixed z-40" style={{ bottom: `calc(env(safe-area-inset-bottom) + ${isNavigating ? 110 : 80}px)`, left: 16 }}>
          <button
            onClick={goToMyLocation}
            className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-xl transition-all active:scale-90"
            style={{ background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
            title="Mergi la locația mea"
          >
            {mapPanned
              ? <Navigation size={20} style={{ color: '#3B49DF' }} />
              : <Crosshair size={20} style={{ color: '#64748b' }} />
            }
          </button>
        </div>
      )}

      {/* ── Emergency button — always visible (even during navigation) ── */}
      {activeTab === 'home' && sheetSnap !== 'FULL' && (
        <EmergencyButton t={t} userLocation={userLocation} onTimerActive={setTimerActive} />
      )}

      <AnimatePresence>
        {activeTab === 'home' && (
          <motion.div key="home-overlay">
            {/* BottomNav only when NOT navigating */}
            {!isNavigating && sheetSnap !== 'FULL' && (
              <BottomNav activeTab={activeTab} setActiveTab={handleTabChange} t={t} />
            )}
            <RoutePlannerScreen
              onClose={() => { setInitialDestination(null); setAutoNavigate(false); }}
              t={t} userLocation={userLocation} reports={reports}
              onDrawRoute={drawRoute} onStartNav={startNavigation}
              initialDest={initialDestination} isNavigating={isNavigating}
              activeRoute={activeRoute} onStopNav={stopNavigation}
              onSnapChange={setSheetSnap} autoNavigate={autoNavigate}
            />
          </motion.div>
        )}

        {activeTab === 'alerts' && <SettingsScreen onClose={() => setActiveTab('home')} t={t} onOpenMenu={() => setActiveTab('settings')} />}
        {activeTab === 'settings' && <MenuScreen onClose={() => setActiveTab('alerts')} t={t} />}

        {showAuth && (
          <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150]">
            <AuthScreen onSuccess={() => { setShowAuth(false); setActiveTab('alerts'); }} onClose={() => setShowAuth(false)} />
          </motion.div>
        )}

        {showReportModal && (
          <ReportModal
            onClose={() => { setShowReportModal(false); setReportLocation(null); }}
            onSubmit={async (categories, details, isLive) => {
              if (!reportLocation) return;
              const reportId = Math.random().toString(36).substr(2, 9);
              try {
                await setDoc(doc(db, "reports", reportId), { id: reportId, lat: reportLocation[0], lng: reportLocation[1], categories, details, timestamp: new Date().toISOString(), isLive, weight: 1, expiresAt: makeExpiresAt(), expired: false });
                setShowReportModal(false); setReportLocation(null);
              } catch (error) { handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`); }
            }}
            t={t} reportLocation={reportLocation}
          />
        )}

        {selectedZone && (
          <ZoneDetailsModal
            zone={selectedZone}
            onClose={() => setSelectedZone(null)}
            userLocation={userLocation}
            onConfirm={async () => {
              try {
                await updateDoc(doc(db, "reports", selectedZone.id), { weight: (selectedZone.weight || 1) + 1, expiresAt: makeExpiresAt(), expired: false });
                setSelectedZone(null);
              } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `reports/${selectedZone.id}`); }
            }}
            onDecline={async () => {
              try {
                const newWeight = Math.max(0, (selectedZone.weight || 1) - 1);
                await updateDoc(doc(db, "reports", selectedZone.id), newWeight === 0
                  ? { expired: true }
                  : { weight: newWeight }
                );
                setSelectedZone(null);
              } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `reports/${selectedZone.id}`); }
            }}
            t={t}
          />
        )}

        {selectedSpace && (
          <SpaceDetailsModal space={selectedSpace} onClose={() => setSelectedSpace(null)} onNavigate={() => handleNavigateToSafeSpace(selectedSpace)} t={t} />
        )}
      </AnimatePresence>
    </div>
  );
}