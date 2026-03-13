export interface RouteInfo {
  distance: number;
  duration: number;
  geometry: any;
  safetyScore: number;
  type: 'safe' | 'fastest';
  steps: any[];
}

export interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export type Language = 'en' | 'ro';

export interface Report {
  id: string;
  lat: number;
  lng: number;
  categories: string[];
  details?: string;
  timestamp: string;
  isLive: boolean;
  weight: number;
}

export interface SafeSpace {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: 'pharmacy' | 'hospital' | 'police' | 'supermarket' | 'convenience' | 'doctors' | 'clinic' | 'store';
  details: string;
  // Fields populated from real Overpass data (optional)
  address?: string;
  phone?: string;
  openingHours?: string;
  website?: string;
  distance?: number;
  // Legacy field (kept for backward compat with mock data)
  openNow?: boolean;
}

export interface UserSettings {
  alertRadius: 200 | 500 | 1000;
  notifyFlaggedZone: boolean;
  emergencyContact: {
    name: string;
    phone: string;
  };
}