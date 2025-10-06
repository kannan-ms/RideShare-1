// src/config/googleMapsConfig.js
// Export your Google Maps API key here. For security, prefer using env vars or secure storage.

export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Optional: warn in development if key is missing
if (!GOOGLE_MAPS_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn('GOOGLE_MAPS_API_KEY is not set. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in your env for geocoding.');
}


