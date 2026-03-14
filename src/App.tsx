import React, { useEffect, useState, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Shield, X, Navigation2, StopCircle } from 'lucide-react';
import { Language, Report, SafeSpace, RouteInfo, SearchResult } from './types';
import { translations } from './translations';
import { auth, db, OperationType, handleFirestoreError } from "./firebase";
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, onSnapshot, updateDoc, doc, setDoc, query, where, Timestamp
} from "firebase/firestore";
import { MOCK_SAFE_SPACES, COLORS } from './constants';

// --- Components ---
import { BottomNav } from './components/BottomNav';
import { EmergencyButton } from './components/EmergencyButton';
import { ErrorFallback } from './components/ErrorFallback';
import { RoutePlannerScreen } from './components/RoutePlannerScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { MenuScreen } from './components/MenuScreen';
import { ReportModal } from './components/ReportModal';
import { ZoneDetailsModal } from './components/ZoneDetailsModal';
import { SpaceDetailsModal } from './components/SpaceDetailsModal';
import { AuthScreen } from './components/AuthScreen';

// ---------------------------------------------------------------------------
// Safe Space icon HTML
// ---------------------------------------------------------------------------
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
  return `
    <div style="width:36px;height:36px;background:white;border-radius:50%;border:2.5px solid ${cfg.color};box-shadow:0 2px 8px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${cfg.color}">${cfg.path}</svg>
    </div>
  `;
}

