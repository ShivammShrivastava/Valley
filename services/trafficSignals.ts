/**
 * Traffic Signal Service — Optimized with Persistent Caching
 *
 * Reads traffic signal data from Firestore's nested structure and computes
 * signal state and speed advisory entirely on-device (no backend server needed).
 *
 * Performance optimizations:
 *   1. Persistent geocode cache (disk) — place names are geocoded ONCE ever
 *   2. Persistent signal cache (disk) — Firestore data shown instantly on next nav
 *   3. Pre-stored coordinates support — skip geocoding if Firestore has lat/lng
 *   4. Rate-limited Nominatim calls — 1 request/second to avoid IP bans
 *   5. Background refresh — show cached data instantly, refresh silently
 *
 * Firestore structure:
 *   Indore (collection)
 *     └── Bengali Square (document)
 *          ├── Traffic light 1: BS (sub-collection)
 *          │    └── T1 (document)
 *          │         ├── Going_Towards: "Palasia"
 *          │         ├── Going_Towards_Lat (optional): pre-geocoded latitude
 *          │         ├── Going_Towards_Lng (optional): pre-geocoded longitude
 *          │         ├── green_interval, longitude, latitude, Anchor_time
 *          └── Traffic light 2: BS (sub-collection)
 *               └── T2 (document)
 *                    ├── Going_Towards: "..."
 *                    ├── green_interval, longitude, latitude, Anchor_time
 */

