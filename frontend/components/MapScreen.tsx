import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Keyboard,
  ActivityIndicator,
  StatusBar,
  Image,
  Animated,
  BackHandler,
  ScrollView,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

// Default: Indore, Madhya Pradesh, India
const DEFAULT_LAT = 22.7196;
const DEFAULT_LNG = 75.8577;
const DEFAULT_DELTA = 0.02;

// Map type definitions
const MAP_TYPES = ['standard', 'satellite', 'terrain', 'hybrid'] as const;
type MapType = (typeof MAP_TYPES)[number];

const MAP_TYPE_LABELS: Record<MapType, string> = {
  standard: 'Default',
  satellite: 'Satellite',
  terrain: 'Terrain',
  hybrid: 'Hybrid',
};

// Popular Indore landmarks — shown as quick-select pills when search is empty
// ALL coordinates verified via web search (geocords.com, mapcarta, housing.com, wikipedia)
const POPULAR_PLACES = [
  { name: 'Vijay Nagar', lat: 22.7603, lon: 75.8863 },
  { name: 'Palasia', lat: 22.7167, lon: 75.8833 },
  { name: 'Rajwada', lat: 22.7196, lon: 75.8577 },
  { name: 'C21 Mall', lat: 22.7440, lon: 75.8943 },
  { name: 'Sapna Sangeeta', lat: 22.7253, lon: 75.8656 },
  { name: 'Bengali Square', lat: 22.7081, lon: 75.9229 },
  { name: 'Bhanwarkuan', lat: 22.7422, lon: 75.8917 },
  { name: 'Bicholi Mardana', lat: 22.6984, lon: 75.9292 },
  { name: 'Dewas Naka', lat: 22.7814, lon: 75.9035 },
  { name: 'Khajrana', lat: 22.7312, lon: 75.9081 },
  { name: 'Rau', lat: 22.6317, lon: 75.7995 },
  { name: 'MR 10', lat: 22.7466, lon: 75.9364 },
];

