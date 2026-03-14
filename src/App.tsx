import React, { useEffect, useState, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, Navigation, Shield, X,
  MapPin, Navigation2, StopCircle, Footprints
} from 'lucide-react';
import { Language, Report, SafeSpace, RouteInfo, SearchResult } from './types';
import { translations } from './translations';
import { auth, db, OperationType, handleFirestoreError } from "./firebase";
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, onSnapshot, updateDoc, doc, setDoc, query, where, Timestamp
} from "firebase/firestore";
import { MOCK_REPORTS, MOCK_SAFE_SPACES, COLORS } from './constants';

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

// --- Safe Space icon SVG generator ---
// Clean minimal map icons — white pill with colored icon inside
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
    <div style="
      width:36px; height:36px;
      background:white;
      border-radius:50%;
      border:2.5px solid ${cfg.color};
      box-shadow:0 2px 8px rgba(0,0,0,0.18);
      display:flex; align-items:center; justify-content:center;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${cfg.color}">
        ${cfg.path}
      </svg>
    </div>
  `;
}

// Check if a place is open right now based on opening_hours tag
function isOpenNow(openingHours?: string): boolean {
  if (!openingHours) return true; // no data = assume open (don't hide it)
  if (openingHours === '24/7') return true;
  
  try {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon...
    const hour = now.getHours();
    const min = now.getMinutes();
    const currentMins = hour * 60 + min;

    // Map day number to OSM abbreviations
    const dayAbbr = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const today = dayAbbr[day];

    // Try to parse simple formats like "Mo-Fr 08:00-20:00" or "Mo-Sa 09:00-21:00"
    const rules = openingHours.split(';').map(r => r.trim());
    
    for (const rule of rules) {
      const match = rule.match(/^([A-Za-z,\-\s]+)\s+(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
      if (!match) continue;
      
      const dayRange = match[1].trim();
      const startMins = parseInt(match[2]) * 60 + parseInt(match[3]);
      const endMins = parseInt(match[4]) * 60 + parseInt(match[5]);
      
      // Check if today is in day range
      const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
      let inDay = false;
      
      if (dayRange.includes('-')) {
        const parts = dayRange.split('-').map(d => d.trim());
        const startIdx = days.indexOf(parts[0]);
        const endIdx = days.indexOf(parts[1]);
        const todayIdx = days.indexOf(today);
        if (startIdx !== -1 && endIdx !== -1 && todayIdx !== -1) {
          inDay = todayIdx >= startIdx && todayIdx <= endIdx;
        }
      } else {
        inDay = dayRange.includes(today);
      }
      
      if (inDay && currentMins >= startMins && currentMins <= endMins) return true;
    }
    
    return false;
  } catch {
    return true; // parse error = assume open
  }
}

// --- Parse Overpass element into SafeSpace ---
function parseOverpassElement(el: any): SafeSpace | null {
  const tags = el.tags || {};
  const amenity = tags.amenity || tags.shop || '';
  
  // Skip elements without coordinates
  if (el.lat === undefined || el.lon === undefined) return null;

  const typeMap: Record<string, SafeSpace['type']> = {
    pharmacy: 'pharmacy',
    hospital: 'hospital',
    police: 'police',
    supermarket: 'supermarket',
    convenience: 'convenience',
    chemist: 'pharmacy',
    doctors: 'doctors',
    clinic: 'clinic',
    fast_food: 'convenience',
    cafe: 'convenience',
    bar: 'convenience',
    restaurant: 'convenience',
  };

  const type = typeMap[amenity];
  if (!type) return null;

  const labelMap: Record<string, string> = {
    pharmacy: 'Farmacie',
    hospital: 'Spital',
    police: 'Secție Poliție',
    supermarket: 'Supermarket',
    convenience: 'Magazin',
    doctors: 'Cabinet Medical',
    clinic: 'Clinică',
  };

  const name = tags.name || tags['name:ro'] || tags['name:en'] || labelMap[type];

  const addressParts = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean);
  const address = addressParts.join(', ');

  const openingHoursRaw = tags.opening_hours || '';

  return {
    id: String(el.id),
    name,
    type,
    lat: el.lat,
    lng: el.lon,
    details: address || 'Spațiu sigur verificat',
    address,
    phone: tags.phone || tags['contact:phone'] || '',
    openingHours: openingHoursRaw,
    openNow: isOpenNow(openingHoursRaw),
    website: tags.website || tags['contact:website'] || '',
  } as SafeSpace;
}

// --- Main App ---

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
  
  const [activeTab, setActiveTab] = useState('home');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSafeSpaces, setShowSafeSpaces] = useState(false);
  const [selectedZone, setSelectedZone] = useState<Report | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<SafeSpace | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [safeSpaces, setSafeSpaces] = useState<SafeSpace[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number]>([45.7489, 21.2087]);
  const [reportLocation, setReportLocation] = useState<[number, number] | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeRoute, setActiveRoute] = useState<RouteInfo | null>(null);
  const [proximityAlert, setProximityAlert] = useState<string | null>(null);
  const [initialDestination, setInitialDestination] = useState<SearchResult | null>(null);
  const [safeSpacesLoading, setSafeSpacesLoading] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  // Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) setShowAuth(false); // auto-close auth screen on login
    });
    return () => unsub();
  }, []);
  
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const reportsLayerRef = useRef<any>(null);
  const safeSpacesLayerRef = useRef<any>(null);
  const reportLocationMarkerRef = useRef<any>(null);
  const reportingActiveRef = useRef(false);
  const lastSafeSpacesFetchRef = useRef<string>('');

  // Keep reportingActiveRef in sync so map click handler always has latest value
  useEffect(() => {
    reportingActiveRef.current = showReportModal;
  }, [showReportModal]);
  useEffect(() => {
    const latDelta = 0.18;
    const lngDelta = 0.25; 

    const minLat = userLocation[0] - latDelta;
    const maxLat = userLocation[0] + latDelta;
    const minLng = userLocation[1] - lngDelta;
    const maxLng = userLocation[1] + lngDelta;

    const q = query(
      collection(db, "reports"), 
      where("lat", ">=", minLat),
      where("lat", "<=", maxLat)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reportsData: Report[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.lng >= minLng && data.lng <= maxLng) {
          reportsData.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp instanceof Timestamp 
              ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : data.timestamp
          } as Report);
        }
      });
      setReports(reportsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "reports");
    });
    return () => unsubscribe();
  }, [userLocation]);

  // Fetch Real Safe Spaces from Overpass via backend
  const fetchSafeSpaces = async (lat: number, lon: number) => {
    // Avoid re-fetching if user hasn't moved more than ~200m
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (key === lastSafeSpacesFetchRef.current) return;
    lastSafeSpacesFetchRef.current = key;

    setSafeSpacesLoading(true);
    try {
      const res = await fetch(`/api/safe-spaces?lat=${lat}&lon=${lon}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Google Places detail:', JSON.stringify(errData));
        throw new Error(errData.detail || errData.error || 'Backend error');
      }
      const data = await res.json();

      const parsed: SafeSpace[] = (data.places || [])
        .map((p: any) => ({
          ...p,
          distance: Math.round(Math.sqrt(
            Math.pow(p.lat - lat, 2) + Math.pow(p.lng - lon, 2)
          ) * 111000),
        }))
        .sort((a: any, b: any) => a.distance - b.distance);

      setSafeSpaces(parsed);
    } catch (e) {
      console.error('Safe spaces fetch error:', e);
      // Fallback to mock data if API fails
      setSafeSpaces(MOCK_SAFE_SPACES);
    } finally {
      setSafeSpacesLoading(false);
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    mapRef.current = L.map(mapContainerRef.current, {
      center: userLocation,
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    tileLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(mapRef.current);

    reportsLayerRef.current = L.layerGroup().addTo(mapRef.current);
    safeSpacesLayerRef.current = L.layerGroup().addTo(mapRef.current);

    // Map Click Handler — always active when showReportModal is true
    mapRef.current.on('click', (e: any) => {
      if (reportingActiveRef.current) {
        const { lat, lng } = e.latlng;
        setReportLocation([lat, lng]);
      }
    });

    // Geolocation Watch
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        const newPos: [number, number] = [latitude, longitude];
        setUserLocation(newPos);
        
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(newPos);
        } else {
          userMarkerRef.current = L.circleMarker(newPos, {
            radius: 10,
            fillColor: COLORS.primary,
            fillOpacity: 1,
            color: 'white',
            weight: 3,
          }).addTo(mapRef.current);
        }

        if (isNavigating) {
          mapRef.current.panTo(newPos);
        }

        reports.forEach(report => {
          const dist = L.latLng(newPos).distanceTo(L.latLng(report.lat, report.lng));
          if (dist < 100) {
            const msg = `Warning: You are entering a danger zone (${report.categories.join(', ')})`;
            if (proximityAlert !== msg) setProximityAlert(msg);
          }
        });

        // Re-fetch safe spaces if user moved significantly and they're shown
        if (showSafeSpaces) {
          fetchSafeSpaces(latitude, longitude);
        }
      }, (err) => console.error(err), { enableHighAccuracy: true });
    }
  }, [isNavigating, reports]);

  // Fetch safe spaces when toggle is turned on
  useEffect(() => {
    if (showSafeSpaces) {
      fetchSafeSpaces(userLocation[0], userLocation[1]);
    } else {
      // Clear markers when toggled off
      if (safeSpacesLayerRef.current) safeSpacesLayerRef.current.clearLayers();
    }
  }, [showSafeSpaces]);

  // Update Map Markers
  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    if (reportsLayerRef.current) reportsLayerRef.current.clearLayers();
    if (safeSpacesLayerRef.current) safeSpacesLayerRef.current.clearLayers();
    if (reportLocationMarkerRef.current) {
      mapRef.current.removeLayer(reportLocationMarkerRef.current);
      reportLocationMarkerRef.current = null;
    }

    // Add Reports
    reports.forEach(report => {
      const color = report.weight >= 5 ? COLORS.danger : report.weight >= 2 ? '#FB923C' : '#FACC15';
      
      const circle = L.circle([report.lat, report.lng], {
        radius: 50 + (report.weight * 10),
        fillColor: color,
        fillOpacity: 0.25,
        color: color,
        weight: 1.5,
      }).addTo(reportsLayerRef.current);

      circle.on('click', () => setSelectedZone(report));
    });

    // Add Safe Space Markers with SVG pin icons
    if (showSafeSpaces) {
      safeSpaces.forEach(space => {
        const icon = L.divIcon({
          className: '',
          html: createSafeSpaceIconHtml(space.type),
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -22],
        });

        const marker = L.marker([space.lat, space.lng], { icon })
          .addTo(safeSpacesLayerRef.current);

        marker.on('click', () => setSelectedSpace(space));
      });
    }

    // Add Report Location Marker
    if (reportLocation) {
      const iconHtml = `<div style="
        width:32px;height:32px;
        background:#ef4444;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
      "></div>`;
      const icon = L.divIcon({
        className: '',
        html: iconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });
      reportLocationMarkerRef.current = L.marker(reportLocation, { icon }).addTo(mapRef.current);
    }
  }, [reports, safeSpaces, showSafeSpaces, reportLocation]);

  const handleReportSubmit = async (categories: string[], details: string, isLive: boolean) => {
    if (!reportLocation) return;
    const reportId = Math.random().toString(36).substr(2, 9);
    const newReport = {
      id: reportId,
      lat: reportLocation[0],
      lng: reportLocation[1],
      categories,
      details,
      timestamp: new Date().toISOString(),
      isLive,
      weight: 1,
    };
    
    try {
      await setDoc(doc(db, "reports", reportId), newReport);
      setShowReportModal(false);
      setReportLocation(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
    }
  };

  const drawRoute = (route: RouteInfo) => {
    const L = (window as any).L;
    if (routeLayerRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
    }
    const color = route.type === 'safe' ? COLORS.safe : COLORS.primary;
    routeLayerRef.current = L.geoJSON(route.geometry, {
      style: {
        color: color,
        weight: 8,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }
    }).addTo(mapRef.current);
    
    mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [80, 80] });
    setActiveRoute(route);
  };

  const startNavigation = (route?: RouteInfo) => {
    const routeToUse = route ?? activeRoute;
    if (!routeToUse) return;
    
    setActiveRoute(routeToUse);
    setIsNavigating(true);
    // Note: We don't setActiveTab('home') here because the 
    // RoutePlanner's sheet or overlay manages its own visibility/transition
    mapRef.current?.setView(userLocation, 18);
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setActiveRoute(null);
    if (routeLayerRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
    }
  };


  const handleNavigateToSafeSpace = (space: SafeSpace) => {
    setSelectedSpace(null);
    setInitialDestination({
      display_name: space.name,
      lat: space.lat.toString(),
      lon: space.lng.toString()
    });
    setActiveTab('route');
  };

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col bg-slate-50">
      {/* Proximity Alert & Header logic remains same */}
      <AnimatePresence>
        {proximityAlert && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-24 left-6 right-6 z-[100] p-4 bg-danger text-white rounded-2xl shadow-2xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} />
              <p className="text-xs font-bold">{proximityAlert}</p>
            </div>
            <button onClick={() => setProximityAlert(null)}>
              <X size={18} />
            </button>
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
          {/* Safe Spaces toggle button */}
          <button 
            onClick={() => setShowSafeSpaces(!showSafeSpaces)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl relative ${showSafeSpaces ? 'bg-safe text-white scale-105' : 'glass text-slate-600'}`}
            title={showSafeSpaces ? 'Ascunde spații sigure' : 'Arată spații sigure'}
          >
            <Shield size={20} />
            {/* Loading spinner */}
            {safeSpacesLoading && (
              <div className="absolute -top-1 -right-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin bg-safe" />
            )}
          </button>
        </div>
      </header>

      {/* Map Container */}
      <div ref={mapContainerRef} className="flex-1 w-full z-0" />

      {/* Navigation Overlay */}
      {isNavigating && activeRoute && (
        <div className="absolute top-24 left-6 right-6 z-40">
          <div className="glass p-6 rounded-3xl shadow-2xl border-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Navigation2 size={24} className="animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest">Navigating</p>
                <h3 className="text-sm font-bold text-slate-900">Follow the {activeRoute.type} path</h3>
              </div>
            </div>
            <button 
              onClick={stopNavigation}
              className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors"
            >
              <StopCircle size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Overlays */}
      <AnimatePresence>
        {activeTab === 'home' && !isNavigating && (
          <motion.div key="home-overlay">
            <EmergencyButton t={t} userLocation={userLocation} onTimerActive={setTimerActive} />
            <BottomNav 
              activeTab={activeTab} 
              setActiveTab={(tab) => {
                if (tab === 'report') { setShowReportModal(true); return; }
                if (tab === 'alerts' && !currentUser) { setShowAuth(true); return; }
                if (timerActive && tab !== 'home') return; 
                setActiveTab(tab);
              }} 
              t={t} 
            />
          </motion.div>
        )}

        {/* --- UPDATED ROUTE PLANNER SCREEN INVOCATION --- */}
        {activeTab === 'route' && (
          <RoutePlannerScreen
            onClose={() => { 
              setActiveTab('home'); 
              setInitialDestination(null); 
            }}
            t={t}
            userLocation={userLocation}
            reports={reports}
            onDrawRoute={drawRoute}
            onStartNav={startNavigation} // Now uses the enhanced version
            initialDest={initialDestination}
          />
        )}

        {activeTab === 'alerts' && (
          <SettingsScreen onClose={() => setActiveTab('home')} t={t} />
        )}

        {showAuth && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150]"
          >
            <AuthScreen onSuccess={() => { setShowAuth(false); setActiveTab('alerts'); }} onClose={() => setShowAuth(false)} />
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <MenuScreen onClose={() => setActiveTab('home')} t={t} />
        )}

        {showReportModal && (
          <ReportModal 
            onClose={() => {
              setShowReportModal(false);
              setReportLocation(null);
            }} 
            onSubmit={handleReportSubmit}
            t={t} 
            reportLocation={reportLocation}
          />
        )}

        {selectedZone && (
          <ZoneDetailsModal 
            zone={selectedZone} 
            onClose={() => setSelectedZone(null)} 
            onConfirm={async () => {
              try {
                const reportRef = doc(db, "reports", selectedZone.id);
                await updateDoc(reportRef, {
                  weight: (selectedZone.weight || 1) + 1
                });
                setSelectedZone(null);
              } catch (error) {
                handleFirestoreError(error, OperationType.UPDATE, `reports/${selectedZone.id}`);
              }
            }}
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