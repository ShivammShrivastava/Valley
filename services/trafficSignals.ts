/**
 * Traffic Signal Service
 *
 * Reads traffic signal data from Firestore and provides helpers
 * to find the nearest signal along the user's route.
 */

import { db } from '../firebase';
import {
  collection,
  getDocs,
  query,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TrafficSignal {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  anchor_time: string;       // ISO 8601 timestamp when green phase started
  green_interval: number;    // seconds
  yellow_interval: number;   // seconds
  red_interval: number;      // seconds
}

export interface SpeedAdvisory {
  min_speed: number;         // km/h
  max_speed: number;         // km/h
  user_speed: number;        // km/h
  status: 'perfect' | 'too_fast' | 'too_slow' | 'at_signal';
  message: string;
  signal_state: 'green' | 'yellow' | 'red';
  signal_remaining: number;  // seconds left in current state
  distance_m: number;
  target_green: 'current' | 'next';
}

// ---------------------------------------------------------------------------
// Firestore reads
// ---------------------------------------------------------------------------

/**
 * Fetch all traffic signals from Firestore.
 * Collection: "indore" (city-based collection for scalability)
 */
export async function fetchTrafficSignals(): Promise<TrafficSignal[]> {
  try {
    const q = query(collection(db, 'indore'));
    const snapshot = await getDocs(q);

    const signals: TrafficSignal[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      signals.push({
        id: doc.id,
        name: doc.id,  // Document name IS the signal name (e.g. "Bengali square")
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        anchor_time: data.anchor_time ?? '',
        green_interval: Number(data.green_interval ?? 0),
        yellow_interval: Number(data.yellow_interval ?? 0),
        red_interval: Number(data.red_interval ?? 0),
      });
    });

    return signals;
  } catch (error) {
    console.error('Error fetching traffic signals:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Haversine distance in meters */
function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest traffic signal to a given position
 * that is also along the route (within routeProximityM of any route point).
 */
export function findNearestSignalOnRoute(
  signals: TrafficSignal[],
  userLat: number,
  userLng: number,
  route: { latitude: number; longitude: number }[],
  routeProximityM: number = 100,
): { signal: TrafficSignal; distance: number } | null {
  if (signals.length === 0) return null;

  // Filter signals that are near the route
  const onRouteSignals = signals.filter((sig) => {
    // Check if signal is within routeProximityM of any route point
    // Sample every 5th point for performance
    for (let i = 0; i < route.length; i += 5) {
      const d = haversineM(sig.latitude, sig.longitude, route[i].latitude, route[i].longitude);
      if (d <= routeProximityM) return true;
    }
    return false;
  });

  const candidateSignals = onRouteSignals.length > 0 ? onRouteSignals : signals;

  // Find nearest to user (ahead on route)
  let nearest: { signal: TrafficSignal; distance: number } | null = null;

  for (const sig of candidateSignals) {
    const d = haversineM(userLat, userLng, sig.latitude, sig.longitude);
    // Only consider signals ahead (within 2km)
    if (d <= 2000 && (!nearest || d < nearest.distance)) {
      nearest = { signal: sig, distance: d };
    }
  }

  return nearest;
}

// ---------------------------------------------------------------------------
// Flask API call
// ---------------------------------------------------------------------------

// Change this to your Flask server URL
// For physical devices: use your computer's local IP
// For Android emulator: use 10.0.2.2
// For iOS simulator: use localhost
const FLASK_API_URL = 'http://10.88.12.246:5000';

/**
 * Call the Flask backend to get speed advisory.
 */
export async function getSpeedAdvisory(
  userLat: number,
  userLng: number,
  userSpeedKmh: number,
  signal: TrafficSignal,
): Promise<SpeedAdvisory | null> {
  try {
    const response = await fetch(`${FLASK_API_URL}/speed-advisory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_lat: userLat,
        user_lng: userLng,
        user_speed_kmh: userSpeedKmh,
        signal_lat: signal.latitude,
        signal_lng: signal.longitude,
        anchor_time: signal.anchor_time,
        green_interval: signal.green_interval,
        yellow_interval: signal.yellow_interval,
        red_interval: signal.red_interval,
      }),
    });

    if (!response.ok) {
      console.error('Flask API error:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to reach Flask API:', error);
    return null;
  }
}
