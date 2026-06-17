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

  const [userLat, setUserLat] = useState(DEFAULT_LAT);
  const [userLng, setUserLng] = useState(DEFAULT_LNG);
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

  // --- GPS warm-up: start tracking early so satellite lock is ready before navigation ---
  const gpsWarmupRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // Get initial position with best accuracy
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const { latitude, longitude } = loc.coords;
      setUserLat(latitude);
      setUserLng(longitude);
      setHasUserLocation(true);
      setStartCoords({ lat: latitude, lng: longitude });

      // Reverse geocode to get location name
      reverseGeocode(latitude, longitude);

      // Animate to user location
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        1500,
      );

      // Start GPS warm-up subscription — this keeps the GPS chip active
      // so it has a full satellite lock by the time navigation starts.
      // Uses BestForNavigation accuracy to prime the highest-quality fix.
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (newLoc) => {
          // Only accept readings with good accuracy (≤20m)
          if (newLoc.coords.accuracy !== null && newLoc.coords.accuracy > 20) return;
          setUserLat(newLoc.coords.latitude);
          setUserLng(newLoc.coords.longitude);
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

  // --- Nominatim Search ---
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    try {
      // Bounded search first
      const bounded = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&viewbox=75.65,22.85,76.05,22.55&bounded=1&limit=5&addressdetails=1`;
      let res = await fetch(bounded, {
        headers: { 'User-Agent': 'SuvegaApp/1.0' },
      });
      let data = await res.json();

      // Fallback: wider India search
      if (data.length === 0) {
        const wide = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&limit=5&addressdetails=1`;
        res = await fetch(wide, {
          headers: { 'User-Agent': 'SuvegaApp/1.0' },
        });
        data = await res.json();
      }

      setResults(data);
      setShowResults(data.length > 0);
    } catch {
      setResults([]);
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
      const name = item.display_name.split(',').slice(0, 2).join(', ');
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);

      if (activeField === 'start') {
        setStartQuery(name);
        setStartDisplayText(name);
        setStartCoords({ lat, lng });
        setIsUsingCurrentLocation(false);
        // Auto-focus destination after picking start
        setTimeout(() => destInputRef.current?.focus(), 150);
      } else {
        setDestQuery(name);

        // Navigate to navigation screen with start and destination
        const originLat = startCoords?.lat ?? userLat;
        const originLng = startCoords?.lng ?? userLng;

        router.push({
          pathname: '/navigation',
          params: {
            destLat: lat.toString(),
            destLng: lng.toString(),
            destName: name,
          },
        });

        // Reset after navigation
        setTimeout(() => {
          collapseSearch();
        }, 300);
      }
    },
    [activeField, startCoords, userLat, userLng, router],
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
    // Reset destination
    setDestQuery('');
    // Set start to current location
    if (isUsingCurrentLocation || !startQuery) {
      setStartQuery('');
      setStartDisplayText(userLocationName);
      setStartCoords({ lat: userLat, lng: userLng });
      setIsUsingCurrentLocation(true);
    }
    setTimeout(() => destInputRef.current?.focus(), 200);
  }, [userLocationName, userLat, userLng, isUsingCurrentLocation, startQuery]);

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

    // Set start to what was destination
    if (destQuery) {
      setStartQuery(destQuery);
      setStartDisplayText(destQuery);
      setIsUsingCurrentLocation(false);
      // Note: we don't have destCoords stored separately, so we leave startCoords
    } else {
      setStartQuery('');
      setStartDisplayText(userLocationName);
      setIsUsingCurrentLocation(true);
      setStartCoords({ lat: userLat, lng: userLng });
    }

    // Set destination to what was start
    setDestQuery(tempQuery);
  }, [startQuery, startDisplayText, startCoords, destQuery, userLocationName, userLat, userLng]);

  // --- Controls ---
  const goToMe = useCallback(() => {
    mapRef.current?.animateToRegion(
      {
        latitude: userLat,
        longitude: userLng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      1500,
    );
  }, [userLat, userLng]);

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
        showsCompass={false}
        toolbarEnabled={false}
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

          {/* Search Results dropdown */}
          {showResults && (
            <View style={styles.expandedDropdown}>
              <FlatList
                data={results}
                keyExtractor={(item, i) => item.place_id?.toString() ?? i.toString()}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.resultRow} onPress={() => onPickResult(item)}>
                    <MaterialIcons name="location-on" size={18} color="#00E676" />
                    <Text style={styles.resultText} numberOfLines={2}>
                      {item.display_name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
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
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  resultText: { color: '#ccc', fontSize: 14, marginLeft: 10, flex: 1 },

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