function isOpenNow(openingHours?: string): boolean {
  if (!openingHours) return true;
  if (openingHours === '24/7') return true;
  try {
    const now = new Date();
    const day = now.getDay();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const dayAbbr = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const today = dayAbbr[day];
    const rules = openingHours.split(';').map(r => r.trim());
    for (const rule of rules) {
      const match = rule.match(/^([A-Za-z,\-\s]+)\s+(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
      if (!match) continue;
      const dayRange = match[1].trim();
      const startMins = parseInt(match[2]) * 60 + parseInt(match[3]);
      const endMins   = parseInt(match[4]) * 60 + parseInt(match[5]);
      const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
      let inDay = false;
      if (dayRange.includes('-')) {
        const parts = dayRange.split('-').map(d => d.trim());
        const si = days.indexOf(parts[0]), ei = days.indexOf(parts[1]), ti = days.indexOf(today);
        if (si !== -1 && ei !== -1 && ti !== -1) inDay = ti >= si && ti <= ei;
      } else { inDay = dayRange.includes(today); }
      if (inDay && currentMins >= startMins && currentMins <= endMins) return true;
    }
    return false;
  } catch { return true; }
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [lang] = useState<Language>(navigator.language.startsWith('ro') ? 'ro' : 'en');
  const t = translations[lang];

  // activeTab: 'home' | 'report' | 'alerts' | 'settings'
  // 'route' tab is REMOVED — route planner is always on home screen
  const [activeTab, setActiveTab] = useState('home');
  const [showReportModal, setShowReportModal]   = useState(false);
  const [showSafeSpaces, setShowSafeSpaces]     = useState(false);
  const [selectedZone, setSelectedZone]         = useState<Report | null>(null);
  const [selectedSpace, setSelectedSpace]       = useState<SafeSpace | null>(null);
  const [reports, setReports]                   = useState<Report[]>([]);
  const [safeSpaces, setSafeSpaces]             = useState<SafeSpace[]>([]);
  const [userLocation, setUserLocation]         = useState<[number, number]>([45.7489, 21.2087]);
  const [reportLocation, setReportLocation]     = useState<[number, number] | null>(null);
  const [isNavigating, setIsNavigating]         = useState(false);
  const [activeRoute, setActiveRoute]           = useState<RouteInfo | null>(null);
  const [proximityAlert, setProximityAlert]     = useState<string | null>(null);
  const [initialDestination, setInitialDestination] = useState<SearchResult | null>(null);
  const [safeSpacesLoading, setSafeSpacesLoading]   = useState(false);
  const [timerActive, setTimerActive]           = useState(false);
  const [showAuth, setShowAuth]                 = useState(false);
  const [currentUser, setCurrentUser]           = useState(auth.currentUser);
  const [sheetSnap, setSheetSnap]               = useState<'SEARCH' | 'ROUTES' | 'FULL'>('SEARCH');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      if (user) setShowAuth(false);
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
  const reportingActiveRef      = useRef(false);
  const lastSafeSpacesFetchRef  = useRef<string>('');

  useEffect(() => { reportingActiveRef.current = showReportModal; }, [showReportModal]);

  // ── Firestore reports listener ──────────────────────────────────────────
  useEffect(() => {
    const latDelta = 0.18, lngDelta = 0.25;
    const minLat = userLocation[0] - latDelta, maxLat = userLocation[0] + latDelta;
    const minLng = userLocation[1] - lngDelta, maxLng = userLocation[1] + lngDelta;

    const q = query(collection(db, "reports"), where("lat", ">=", minLat), where("lat", "<=", maxLat));
    const unsub = onSnapshot(q, snap => {
      const data: Report[] = [];
      snap.forEach(d => {
        const r = d.data();
        if (r.lng >= minLng && r.lng <= maxLng) {
          data.push({
            id: d.id, ...r,
            timestamp: r.timestamp instanceof Timestamp
              ? r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : r.timestamp,
          } as Report);
        }
      });
      setReports(data);
    }, err => handleFirestoreError(err, OperationType.LIST, "reports"));
    return () => unsub();
  }, [userLocation]);

  // ── Safe spaces ─────────────────────────────────────────────────────────
  const fetchSafeSpaces = async (lat: number, lon: number) => {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (key === lastSafeSpacesFetchRef.current) return;
    lastSafeSpacesFetchRef.current = key;
    setSafeSpacesLoading(true);
    try {
      const res = await fetch(`/api/safe-spaces?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error('Backend error');
      const data = await res.json();
      const parsed: SafeSpace[] = (data.places || [])
        .map((p: any) => ({
          ...p,
          distance: Math.round(Math.sqrt(Math.pow(p.lat - lat, 2) + Math.pow(p.lng - lon, 2)) * 111000),
        }))
        .sort((a: any, b: any) => a.distance - b.distance);
      setSafeSpaces(parsed);
    } catch {
      setSafeSpaces(MOCK_SAFE_SPACES);
    } finally { setSafeSpacesLoading(false); }
  };

  useEffect(() => {
    if (showSafeSpaces) fetchSafeSpaces(userLocation[0], userLocation[1]);
    else if (safeSpacesLayerRef.current) safeSpacesLayerRef.current.clearLayers();
  }, [showSafeSpaces]);

  // ── Map init ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    mapRef.current = L.map(mapContainerRef.current, {
      center: userLocation, zoom: 15, zoomControl: false, attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 })
      .addTo(mapRef.current);

    reportsLayerRef.current    = L.layerGroup().addTo(mapRef.current);
    safeSpacesLayerRef.current = L.layerGroup().addTo(mapRef.current);

    mapRef.current.on('click', (e: any) => {
      if (reportingActiveRef.current) setReportLocation([e.latlng.lat, e.latlng.lng]);
    });

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const newPos: [number, number] = [lat, lng];
        setUserLocation(newPos);
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(newPos);
        } else {
          userMarkerRef.current = L.circleMarker(newPos, {
            radius: 10, fillColor: COLORS.primary, fillOpacity: 1, color: 'white', weight: 3,
          }).addTo(mapRef.current);
        }
        if (isNavigating) mapRef.current.panTo(newPos);
        reports.forEach(report => {
          const dist = L.latLng(newPos).distanceTo(L.latLng(report.lat, report.lng));
          if (dist < 100) {
            const msg = `Atenție: Intri într-o zonă periculoasă (${report.categories.join(', ')})`;
            if (proximityAlert !== msg) setProximityAlert(msg);
          }
        });
        if (showSafeSpaces) fetchSafeSpaces(lat, lng);
      }, err => console.error(err), { enableHighAccuracy: true });
    }
  }, [isNavigating, reports]);

  // ── Map markers ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    reportsLayerRef.current?.clearLayers();
    safeSpacesLayerRef.current?.clearLayers();
    if (reportLocationMarkerRef.current) {
      mapRef.current.removeLayer(reportLocationMarkerRef.current);
      reportLocationMarkerRef.current = null;
    }

    reports.forEach(report => {
      const color = report.weight >= 5 ? COLORS.danger : report.weight >= 2 ? '#FB923C' : '#FACC15';
      const circle = L.circle([report.lat, report.lng], {
        radius: 50 + report.weight * 10, fillColor: color, fillOpacity: 0.25, color, weight: 1.5,
      }).addTo(reportsLayerRef.current);
      circle.on('click', () => setSelectedZone(report));
    });

    if (showSafeSpaces) {
      safeSpaces.forEach(space => {
        const icon = L.divIcon({
          className: '', html: createSafeSpaceIconHtml(space.type),
          iconSize: [36, 36], iconAnchor: [18, 18],
        });
        L.marker([space.lat, space.lng], { icon })
          .addTo(safeSpacesLayerRef.current)
          .on('click', () => setSelectedSpace(space));
      });
    }

    if (reportLocation) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;background:#ef4444;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [32, 32], iconAnchor: [16, 32],
      });
      reportLocationMarkerRef.current = L.marker(reportLocation, { icon }).addTo(mapRef.current);
    }
  }, [reports, safeSpaces, showSafeSpaces, reportLocation]);

  // ── Route actions ────────────────────────────────────────────────────────
  const drawRoute = (route: RouteInfo) => {
    const L = (window as any).L;
    if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);
    const color = route.type === 'safe' ? COLORS.safe : COLORS.primary;
    routeLayerRef.current = L.geoJSON(route.geometry, {
      style: { color, weight: 8, opacity: 0.9, lineCap: 'round', lineJoin: 'round' },
    }).addTo(mapRef.current);
    mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [80, 80] });
    setActiveRoute(route);
  };

  const startNavigation = (route?: RouteInfo) => {
    const r = route ?? activeRoute;
    if (!r) return;
    setActiveRoute(r);
    setIsNavigating(true);
    mapRef.current?.setView(userLocation, 18);
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setActiveRoute(null);
    if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);
  };

  const handleNavigateToSafeSpace = (space: SafeSpace) => {
    setSelectedSpace(null);
    setInitialDestination({ display_name: space.name, lat: space.lat.toString(), lon: space.lng.toString() });
    // Just set the destination — RoutePlannerScreen will auto-compute on home tab
    setActiveTab('home');
  };

  // ── Tab navigation handler ───────────────────────────────────────────────
  const handleTabChange = (tab: string) => {
    if (tab === 'report')  { setShowReportModal(true); return; }
    if (tab === 'alerts' && !currentUser) { setShowAuth(true); return; }
    if (timerActive && tab !== 'home') return;
    setActiveTab(tab);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col bg-slate-50">

      {/* Proximity alert */}
      <AnimatePresence>
        {proximityAlert && (
          <motion.div
            initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            className="fixed top-24 left-6 right-6 z-[100] p-4 bg-danger text-white rounded-2xl shadow-2xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} />
              <p className="text-xs font-bold">{proximityAlert}</p>
            </div>
            <button onClick={() => setProximityAlert(null)}><X size={18} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-6 z-30 flex items-center justify-between pointer-events-none">
        <div className="glass px-5 py-3 rounded-2xl pointer-events-auto flex items-center gap-3 shadow-2xl border-white/60">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-lg transition-colors duration-500 ${proximityAlert ? 'bg-danger' : 'bg-primary'}`}>
            <Shield size={18} />
          </div>
          <h1 className="text-lg font-display font-black tracking-tight text-slate-900">{t.appName}</h1>
        </div>
        <div className="flex gap-2 pointer-events-auto">
          <button
            onClick={() => setShowSafeSpaces(!showSafeSpaces)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl relative ${showSafeSpaces ? 'bg-safe text-white scale-105' : 'glass text-slate-600'}`}
          >
            <Shield size={20} />
            {safeSpacesLoading && (
              <div className="absolute -top-1 -right-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin bg-safe" />
            )}
          </button>
        </div>
      </header>

      {/* Map */}
      <div ref={mapContainerRef} className="flex-1 w-full z-0" />

      {/* ── Overlays ── */}
      <AnimatePresence>

        {/* HOME TAB — BottomNav + EmergencyButton + RoutePlanner sheet */}
        {activeTab === 'home' && (
          <motion.div key="home-overlay">
            {/* Emergency button and bottom nav only when not navigating and sheet not full */}
            {!isNavigating && sheetSnap !== 'FULL' && (
              <>
                <EmergencyButton t={t} userLocation={userLocation} onTimerActive={setTimerActive} />
                <BottomNav activeTab={activeTab} setActiveTab={handleTabChange} t={t} />
              </>
            )}
            {/* Route planner — always on home, hides when navigating collapses it */}
            <RoutePlannerScreen
              onClose={() => setInitialDestination(null)}
              t={t}
              userLocation={userLocation}
              reports={reports}
              onDrawRoute={drawRoute}
              onStartNav={startNavigation}
              initialDest={initialDestination}
              isNavigating={isNavigating}
              activeRoute={activeRoute}
              onStopNav={stopNavigation}
              onSnapChange={setSheetSnap}
            />
          </motion.div>
        )}

        {/* ALERTS TAB — SettingsScreen (Cont: notifications + emergency contacts) */}
        {activeTab === 'alerts' && (
          <SettingsScreen
            onClose={() => setActiveTab('home')}
            t={t}
            onOpenMenu={() => setActiveTab('settings')}
          />
        )}

        {/* SETTINGS TAB — MenuScreen (About, Privacy — opened from SettingsScreen) */}
        {activeTab === 'settings' && (
          <MenuScreen onClose={() => setActiveTab('alerts')} t={t} />
        )}

        {/* AUTH */}
        {showAuth && (
          <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150]">
            <AuthScreen
              onSuccess={() => { setShowAuth(false); setActiveTab('alerts'); }}
              onClose={() => setShowAuth(false)}
            />
          </motion.div>
        )}

        {/* REPORT MODAL */}
        {showReportModal && (
          <ReportModal
            onClose={() => { setShowReportModal(false); setReportLocation(null); }}
            onSubmit={async (categories, details, isLive) => {
              if (!reportLocation) return;
              const reportId = Math.random().toString(36).substr(2, 9);
              try {
                await setDoc(doc(db, "reports", reportId), {
                  id: reportId, lat: reportLocation[0], lng: reportLocation[1],
                  categories, details, timestamp: new Date().toISOString(), isLive, weight: 1,
                });
                setShowReportModal(false);
                setReportLocation(null);
              } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
              }
            }}
            t={t}
            reportLocation={reportLocation}
          />
        )}

        {/* ZONE DETAILS */}
        {selectedZone && (
          <ZoneDetailsModal
            zone={selectedZone}
            onClose={() => setSelectedZone(null)}
            onConfirm={async () => {
              try {
                await updateDoc(doc(db, "reports", selectedZone.id), { weight: (selectedZone.weight || 1) + 1 });
                setSelectedZone(null);
              } catch (error) {
                handleFirestoreError(error, OperationType.UPDATE, `reports/${selectedZone.id}`);
              }
            }}
            t={t}
          />
        )}

        {/* SPACE DETAILS */}
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