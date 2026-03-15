import { registerPlugin } from '@capacitor/core';

export interface LocationSettingsPlugin {
  /** Shows the Android "Turn on Location?" dialog from Google Play Services.
   *  Resolves with { status: 'enabled' } when location is on,
   *  or { status: 'denied' } if user tapped "No thanks". */
  requestLocationServices(): Promise<{ status: 'enabled' | 'denied' }>;
}

const LocationSettings = registerPlugin<LocationSettingsPlugin>('LocationSettings', {
  web: () => ({
    // No-op on web — just resolves immediately
    requestLocationServices: async () => ({ status: 'enabled' as const }),
  }),
});

export { LocationSettings };