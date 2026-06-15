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
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();

  const [userLat, setUserLat] = useState(DEFAULT_LAT);
  const [userLng, setUserLng] = useState(DEFAULT_LNG);
  const [hasUserLocation, setHasUserLocation] = useState(false);

  // Search
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

  // --- Location ---
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      setUserLat(latitude);
      setUserLng(longitude);
      setHasUserLocation(true);

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
    })();
  }, []);

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
    (text: string) => {
      setQuery(text);
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
      setQuery(name);

      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      setSearchMarker({ lat, lng, title: name });

      mapRef.current?.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1200,
      );
    },
    [],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    setSearchMarker(null);
  }, []);

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

      {/* Search Bar */}
      <View style={[styles.searchWrap, { top: insets.top + 12 }]}>
        <View style={styles.searchBar}>
          <Image
            source={require('../assets/images/suvega-logo.png')}
            style={styles.searchLogo}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search here"
            placeholderTextColor="#777"
            value={query}
            onChangeText={onQueryChange}
            onFocus={() => results.length > 0 && setShowResults(true)}
            returnKeyType="search"
            onSubmitEditing={() => doSearch(query)}
          />
          {searching && (
            <ActivityIndicator size="small" color="#00E676" style={{ marginLeft: 8 }} />
          )}
          {query.length > 0 && !searching && (
            <TouchableOpacity
              onPress={clearSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>

        {/* Results dropdown */}
        {showResults && (
          <View style={styles.dropdown}>
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
      </View>

      {/* Map Controls */}
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

      {/* Map Type Picker */}
      {showTypePicker && (
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

  /* Search */
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
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: 50 },
  searchLogo: { width: 32, height: 32, marginRight: 10, borderRadius: 8 },

  /* Dropdown */
  dropdown: {
    marginTop: 6,
    backgroundColor: 'rgba(28,28,32,0.96)',
    borderRadius: 16,
    maxHeight: 220,
    overflow: 'hidden',
    elevation: 8,
  },
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
