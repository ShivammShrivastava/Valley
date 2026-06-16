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
import {
  fetchTrafficSignals,
  findNearestSignalOnRoute,
  getSpeedAdvisory,
  TrafficSignal,
  SpeedAdvisory,
} from '../services/trafficSignals';

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
// Speedometer Component
// ---------------------------------------------------------------------------
function Speedometer({ speed }: { speed: number }) {
  return (
    <View style={speedoStyles.container}>
      <View style={speedoStyles.ring}>
        <Text style={speedoStyles.value}>{Math.round(speed)}</Text>
        <Text style={speedoStyles.unit}>km/h</Text>
      </View>
      <Text style={speedoStyles.label}>Current Speed</Text>
    </View>
  );
}

const speedoStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  value: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  unit: {
    color: '#999',
    fontSize: 10,
    fontWeight: '500',
    marginTop: -2,
  },
  label: {
    color: '#888',
    fontSize: 11,
    marginTop: 6,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// Speed Range Bar Component
// ---------------------------------------------------------------------------
function SpeedRangeBar({
  minSpeed,
  maxSpeed,
  currentSpeed,
}: {
  minSpeed: number;
  maxSpeed: number;
  currentSpeed: number;
}) {
  // Calculate position of current speed on the bar (0 to 1)
  const range = maxSpeed - minSpeed;
  const clampedSpeed = Math.max(minSpeed - 10, Math.min(maxSpeed + 10, currentSpeed));
  const barMin = minSpeed - 10;
  const barMax = maxSpeed + 10;
  const barRange = barMax - barMin;
  const position = barRange > 0 ? ((clampedSpeed - barMin) / barRange) * 100 : 50;

  const isInRange = currentSpeed >= minSpeed && currentSpeed <= maxSpeed;

  return (
    <View style={rangeStyles.container}>
      <View style={rangeStyles.labelsRow}>
        <Text style={rangeStyles.speedLabel}>{Math.round(minSpeed)} km/h</Text>
        <Text style={[rangeStyles.rangeTitle, isInRange && rangeStyles.rangeTitleGreen]}>
          Speed Range
        </Text>
        <Text style={rangeStyles.speedLabel}>{Math.round(maxSpeed)} km/h</Text>
      </View>
      <View style={rangeStyles.barTrack}>
        {/* Green zone */}
        <View
          style={[
            rangeStyles.greenZone,
            {
              left: `${((minSpeed - barMin) / barRange) * 100}%`,
              width: `${(range / barRange) * 100}%`,
            },
          ]}
        />
        {/* Current speed indicator */}
        <View
          style={[
            rangeStyles.indicator,
            {
              left: `${position}%`,
              backgroundColor: isInRange ? '#00E676' : '#FF5252',
            },
          ]}
        />
      </View>
    </View>
  );
}

const rangeStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  speedLabel: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
  },
  rangeTitle: {
    color: '#888',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  rangeTitleGreen: {
    color: '#00E676',
  },
  barTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    position: 'relative',
    overflow: 'visible',
  },
  greenZone: {
    position: 'absolute',
    top: 0,
    height: 6,
    backgroundColor: 'rgba(0,230,118,0.35)',
    borderRadius: 3,
  },
  indicator: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
});

// ---------------------------------------------------------------------------
// Signal State Indicator
// ---------------------------------------------------------------------------
function SignalIndicator({
  state,
  remaining,
  signalName,
  distanceM,
}: {
  state: string;
  remaining: number;
  signalName: string;
  distanceM: number;
}) {
  const color =
    state === 'green' ? '#00E676' : state === 'yellow' ? '#FFD600' : '#FF5252';

  return (
    <View style={sigStyles.container}>
      <View style={[sigStyles.dot, { backgroundColor: color }]} />
      <View style={sigStyles.info}>
        <Text style={sigStyles.name} numberOfLines={1}>{signalName}</Text>
        <Text style={sigStyles.detail}>
          {state.charAt(0).toUpperCase() + state.slice(1)} · {Math.round(remaining)}s · {Math.round(distanceM)}m away
        </Text>
      </View>
    </View>
  );
}

const sigStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '600',
  },
  detail: {
    color: '#888',
    fontSize: 11,
    marginTop: 1,
  },
});

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
  const [userSpeed, setUserSpeed] = useState(0); // m/s from GPS
  const [hasLocation, setHasLocation] = useState(false);

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

  // --- Fetch traffic signals from Firestore ---
  useEffect(() => {
    (async () => {
      setSignalLoading(true);
      const sigs = await fetchTrafficSignals();
      setSignals(sigs);
      setSignalLoading(false);
    })();
  }, []);

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

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setRouteError(true);
        setLoading(false);
        return;
      }

      // Get initial location
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude, speed } = loc.coords;
      setUserLat(latitude);
      setUserLng(longitude);
      setUserSpeed(speed ?? 0);
      setHasLocation(true);

      // Fetch initial route
      await loadRoute(latitude, longitude);

      // Watch position for live updates
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 3, // update every 3m moved
          timeInterval: 2000, // or every 2s
        },
        (newLoc) => {
          const { latitude: lat, longitude: lng, speed: spd } = newLoc.coords;
          setUserLat(lat);
          setUserLng(lng);
          setUserSpeed(spd ?? 0);
        },
      );
      locationSubRef.current = sub;
    })();

    return () => {
      sub?.remove();
    };
  }, [loadRoute]);

  // --- Find nearest signal and get advisory ---
  useEffect(() => {
    if (!hasLocation || signals.length === 0 || fullRoute.length === 0) return;

    const nearest = findNearestSignalOnRoute(
      signals,
      userLat,
      userLng,
      fullRoute,
    );
    setNearestSignal(nearest);
  }, [userLat, userLng, hasLocation, signals, fullRoute]);

  // --- Poll speed advisory ---
  useEffect(() => {
    if (!nearestSignal || !hasLocation) return;

    const fetchAdvisory = async () => {
      const speedKmh = Math.max(0, (userSpeed ?? 0)) * 3.6; // m/s to km/h
      const result = await getSpeedAdvisory(
        userLat,
        userLng,
        speedKmh,
        nearestSignal.signal,
      );
      if (result) {
        setAdvisory(result);
      }
    };

    // Fetch immediately
    fetchAdvisory();

    // Then poll
    advisoryIntervalRef.current = setInterval(fetchAdvisory, ADVISORY_INTERVAL_MS);

    return () => {
      if (advisoryIntervalRef.current) {
        clearInterval(advisoryIntervalRef.current);
      }
    };
  }, [nearestSignal, hasLocation, userLat, userLng, userSpeed]);

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
  const userSpeedKmh = Math.max(0, (userSpeed ?? 0)) * 3.6;

  // Status message styling
  const getStatusStyle = () => {
    if (!advisory) return { color: '#888' };
    switch (advisory.status) {
      case 'perfect':
        return { color: '#00E676' };
      case 'too_fast':
        return { color: '#FF5252' };
      case 'too_slow':
        return { color: '#FFD600' };
      default:
        return { color: '#888' };
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* ===== TOP SECTION (18%) — Speed Advisory ===== */}
      <View style={styles.topSection}>
        {/* Back button */}
        <TouchableOpacity
          style={[styles.backBtn, { marginTop: insets.top + 8 }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Speed range display */}
        <View style={[styles.topContent, { marginTop: insets.top + 4 }]}>
          {advisory && nearestSignal ? (
            <>
              <SignalIndicator
                state={advisory.signal_state}
                remaining={advisory.signal_remaining}
                signalName={nearestSignal.signal.name}
                distanceM={advisory.distance_m}
              />
              <SpeedRangeBar
                minSpeed={advisory.min_speed}
                maxSpeed={advisory.max_speed}
                currentSpeed={userSpeedKmh}
              />
            </>
          ) : signalLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#00E676" />
              <Text style={styles.loadingSmallText}>Loading signals...</Text>
            </View>
          ) : (
            <View style={styles.loadingRow}>
              <MaterialIcons name="traffic" size={18} color="#666" />
              <Text style={styles.loadingSmallText}>No signals nearby</Text>
            </View>
          )}
        </View>
      </View>

      {/* ===== MIDDLE SECTION (60%) — MAP ===== */}
      <View style={styles.middleSection}>
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
          pitchEnabled={true}
          loadingEnabled={true}
          loadingIndicatorColor="#00E676"
          loadingBackgroundColor="#0B0B0B"
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
            <ActivityIndicator size="large" color="#00E676" />
            <Text style={styles.loadingText}>Finding best route...</Text>
          </View>
        )}

        {/* Error overlay */}
        {routeError && !loading && (
          <View style={styles.loadingOverlay}>
            <MaterialIcons name="error-outline" size={40} color="#FF5252" />
            <Text style={styles.errorText}>Could not find route</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => hasLocation && loadRoute(userLat, userLng)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Map Controls — positioned inside middle section */}
        <View style={styles.mapControls}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={fitRoute} activeOpacity={0.7}>
            <MaterialIcons name="zoom-out-map" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={goToMe} activeOpacity={0.7}>
            <MaterialIcons name="my-location" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => setShowTypePicker((v) => !v)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="layers" size={22} color="#fff" />
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

      {/* ===== BOTTOM SECTION (22%) — Speedometer & Status ===== */}
      <View style={styles.bottomSection}>
        <View style={styles.bottomContent}>
          {/* Speedometer */}
          <Speedometer speed={userSpeedKmh} />

          {/* Status message */}
          <View style={styles.statusContainer}>
            {advisory ? (
              <>
                <Text style={[styles.statusMessage, getStatusStyle()]}>
                  {advisory.message}
                </Text>
                {advisory.status === 'perfect' && (
                  <MaterialIcons
                    name="check-circle"
                    size={20}
                    color="#00E676"
                    style={{ marginTop: 4 }}
                  />
                )}
                {advisory.status === 'too_fast' && (
                  <MaterialIcons
                    name="speed"
                    size={20}
                    color="#FF5252"
                    style={{ marginTop: 4 }}
                  />
                )}
                {advisory.status === 'too_slow' && (
                  <MaterialIcons
                    name="trending-up"
                    size={20}
                    color="#FFD600"
                    style={{ marginTop: 4 }}
                  />
                )}
              </>
            ) : (
              <Text style={styles.statusPlaceholder}>
                {signalLoading ? 'Connecting...' : 'No signal data'}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0B' },

  /* Sections */
  topSection: {
    flex: 18, // 18%
    backgroundColor: '#111113',
    justifyContent: 'flex-start',
  },
  middleSection: {
    flex: 60, // 60%
    backgroundColor: '#0B0B0B',
    overflow: 'hidden',
    borderRadius: 0,
  },
  bottomSection: {
    flex: 22, // 22%
    backgroundColor: '#111113',
    justifyContent: 'center',
  },

  map: { flex: 1 },

  /* Back button */
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(32,32,36,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    zIndex: 10,
  },

  /* Top section content */
  topContent: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 60, // space for back button
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  loadingSmallText: {
    color: '#888',
    fontSize: 13,
  },

  /* Bottom section content */
  bottomContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusMessage: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusPlaceholder: {
    color: '#666',
    fontSize: 14,
  },

  /* Loading / Error overlays */
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,11,11,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingText: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: '#FF5252',
    fontSize: 15,
    marginTop: 10,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#00E676',
    borderRadius: 20,
  },
  retryText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },

  /* Map Controls */
  mapControls: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    gap: 10,
    zIndex: 10,
  },
  ctrlBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(32,32,36,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },

  /* Type picker */
  typePicker: {
    position: 'absolute',
    right: 62,
    bottom: 12,
    backgroundColor: 'rgba(28,28,32,0.96)',
    borderRadius: 14,
    paddingVertical: 4,
    elevation: 8,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  typeOpt: { paddingHorizontal: 20, paddingVertical: 11 },
  typeOptActive: { backgroundColor: 'rgba(0,230,118,0.12)' },
  typeLabel: { color: '#999', fontSize: 14 },
  typeLabelActive: { color: '#00E676', fontWeight: '600' },
});