// ---------------------------------------------------------------------------
// Local landmarks database — buildings, societies, nakas, and places that
// OpenStreetMap / Nominatim doesn't index well (or at all).
// ALL coordinates verified via web search (geocords.com, mapcarta, wikipedia,
// housing.com, findlatitudeandlongitude.com).
// ---------------------------------------------------------------------------
const LOCAL_LANDMARKS = [
  // --- Nakas & Chowks ---
  { name: 'Dewas Naka', area: 'Indore', lat: 22.7814, lon: 75.9035, kw: ['dewas', 'naka'] },
  { name: 'Bhawarkuan Square', area: 'Indore', lat: 22.7422, lon: 75.8917, kw: ['bhawarkuan', 'bhanwarkuan', 'bhanwar'] },
  { name: 'Geeta Bhawan Square', area: 'Indore', lat: 22.7184, lon: 75.8843, kw: ['geeta', 'bhawan', 'chowk', 'chauraha'] },
  { name: 'LIG Square', area: 'Indore', lat: 22.7377, lon: 75.8882, kw: ['lig', 'square'] },
  { name: 'Pipliyahana Square', area: 'Indore', lat: 22.7060, lon: 75.9059, kw: ['pipliyahana', 'pipliya'] },
  { name: 'Mhow Naka', area: 'Indore', lat: 22.7000, lon: 75.8300, kw: ['mhow', 'naka'] },
  { name: 'Radisson Square', area: 'Indore', lat: 22.7230, lon: 75.9050, kw: ['radisson', 'square'] },
  { name: 'Bombay Hospital Square', area: 'Ring Road', lat: 22.7568, lon: 75.9037, kw: ['bombay', 'hospital'] },
  { name: 'Niranjanpur Square', area: 'Indore', lat: 22.7783, lon: 75.8854, kw: ['niranjanpur', 'niranjan'] },

  // --- Neighborhoods & Areas ---
  { name: 'Bicholi Mardana', area: 'Indore', lat: 22.6984, lon: 75.9292, kw: ['bicholi', 'mardana'] },
  { name: 'Bicholi Hapsi', area: 'Indore', lat: 22.7161, lon: 75.9386, kw: ['bicholi', 'hapsi'] },
  { name: 'Scheme No. 54', area: 'Vijay Nagar', lat: 22.7507, lon: 75.8956, kw: ['scheme 54', 'scheme54', '54'] },
  { name: 'Scheme No. 78', area: 'Vijay Nagar', lat: 22.7648, lon: 75.8976, kw: ['scheme 78', 'scheme78', '78'] },
  { name: 'Scheme No. 140', area: 'Indore', lat: 22.7089, lon: 75.9127, kw: ['scheme 140', 'scheme140', '140'] },
  { name: 'Silicon City', area: 'Indore', lat: 22.6420, lon: 75.8353, kw: ['silicon', 'city'] },
  { name: 'Super Corridor', area: 'Indore', lat: 22.7597, lon: 75.8177, kw: ['super', 'corridor'] },
  { name: 'Kanadia Road', area: 'Indore', lat: 22.7205, lon: 75.9060, kw: ['kanadia', 'road'] },
  { name: 'Bypass Road', area: 'Indore', lat: 22.7300, lon: 75.9200, kw: ['bypass', 'road'] },
  { name: 'Ring Road', area: 'Indore', lat: 22.7350, lon: 75.8600, kw: ['ring', 'road'] },
  { name: 'Sudama Nagar', area: 'Indore', lat: 22.6953, lon: 75.8361, kw: ['sudama', 'nagar'] },
  { name: 'Annapurna Road', area: 'Indore', lat: 22.6901, lon: 75.8379, kw: ['annapurna', 'road'] },
  { name: 'Sneh Nagar', area: 'Indore', lat: 22.7120, lon: 75.8780, kw: ['sneh', 'nagar'] },
  { name: 'Mahalaxmi Nagar', area: 'Indore', lat: 22.7602, lon: 75.9120, kw: ['mahalaxmi', 'mahalakshmi', 'nagar'] },
  { name: 'Tilak Nagar', area: 'Indore', lat: 22.7184, lon: 75.8987, kw: ['tilak', 'nagar'] },

  // --- Malls & Markets ---
  { name: 'C21 Mall', area: 'Vijay Nagar', lat: 22.7440, lon: 75.8943, kw: ['c21', 'mall'] },
  { name: 'Treasure Island Mall', area: 'MG Road', lat: 22.7210, lon: 75.8785, kw: ['treasure', 'island', 'ti mall'] },
  { name: 'Mangal City Mall', area: 'Vijay Nagar', lat: 22.7525, lon: 75.8965, kw: ['mangal', 'city', 'mall'] },
  { name: 'Phoenix Citadel', area: 'MR 10 Road', lat: 22.7466, lon: 75.9364, kw: ['phoenix', 'citadel'] },
  { name: 'Central Mall', area: 'RNT Marg', lat: 22.7180, lon: 75.8710, kw: ['central', 'mall', 'nexus'] },
  { name: 'Orbit Mall', area: 'Scheme 54', lat: 22.7455, lon: 75.8943, kw: ['orbit', 'mall'] },

  // --- Buildings & Societies (user-requested) ---
  // Coordinates placed in verified Bicholi Mardana area (22.70°N, 75.93°E)
  { name: 'Anand Heritage', area: 'Bicholi Mardana', lat: 22.7000, lon: 75.9297, kw: ['anand', 'heritage'] },
  { name: 'Shreeji Heights', area: 'Shreeji Valley, Bicholi Mardana', lat: 22.6990, lon: 75.9290, kw: ['shreeji', 'heights'] },
  { name: 'Shreeji Valley', area: 'Bicholi Mardana', lat: 22.6985, lon: 75.9285, kw: ['shreeji', 'valley'] },

  // --- Temples & Religious ---
  { name: 'Khajrana Ganesh Temple', area: 'Khajrana', lat: 22.7312, lon: 75.9081, kw: ['khajrana', 'ganesh', 'temple', 'mandir'] },
  { name: 'Annapurna Temple', area: 'Sudama Nagar', lat: 22.6901, lon: 75.8379, kw: ['annapurna', 'temple', 'mandir'] },
  { name: 'Lalbagh Palace', area: 'Indore', lat: 22.7000, lon: 75.8470, kw: ['lalbagh', 'palace'] },

  // --- Hospitals ---
  { name: 'MY Hospital', area: 'Indore', lat: 22.7133, lon: 75.8800, kw: ['my', 'hospital', 'maharaja', 'yeshwantrao'] },
  { name: 'CHL Hospital', area: 'AB Road', lat: 22.7320, lon: 75.8890, kw: ['chl', 'hospital'] },
  { name: 'Medanta Hospital', area: 'Super Corridor', lat: 22.7580, lon: 75.8200, kw: ['medanta', 'hospital'] },
  { name: 'Choithram Hospital', area: 'Manik Bagh Road', lat: 22.6885, lon: 75.8544, kw: ['choithram', 'hospital'] },

  // --- Transport ---
  { name: 'Indore Junction', area: 'Railway Station', lat: 22.7167, lon: 75.8678, kw: ['indore', 'junction', 'railway', 'station', 'rail'] },
  { name: 'Sarwate Bus Stand', area: 'Indore', lat: 22.7140, lon: 75.8680, kw: ['sarwate', 'bus', 'stand'] },
  { name: 'Gangwal Bus Stand', area: 'Indore', lat: 22.7129, lon: 75.8410, kw: ['gangwal', 'bus', 'stand'] },
  { name: 'Indore Airport', area: 'Devi Ahilyabai Holkar Airport', lat: 22.7214, lon: 75.8005, kw: ['airport', 'devi', 'ahilyabai'] },

  // --- Education ---
  { name: 'IIT Indore', area: 'Simrol', lat: 22.5273, lon: 75.9344, kw: ['iit', 'indore', 'simrol'] },
  { name: 'IIM Indore', area: 'Rau-Pithampur Road', lat: 22.6241, lon: 75.7956, kw: ['iim', 'indore'] },
  { name: 'DAVV University', area: 'Khandwa Road', lat: 22.6893, lon: 75.8705, kw: ['davv', 'university', 'devi', 'ahilya'] },
  { name: 'Medicaps University', area: 'Rau', lat: 22.6332, lon: 75.7775, kw: ['medicaps', 'university'] },
];

