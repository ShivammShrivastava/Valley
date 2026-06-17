/**
 * Traffic Signal Service
 *
 * Reads traffic signal data from Firestore and computes signal state
 * and speed advisory entirely on-device (no backend server needed).
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

interface SignalState {
  state: 'green' | 'yellow' | 'red';
  remaining: number;
  cycle_position: number;
  total_cycle: number;
}

// Speed limit cap (km/h)
const SPEED_LIMIT = 60;
// Buffer before green ends (seconds)
const GREEN_END_BUFFER = 5;

// ---------------------------------------------------------------------------
// Firestore reads
// ---------------------------------------------------------------------------

/**
 * Fetch all traffic signals from Firestore.
 * Collection: "indore" (city-based collection for scalability)
 *
 * When you add new squares/documents to Firestore, the app will
 * pick them up automatically the next time NavigationScreen opens
 * (signals are fetched fresh every time the screen mounts).
 */
export async function fetchTrafficSignals(): Promise<TrafficSignal[]> {
  try {
    const q = query(collection(db, 'Indore'));
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
// On-device signal state calculation
// ---------------------------------------------------------------------------

/**
 * Compute the current state of a traffic signal.
 *
 * Cycle order: GREEN → YELLOW → RED → GREEN ...
 *
 * Uses the anchor_time (when green first started) and intervals
 * to determine what color the signal is RIGHT NOW via modular arithmetic.
 */
export function computeSignalState(signal: TrafficSignal): SignalState {
  const now = new Date();

  // Parse anchor time — handles both "10:00:00" (time-only) and full ISO strings
  let anchor: Date;
  if (signal.anchor_time.includes('T') || signal.anchor_time.includes('-')) {
    // Full ISO format: "2025-01-01T10:00:00Z" or "2025-01-01T10:00:00+05:30"
    anchor = new Date(signal.anchor_time);
  } else {
    // Time-only format: "10:00:00" — treat as today's date in local timezone
    const [hours, minutes, seconds] = signal.anchor_time.split(':').map(Number);
    anchor = new Date();
    anchor.setHours(hours ?? 0, minutes ?? 0, seconds ?? 0, 0);
  }

  const totalCycle = signal.green_interval + signal.yellow_interval + signal.red_interval;

  if (totalCycle <= 0) {
    return { state: 'red', remaining: 0, cycle_position: 0, total_cycle: 0 };
  }

  // Seconds elapsed since anchor
  const elapsedMs = now.getTime() - anchor.getTime();
  const elapsedSec = elapsedMs / 1000;

  // Position within the current cycle (always positive via modulo)
  let cyclePos = elapsedSec % totalCycle;
  if (cyclePos < 0) cyclePos += totalCycle; // handle negative (anchor in future)

  let state: 'green' | 'yellow' | 'red';
  let remaining: number;

  if (cyclePos < signal.green_interval) {
    state = 'green';
    remaining = signal.green_interval - cyclePos;
  } else if (cyclePos < signal.green_interval + signal.yellow_interval) {
    state = 'yellow';
    remaining = (signal.green_interval + signal.yellow_interval) - cyclePos;
  } else {
    state = 'red';
    remaining = totalCycle - cyclePos;
  }

  return {
    state,
    remaining: Math.round(remaining * 10) / 10,
    cycle_position: Math.round(cyclePos * 10) / 10,
    total_cycle: totalCycle,
  };
}

// ---------------------------------------------------------------------------
// On-device speed advisory calculation
// ---------------------------------------------------------------------------

/**
 * Compute min/max speed advisory for the user to hit a green light.
 *
 * max_speed: speed to arrive exactly when green STARTS
 * min_speed: speed to arrive when green is about to END (5s buffer)
 *
 * All computation happens on-device — no server needed.
 */
export function computeSpeedAdvisory(
  userLat: number,
  userLng: number,
  userSpeedKmh: number,
  signal: TrafficSignal,
): SpeedAdvisory {
  // Calculate distance to signal
  const distanceM = haversineM(userLat, userLng, signal.latitude, signal.longitude);

  // Get current signal state
  const signalInfo = computeSignalState(signal);

  const { state, remaining } = signalInfo;
  const { green_interval, yellow_interval, red_interval } = signal;

  // --- Handle at-signal case ---
  if (distanceM <= 5) {
    return {
      min_speed: 0,
      max_speed: 0,
      user_speed: Math.round(userSpeedKmh * 10) / 10,
      status: 'at_signal',
      message: 'You are at the signal',
      signal_state: state,
      signal_remaining: Math.round(remaining * 10) / 10,
      distance_m: Math.round(distanceM),
      target_green: 'current',
    };
  }

  // --- Calculate time windows to green ---
  // Cycle order: GREEN → YELLOW → RED → GREEN ...
  let timeToGreenStart: number;
  let timeToGreenEnd: number;

  if (state === 'green') {
    const timeToCurrentGreenEnd = remaining;

    // Check if user can catch THIS green
    if (timeToCurrentGreenEnd > GREEN_END_BUFFER) {
      const minTime = GREEN_END_BUFFER;
      const maxTime = timeToCurrentGreenEnd - GREEN_END_BUFFER;

      if (maxTime > 0) {
        const minSpeedMs = distanceM / maxTime;
        const maxSpeedMs = distanceM / minTime;
        const minSpeedKmh = minSpeedMs * 3.6;
        const maxSpeedKmh = maxSpeedMs * 3.6;

        // If reachable within speed limit, use current green
        if (minSpeedKmh <= SPEED_LIMIT) {
          return buildAdvisory(minSpeedKmh, maxSpeedKmh, userSpeedKmh,
            state, remaining, distanceM, 'current');
        }
      }
    }

    // Fall through to next green
    timeToGreenStart = remaining + yellow_interval + red_interval;
    timeToGreenEnd = timeToGreenStart + green_interval;

  } else if (state === 'yellow') {
    // After yellow → red → green
    timeToGreenStart = remaining + red_interval;
    timeToGreenEnd = timeToGreenStart + green_interval;

  } else {
    // red: After red → green
    timeToGreenStart = remaining;
    timeToGreenEnd = timeToGreenStart + green_interval;
  }

  // --- Compute speeds for next green window ---
  let maxSpeedKmh: number;
  let minSpeedKmh: number;

  if (timeToGreenStart > 0) {
    maxSpeedKmh = (distanceM / timeToGreenStart) * 3.6;
  } else {
    maxSpeedKmh = SPEED_LIMIT;
  }

  const safeGreenEndTime = timeToGreenEnd - GREEN_END_BUFFER;
  if (safeGreenEndTime > 0) {
    minSpeedKmh = (distanceM / safeGreenEndTime) * 3.6;
  } else {
    minSpeedKmh = 0;
  }

  return buildAdvisory(minSpeedKmh, maxSpeedKmh, userSpeedKmh,
    state, remaining, distanceM, 'next');
}

/** Build the advisory response with clamped speeds and status message */
function buildAdvisory(
  minSpeedKmh: number,
  maxSpeedKmh: number,
  userSpeedKmh: number,
  signalState: 'green' | 'yellow' | 'red',
  signalRemaining: number,
  distanceM: number,
  targetGreen: 'current' | 'next',
): SpeedAdvisory {
  // Clamp to speed limit
  minSpeedKmh = Math.max(5, Math.min(minSpeedKmh, SPEED_LIMIT));
  maxSpeedKmh = Math.max(5, Math.min(maxSpeedKmh, SPEED_LIMIT));

  // Ensure min <= max
  if (minSpeedKmh > maxSpeedKmh) {
    [minSpeedKmh, maxSpeedKmh] = [maxSpeedKmh, minSpeedKmh];
  }

  // Determine status
  let status: SpeedAdvisory['status'];
  let message: string;

  if (userSpeedKmh < minSpeedKmh) {
    status = 'too_slow';
    message = 'You are too slow';
  } else if (userSpeedKmh > maxSpeedKmh) {
    status = 'too_fast';
    message = 'You are going too fast';
  } else {
    status = 'perfect';
    message = 'Perfect – you will hit green';
  }

  return {
    min_speed: Math.round(minSpeedKmh * 10) / 10,
    max_speed: Math.round(maxSpeedKmh * 10) / 10,
    user_speed: Math.round(userSpeedKmh * 10) / 10,
    status,
    message,
    signal_state: signalState,
    signal_remaining: Math.round(signalRemaining * 10) / 10,
    distance_m: Math.round(distanceM),
    target_green: targetGreen,
  };
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

  // Find nearest to user (ahead on route, within 2km)
  let nearest: { signal: TrafficSignal; distance: number } | null = null;

  for (const sig of candidateSignals) {
    const d = haversineM(userLat, userLng, sig.latitude, sig.longitude);
    if (d <= 2000 && (!nearest || d < nearest.distance)) {
      nearest = { signal: sig, distance: d };
    }
  }

  return nearest;
}
