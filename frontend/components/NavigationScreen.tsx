import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  fetchTrafficSignals,
  filterSignalsByRoute,
  findNearestSignalOnRoute,
  computeSpeedAdvisory,
  TrafficSignal,
  SpeedAdvisory,
} from '../services/trafficSignals';
import { SpeedTracker } from '../services/speedTracker';

// Map type definitions
const MAP_TYPES = ['standard', 'satellite', 'terrain', 'hybrid'] as const;
type MapType = (typeof MAP_TYPES)[number];

const MAP_TYPE_LABELS: Record<MapType, string> = {
  standard: 'Default',
  satellite: 'Satellite',
  terrain: 'Terrain',
  hybrid: 'Hybrid',
};

// Reroute threshold in meters
const REROUTE_THRESHOLD_M = 10;
// Minimum interval between reroute calls (ms) to avoid spamming
const REROUTE_COOLDOWN_MS = 5000;
// Speed advisory polling interval (ms)
const ADVISORY_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Haversine distance in meters between two lat/lng points */
function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Find the index of the closest point on the route to a given coordinate */
function closestPointIndex(
  route: { latitude: number; longitude: number }[],
  lat: number,
  lng: number,
): { index: number; distance: number } {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < route.length; i++) {
    const d = haversineM(lat, lng, route[i].latitude, route[i].longitude);
    if (d < minDist) {
      minDist = d;
      minIdx = i;
    }
  }
  return { index: minIdx, distance: minDist };
}

/** Fetch route from OSRM */
async function fetchRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ latitude: number; longitude: number }[] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes?.length) return null;
    const coords: [number, number][] = json.routes[0].geometry.coordinates;
    // GeoJSON is [lng, lat] — convert to {latitude, longitude}
    return coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// NavigationScreen Component