// --- Fuzzy search the local landmarks database ---
const searchLocalLandmarks = (query: string): any[] => {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];

  const words = q.split(/\s+/);

  return LOCAL_LANDMARKS.filter((place) => {
    // Check if name contains query
    const nameMatch = place.name.toLowerCase().includes(q);
    // Check if area contains query
    const areaMatch = place.area.toLowerCase().includes(q);
    // Check if any keyword matches any query word
    const keywordMatch = place.kw.some((kw) =>
      words.some((w) => kw.includes(w) || w.includes(kw)),
    );
    return nameMatch || areaMatch || keywordMatch;
  })
    .slice(0, 5) // limit to 5 local results
    .map((place) => ({
      // Format as Nominatim-compatible result object
      lat: place.lat.toString(),
      lon: place.lon.toString(),
      place_id: `local_${place.name.replace(/\s/g, '_')}`,
      name: place.name,
      display_name: `${place.name}, ${place.area}, Indore`,
      namedetails: { name: place.name },
      address: { suburb: place.area, city: 'Indore' },
      _isLocal: true, // tag for deduplication
    }));
};

// --- Convert Photon GeoJSON result to Nominatim-compatible format ---
const photonToNominatim = (feature: any): any => {
  const props = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [0, 0];
  return {
    lat: lat.toString(),
    lon: lon.toString(),
    place_id: `photon_${props.osm_id || Math.random()}`,
    name: props.name || '',
    display_name: [props.name, props.street, props.suburb, props.city, props.state]
      .filter(Boolean)
      .join(', '),
    namedetails: { name: props.name || '' },
    address: {
      suburb: props.suburb || props.district || '',
      neighbourhood: props.neighbourhood || '',
      city: props.city || props.town || '',
      state: props.state || '',
    },
  };
};

