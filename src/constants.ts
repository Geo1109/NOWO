import { Report, SafeSpace } from './types';

export const MOCK_REPORTS: Report[] = [
  { id: '1', lat: 45.7489, lng: 21.2087, categories: ['suspicious'], timestamp: '23:15', isLive: true, weight: 1 },
  { id: '2', lat: 45.7502, lng: 21.2101, categories: ['lighting', 'intoxicated'], timestamp: '22:40', isLive: false, weight: 2 },
  { id: '3', lat: 45.7478, lng: 21.2065, categories: ['dogs'], timestamp: '21:30', isLive: false, weight: 1 },
  { id: '4', lat: 45.7510, lng: 21.2120, categories: ['suspicious'], timestamp: '23:50', isLive: true, weight: 5 },
  { id: '5', lat: 45.7495, lng: 21.2055, categories: ['harassment'], timestamp: '22:10', isLive: false, weight: 3 },
  { id: '6', lat: 45.7470, lng: 21.2090, categories: ['gathering'], timestamp: '01:20', isLive: true, weight: 2 },
  { id: '7', lat: 45.7520, lng: 21.2080, categories: ['lighting'], timestamp: '20:00', isLive: false, weight: 1 },
  { id: '8', lat: 45.7450, lng: 21.2150, categories: ['blocked'], timestamp: '19:30', isLive: false, weight: 1 },
];

export const MOCK_SAFE_SPACES: SafeSpace[] = [
  { id: 's1', lat: 45.7505, lng: 21.2075, name: "Farmacia Catena", type: 'pharmacy', openNow: true, details: "Open 24h" },
  { id: 's2', lat: 45.7485, lng: 21.2110, name: "Profi", type: 'store', openNow: true, details: "Open until 22:00" },
  { id: 's3', lat: 45.7460, lng: 21.2080, name: "Spitalul Județean", type: 'hospital', openNow: true, details: "Open 24h" },
];

export const COLORS = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  primary: '#3B49DF',
  accent: '#E11D48', // Red for danger
  text: '#0F172A',
  muted: '#475569',
  border: '#E2E8F0',
  safe: '#059669',
  danger: '#E11D48',
};