import { db } from '../firebase';
import {
  collection,
  getDocs,
  query,
} from 'firebase/firestore';
import { File as ExpoFile, Directory, Paths } from 'expo-file-system';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TrafficSignal {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  anchor_time: string;       // ISO 8601 or "HH:MM:SS" when green phase started
  green_interval: number;    // seconds
  yellow_interval: number;   // seconds
  red_interval: number;      // seconds
  going_towards: string;     // Place name indicating which direction this signal serves
  going_towards_lat?: number; // Pre-geocoded latitude (optional, from Firestore)
  going_towards_lng?: number; // Pre-geocoded longitude (optional, from Firestore)
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

// How close (in meters) the route must pass to the "Going Towards" place
// for the signal to be considered relevant
const GOING_TOWARDS_PROXIMITY_M = 500;

// ---------------------------------------------------------------------------
// Persistent Cache — uses expo-file-system (SDK 54 class-based API)
// ---------------------------------------------------------------------------

// Cache directory and file references
const cacheDir = new Directory(Paths.document, 'suvega_cache');
const geocodeCacheFile = new ExpoFile(cacheDir, 'geocode_cache.json');
const signalsCacheFile = new ExpoFile(cacheDir, 'signals_cache.json');

// In-memory geocode cache (loaded from disk on first use)
let geocodeCache: Record<string, { lat: number; lng: number } | null> = {};
let geocodeCacheLoaded = false;

// In-memory signals cache
let signalsCache: TrafficSignal[] | null = null;
let signalsCacheLoaded = false;

/** Ensure cache directory exists */
function ensureCacheDir(): void {
  if (!cacheDir.exists) {
    cacheDir.create({ intermediates: true });
  }
}

/** Load geocode cache from disk into memory */
async function loadGeocodeCache(): Promise<void> {
  if (geocodeCacheLoaded) return;
  try {
    ensureCacheDir();
    if (geocodeCacheFile.exists) {
      const raw = await geocodeCacheFile.text();
      geocodeCache = JSON.parse(raw);
    }
  } catch (error) {
    console.warn('Could not load geocode cache:', error);
    geocodeCache = {};
  }
  geocodeCacheLoaded = true;
}

/** Save geocode cache from memory to disk */
function saveGeocodeCache(): void {
  try {
    ensureCacheDir();
    if (!geocodeCacheFile.exists) {
      geocodeCacheFile.create();
    }
    geocodeCacheFile.write(JSON.stringify(geocodeCache));
  } catch (error) {
    console.warn('Could not save geocode cache:', error);
  }
}

/** Load signals cache from disk */
async function loadSignalsCache(): Promise<TrafficSignal[] | null> {
  if (signalsCacheLoaded && signalsCache) return signalsCache;
  try {
    ensureCacheDir();
    if (signalsCacheFile.exists) {
      const raw = await signalsCacheFile.text();
      const parsed = JSON.parse(raw);
      signalsCache = parsed.signals ?? null;
      signalsCacheLoaded = true;
      return signalsCache;
    }
  } catch (error) {
    console.warn('Could not load signals cache:', error);
  }
  signalsCacheLoaded = true;
  return null;
}

/** Save signals to disk cache */
function saveSignalsCache(signals: TrafficSignal[]): void {
  try {
    ensureCacheDir();
    if (!signalsCacheFile.exists) {
      signalsCacheFile.create();
    }
    signalsCacheFile.write(JSON.stringify({ signals, timestamp: Date.now() }));
    signalsCache = signals;
  } catch (error) {
    console.warn('Could not save signals cache:', error);
  }
}

// ---------------------------------------------------------------------------
// Rate-limited Nominatim geocoding
// ---------------------------------------------------------------------------

let lastNominatimCall = 0;

/**
 * Wait to respect Nominatim's 1 request/second rate limit.
 * Only delays if needed — instant if enough time has passed.
 */
async function waitForNominatimSlot(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < 1100) {
    // Wait the remaining time to hit 1.1 seconds gap (safe margin)
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastNominatimCall = Date.now();
}

/**
 * Geocode a place name into coordinates using Nominatim.
 * Biased towards Indore, India for local place names.
 *
 * Uses 3-tier lookup:
 *   1. In-memory cache (instant)
 *   2. Disk cache (fast, ~5ms)
 *   3. Nominatim API (rate-limited, ~500ms+)
 */
async function geocodePlaceName(
  placeName: string,
): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = placeName.trim().toLowerCase();

  // Tier 1: In-memory cache
  await loadGeocodeCache();
  if (cacheKey in geocodeCache) {
    return geocodeCache[cacheKey] ?? null;
  }

  // Tier 2: Not in cache — call Nominatim (rate-limited)
  try {
    await waitForNominatimSlot();

    // Bounded search within Indore area first
    const boundedUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      placeName + ', Indore',
    )}&countrycodes=in&viewbox=75.65,22.85,76.05,22.55&bounded=1&limit=1`;

    let res = await fetch(boundedUrl, {
      headers: { 'User-Agent': 'SuvegaApp/1.0' },
    });
    let data = await res.json();

    // Fallback: wider search within India
    if (!data || data.length === 0) {
      await waitForNominatimSlot();
      const wideUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        placeName + ', Indore, India',
      )}&countrycodes=in&limit=1`;
      res = await fetch(wideUrl, {
        headers: { 'User-Agent': 'SuvegaApp/1.0' },
      });
      data = await res.json();
    }

    if (data && data.length > 0) {
      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
      geocodeCache[cacheKey] = result;
      // Save to disk in background (non-blocking)
      saveGeocodeCache();
      return result;
    }

    geocodeCache[cacheKey] = null;
    saveGeocodeCache();
    return null;
  } catch (error) {
    console.error(`Geocoding failed for "${placeName}":`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Firestore reads — nested collection traversal with caching
// ---------------------------------------------------------------------------

/**
 * Fetch all traffic signals from Firestore using the nested structure.
 *
 * Uses a 2-layer strategy for speed:
 *   1. Return cached signals IMMEDIATELY (if available)
 *   2. Fetch fresh data from Firestore in parallel
 *   3. Update cache when fresh data arrives
 *
 * The `onUpdate` callback is called when fresh data arrives so the UI
 * can update without blocking the initial render.
 */
export async function fetchTrafficSignals(
  onUpdate?: (signals: TrafficSignal[]) => void,
): Promise<TrafficSignal[]> {
  // Try to return cached data first (instant)
  const cached = await loadSignalsCache();

  if (cached && cached.length > 0) {
    // Return cached immediately, then refresh in background
    fetchFreshSignals().then((fresh) => {
      if (fresh.length > 0) {
        saveSignalsCache(fresh);
        if (onUpdate) onUpdate(fresh);
      }
    });
    return cached;
  }

  // No cache — fetch fresh (first time only)
  const fresh = await fetchFreshSignals();
  if (fresh.length > 0) {
    saveSignalsCache(fresh);
  }
  return fresh;
}

/**
 * Fetch fresh traffic signals directly from Firestore.
 * Traverses: Indore → each square → each traffic light sub-collection → each doc
 */
async function fetchFreshSignals(): Promise<TrafficSignal[]> {
  try {
    // Step 1: Get all documents in the "Indore" collection (e.g. "Bengali Square")
    const indoreSnapshot = await getDocs(query(collection(db, 'Indore')));

    const signals: TrafficSignal[] = [];

    // Step 2: For each square document, discover its sub-collections
    for (const squareDoc of indoreSnapshot.docs) {
      const squareName = squareDoc.id; // e.g. "Bengali Square"

      // Discover sub-collection names for this square
      const subCollectionNames = await discoverSubCollections(squareName);

      // Step 3: For each sub-collection, fetch all signal documents
      for (const subColName of subCollectionNames) {
        try {
          const signalSnapshot = await getDocs(
            query(collection(db, 'Indore', squareName, subColName)),
          );

          signalSnapshot.forEach((signalDoc) => {
            const data = signalDoc.data();

            // Read pre-geocoded coordinates if available
            const goingTowardsLat = data.Going_Towards_Lat ?? data.going_towards_lat;
            const goingTowardsLng = data.Going_Towards_Lng ?? data.going_towards_lng;

            signals.push({
              id: `${squareName}/${subColName}/${signalDoc.id}`,
              name: `${squareName} - ${subColName}`,
              latitude: Number(data.latitude ?? 0),
              longitude: Number(data.longitude ?? 0),
              anchor_time: data.Anchor_time ?? data.anchor_time ?? '',
              green_interval: Number(data.green_interval ?? 0),
              yellow_interval: Number(data.yellow_interval ?? 0),
              red_interval: Number(data.red_interval ?? 0),
              going_towards: data.Going_Towards ?? data.going_towards ?? '',
              // Pre-geocoded coords (if stored in Firestore, skips Nominatim entirely)
              going_towards_lat: goingTowardsLat != null ? Number(goingTowardsLat) : undefined,
              going_towards_lng: goingTowardsLng != null ? Number(goingTowardsLng) : undefined,
            });
          });
        } catch (subError) {
          console.warn(
            `Could not read sub-collection "${subColName}" in "${squareName}":`,
            subError,
          );
        }
      }
    }

    console.log(`Fetched ${signals.length} traffic signals from Firestore`);
    return signals;
  } catch (error) {
    console.error('Error fetching traffic signals:', error);
    return [];
  }
}

/**
 * Discover sub-collection names for a given square document.
 *
 * Firestore Web SDK doesn't support listCollections(), so we probe
 * for known naming patterns. The pattern is "Traffic light N: XX"
 * where XX is an abbreviation of the square name.
 *
 * We probe up to 10 traffic lights per square to auto-discover.
 */
async function discoverSubCollections(squareName: string): Promise<string[]> {
  const found: string[] = [];

  // Extract abbreviation from square name (e.g. "Bengali Square" → "BS")
  const abbreviation = squareName
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

  // Probe for "Traffic light 1: BS", "Traffic light 2: BS", etc.
  for (let i = 1; i <= 10; i++) {
    const subColName = `Traffic light ${i}: ${abbreviation}`;
    try {
      const snapshot = await getDocs(
        query(collection(db, 'Indore', squareName, subColName)),
      );
      if (!snapshot.empty) {
        found.push(subColName);
      }
    } catch {
      // Sub-collection doesn't exist, skip
    }
  }

  // If no pattern-based names found, try without abbreviation
  if (found.length === 0) {
    for (let i = 1; i <= 10; i++) {
      const subColName = `Traffic light ${i}`;
      try {
        const snapshot = await getDocs(
          query(collection(db, 'Indore', squareName, subColName)),
        );
        if (!snapshot.empty) {
          found.push(subColName);
        }
      } catch {
        // Sub-collection doesn't exist, skip
      }
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Direction-based signal filtering (with smart caching)
// ---------------------------------------------------------------------------

/**
 * Filter signals to only those whose "Going Towards" direction lies along
 * the user's route polyline.
 *
 * Optimization priority for resolving Going_Towards coordinates:
 *   1. Pre-stored in Firestore (going_towards_lat/lng) → INSTANT, no API call
 *   2. Persistent disk cache from previous geocoding   → INSTANT, no API call
 *   3. Nominatim API (rate-limited 1 req/sec)          → only on first-ever use
 *
 * This means after the first navigation session, ALL future sessions
 * filter signals INSTANTLY with zero API calls.
 */
export async function filterSignalsByRoute(
  signals: TrafficSignal[],
  route: { latitude: number; longitude: number }[],
): Promise<TrafficSignal[]> {
  if (signals.length === 0 || route.length === 0) return [];

  const filtered: TrafficSignal[] = [];

  for (const signal of signals) {
    if (!signal.going_towards || signal.going_towards.trim() === '') {
      // If no direction specified, include the signal by default
      filtered.push(signal);
      continue;
    }

    // Priority 1: Use pre-stored coordinates from Firestore (INSTANT)
    let placeCoords: { lat: number; lng: number } | null = null;

    if (
      signal.going_towards_lat != null &&
      signal.going_towards_lng != null &&
      !isNaN(signal.going_towards_lat) &&
      !isNaN(signal.going_towards_lng)
    ) {
      placeCoords = {
        lat: signal.going_towards_lat,
        lng: signal.going_towards_lng,
      };
    } else {
      // Priority 2 & 3: Disk cache → Nominatim API (with rate limiting)
      placeCoords = await geocodePlaceName(signal.going_towards);
    }

    if (!placeCoords) {
      console.warn(
        `Could not resolve "${signal.going_towards}" for signal "${signal.name}", skipping`,
      );
      continue;
    }

    // Check if the route polyline passes near the "Going Towards" location
    // Sample every 3rd point for performance (route can have thousands of points)
    let routePassesThroughPlace = false;
    for (let i = 0; i < route.length; i += 3) {
      const d = haversineM(
        placeCoords.lat,
        placeCoords.lng,
        route[i].latitude,
        route[i].longitude,
      );
      if (d <= GOING_TOWARDS_PROXIMITY_M) {
        routePassesThroughPlace = true;
        break;
      }
    }

    if (routePassesThroughPlace) {
      filtered.push(signal);
    }
  }

  console.log(
    `Filtered ${signals.length} signals → ${filtered.length} match route direction`,
  );
  return filtered;
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
 *
 * NOTE: This function should receive ALREADY-FILTERED signals
 * (filtered by filterSignalsByRoute) so it only considers
 * direction-relevant signals.
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
