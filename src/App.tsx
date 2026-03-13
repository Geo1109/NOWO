import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Map as MapIcon, 
  AlertTriangle, 
  Bell, 
  Navigation, 
  Shield, 
  X, 
  ChevronUp, 
  Clock, 
  MapPin,
  Search,
  Settings as SettingsIcon,
  Phone,
  CheckCircle2,
  Plus,
  Home,
  ArrowRight,
  Info,
  Activity,
  Stethoscope,
  ShoppingBag,
  Building2,
  LocateFixed,
  Navigation2,
  StopCircle,
  Footprints
} from 'lucide-react';
import { Language, Report, SafeSpace, UserSettings } from './types';
import { translations } from './translations';
import { db } from "./firebase";
import { 
  collection, 
  onSnapshot, 
  updateDoc, 
  doc, 
  setDoc,
  query,
  orderBy,
  where,
  Timestamp
} from "firebase/firestore";
import { MOCK_REPORTS, MOCK_SAFE_SPACES, COLORS } from './constants';

// --- Types ---
interface RouteInfo {
  distance: number;
  duration: number;
  geometry: any;
  safetyScore: number;
  type: 'safe' | 'fastest';
  steps: any[];
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

// --- Components ---

const BottomNav = ({ activeTab, setActiveTab, t }: { activeTab: string, setActiveTab: (t: string) => void, t: any }) => (
  <nav className="fixed bottom-0 left-0 right-0 h-20 glass border-t border-slate-200 flex items-center justify-around px-8 z-50 pb-2">
    <button 
      onClick={() => setActiveTab('home')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'home' ? 'text-primary scale-105' : 'text-slate-400'}`}
    >
      <Home size={22} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">Home</span>
    </button>

    <button 
      onClick={() => setActiveTab('route')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'route' ? 'text-primary scale-105' : 'text-slate-400'}`}
    >
      <Navigation size={22} strokeWidth={activeTab === 'route' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">{t.safeRoute}</span>
    </button>
    
    <div className="relative -mt-10">
      <button 
        onClick={() => setActiveTab('report')}
        className="w-14 h-14 rounded-2xl bg-accent glow-accent text-white shadow-xl active:scale-90 transition-all flex items-center justify-center"
      >
        <AlertTriangle size={24} />
      </button>
    </div>

    <button 
      onClick={() => setActiveTab('alerts')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'alerts' ? 'text-primary scale-105' : 'text-slate-400'}`}
    >
      <Bell size={22} strokeWidth={activeTab === 'alerts' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">{t.alerts}</span>
    </button>

    <button 
      onClick={() => setActiveTab('settings')}
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'settings' ? 'text-primary scale-105' : 'text-slate-400'}`}
    >
      <SettingsIcon size={22} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
      <span className="text-[9px] font-bold uppercase tracking-widest">Menu</span>
    </button>
  </nav>
);

