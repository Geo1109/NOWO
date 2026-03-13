import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Search, MapPin, Footprints, AlertTriangle } from 'lucide-react';
import { RouteInfo, SearchResult, Report } from '../types';

interface RoutePlannerScreenProps {
  onClose: () => void;
  t: any;
  userLocation: [number, number];
  reports: Report[];
  onDrawRoute: (r: RouteInfo) => void;
  onStartNav: () => void;
  initialDest?: SearchResult | null;
}

export const RoutePlannerScreen = ({ 
  onClose, 
  t, 
  userLocation, 
  reports, 
  onDrawRoute, 
  onStartNav, 
  initialDest 
}: RoutePlannerScreenProps) => {
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
      const res = await fetch(`/api/search?q=${encodeURIComponent(val)}&lat=${userLocation[0]}&lon=${userLocation[1]}&viewbox=${userLocation[1]-0.1},${userLocation[0]+0.1},${userLocation[1]+0.1},${userLocation[0]-0.1}`);
      
      if (!res.ok) {
        setSearchError("Search service unavailable.");
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

      const fetchRoute = async (points: [number, number][], type: 'fastest' | 'safe' | 'alternative') => {
        const pointsStr = points.map(p => `${p[1]},${p[0]}`).join(';');
        const radiuses = points.map((_, i) => (i === 0 || i === points.length - 1) ? 50 : 150).join(';');
        
        const response = await fetch(`/api/route?points=${pointsStr}&radiuses=${radiuses}`);
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

      const initialRoutes = await fetchRoute([[startLat, startLng], [destLat, destLng]], 'fastest');
      if (!initialRoutes) throw new Error("Could not fetch initial routes");

      let allProcessed: RouteInfo[] = initialRoutes;

      const bestInitial = [...allProcessed].sort((a, b) => b.safetyScore - a.safetyScore)[0];
      
      if (bestInitial.safetyScore < 85 && reports.length > 0) {
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
          const dx = destLng - startLng;
          const dy = destLat - startLat;
          const len = Math.sqrt(dx*dx + dy*dy);
          
          const px = -dy / len;
          const py = dx / len;

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

      const fastest = [...allProcessed].sort((a, b) => a.duration - b.duration)[0];
      const safest = [...allProcessed].sort((a, b) => b.safetyScore - a.safetyScore)[0];

      let finalRoutes: RouteInfo[] = [];
      const isPhysicallyDifferent = JSON.stringify(safest.geometry) !== JSON.stringify(fastest.geometry);
      
      if (isPhysicallyDifferent && (safest.safetyScore > fastest.safetyScore || safest.duration > fastest.duration)) {
        safest.type = 'safe';
        fastest.type = 'fastest';
        finalRoutes = [safest, fastest];
      } else {
        safest.type = 'safe';
        finalRoutes = [safest];
      }

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
