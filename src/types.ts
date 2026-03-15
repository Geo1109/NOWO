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
  /** ISO string — when this report auto-expires (20 min from creation/last confirm) */
  expiresAt?: string;
  /** Set to true by Cloud Function or client-side expiry check */
  expired?: boolean;
  /** UIDs of users who created or confirmed this report (prevents duplicate reporting) */
  reportedBy?: string[];
  /** Number of decline votes — if >= weight*1.5 the zone auto-expires */
  declineCount?: number;
  /** UID of the user who originally created the report */
  reporterId?: string;
}

export interface SafeSpace {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: 'pharmacy' | 'hospital' | 'police' | 'supermarket' | 'convenience' | 'doctors' | 'clinic' | 'store';
  details: string;
  address?: string;
  phone?: string;
  openingHours?: string;
  website?: string;
  distance?: number;
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