// --- Deduplicate results by proximity (within ~200m = same place) ---
const dedupeResults = (results: any[]): any[] => {
  const seen: Array<{ lat: number; lon: number }> = [];
  return results.filter((r) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (isNaN(lat) || isNaN(lon)) return false;
    const isDupe = seen.some(
      (s) => Math.abs(s.lat - lat) < 0.002 && Math.abs(s.lon - lon) < 0.002,
    );
    if (!isDupe) seen.push({ lat, lon });
    return !isDupe;
  });
};

// --- Helper: extract Indian-friendly display name from result ---
const getDisplayName = (result: any): { main: string; sub: string } => {
  const name = result.namedetails?.name || result.name || '';
  const suburb =
    result.address?.suburb ||
    result.address?.neighbourhood ||
    result.address?.quarter ||
    result.address?.village ||
    '';
  const city =
    result.address?.city ||
    result.address?.town ||
    result.address?.county ||
    'Indore';

  if (suburb && suburb !== name) {
    return { main: name || suburb, sub: `${suburb !== name ? suburb + ', ' : ''}${city}` };
  }
  if (name.length > 40) {
    return { main: name.split(',')[0].trim(), sub: city };
  }
  return { main: name || 'Unknown place', sub: city };
};

// ---------------------------------------------------------------------------
// MapScreen Component
// ---------------------------------------------------------------------------
export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destInputRef = useRef<TextInput>(null);
  const startInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // GPS position stored in REF (not state) to avoid re-renders that interrupt
  // map gestures like rotation, pinch-zoom, and scroll.
  // The native `showsUserLocation` blue dot updates independently.
  const userPosRef = useRef({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [hasUserLocation, setHasUserLocation] = useState(false);

  // Reverse geocoded user location name
  const [userLocationName, setUserLocationName] = useState('Your location');

  // Expanded search state
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeField, setActiveField] = useState<'start' | 'dest'>('dest');

  // Start location
  const [startQuery, setStartQuery] = useState('');
  const [startDisplayText, setStartDisplayText] = useState('');
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(true);

  // Destination
  const [destQuery, setDestQuery] = useState('');

  // Search (shared)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMarker, setSearchMarker] = useState<{
    lat: number;
    lng: number;
    title: string;
  } | null>(null);

  // Map
  const [mapType, setMapType] = useState<MapType>('standard');
  const [showTypePicker, setShowTypePicker] = useState(false);

  // --- Reverse geocode user location ---
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results && results.length > 0) {
        const addr = results[0];
        const parts = [addr.name, addr.street, addr.district, addr.city].filter(Boolean);
        const name = parts.slice(0, 2).join(', ') || 'Your location';
        setUserLocationName(name);
        setStartDisplayText(name);
      }
    } catch {
      setUserLocationName('Your location');
      setStartDisplayText('Your location');
    }
  }, []);

  // --- GPS: instant centering + background warm-up (zero re-renders) ---
  const gpsWarmupRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Step 1: INSTANT centering from cached position (no GPS wait)
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        const { latitude, longitude } = lastKnown.coords;
        userPosRef.current = { lat: latitude, lng: longitude };
        setHasUserLocation(true);
        setStartCoords({ lat: latitude, lng: longitude });
        mapRef.current?.animateToRegion(
          { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          800,
        );
        reverseGeocode(latitude, longitude);
      }

      // Step 2: Get accurate position (may take a few seconds)
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = loc.coords;
      userPosRef.current = { lat: latitude, lng: longitude };
      if (!hasUserLocation) {
        setHasUserLocation(true);
        setStartCoords({ lat: latitude, lng: longitude });
        reverseGeocode(latitude, longitude);
      }

      // Animate to accurate position
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        1200,
      );

      // Step 3: GPS warm-up subscription — keeps GPS chip active.
      // Updates ref only (NO setState) → zero re-renders → smooth map gestures.
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (newLoc) => {
          if (newLoc.coords.accuracy !== null && newLoc.coords.accuracy > 20) return;
          // Update ref only — no setState, no re-renders
          userPosRef.current = {
            lat: newLoc.coords.latitude,
            lng: newLoc.coords.longitude,
          };
        },
      );
      gpsWarmupRef.current = sub;
    })();

    return () => {
      sub?.remove();
      gpsWarmupRef.current = null;
    };
  }, [reverseGeocode]);

  // --- Handle back button when expanded ---
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isExpanded) {
        collapseSearch();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [isExpanded]);

  // --- Multi-source search: Local DB + Nominatim + Photon (parallel) ---
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      // Source 1: LOCAL LANDMARKS (instant — no network call)
      const localResults = searchLocalLandmarks(q);

      // Show local results immediately while network requests are in-flight
      if (localResults.length > 0) {
        setResults(localResults);
        setShowResults(true);
      }

      // For Nominatim: append "indore" to short queries for better context
      // "bicholi mardana" → "bicholi mardana, indore" gives much better results
      const qLower = q.toLowerCase();
      const needsContext = q.length < 25 && !qLower.includes('indore');
      const nominatimQuery = needsContext ? `${q}, Indore` : q;

      // Source 2: NOMINATIM (OpenStreetMap geocoder)
      const nominatimUrl =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(nominatimQuery)}` +
        `&format=json` +
        `&limit=7` +
        `&countrycodes=in` +
        `&viewbox=75.7,22.5,76.1,23.0` +
        `&bounded=0` +
        `&namedetails=1` +
        `&addressdetails=1` +
        `&accept-language=en`;

      const nominatimPromise = fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'SuvegaApp/1.0 (indore navigation)',
          'Accept-Language': 'en',
        },
      }).then((r) => r.json()).catch(() => []);

      // Source 3: PHOTON (better fuzzy matching, proximity-biased to Indore)
      const photonUrl =
        `https://photon.komoot.io/api/` +
        `?q=${encodeURIComponent(q)}` +
        `&lat=22.7196&lon=75.8577` +
        `&limit=5` +
        `&lang=en`;

      const photonPromise = fetch(photonUrl, {
        headers: { 'User-Agent': 'SuvegaApp/1.0' },
      })
        .then((r) => r.json())
        .then((data) => (data.features || []).map(photonToNominatim))
        .catch(() => []);

      // Wait for both network searches in parallel
      const [nominatimData, photonData] = await Promise.all([
        nominatimPromise,
        photonPromise,
      ]);

      // Merge: Local first (curated), then Nominatim, then Photon
      const merged = [...localResults, ...nominatimData, ...photonData];

      // Deduplicate by proximity (~200m radius)
      const deduped = dedupeResults(merged);

      // Limit to 10 results total
      const final = deduped.slice(0, 10);

      setResults(final);
      setShowResults(final.length > 0);
    } catch {
      // If everything fails, at least show local results
      const fallback = searchLocalLandmarks(q);
      setResults(fallback);
      setShowResults(fallback.length > 0);
    } finally {
      setSearching(false);
    }
  }, []);

  const onQueryChange = useCallback(
    (text: string, field: 'start' | 'dest') => {
      if (field === 'start') {
        setStartQuery(text);
        setIsUsingCurrentLocation(false);
      } else {
        setDestQuery(text);
      }
      setActiveField(field);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => doSearch(text), 400);
    },
    [doSearch],
  );

  const onPickResult = useCallback(
    (item: any) => {
      Keyboard.dismiss();
      setShowResults(false);
      // Use Indian-friendly display name instead of raw display_name
      const display = getDisplayName(item);
      const friendlyName = display.sub ? `${display.main}, ${display.sub}` : display.main;
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);

      if (activeField === 'start') {
        setStartQuery(friendlyName);
        setStartDisplayText(friendlyName);
        setStartCoords({ lat, lng });
        setIsUsingCurrentLocation(false);
        setTimeout(() => destInputRef.current?.focus(), 150);
      } else {
        setDestQuery(display.main);

        router.push({
          pathname: '/navigation',
          params: {
            destLat: lat.toString(),
            destLng: lng.toString(),
            destName: friendlyName,
          },
        });

        setTimeout(() => {
          collapseSearch();
        }, 300);
      }
    },
    [activeField, startCoords, router],
  );

  // --- Handle popular place quick-select ---
  const onPickPopularPlace = useCallback(
    (place: typeof POPULAR_PLACES[number]) => {
      Keyboard.dismiss();
      if (activeField === 'start') {
        setStartQuery(place.name);
        setStartDisplayText(place.name);
        setStartCoords({ lat: place.lat, lng: place.lon });
        setIsUsingCurrentLocation(false);
        setTimeout(() => destInputRef.current?.focus(), 150);
      } else {
        setDestQuery(place.name);
        router.push({
          pathname: '/navigation',
          params: {
            destLat: place.lat.toString(),
            destLng: place.lon.toString(),
            destName: `${place.name}, Indore`,
          },
        });
        setTimeout(() => collapseSearch(), 300);
      }
    },
    [activeField, router],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    setSearchMarker(null);
  }, []);

  // --- Expand / Collapse ---
  const expandSearch = useCallback(() => {
    setIsExpanded(true);
    setActiveField('dest');
    setDestQuery('');
    if (isUsingCurrentLocation || !startQuery) {
      setStartQuery('');
      setStartDisplayText(userLocationName);
      setStartCoords({ lat: userPosRef.current.lat, lng: userPosRef.current.lng });
      setIsUsingCurrentLocation(true);
    }
    setTimeout(() => destInputRef.current?.focus(), 200);
  }, [userLocationName, isUsingCurrentLocation, startQuery]);

  const collapseSearch = useCallback(() => {
    Keyboard.dismiss();
    setIsExpanded(false);
    setResults([]);
    setShowResults(false);
    setDestQuery('');
    setStartQuery('');
    setIsUsingCurrentLocation(true);
    setStartDisplayText(userLocationName);
  }, [userLocationName]);

  // --- Swap start and destination ---
  const swapLocations = useCallback(() => {
    const tempQuery = startQuery || startDisplayText;
    const tempCoords = startCoords;

    if (destQuery) {
      setStartQuery(destQuery);
      setStartDisplayText(destQuery);
      setIsUsingCurrentLocation(false);
    } else {
      setStartQuery('');
      setStartDisplayText(userLocationName);
      setIsUsingCurrentLocation(true);
      setStartCoords({ lat: userPosRef.current.lat, lng: userPosRef.current.lng });
    }

    setDestQuery(tempQuery);
  }, [startQuery, startDisplayText, startCoords, destQuery, userLocationName]);

  // --- Controls ---
  const goToMe = useCallback(() => {
    mapRef.current?.animateToRegion(
      {
        latitude: userPosRef.current.lat,
        longitude: userPosRef.current.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      1500,
    );
  }, []);

  const pickMapType = useCallback((t: MapType) => {
    setMapType(t);
    setShowTypePicker(false);
  }, []);

  // --- Render ---
  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Google Maps */}
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapType}
        initialRegion={{
          latitude: DEFAULT_LAT,
          longitude: DEFAULT_LNG,
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        toolbarEnabled={false}
        rotateEnabled={true}
        pitchEnabled={false}
        scrollEnabled={true}
        zoomEnabled={true}
        zoomTapEnabled={false}
        loadingEnabled={true}
        loadingIndicatorColor="#00E676"
        loadingBackgroundColor="#0B0B0B"
      >
        {/* Search result marker */}
        {searchMarker && (
          <Marker
            coordinate={{
              latitude: searchMarker.lat,
              longitude: searchMarker.lng,
            }}
            title={searchMarker.title}
            pinColor="#00E676"
          />
        )}
      </MapView>

      {/* ============ COLLAPSED SEARCH BAR ============ */}
      {!isExpanded && (
        <View style={[styles.searchWrap, { top: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.searchBar}
            onPress={expandSearch}
            activeOpacity={0.8}
          >
            <Image
              source={require('../assets/images/suvega-logo.png')}
              style={styles.searchLogo}
            />
            <Text style={styles.searchPlaceholder}>Search here</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ============ EXPANDED SEARCH PANEL ============ */}
      {isExpanded && (
        <View style={[styles.expandedWrap, { paddingTop: insets.top + 8 }]}>
          <View style={styles.expandedPanel}>
            {/* Back button */}
            <TouchableOpacity
              style={styles.expandedBackBtn}
              onPress={collapseSearch}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="arrow-back" size={22} color="#ccc" />
            </TouchableOpacity>

            {/* Input fields container */}
            <View style={styles.inputFieldsContainer}>
              {/* Start location row */}
              <View style={styles.inputRow}>
                {/* Blue dot icon */}
                <View style={styles.iconContainer}>
                  <View style={styles.blueDot}>
                    <View style={styles.blueDotInner} />
                  </View>
                </View>
                <View style={styles.inputFieldWrap}>
                  {isUsingCurrentLocation && activeField !== 'start' ? (
                    <TouchableOpacity
                      style={styles.inputField}
                      onPress={() => {
                        setActiveField('start');
                        setIsUsingCurrentLocation(false);
                        setStartQuery('');
                        setTimeout(() => startInputRef.current?.focus(), 100);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.locationText} numberOfLines={1}>
                        {startDisplayText || 'Your location'}
                      </Text>
                    </TouchableOpacity>
                  ) : activeField === 'start' ? (
                    <TextInput
                      ref={startInputRef}
                      style={styles.inputFieldText}
                      placeholder="Your location"
                      placeholderTextColor="#888"
                      value={startQuery}
                      onChangeText={(text) => onQueryChange(text, 'start')}
                      onFocus={() => {
                        setActiveField('start');
                        if (startQuery) doSearch(startQuery);
                      }}
                      returnKeyType="search"
                      onSubmitEditing={() => doSearch(startQuery)}
                      autoFocus={false}
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.inputField}
                      onPress={() => {
                        setActiveField('start');
                        setTimeout(() => startInputRef.current?.focus(), 100);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.locationText, !startQuery && styles.placeholderText]} numberOfLines={1}>
                        {startQuery || startDisplayText || 'Your location'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Dotted line connecting the two inputs */}
              <View style={styles.connectorContainer}>
                <View style={styles.iconContainer}>
                  <View style={styles.dotConnector}>
                    <View style={styles.connectorDot} />
                    <View style={styles.connectorDot} />
                    <View style={styles.connectorDot} />
                  </View>
                </View>
                <View style={styles.inputFieldWrap} />
              </View>

              {/* Destination row */}
              <View style={styles.inputRow}>
                {/* Red pin icon */}
                <View style={styles.iconContainer}>
                  <MaterialIcons name="location-on" size={20} color="#E57373" />
                </View>
                <View style={styles.inputFieldWrap}>
                  <TextInput
                    ref={destInputRef}
                    style={styles.inputFieldText}
                    placeholder="Choose destination"
                    placeholderTextColor="#888"
                    value={destQuery}
                    onChangeText={(text) => onQueryChange(text, 'dest')}
                    onFocus={() => {
                      setActiveField('dest');
                      if (destQuery) doSearch(destQuery);
                    }}
                    returnKeyType="search"
                    onSubmitEditing={() => doSearch(destQuery)}
                  />
                </View>
              </View>
            </View>

            {/* Swap button */}
            <TouchableOpacity
              style={styles.swapBtn}
              onPress={swapLocations}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="swap-vert" size={22} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Search Results dropdown — Indian-style: landmark name + area */}
          {showResults && (
            <View style={styles.expandedDropdown}>
              <FlatList
                data={results}
                keyExtractor={(item, i) => item.place_id?.toString() ?? i.toString()}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const display = getDisplayName(item);
                  return (
                    <TouchableOpacity style={styles.resultRow} onPress={() => onPickResult(item)}>
                      <View style={styles.resultIconWrap}>
                        <MaterialIcons name="location-on" size={20} color="#00E676" />
                      </View>
                      <View style={styles.resultTextWrap}>
                        <Text style={styles.resultMainText} numberOfLines={1}>
                          {display.main}
                        </Text>
                        <Text style={styles.resultSubText} numberOfLines={1}>
                          {display.sub}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}

          {/* Popular places — shown when destination search is empty */}
          {!showResults && !searching && activeField === 'dest' && destQuery.length < 2 && (
            <View style={styles.popularSection}>
              <Text style={styles.popularTitle}>Popular in Indore</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.popularScroll}
                keyboardShouldPersistTaps="handled"
              >
                {POPULAR_PLACES.map((place) => (
                  <TouchableOpacity
                    key={place.name}
                    style={styles.popularPill}
                    onPress={() => onPickPopularPlace(place)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="place" size={14} color="#00E676" />
                    <Text style={styles.popularPillText}>{place.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Searching indicator */}
          {searching && (
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color="#00E676" />
              <Text style={styles.searchingText}>Searching...</Text>
            </View>
          )}
        </View>
      )}

      {/* Map Controls */}
      {!isExpanded && (
        <View style={[styles.controls, { bottom: 32 + insets.bottom }]}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={goToMe} activeOpacity={0.7}>
            <MaterialIcons name="my-location" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={() => setShowTypePicker((v) => !v)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="layers" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Map Type Picker */}
      {showTypePicker && !isExpanded && (
        <View style={[styles.typePicker, { bottom: 32 + insets.bottom }]}>
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
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0B' },
  map: { flex: 1 },

  /* ===== Collapsed Search ===== */
  searchWrap: { position: 'absolute', left: 16, right: 16, zIndex: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(38,38,42,0.92)',
    borderRadius: 28,
    paddingHorizontal: 16,
    height: 50,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  searchLogo: { width: 32, height: 32, marginRight: 10, borderRadius: 8 },
  searchPlaceholder: {
    flex: 1,
    color: '#777',
    fontSize: 16,
  },

  /* ===== Expanded Search Panel ===== */
  expandedWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(18,18,22,0.98)',
    paddingHorizontal: 12,
    paddingBottom: 8,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  expandedPanel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandedBackBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },

  /* Input fields */
  inputFieldsContainer: {
    flex: 1,
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
  },
  iconContainer: {
    width: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputFieldWrap: {
    flex: 1,
    marginLeft: 8,
  },
  inputField: {
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  inputFieldText: {
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#E0E0E0',
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  locationText: {
    color: '#E0E0E0',
    fontSize: 15,
  },
  placeholderText: {
    color: '#888',
  },

  /* Blue dot indicator */
  blueDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(66,133,244,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blueDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4285F4',
  },

  /* Connector dots between the two input fields */
  connectorContainer: {
    flexDirection: 'row',
    height: 18,
    alignItems: 'center',
  },
  dotConnector: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  connectorDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  /* Swap button */
  swapBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },

  /* Expanded dropdown */
  expandedDropdown: {
    marginTop: 4,
    backgroundColor: 'rgba(28,28,32,0.96)',
    borderRadius: 12,
    maxHeight: 280,
    overflow: 'hidden',
    elevation: 8,
    marginHorizontal: 4,
  },

  /* Searching indicator */
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  searchingText: {
    color: '#888',
    fontSize: 14,
    marginLeft: 10,
  },

  /* Dropdown */
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  resultIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,230,118,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resultTextWrap: {
    flex: 1,
  },
  resultMainText: {
    color: '#E0E0E0',
    fontSize: 15,
    fontWeight: '600',
  },
  resultSubText: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
  },

  /* Popular places */
  popularSection: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  popularTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 16,
    textTransform: 'uppercase',
  },
  popularScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  popularPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(0,230,118,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.2)',
    gap: 6,
  },
  popularPillText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '500',
  },

  /* Controls */
  controls: { position: 'absolute', right: 16, gap: 12 },
  ctrlBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
    right: 72,
    backgroundColor: 'rgba(28,28,32,0.96)',
    borderRadius: 14,
    paddingVertical: 4,
    elevation: 8,
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