// ---------------------------------------------------------------------------
export default function NavigationScreen() {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    destLat: string;
    destLng: string;
    destName: string;
  }>();

  const destLat = parseFloat(params.destLat ?? '0');
  const destLng = parseFloat(params.destLng ?? '0');
  const destName = params.destName ?? 'Destination';

  // User location
  const [userLat, setUserLat] = useState(0);
  const [userLng, setUserLng] = useState(0);
  const [userSpeedKmh, setUserSpeedKmh] = useState(0); // km/h — Kalman filtered
  const [hasLocation, setHasLocation] = useState(false);

  // High-accuracy speed engine (Kalman filter + adaptive EMA + stationary detection)
  const speedTrackerRef = useRef(new SpeedTracker());

  // Route
  const [fullRoute, setFullRoute] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [displayRoute, setDisplayRoute] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [routeError, setRouteError] = useState(false);

  // Map controls
  const [mapType, setMapType] = useState<MapType>('standard');
  const [showTypePicker, setShowTypePicker] = useState(false);

  // Traffic signals
  const [signals, setSignals] = useState<TrafficSignal[]>([]);
  const [filteredSignals, setFilteredSignals] = useState<TrafficSignal[]>([]);
  const [nearestSignal, setNearestSignal] = useState<{
    signal: TrafficSignal;
    distance: number;
  } | null>(null);
  const [advisory, setAdvisory] = useState<SpeedAdvisory | null>(null);
  const [signalLoading, setSignalLoading] = useState(true);

  // Reroute cooldown
  const lastRerouteRef = useRef(0);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const advisoryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fetch traffic signals from Firestore (with background refresh) ---
  // First call returns cached data instantly (if available).
  // Fresh data from Firestore arrives via the onUpdate callback silently.
  useEffect(() => {
    (async () => {
      setSignalLoading(true);
      const sigs = await fetchTrafficSignals((freshSignals) => {
        // Background refresh: silently update when fresh Firestore data arrives
        setSignals(freshSignals);
      });
      setSignals(sigs);
      setSignalLoading(false);
    })();
  }, []);

  // --- Filter signals by route direction ("Going Towards" field) ---
  // Re-runs whenever signals or the route changes (including reroutes)
  useEffect(() => {
    if (signals.length === 0 || fullRoute.length === 0) {
      setFilteredSignals([]);
      return;
    }

    let cancelled = false;
    (async () => {
      const filtered = await filterSignalsByRoute(signals, fullRoute);
      if (!cancelled) {
        setFilteredSignals(filtered);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signals, fullRoute]);

  // --- Fetch initial route once we have user location ---
  const loadRoute = useCallback(
    async (fromLat: number, fromLng: number) => {
      setLoading(true);
      setRouteError(false);
      const route = await fetchRoute(fromLat, fromLng, destLat, destLng);
      if (route && route.length > 0) {
        setFullRoute(route);
        setDisplayRoute(route);
        // Fit map to show entire route
        mapRef.current?.fitToCoordinates(route, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        });
      } else {
        setRouteError(true);
      }
      setLoading(false);
    },
    [destLat, destLng],
  );



  // --- Get user location & start watching ---
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    const tracker = speedTrackerRef.current;
    tracker.reset(); // Fresh start for each navigation session

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setRouteError(true);
        setLoading(false);
        return;
      }

      // Get initial location with best accuracy for navigation
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const { latitude, longitude, speed, accuracy: acc } = loc.coords;
      setUserLat(latitude);
      setUserLng(longitude);

      // Feed initial reading into SpeedTracker
      const initSpeed = tracker.update(
        latitude, longitude,
        speed, acc,
        loc.timestamp,
      );
      setUserSpeedKmh(initSpeed);
      setHasLocation(true);

      // Fetch initial route
      await loadRoute(latitude, longitude);

      // Watch position for live updates — optimized for vehicle navigation
      // timeInterval: 500ms = 2 readings/sec (good balance for Kalman filter)
      // distanceInterval: 0 = trigger even when stationary (for stationary detection)
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 0,
          timeInterval: 500,
        },
        (newLoc) => {
          const {
            latitude: lat,
            longitude: lng,
            speed: spd,
            accuracy: locAccuracy,
          } = newLoc.coords;

          // --- Accuracy gate: discard very poor fixes ---
          // But use a softer threshold (30m) since SpeedTracker's Kalman
          // filter already handles noise — hard rejection at 20m was
          // throwing away too many readings and causing gaps.
          if (locAccuracy !== null && locAccuracy > 30) return;

          setUserLat(lat);
          setUserLng(lng);

          // Feed raw reading into SpeedTracker — it handles everything:
          // Kalman filtering, source selection, spike rejection,
          // EMA smoothing, and stationary detection
          const displayKmh = tracker.update(
            lat, lng,
            spd, locAccuracy,
            newLoc.timestamp,
          );
          setUserSpeedKmh(displayKmh);
        },
      );
      locationSubRef.current = sub;
    })();

    return () => {
      sub?.remove();
    };
  }, [loadRoute]);

  // --- Find nearest signal and get advisory ---
  // Uses filteredSignals (already filtered by "Going Towards" direction)
  useEffect(() => {
    if (!hasLocation || filteredSignals.length === 0 || fullRoute.length === 0) return;

    const nearest = findNearestSignalOnRoute(
      filteredSignals,
      userLat,
      userLng,
      fullRoute,
    );
    setNearestSignal(nearest);
  }, [userLat, userLng, hasLocation, filteredSignals, fullRoute]);

  // --- Poll speed advisory (computed on-device, no server needed) ---
  useEffect(() => {
    if (!nearestSignal || !hasLocation) return;

    const updateAdvisory = () => {
      // Use Kalman-filtered speed (less smoothed than display) for
      // more responsive advisory — advisory needs to react quickly
      // to speed changes so the user gets timely feedback.
      const speedKmh = speedTrackerRef.current.getSpeedKmh();
      const result = computeSpeedAdvisory(
        userLat,
        userLng,
        speedKmh,
        nearestSignal.signal,
      );
      setAdvisory(result);
    };

    // Compute immediately
    updateAdvisory();

    // Then update every 2 seconds (signal state changes over time)
    advisoryIntervalRef.current = setInterval(updateAdvisory, ADVISORY_INTERVAL_MS);

    return () => {
      if (advisoryIntervalRef.current) {
        clearInterval(advisoryIntervalRef.current);
      }
    };
  }, [nearestSignal, hasLocation, userLat, userLng, userSpeedKmh]);

  // --- Live route updates: trim polyline & reroute ---
  useEffect(() => {
    if (!hasLocation || fullRoute.length === 0) return;

    const { index, distance } = closestPointIndex(
      fullRoute,
      userLat,
      userLng,
    );

    // Trim the polyline: remove covered portion
    if (index > 0) {
      const remaining = fullRoute.slice(index);
      // Prepend current user position for smooth line
      setDisplayRoute([
        { latitude: userLat, longitude: userLng },
        ...remaining,
      ]);
    }

    // Reroute if deviated more than threshold
    const now = Date.now();
    if (
      distance > REROUTE_THRESHOLD_M &&
      now - lastRerouteRef.current > REROUTE_COOLDOWN_MS
    ) {
      lastRerouteRef.current = now;
      // Fetch new route from current position
      fetchRoute(userLat, userLng, destLat, destLng).then((newRoute) => {
        if (newRoute && newRoute.length > 0) {
          setFullRoute(newRoute);
          setDisplayRoute(newRoute);
        }
      });
    }
  }, [userLat, userLng, hasLocation, fullRoute, destLat, destLng]);

  // --- Controls ---
  const goToMe = useCallback(() => {
    if (!hasLocation) return;
    mapRef.current?.animateToRegion(
      {
        latitude: userLat,
        longitude: userLng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      1500,
    );
  }, [userLat, userLng, hasLocation]);

  const fitRoute = useCallback(() => {
    if (displayRoute.length > 0) {
      mapRef.current?.fitToCoordinates(displayRoute, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [displayRoute]);

  const pickMapType = useCallback((t: MapType) => {
    setMapType(t);
    setShowTypePicker(false);
  }, []);

  // Derived values
  const midLat = hasLocation ? (userLat + destLat) / 2 : destLat;
  const midLng = hasLocation ? (userLng + destLng) / 2 : destLng;
  const roundedSpeed = Math.round(userSpeedKmh);

  // --- Status message & icon logic ---
  const getStatusInfo = () => {
    if (!advisory) {
      if (signalLoading) {
        return { message: 'CONNECTING TO SIGNALS...', icon: 'wifi' as const, color: '#B0BEC5' };
      }
      if (roundedSpeed === 0) {
        return { message: 'READY TO RIDE!', icon: 'two-wheeler' as const, color: '#B0BEC5' };
      }
      return { message: 'NO SIGNALS NEARBY', icon: 'explore' as const, color: '#B0BEC5' };
    }
    switch (advisory.status) {
      case 'perfect':
        return { message: 'PERFECT – YOU WILL HIT GREEN!', icon: 'check-box' as const, color: '#66BB6A' };
      case 'too_fast':
        return { message: 'SLOW DOWN A BIT', icon: 'speed' as const, color: '#EF5350' };
      case 'too_slow':
        return { message: 'SPEED UP A LITTLE', icon: 'trending-up' as const, color: '#FFC107' };
      case 'at_signal':
        return { message: 'YOU ARE AT THE SIGNAL', icon: 'traffic' as const, color: '#B0BEC5' };
      default:
        return { message: 'NAVIGATING...', icon: 'navigation' as const, color: '#B0BEC5' };
    }
  };

  const statusInfo = getStatusInfo();

  // Speed text for bottom bar
  const speedDisplayText = roundedSpeed > 0
    ? `Your speed: ${roundedSpeed} km/h`
    : 'Waiting for movement...';

  // Speedometer ring color based on status
  const speedoRingColor = !advisory
    ? '#5C9CE6'
    : advisory.status === 'perfect'
    ? '#66BB6A'
    : advisory.status === 'too_fast'
    ? '#EF5350'
    : advisory.status === 'too_slow'
    ? '#FFC107'
    : '#5C9CE6';

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ===== TOP BAR — Gradient with Speed Range ===== */}
      <LinearGradient
        colors={['#7B6BA5', '#6E8CC2', '#7BA3C9']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.topBar, { paddingTop: insets.top + 4 }]}
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>

        {/* Speed range: MIN --- km/h --- MAX */}
        {advisory && nearestSignal ? (
          <View style={styles.speedRangeRow}>
            <View style={styles.speedBlock}>
              <Text style={styles.speedValue}>{Math.round(advisory.min_speed)}</Text>
              <Text style={styles.speedLabel}>MIN</Text>
            </View>
            <View style={styles.rangeCenter}>
              <View style={styles.rangeLine} />
              <Text style={styles.rangeUnit}>km/h</Text>
              <View style={styles.rangeLine} />
            </View>
            <View style={styles.speedBlock}>
              <Text style={styles.speedValue}>{Math.round(advisory.max_speed)}</Text>
              <Text style={styles.speedLabel}>MAX</Text>
            </View>
          </View>
        ) : (
          <View style={styles.speedRangeRow}>
            {signalLoading ? (
              <View style={styles.topLoadingRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.topLoadingText}>Finding signals...</Text>
              </View>
            ) : (
              <View style={styles.noSignalRow}>
                <View style={styles.speedBlock}>
                  <Text style={styles.speedValueDim}>--</Text>
                  <Text style={styles.speedLabel}>MIN</Text>
                </View>
                <View style={styles.rangeCenter}>
                  <View style={styles.rangeLine} />
                  <Text style={styles.rangeUnit}>km/h</Text>
                  <View style={styles.rangeLine} />
                </View>
                <View style={styles.speedBlock}>
                  <Text style={styles.speedValueDim}>--</Text>
                  <Text style={styles.speedLabel}>MAX</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </LinearGradient>

      {/* ===== MIDDLE — MAP ===== */}
      <View style={styles.mapSection}>
        <MapView
          ref={mapRef}
          style={styles.map}
          mapType={mapType}
          initialRegion={{
            latitude: midLat,
            longitude: midLng,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          rotateEnabled={true}
          pitchEnabled={false}
          loadingEnabled={true}
          loadingIndicatorColor="#7B6BA5"
          loadingBackgroundColor="#f5f5f5"
        >
          {/* Destination marker */}
          <Marker
            coordinate={{ latitude: destLat, longitude: destLng }}
            title={destName}
            pinColor="#00E676"
          />

          {/* Traffic signal markers */}
          {nearestSignal && (
            <Marker
              coordinate={{
                latitude: nearestSignal.signal.latitude,
                longitude: nearestSignal.signal.longitude,
              }}
              title={nearestSignal.signal.name}
              pinColor={
                advisory?.signal_state === 'green'
                  ? '#00E676'
                  : advisory?.signal_state === 'yellow'
                  ? '#FFD600'
                  : '#FF5252'
              }
            />
          )}

          {/* Route polyline */}
          {displayRoute.length > 1 && (
            <Polyline
              coordinates={displayRoute}
              strokeColor="#4285F4"
              strokeWidth={5}
              lineDashPattern={[0]}
            />
          )}
        </MapView>

        {/* Loading overlay */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#7B6BA5" />
            <Text style={styles.loadingText}>Finding best route...</Text>
          </View>
        )}

        {/* Error overlay */}
        {routeError && !loading && (
          <View style={styles.loadingOverlay}>
            <MaterialIcons name="error-outline" size={40} color="#EF5350" />
            <Text style={styles.errorText}>Could not find route</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => hasLocation && loadRoute(userLat, userLng)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Map Controls */}
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={fitRoute} activeOpacity={0.7}>
            <MaterialIcons name="zoom-out-map" size={22} color="#555" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={goToMe} activeOpacity={0.7}>
            <MaterialIcons name="my-location" size={22} color="#555" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => setShowTypePicker((v) => !v)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="layers" size={22} color="#555" />
          </TouchableOpacity>
        </View>

        {/* Map Type Picker */}
        {showTypePicker && (
          <View style={styles.typePicker}>
            {MAP_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeOpt, mapType === t && styles.typeOptActive]}
                onPress={() => pickMapType(t)}
              >
                <Text style={[styles.typeLabel, mapType === t && styles.typeLabelActive]}>
                  {MAP_TYPE_LABELS[t]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ===== BOTTOM BAR — Gradient with Speedometer & Status ===== */}
      <LinearGradient
        colors={['#6B83D6', '#8B6FC0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        {/* Speedometer circle */}
        <View style={styles.speedoArea}>
          <View style={[styles.speedoRing, { borderColor: speedoRingColor }]}>
            <Text style={styles.speedoValue}>
              {roundedSpeed}
            </Text>
            <Text style={styles.speedoUnit}>km/h</Text>
          </View>
          <Text style={styles.speedoLabel}>Current Speed</Text>
        </View>

        {/* Status area */}
        <View style={styles.statusArea}>
          <Text style={styles.statusSpeedText}>{speedDisplayText}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusIcon, { backgroundColor: statusInfo.color }]}>
              <MaterialIcons name={statusInfo.icon} size={16} color="#fff" />
            </View>
            <Text style={styles.statusMessage}>{statusInfo.message}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f0f0' },

  /* ===== TOP BAR ===== */
  topBar: {
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  speedRangeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBlock: {
    alignItems: 'center',
    minWidth: 48,
  },
  speedValue: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  speedValueDim: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  speedLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
  rangeCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  rangeLine: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 1,
  },
  rangeUnit: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 10,
  },
  topLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  topLoadingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '500',
  },
  noSignalRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ===== MAP SECTION ===== */
  mapSection: {
    flex: 1,
    overflow: 'hidden',
  },
  map: { flex: 1 },

  /* Loading / Error overlays */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,245,245,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingText: {
    color: '#666',
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: '#EF5350',
    fontSize: 15,
    marginTop: 10,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 10,
    backgroundColor: '#7B6BA5',
    borderRadius: 22,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  /* Map Controls */
  mapControls: {
    position: 'absolute',
    right: 12,
    bottom: 16,
    gap: 10,
    zIndex: 10,
  },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },

  /* Type picker */
  typePicker: {
    position: 'absolute',
    right: 64,
    bottom: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    paddingVertical: 4,
    elevation: 8,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  typeOpt: { paddingHorizontal: 20, paddingVertical: 11 },
  typeOptActive: { backgroundColor: 'rgba(123,107,165,0.12)' },
  typeLabel: { color: '#888', fontSize: 14 },
  typeLabelActive: { color: '#7B6BA5', fontWeight: '600' },

  /* ===== BOTTOM BAR ===== */
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingHorizontal: 20,
  },

  /* Speedometer */
  speedoArea: {
    alignItems: 'center',
    marginRight: 20,
  },
  speedoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  speedoValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  speedoUnit: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: -2,
  },
  speedoLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.3,
  },

  /* Status */
  statusArea: {
    flex: 1,
    justifyContent: 'center',
  },
  statusSpeedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  statusMessage: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
  },
});
