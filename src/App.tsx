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
import { Language, Report, SafeSpace, UserSettings, RouteInfo, SearchResult } from './types';
import { translations } from './translations';
import { db, OperationType, handleFirestoreError } from "./firebase";
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
    try {
      const res = await fetch(`/api/safe-spaces?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error("Backend failed to fetch safe spaces");
      const data = await res.json();
      
      const realSpaces: SafeSpace[] = data.elements.map((el: any) => ({
        id: el.id.toString(),
        name: el.tags.name || el.tags.amenity.charAt(0).toUpperCase() + el.tags.amenity.slice(1),
        type: el.tags.amenity === 'pharmacy' ? 'pharmacy' : el.tags.amenity === 'police' ? 'police' : 'hospital',
        lat: el.lat,
        lng: el.lon,
        details: el.tags['addr:street'] ? `${el.tags['addr:street']} ${el.tags['addr:housenumber'] || ''}` : 'Verified Safe Space'
      }));
      setSafeSpaces(realSpaces);
    } catch (e) {
      console.error("Safe spaces error:", e);
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
          <SettingsScreen onClose={() => setActiveTab('home')} t={t} />
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