const EmergencyButton = ({ t }: { t: any }) => {
  const [active, setActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed top-24 right-6 z-40 flex flex-col items-end gap-3">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${active ? 'bg-danger text-white animate-pulse' : 'glass text-danger border-danger/40'}`}
      >
        <Shield size={24} className={active ? 'text-white' : 'text-danger'} />
        {active && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-danger rounded-full animate-ping" />
          </div>
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0, x: 20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className="glass rounded-3xl p-5 shadow-2xl border-danger/10 w-72"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold leading-tight text-danger">{t.emergency}</h4>
              <button onClick={() => setIsExpanded(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            
            <p className="text-xs text-slate-500 mb-4 font-medium">
              {active ? "Live location is being shared with emergency contacts." : "Tap to start sharing your live location with emergency contacts."}
            </p>

            <button 
              onClick={() => setActive(!active)}
              className={`w-full py-3 rounded-xl text-xs font-bold transition-all ${active ? 'bg-slate-100 text-slate-900' : 'bg-danger text-white shadow-lg shadow-danger/20'}`}
            >
              {active ? 'Stop Sharing' : 'Start Sharing'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Firestore Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: undefined, // No auth in this setup as requested
      email: undefined,
      emailVerified: undefined,
      isAnonymous: undefined,
      tenantId: undefined,
      providerInfo: []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function ErrorFallback({ error, resetErrorBoundary }: { error: any, resetErrorBoundary: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center p-10 text-center">
      <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-6">
        <AlertTriangle size={40} />
      </div>
      <h1 className="text-2xl font-black text-slate-900 mb-4">Something went wrong</h1>
      <p className="text-slate-500 text-sm font-bold mb-8 max-w-xs">
        The application encountered an error. Please try refreshing the page.
      </p>
      <button 
        onClick={() => {
          resetErrorBoundary();
          window.location.reload();
        }}
        className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black"
      >
        Refresh App
      </button>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-10 p-4 bg-slate-100 rounded-xl text-[10px] text-left overflow-auto max-w-full">
          {error?.message}
        </pre>
      )}
    </div>
  );
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
  const [safeSpaces, setSafeSpaces] = useState<SafeSpace[]>(MOCK_SAFE_SPACES);
  const [userLocation, setUserLocation] = useState<[number, number]>([45.7489, 21.2087]);
  const [reportLocation, setReportLocation] = useState<[number, number] | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeRoute, setActiveRoute] = useState<RouteInfo | null>(null);
  const [proximityAlert, setProximityAlert] = useState<string | null>(null);
  const [initialDestination, setInitialDestination] = useState<SearchResult | null>(null);
  
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tileLayerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const reportsLayerRef = useRef<any>(null);
  const safeSpacesLayerRef = useRef<any>(null);
  const reportLocationMarkerRef = useRef<any>(null);

  // Fetch Reports from Firestore (Geo-filtered to 20km radius)
  useEffect(() => {
    // 1 degree lat is ~111km. 20km is ~0.18 degrees.
    const latDelta = 0.18;
    // For longitude, it depends on latitude, but 0.25 is a safe broad estimate for 20km in most inhabited areas
    const lngDelta = 0.25; 

    const minLat = userLocation[0] - latDelta;
    const maxLat = userLocation[0] + latDelta;
    const minLng = userLocation[1] - lngDelta;
    const maxLng = userLocation[1] + lngDelta;

    // We filter by Latitude in Firestore to reduce data transfer significantly.
    // Longitude filtering is done on the client to avoid complex composite index requirements.
    const q = query(
      collection(db, "reports"), 
      where("lat", ">=", minLat),
      where("lat", "<=", maxLat)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reportsData: Report[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // Client-side Longitude & precise distance filtering
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
  }, [userLocation]); // Re-run when user moves

  // Fetch Real Safe Spaces
  const fetchSafeSpaces = async (lat: number, lon: number) => {
    const query = `[out:json];node["amenity"~"pharmacy|hospital|police"](around:3000,${lat},${lon});out;`;
    const endpoints = [
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          continue;
        }

        const data = await res.json();
        if (!data || !data.elements) continue;
        
        const realSpaces: SafeSpace[] = data.elements.map((el: any) => ({
          id: el.id.toString(),
          name: el.tags.name || el.tags.amenity.charAt(0).toUpperCase() + el.tags.amenity.slice(1),
          type: el.tags.amenity === 'pharmacy' ? 'pharmacy' : el.tags.amenity === 'police' ? 'police' : 'hospital',
          lat: el.lat,
          lng: el.lon,
          details: el.tags['addr:street'] ? `${el.tags['addr:street']} ${el.tags['addr:housenumber'] || ''}` : 'Verified Safe Space'
        }));
        
        setSafeSpaces(realSpaces);
        return; // Success
      } catch (e) {
        console.warn(`Failed to fetch from ${url}:`, e);
      }
    }
    console.error("All safe spaces endpoints failed.");
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

    // Map Click Handler for Reporting
    mapRef.current.on('click', (e: any) => {
      // We check if the modal is open but we allow clicks to pass through if we're in "marking mode"
      const reportModalOpen = document.getElementById('report-modal-overlay');
      if (reportModalOpen) {
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

        // Proximity checks
        reports.forEach(report => {
          const dist = L.latLng(newPos).distanceTo(L.latLng(report.lat, report.lng));
          if (dist < 100) {
            const msg = `Warning: You are entering a danger zone (${report.categories.join(', ')})`;
            if (proximityAlert !== msg) {
              setProximityAlert(msg);
            }
          }
        });

        // Auto-fetch safe spaces when location changes significantly
        if (showSafeSpaces) {
          fetchSafeSpaces(latitude, longitude);
        }
      }, (err) => console.error(err), { enableHighAccuracy: true });
    }
  }, [isNavigating, reports]);

  // Fetch safe spaces when toggled
  useEffect(() => {
    if (showSafeSpaces) {
      fetchSafeSpaces(userLocation[0], userLocation[1]);
    }
  }, [showSafeSpaces]);

  // Update Markers
  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    // Clear existing layers
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

    // Add Safe Spaces
    if (showSafeSpaces) {
      safeSpaces.forEach(space => {
        const iconMap: any = {
          pharmacy: '💊',
          store: '🛒',
          hospital: '🏥',
          police: '👮'
        };

        const iconHtml = `<div class="marker-pin-safe">
          <span style="font-size: 18px;">${iconMap[space.type] || '🛡️'}</span>
        </div>`;
        
        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: iconHtml,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const marker = L.marker([space.lat, space.lng], { icon }).addTo(safeSpacesLayerRef.current);
        marker.on('click', () => setSelectedSpace(space));
      });
    }

    // Add Report Location Marker
    if (reportLocation) {
      const iconHtml = `<div class="marker-pin-report">
        <span style="font-size: 14px;">📍</span>
      </div>`;
      const icon = L.divIcon({
        className: 'custom-div-icon',
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
      timestamp: new Date().toISOString(), // Store as ISO for Firestore rules validation
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

  const startNavigation = () => {
    if (!activeRoute) return;
    setIsNavigating(true);
    setActiveTab('home');
    mapRef.current.setView(userLocation, 18);
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
      {/* Proximity Alert */}
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
          <button 
            onClick={() => setShowSafeSpaces(!showSafeSpaces)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-xl ${showSafeSpaces ? 'bg-safe text-white scale-105' : 'glass text-slate-600'}`}
          >
            <Shield size={20} />
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
            <EmergencyButton t={t} />
            <BottomNav activeTab={activeTab} setActiveTab={(tab) => tab === 'report' ? setShowReportModal(true) : setActiveTab(tab)} t={t} />
          </motion.div>
        )}

        {activeTab === 'route' && (
          <RoutePlannerScreen 
            key="route-screen" 
            onClose={() => {
              setActiveTab('home');
              setInitialDestination(null);
            }} 
            t={t} 
            userLocation={userLocation}
            reports={reports}
            onDrawRoute={drawRoute}
            onStartNav={startNavigation}
            initialDest={initialDestination}
          />
        )}

        {activeTab === 'alerts' && (
          <SettingsScreen key="alerts-screen" onClose={() => setActiveTab('home')} t={t} />
        )}

        {activeTab === 'settings' && (
          <MenuScreen key="menu-screen" onClose={() => setActiveTab('home')} t={t} />
        )}

        {showReportModal && (
          <ReportModal 
            key="report-modal"
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
          <ZoneDetails 
            key={`zone-details-${selectedZone.id}`}
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
          <SpaceDetails 
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

// --- Sub-Screens ---

const RoutePlannerScreen = ({ onClose, t, userLocation, reports, onDrawRoute, onStartNav, initialDest }: { key?: string, onClose: () => void, t: any, userLocation: [number, number], reports: Report[], onDrawRoute: (r: RouteInfo) => void, onStartNav: () => void, initialDest?: SearchResult | null }) => {
  const [query, setQuery] = useState(initialDest?.display_name || '');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedDest, setSelectedDest] = useState<SearchResult | null>(initialDest || null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);

  useEffect(() => {
    if (initialDest) {
      findRoutes(initialDest);
    }
  }, [initialDest]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 3 && (!selectedDest || query !== selectedDest.display_name)) {
        performSearch(query);
      } else if (query.length < 3) {
        setSearchResults([]);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [query]);

  const performSearch = async (val: string) => {
    setSearchError(null);
    try {
      // Localized search with user coordinates - using a tighter viewbox (approx 10km)
      // Added email parameter as per Nominatim usage policy to reduce blocks
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5&lat=${userLocation[0]}&lon=${userLocation[1]}&viewbox=${userLocation[1]-0.1},${userLocation[0]+0.1},${userLocation[1]+0.1},${userLocation[0]-0.1}&bounded=1&email=stangeorgian38@gmail.com`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!res.ok) {
        if (res.status === 429) {
          setSearchError("Too many requests. Please wait a moment.");
        } else {
          setSearchError("Search service unavailable.");
        }
        return;
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        setSearchError("Invalid response from search service.");
        return;
      }
      
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      console.error("Search error:", e);
      setSearchError("Network error. Please check your connection.");
    }
  };

  const findRoutes = async (dest: SearchResult) => {
    setSelectedDest(dest);
    setSearchResults([]);
    setLoading(true);
    
    try {
      const startLat = userLocation[0];
      const startLng = userLocation[1];
      const destLat = parseFloat(dest.lat);
      const destLng = parseFloat(dest.lon);

      // Helper to fetch and process a route
      const fetchRoute = async (points: [number, number][], type: 'fastest' | 'safe' | 'alternative') => {
        const pointsStr = points.map(p => `${p[1]},${p[0]}`).join(';');
        // Add radiuses to allow flexibility (especially for bypass waypoints)
        // 50m for start/end, 150m for bypass points to prevent "circling" to an exact spot
        const radiuses = points.map((_, i) => (i === 0 || i === points.length - 1) ? 50 : 150).join(';');
        
        const url = `https://router.project-osrm.org/route/v1/foot/${pointsStr}?overview=full&geometries=geojson&alternatives=true&steps=true&radiuses=${radiuses}&continue_straight=false`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (data.code !== 'Ok') return null;
        
        return data.routes.map((r: any) => {
          let safetyScore = 100;
          const coords = r.geometry.coordinates;
          const sampleRate = Math.max(1, Math.floor(coords.length / 50));
          
          for (let i = 0; i < coords.length; i += sampleRate) {
            const coord = coords[i];
            reports.forEach(report => {
              const dist = Math.sqrt(Math.pow(coord[1] - report.lat, 2) + Math.pow(coord[0] - report.lng, 2));
              if (dist < 0.002) {
                safetyScore -= (report.weight * 15 * (1 - dist/0.002));
              }
            });
          }

          return {
            distance: r.distance,
            duration: Math.round(r.duration / 60),
            geometry: r.geometry,
            safetyScore: Math.max(0, Math.round(safetyScore)),
            type,
            steps: r.legs.reduce((acc: any[], leg: any) => [...acc, ...leg.steps], [])
          };
        });
      };

      // 1. Get initial routes (Fastest + OSRM Alternatives)
      const initialRoutes = await fetchRoute([[startLat, startLng], [destLat, destLng]], 'fastest');
      if (!initialRoutes) throw new Error("Could not fetch initial routes");

      let allProcessed: RouteInfo[] = initialRoutes;

      // 2. Check if the "safest" initial route is actually safe
      const bestInitial = [...allProcessed].sort((a, b) => b.safetyScore - a.safetyScore)[0];
      
      // 3. If even the best route is dangerous, try to "Force" a bypass
      if (bestInitial.safetyScore < 85 && reports.length > 0) {
        // Find the most dangerous report near the current best path
        let worstReport: Report | null = null;
        let maxImpact = 0;

        bestInitial.geometry.coordinates.forEach((coord: [number, number]) => {
          reports.forEach(report => {
            const dist = Math.sqrt(Math.pow(coord[1] - report.lat, 2) + Math.pow(coord[0] - report.lng, 2));
            if (dist < 0.0015 && report.weight > maxImpact) {
              maxImpact = report.weight;
              worstReport = report;
            }
          });
        });

        if (worstReport) {
          const wr = worstReport as Report;
          // Calculate a bypass point perpendicular to the path
          // Vector from start to end
          const dx = destLng - startLng;
          const dy = destLat - startLat;
          const len = Math.sqrt(dx*dx + dy*dy);
          
          // Perpendicular vector (normalized)
          const px = -dy / len;
          const py = dx / len;

          // Try two bypass points (Left and Right of the danger zone)
          // Offset by ~200m (0.002 degrees) for a more natural walking detour
          const offset = 0.002;
          const bypassPoints: [number, number][] = [
            [wr.lat + py * offset, wr.lng + px * offset],
            [wr.lat - py * offset, wr.lng - px * offset]
          ];

          for (const bp of bypassPoints) {
            const bypassRoutes = await fetchRoute([[startLat, startLng], bp, [destLat, destLng]], 'safe');
            if (bypassRoutes) {
              allProcessed = [...allProcessed, ...bypassRoutes];
            }
          }
        }
      }

      // 4. Final selection logic
      const fastest = [...allProcessed].sort((a, b) => a.duration - b.duration)[0];
      const safest = [...allProcessed].sort((a, b) => b.safetyScore - a.safetyScore)[0];

      let finalRoutes: RouteInfo[] = [];
      
      // If the safest is significantly safer OR physically different and reasonably fast
      const isPhysicallyDifferent = JSON.stringify(safest.geometry) !== JSON.stringify(fastest.geometry);
      
      if (isPhysicallyDifferent && (safest.safetyScore > fastest.safetyScore || safest.duration > fastest.duration)) {
        safest.type = 'safe';
        fastest.type = 'fastest';
        finalRoutes = [safest, fastest];
      } else {
        // They are the same or safest is also fastest
        safest.type = 'safe';
        finalRoutes = [safest];
      }

      // Remove duplicates (same geometry)
      const uniqueRoutes = finalRoutes.filter((v, i, a) => a.findIndex(t => JSON.stringify(t.geometry) === JSON.stringify(v.geometry)) === i);

      setRoutes(uniqueRoutes);
      if (uniqueRoutes.length > 0) {
        onDrawRoute(uniqueRoutes[0]);
      }
    } catch (error) {
      console.error("Routing error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-0 z-[60] bg-slate-50 flex flex-col"
    >
      <div className="p-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Footprints size={20} />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">{t.safeRoute}</h2>
        </div>
        <button onClick={onClose} className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600">
          <X size={20} />
        </button>
      </div>
      
      <div className="px-8 flex-1 overflow-y-auto flex flex-col gap-6 pb-32">
        <div className="relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.whereGoing}
            className="w-full h-16 glass rounded-2xl pl-14 pr-6 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all text-slate-900"
          />
          
          {searchError && (
            <div className="absolute top-20 left-0 right-0 bg-rose-50 text-rose-600 p-3 rounded-xl text-xs font-bold shadow-lg z-50 border border-rose-100">
              {searchError}
            </div>
          )}
          
          {searchResults.length > 0 && (
            <div className="absolute top-20 left-0 right-0 glass rounded-3xl overflow-hidden shadow-2xl z-50">
              {searchResults.map((res, i) => (
                <button 
                  key={i}
                  onClick={() => findRoutes(res)}
                  className="w-full p-5 text-left hover:bg-slate-50 flex items-start gap-4 border-b border-slate-100 last:border-0"
                >
                  <MapPin size={18} className="text-primary mt-1 shrink-0" />
                  <span className="text-sm font-bold text-slate-700 leading-tight">{res.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {selectedDest && (
          <div className="flex items-center gap-4 p-5 glass rounded-2xl border-primary/10 bg-primary/5">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg">
              <MapPin size={20} />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest">Destination</p>
              <p className="text-sm font-bold text-slate-900 truncate">{selectedDest.display_name}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-400">Calculating safe paths...</p>
          </div>
        )}

        {routes.length > 0 && (
          <div className="flex flex-col gap-4">
            {routes.map((route, idx) => (
              <div 
                key={idx}
                className={`p-6 glass rounded-3xl border-l-8 text-left transition-all ${route.type === 'safe' ? 'border-safe shadow-xl' : 'border-primary/20 opacity-80'}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className={`text-xl font-black flex items-center gap-2 ${route.type === 'safe' ? 'text-safe' : 'text-slate-900'}`}>
                      <Footprints size={20} />
                      {route.type === 'safe' ? (routes.length === 1 ? "Recommended Walk" : "Safest Walk") : "Fastest Walk"}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className={`text-xs font-bold ${route.safetyScore < 50 ? 'text-rose-500' : 'text-slate-400'}`}>
                        {route.safetyScore === 100 ? "Maximum safety" : `Safety Score: ${route.safetyScore}%`}
                      </p>
                      {route.safetyScore < 50 && <AlertTriangle size={12} className="text-rose-500" />}
                    </div>
                  </div>
                  {route.type === 'safe' && (
                    <div className="px-3 py-1 bg-safe/10 text-safe rounded-full text-[10px] font-black uppercase tracking-widest">
                      {route.safetyScore > 80 ? "Best Choice" : "Safest Option"}
                    </div>
                  )}
                  {route.type === 'fastest' && route.safetyScore < 40 && (
                    <div className="px-3 py-1 bg-rose-50 text-rose-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                      High Risk
                    </div>
                  )}
                </div>
                <div className="flex gap-8 mb-6">
                  <div>
                    <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest">Time</p>
                    <p className="text-lg font-black text-slate-900">{route.duration} min</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400 font-black tracking-widest">Distance</p>
                    <p className="text-lg font-black text-slate-900">{(route.distance / 1000).toFixed(1)} km</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => onDrawRoute(route)}
                    className="flex-1 py-3 glass border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Preview
                  </button>
                  <button 
                    onClick={onStartNav}
                    className="flex-[2] py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest glow-primary shadow-lg"
                  >
                    Start Navigation
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const SettingsScreen = ({ onClose, t }: { key?: string, onClose: () => void, t: any }) => (
  <motion.div 
    initial={{ x: '100%' }}
    animate={{ x: 0 }}
    exit={{ x: '100%' }}
    className="fixed inset-0 z-[60] bg-slate-50 flex flex-col"
  >
    <div className="p-8 flex items-center justify-between">
      <h2 className="text-2xl font-black tracking-tight text-slate-900">{t.alerts}</h2>
      <button onClick={onClose} className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600">
        <X size={20} />
      </button>
    </div>
    
    <div className="px-8 flex-1 overflow-y-auto flex flex-col gap-6 pb-32">
      <div className="p-6 glass rounded-3xl flex items-center justify-between">
        <div className="flex-1 pr-4">
          <p className="text-sm font-bold text-slate-800">{t.alertNearMe}</p>
          <p className="text-xs text-slate-400 font-bold">Radius: 500m</p>
        </div>
        <div className="w-14 h-8 bg-primary rounded-full relative shadow-inner">
          <div className="absolute right-1 top-1 w-6 h-6 bg-white rounded-full shadow-lg" />
        </div>
      </div>

      <div className="p-6 glass rounded-3xl flex items-center justify-between">
        <div className="flex-1 pr-4">
          <p className="text-sm font-bold text-slate-800">{t.notifyFlagged}</p>
        </div>
        <div className="w-14 h-8 bg-slate-200 rounded-full relative shadow-inner">
          <div className="absolute left-1 top-1 w-6 h-6 bg-white rounded-full shadow-lg" />
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-xs uppercase text-slate-400 font-black tracking-widest mb-6">{t.emergencyContact}</h3>
        <div className="flex flex-col gap-4">
          <div className="relative">
            <input 
              type="text" 
              placeholder={t.name}
              className="w-full h-14 glass rounded-2xl px-6 text-sm font-bold focus:outline-none text-slate-900"
            />
          </div>
          <div className="relative">
            <input 
              type="tel" 
              placeholder={t.phone}
              className="w-full h-14 glass rounded-2xl px-6 text-sm font-bold focus:outline-none text-slate-900"
            />
          </div>
        </div>
      </div>

      <button className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black text-lg mt-4 shadow-xl active:scale-95 transition-all">
        {t.save}
      </button>
    </div>
  </motion.div>
);

const MenuScreen = ({ onClose, t }: { key?: string, onClose: () => void, t: any }) => (
  <motion.div 
    initial={{ x: '100%' }}
    animate={{ x: 0 }}
    exit={{ x: '100%' }}
    className="fixed inset-0 z-[60] bg-slate-50 flex flex-col"
  >
    <div className="p-8 flex items-center justify-between">
      <h2 className="text-2xl font-black tracking-tight text-slate-900">Menu</h2>
      <button onClick={onClose} className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600">
        <X size={20} />
      </button>
    </div>
    <div className="px-8 flex-1 overflow-y-auto flex flex-col gap-4 pb-32">
      <div className="p-6 glass rounded-3xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Info size={24} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">About SafeWalk</h3>
          <p className="text-xs text-slate-400">Version 1.2.4 (Beta)</p>
        </div>
      </div>
      <div className="p-6 glass rounded-3xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500">
          <Shield size={24} />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">Privacy Policy</h3>
          <p className="text-xs text-slate-400">Your data is encrypted</p>
        </div>
      </div>
    </div>
  </motion.div>
);

const ReportModal = ({ onClose, onSubmit, t, reportLocation }: { key?: string, onClose: () => void, onSubmit: (c: string[], d: string, l: boolean) => void, t: any, reportLocation: [number, number] | null }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [isLive, setIsLive] = useState(true);

  const categories = [
    { id: 'suspicious', label: t.categories.suspicious },
    { id: 'dogs', label: t.categories.dogs },
    { id: 'intoxicated', label: t.categories.intoxicated },
    { id: 'gathering', label: t.categories.gathering },
    { id: 'lighting', label: t.categories.lighting },
    { id: 'blocked', label: t.categories.blocked },
    { id: 'harassment', label: t.categories.harassment },
    { id: 'other', label: t.categories.other },
  ];

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <motion.div 
      id="report-modal-overlay"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="fixed inset-x-0 bottom-0 z-[70] bg-slate-50 flex flex-col rounded-t-[40px] shadow-2xl max-h-[85vh] pointer-events-auto"
    >
      <div className="p-8 flex items-center justify-between">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{t.whatIsHappening}</h2>
        <button onClick={onClose} className="w-12 h-12 glass rounded-2xl flex items-center justify-center text-slate-600">
          <X size={20} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto px-8 flex flex-col gap-8 pb-32">
        {!reportLocation ? (
          <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center text-white">
              <LocateFixed size={20} />
            </div>
            <p className="text-sm font-bold text-rose-600">Tap on the map behind this panel to mark the location</p>
          </div>
        ) : (
          <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
              <CheckCircle2 size={20} />
            </div>
            <p className="text-sm font-bold text-emerald-600">Location marked successfully</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {categories.map(cat => (
            <button 
              key={cat.id}
              onClick={() => toggle(cat.id)}
              className={`px-5 py-4 rounded-2xl text-xs font-bold transition-all border ${selected.includes(cat.id) ? 'bg-rose-500 text-white border-rose-500 glow-accent scale-105' : 'glass text-slate-500 border-slate-100'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-xs uppercase text-slate-400 font-black tracking-widest">Additional Details</h3>
          <textarea 
            placeholder={t.addDetails}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full h-40 glass rounded-3xl p-6 text-sm font-bold focus:outline-none resize-none shadow-inner text-slate-900 border border-slate-100"
          />
        </div>

        <div className="flex items-center justify-between p-6 glass rounded-3xl border border-slate-100">
          <div className="flex items-center gap-4">
            <Clock size={20} className="text-slate-400" />
            <p className="text-sm font-bold text-slate-700">{t.happeningNow}</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsLive(true)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isLive ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-slate-100 text-slate-400'}`}
            >
              {t.yes}
            </button>
            <button 
              onClick={() => setIsLive(false)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isLive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}
            >
              {t.no}
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 border-t border-slate-200 bg-white">
        <button 
          disabled={selected.length === 0 || !reportLocation}
          onClick={() => onSubmit(selected, details, isLive)}
          className={`w-full h-16 rounded-2xl font-black text-lg transition-all active:scale-95 ${(!reportLocation || selected.length === 0) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-rose-500 text-white glow-accent shadow-xl shadow-rose-100'}`}
        >
          {t.reportZone}
        </button>
      </div>
    </motion.div>
  );
};

const ZoneDetails = ({ zone, onClose, onConfirm, t }: { key?: string, zone: Report, onClose: () => void, onConfirm: () => void, t: any }) => (
  <motion.div 
    initial={{ y: '100%' }}
    animate={{ y: 0 }}
    exit={{ y: '100%' }}
    className="fixed bottom-0 left-0 right-0 z-[80] glass rounded-t-[40px] p-10 pb-14 shadow-2xl border-t-2 border-rose-100"
  >
    <div className="w-16 h-1.5 bg-slate-200 rounded-full mx-auto mb-10" />
    
    <div className="flex items-start justify-between mb-8">
      <div>
        <h2 className="text-3xl font-black text-rose-500 mb-2 tracking-tight">{t.dangerZone}</h2>
        <p className="text-sm text-slate-400 font-bold">{zone.weight} {t.reports} • {zone.timestamp}</p>
      </div>
      <button onClick={onClose} className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
        <X size={24} />
      </button>
    </div>

    <div className="flex flex-wrap gap-3 mb-10">
      {zone.categories.map((cat, idx) => (
        <div key={`${cat}-${idx}`} className="px-4 py-2 glass rounded-2xl text-xs font-bold text-slate-600">
          {t.categories[cat] || cat}
        </div>
      ))}
    </div>

    <button 
      onClick={onConfirm}
      className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl"
    >
      <CheckCircle2 size={24} />
      {t.confirmNear}
    </button>
  </motion.div>
);

const SpaceDetails = ({ space, onClose, onNavigate, t }: { space: SafeSpace, onClose: () => void, onNavigate: () => void, t: any }) => {
  const iconMap: any = {
    pharmacy: <ShoppingBag size={24} />,
    store: <ShoppingBag size={24} />,
    hospital: <Stethoscope size={24} />,
    police: <Shield size={24} />
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="fixed bottom-0 left-0 right-0 z-[80] glass rounded-t-[40px] p-10 pb-14 shadow-2xl border-t-2 border-emerald-100"
    >
      <div className="w-16 h-1.5 bg-slate-200 rounded-full mx-auto mb-10" />
      
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            {iconMap[space.type] || <Building2 size={24} />}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{space.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-black uppercase tracking-widest">{t.openNow}</span>
              <p className="text-xs text-slate-400 font-bold">{t.distance}</p>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
          <X size={24} />
        </button>
      </div>

      <p className="text-slate-500 text-sm font-bold mb-10 leading-relaxed">
        {space.details}. This location is verified as a Safe Space. You can seek assistance here 24/7.
      </p>

      <button 
        onClick={onNavigate}
        className="w-full h-16 bg-emerald-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-emerald-100"
      >
        <Navigation size={24} />
        Navigate to Safe Space
      </button>
    </motion.div>
  );
};
