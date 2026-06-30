// services/indorePlaces.ts
// Comprehensive Indore places database for hyper-local search
// Coordinates sourced from geocords.com, mapcarta, google maps, housing.com

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------
export type PlaceCategory =
  | 'area'      // Sub-localities, colonies, schemes
  | 'food'      // Restaurants, food chains, street food
  | 'shop'      // Markets, retail stores, supermarkets
  | 'school'    // Schools, colleges, universities
  | 'gym'       // Gyms, fitness centers
  | 'apartment' // Apartments, buildings, societies
  | 'landmark'  // Squares, parks, monuments
  | 'hospital'  // Hospitals, clinics
  | 'transport' // Railway, bus stands, airport
  | 'temple'    // Temples, religious places
  | 'mall';     // Shopping malls

interface IndorePlace {
  name: string;
  area: string;
  lat: number;
  lon: number;
  cat: PlaceCategory;
  kw: string[];
}

/** Category chips shown in the search UI for quick filtering */
export const CATEGORY_CHIPS: Array<{ id: PlaceCategory; label: string; icon: string }> = [
  { id: 'food', label: 'Food', icon: 'restaurant' },
  { id: 'shop', label: 'Shopping', icon: 'store' },
  { id: 'school', label: 'Education', icon: 'school' },
  { id: 'gym', label: 'Fitness', icon: 'fitness-center' },
  { id: 'area', label: 'Areas', icon: 'location-city' },
  { id: 'mall', label: 'Malls', icon: 'local-mall' },
  { id: 'hospital', label: 'Health', icon: 'local-hospital' },
];

/** Map a place category to a MaterialIcons icon name */
export const getCategoryIcon = (cat?: string): string => {
  switch (cat) {
    case 'food': return 'restaurant';
    case 'shop': return 'store';
    case 'school': return 'school';
    case 'gym': return 'fitness-center';
    case 'apartment': return 'apartment';
    case 'hospital': return 'local-hospital';
    case 'transport': return 'directions-bus';
    case 'temple': return 'account-balance';
    case 'mall': return 'local-mall';
    case 'area': return 'location-city';
    case 'landmark': return 'place';
    default: return 'location-on';
  }
};

// ---------------------------------------------------------------------------
// Format helper — produces Nominatim-compatible result objects
// ---------------------------------------------------------------------------
const formatResult = (place: IndorePlace) => ({
  lat: place.lat.toString(),
  lon: place.lon.toString(),
  place_id: `local_${place.name.replace(/\s/g, '_')}`,
  name: place.name,
  display_name: `${place.name}, ${place.area}, Indore`,
  namedetails: { name: place.name },
  address: { suburb: place.area, city: 'Indore' },
  _isLocal: true,
  _category: place.cat,
});

// =====================================================================
// PLACES DATABASE — ~200 entries
// =====================================================================
const PLACES: IndorePlace[] = [
  // ==================== NAKAS & SQUARES ====================
  { name: 'Dewas Naka', area: 'Indore', lat: 22.7814, lon: 75.9035, cat: 'landmark', kw: ['dewas', 'naka'] },
  { name: 'Bhawarkuan Square', area: 'Indore', lat: 22.7422, lon: 75.8917, cat: 'landmark', kw: ['bhawarkuan', 'bhanwarkuan', 'bhanwar', 'square'] },
  { name: 'Geeta Bhawan Square', area: 'Indore', lat: 22.7184, lon: 75.8843, cat: 'landmark', kw: ['geeta', 'bhawan', 'chowk', 'chauraha'] },
  { name: 'LIG Square', area: 'Indore', lat: 22.7377, lon: 75.8882, cat: 'landmark', kw: ['lig', 'square'] },
  { name: 'Pipliyahana Square', area: 'Indore', lat: 22.7060, lon: 75.9059, cat: 'landmark', kw: ['pipliyahana', 'pipliya', 'square'] },
  { name: 'Mhow Naka', area: 'Indore', lat: 22.7000, lon: 75.8300, cat: 'landmark', kw: ['mhow', 'naka'] },
  { name: 'Radisson Square', area: 'Indore', lat: 22.7230, lon: 75.9050, cat: 'landmark', kw: ['radisson', 'square'] },
  { name: 'Bombay Hospital Square', area: 'Ring Road', lat: 22.7568, lon: 75.9037, cat: 'landmark', kw: ['bombay', 'hospital', 'square'] },
  { name: 'Niranjanpur Square', area: 'Indore', lat: 22.7783, lon: 75.8854, cat: 'landmark', kw: ['niranjanpur', 'niranjan', 'square'] },
  { name: 'Bengali Square', area: 'Indore', lat: 22.7081, lon: 75.9229, cat: 'landmark', kw: ['bengali', 'square'] },
  { name: 'Palasia Square', area: 'Indore', lat: 22.7185, lon: 75.8840, cat: 'landmark', kw: ['palasia', 'square', 'chauraha'] },
  { name: 'Treasure Island Square', area: 'MG Road', lat: 22.7215, lon: 75.8790, cat: 'landmark', kw: ['treasure', 'island', 'square', 'ti'] },
  { name: 'Hira Nagar Square', area: 'Indore', lat: 22.7450, lon: 75.8800, cat: 'landmark', kw: ['hira', 'nagar', 'square'] },
  { name: 'Navlakha Square', area: 'Indore', lat: 22.7280, lon: 75.8760, cat: 'landmark', kw: ['navlakha', 'square'] },
  { name: 'MR 9 Square', area: 'Indore', lat: 22.7400, lon: 75.9200, cat: 'landmark', kw: ['mr9', 'mr 9', 'square'] },
  { name: 'Sukhliya Square', area: 'Indore', lat: 22.7350, lon: 75.9000, cat: 'landmark', kw: ['sukhliya', 'square'] },

  // ==================== SUB-LOCALITIES & COLONIES ====================
  { name: 'Vijay Nagar', area: 'Indore', lat: 22.7603, lon: 75.8863, cat: 'area', kw: ['vijay', 'nagar', 'vn'] },
  { name: 'Palasia', area: 'Indore', lat: 22.7167, lon: 75.8833, cat: 'area', kw: ['palasia'] },
  { name: 'New Palasia', area: 'Indore', lat: 22.7200, lon: 75.8810, cat: 'area', kw: ['new', 'palasia'] },
  { name: 'Old Palasia', area: 'Indore', lat: 22.7150, lon: 75.8850, cat: 'area', kw: ['old', 'palasia'] },
  { name: 'Sapna Sangeeta', area: 'Indore', lat: 22.7253, lon: 75.8656, cat: 'area', kw: ['sapna', 'sangeeta'] },
  { name: 'Nipania', area: 'Indore', lat: 22.7710, lon: 75.8997, cat: 'area', kw: ['nipania'] },
  { name: 'Lasudia Mori', area: 'Indore', lat: 22.7530, lon: 75.8260, cat: 'area', kw: ['lasudia', 'mori', 'lasudiya'] },
  { name: 'Musakhedi', area: 'Indore', lat: 22.7280, lon: 75.8430, cat: 'area', kw: ['musakhedi'] },
  { name: 'Nanda Nagar', area: 'Indore', lat: 22.7340, lon: 75.8560, cat: 'area', kw: ['nanda', 'nagar'] },
  { name: 'Saket Nagar', area: 'Indore', lat: 22.7420, lon: 75.8810, cat: 'area', kw: ['saket', 'nagar'] },
  { name: 'MIG Colony', area: 'Indore', lat: 22.7290, lon: 75.8590, cat: 'area', kw: ['mig', 'colony'] },
  { name: 'Rajendra Nagar', area: 'Indore', lat: 22.7050, lon: 75.8570, cat: 'area', kw: ['rajendra', 'nagar'] },
  { name: 'Agrawal Nagar', area: 'Indore', lat: 22.7080, lon: 75.8820, cat: 'area', kw: ['agrawal', 'nagar'] },
  { name: 'Banganga', area: 'Indore', lat: 22.7130, lon: 75.8540, cat: 'area', kw: ['banganga'] },
  { name: 'Scheme No. 54', area: 'Vijay Nagar', lat: 22.7507, lon: 75.8956, cat: 'area', kw: ['scheme 54', 'scheme54', '54'] },
  { name: 'Scheme No. 74', area: 'Vijay Nagar', lat: 22.7540, lon: 75.8880, cat: 'area', kw: ['scheme 74', 'scheme74', '74'] },
  { name: 'Scheme No. 78', area: 'Vijay Nagar', lat: 22.7648, lon: 75.8976, cat: 'area', kw: ['scheme 78', 'scheme78', '78'] },
  { name: 'Scheme No. 94', area: 'Indore', lat: 22.7600, lon: 75.9020, cat: 'area', kw: ['scheme 94', 'scheme94', '94'] },
  { name: 'Scheme No. 114', area: 'Indore', lat: 22.7660, lon: 75.9050, cat: 'area', kw: ['scheme 114', 'scheme114', '114'] },
  { name: 'Scheme No. 140', area: 'Indore', lat: 22.7089, lon: 75.9127, cat: 'area', kw: ['scheme 140', 'scheme140', '140'] },
  { name: 'Nehru Nagar', area: 'Indore', lat: 22.7100, lon: 75.8670, cat: 'area', kw: ['nehru', 'nagar'] },
  { name: 'Manorama Ganj', area: 'Indore', lat: 22.7230, lon: 75.8750, cat: 'area', kw: ['manorama', 'ganj'] },
  { name: 'South Tukoganj', area: 'Indore', lat: 22.7190, lon: 75.8770, cat: 'area', kw: ['south', 'tukoganj'] },
  { name: 'Tukoganj', area: 'Indore', lat: 22.7210, lon: 75.8780, cat: 'area', kw: ['tukoganj'] },
  { name: 'Pardeshipura', area: 'Indore', lat: 22.7280, lon: 75.8650, cat: 'area', kw: ['pardeshipura'] },
  { name: 'Chandan Nagar', area: 'Indore', lat: 22.7350, lon: 75.9100, cat: 'area', kw: ['chandan', 'nagar'] },
  { name: 'Pigdambar', area: 'Indore', lat: 22.6950, lon: 75.8650, cat: 'area', kw: ['pigdambar'] },
  { name: 'Juni Indore', area: 'Indore', lat: 22.7170, lon: 75.8600, cat: 'area', kw: ['juni', 'old', 'indore'] },
  { name: 'Chhoti Gwaltoli', area: 'Indore', lat: 22.7150, lon: 75.8570, cat: 'area', kw: ['chhoti', 'gwaltoli'] },
  { name: 'Bicholi Mardana', area: 'Indore', lat: 22.6984, lon: 75.9292, cat: 'area', kw: ['bicholi', 'mardana'] },
  { name: 'Bicholi Hapsi', area: 'Indore', lat: 22.7161, lon: 75.9386, cat: 'area', kw: ['bicholi', 'hapsi'] },
  { name: 'Khajrana', area: 'Indore', lat: 22.7312, lon: 75.9081, cat: 'area', kw: ['khajrana'] },
  { name: 'Silicon City', area: 'Indore', lat: 22.6420, lon: 75.8353, cat: 'area', kw: ['silicon', 'city'] },
  { name: 'Super Corridor', area: 'Indore', lat: 22.7597, lon: 75.8177, cat: 'area', kw: ['super', 'corridor'] },
  { name: 'Kanadia Road', area: 'Indore', lat: 22.7205, lon: 75.9060, cat: 'area', kw: ['kanadia', 'road'] },
  { name: 'Bypass Road', area: 'Indore', lat: 22.7300, lon: 75.9200, cat: 'area', kw: ['bypass', 'road'] },
  { name: 'Ring Road', area: 'Indore', lat: 22.7350, lon: 75.8600, cat: 'area', kw: ['ring', 'road'] },
  { name: 'Sudama Nagar', area: 'Indore', lat: 22.6953, lon: 75.8361, cat: 'area', kw: ['sudama', 'nagar'] },
  { name: 'Annapurna Road', area: 'Indore', lat: 22.6901, lon: 75.8379, cat: 'area', kw: ['annapurna', 'road'] },
  { name: 'Sneh Nagar', area: 'Indore', lat: 22.7120, lon: 75.8780, cat: 'area', kw: ['sneh', 'nagar'] },
  { name: 'Mahalaxmi Nagar', area: 'Indore', lat: 22.7602, lon: 75.9120, cat: 'area', kw: ['mahalaxmi', 'mahalakshmi', 'nagar'] },
  { name: 'Tilak Nagar', area: 'Indore', lat: 22.7184, lon: 75.8987, cat: 'area', kw: ['tilak', 'nagar'] },
  { name: 'Rau', area: 'Indore', lat: 22.6317, lon: 75.7995, cat: 'area', kw: ['rau'] },
  { name: 'AB Road', area: 'Indore', lat: 22.7230, lon: 75.8700, cat: 'area', kw: ['ab', 'road', 'agra', 'bombay'] },
  { name: 'MG Road', area: 'Indore', lat: 22.7180, lon: 75.8720, cat: 'area', kw: ['mg', 'road', 'mahatma', 'gandhi'] },
  { name: 'Race Course Road', area: 'Indore', lat: 22.7140, lon: 75.8600, cat: 'area', kw: ['race', 'course', 'road'] },
  { name: 'Khandwa Road', area: 'Indore', lat: 22.6900, lon: 75.8700, cat: 'area', kw: ['khandwa', 'road'] },
  { name: 'Aerodrome Road', area: 'Indore', lat: 22.7150, lon: 75.8100, cat: 'area', kw: ['aerodrome', 'road'] },
  { name: 'Guru Kripa Colony', area: 'Indore', lat: 22.7395, lon: 75.8870, cat: 'area', kw: ['guru', 'kripa', 'colony'] },
  { name: 'Sukhliya', area: 'Indore', lat: 22.7350, lon: 75.9010, cat: 'area', kw: ['sukhliya'] },
  { name: 'MR 10', area: 'Indore', lat: 22.7466, lon: 75.9364, cat: 'area', kw: ['mr10', 'mr 10'] },
  { name: 'Bhawarkuan', area: 'Indore', lat: 22.7422, lon: 75.8917, cat: 'area', kw: ['bhawarkuan', 'bhanwarkuan'] },
  { name: 'Chhawni', area: 'Indore', lat: 22.7200, lon: 75.8500, cat: 'area', kw: ['chhawni', 'cantonment'] },
  { name: 'Ranjit Hanuman', area: 'Indore', lat: 22.7080, lon: 75.8470, cat: 'area', kw: ['ranjit', 'hanuman'] },
  { name: 'Dhar Road', area: 'Indore', lat: 22.7400, lon: 75.8300, cat: 'area', kw: ['dhar', 'road'] },
  { name: 'Ujjain Road', area: 'Indore', lat: 22.7800, lon: 75.8900, cat: 'area', kw: ['ujjain', 'road'] },

  // ==================== FOOD CHAINS & RESTAURANTS ====================
  { name: 'KFC Vijay Nagar', area: 'Vijay Nagar', lat: 22.7560, lon: 75.8900, cat: 'food', kw: ['kfc', 'kentucky', 'fried', 'chicken'] },
  { name: 'KFC Sapna Sangeeta', area: 'Sapna Sangeeta', lat: 22.7255, lon: 75.8660, cat: 'food', kw: ['kfc', 'kentucky', 'fried', 'chicken'] },
  { name: 'KFC C21 Mall', area: 'C21 Mall', lat: 22.7442, lon: 75.8945, cat: 'food', kw: ['kfc', 'kentucky', 'fried', 'chicken'] },
  { name: "McDonald's Vijay Nagar", area: 'Vijay Nagar', lat: 22.7570, lon: 75.8910, cat: 'food', kw: ['mcdonalds', 'mcd', 'mcds', 'burger'] },
  { name: "McDonald's C21 Mall", area: 'C21 Mall', lat: 22.7440, lon: 75.8945, cat: 'food', kw: ['mcdonalds', 'mcd', 'mcds', 'burger'] },
  { name: "McDonald's Sapna Sangeeta", area: 'Sapna Sangeeta', lat: 22.7250, lon: 75.8655, cat: 'food', kw: ['mcdonalds', 'mcd', 'mcds', 'burger'] },
  { name: "Domino's Vijay Nagar", area: 'Vijay Nagar', lat: 22.7580, lon: 75.8890, cat: 'food', kw: ['dominos', 'pizza'] },
  { name: "Domino's Palasia", area: 'Palasia', lat: 22.7170, lon: 75.8835, cat: 'food', kw: ['dominos', 'pizza'] },
  { name: 'Burger King C21', area: 'C21 Mall', lat: 22.7438, lon: 75.8943, cat: 'food', kw: ['burger', 'king', 'bk'] },
  { name: 'Pizza Hut Vijay Nagar', area: 'Vijay Nagar', lat: 22.7575, lon: 75.8895, cat: 'food', kw: ['pizza', 'hut'] },
  { name: 'Subway Vijay Nagar', area: 'Vijay Nagar', lat: 22.7565, lon: 75.8905, cat: 'food', kw: ['subway', 'sandwich'] },
  { name: "Haldiram's", area: 'Sapna Sangeeta', lat: 22.7260, lon: 75.8650, cat: 'food', kw: ['haldirams', 'haldiram', 'namkeen', 'sweets'] },
  { name: 'Chappan Dukan', area: 'New Palasia', lat: 22.7230, lon: 75.8680, cat: 'food', kw: ['chappan', 'dukan', '56', 'shops', 'street', 'food'] },
  { name: 'Sarafa Bazaar', area: 'Rajwada', lat: 22.7190, lon: 75.8580, cat: 'food', kw: ['sarafa', 'bazaar', 'street', 'food', 'night', 'market'] },
  { name: 'Nafees Restaurant', area: 'Chhoti Gwaltoli', lat: 22.7155, lon: 75.8575, cat: 'food', kw: ['nafees', 'restaurant', 'biryani'] },
  { name: 'Apna Sweets', area: 'Sapna Sangeeta', lat: 22.7245, lon: 75.8645, cat: 'food', kw: ['apna', 'sweets', 'mithai'] },
  { name: 'Johny Hot Dog', area: 'Sarafa', lat: 22.7192, lon: 75.8578, cat: 'food', kw: ['johny', 'hot', 'dog'] },
  { name: 'Young Tarang', area: 'Chappan Dukan', lat: 22.7228, lon: 75.8682, cat: 'food', kw: ['young', 'tarang'] },
  { name: 'Shreemaya Celebration', area: 'RNT Marg', lat: 22.7230, lon: 75.8710, cat: 'food', kw: ['shreemaya', 'celebration', 'restaurant'] },
  { name: 'Barbeque Nation', area: 'Vijay Nagar', lat: 22.7555, lon: 75.8895, cat: 'food', kw: ['barbeque', 'bbq', 'nation'] },
  { name: 'Joshi Dahi Bada House', area: 'Sarafa', lat: 22.7195, lon: 75.8575, cat: 'food', kw: ['joshi', 'dahi', 'bada'] },
  { name: 'Madhuram Sweets', area: 'Vijay Nagar', lat: 22.7570, lon: 75.8870, cat: 'food', kw: ['madhuram', 'sweets', 'mithai'] },
  { name: 'Celebration Restaurant', area: 'Race Course Road', lat: 22.7145, lon: 75.8605, cat: 'food', kw: ['celebration', 'restaurant'] },
  { name: 'Cafe Jeera', area: 'Vijay Nagar', lat: 22.7590, lon: 75.8880, cat: 'food', kw: ['cafe', 'jeera'] },
  { name: 'Curewell Bakery', area: 'Sneh Nagar', lat: 22.7125, lon: 75.8785, cat: 'food', kw: ['curewell', 'bakery', 'cafe'] },

  // ==================== SHOPPING & MARKETS ====================
  { name: 'Fayda Bazar', area: 'Vijay Nagar', lat: 22.7580, lon: 75.8870, cat: 'shop', kw: ['fayda', 'bazar', 'bazaar', 'wholesale'] },
  { name: 'D-Mart Vijay Nagar', area: 'Vijay Nagar', lat: 22.7550, lon: 75.8850, cat: 'shop', kw: ['dmart', 'd-mart', 'mart', 'supermarket'] },
  { name: 'D-Mart Bengali Square', area: 'Bengali Square', lat: 22.7080, lon: 75.9230, cat: 'shop', kw: ['dmart', 'd-mart', 'mart', 'supermarket'] },
  { name: 'D-Mart Bhawarkuan', area: 'Bhawarkuan', lat: 22.7430, lon: 75.8920, cat: 'shop', kw: ['dmart', 'd-mart', 'mart', 'supermarket'] },
  { name: 'D-Mart Super Corridor', area: 'Super Corridor', lat: 22.7595, lon: 75.8180, cat: 'shop', kw: ['dmart', 'd-mart', 'mart', 'supermarket'] },
  { name: 'Reliance Smart', area: 'Vijay Nagar', lat: 22.7540, lon: 75.8860, cat: 'shop', kw: ['reliance', 'smart', 'supermarket'] },
  { name: 'Big Bazaar', area: 'Treasure Island', lat: 22.7210, lon: 75.8785, cat: 'shop', kw: ['big', 'bazaar', 'bazar'] },
  { name: 'MT Cloth Market', area: 'Juni Indore', lat: 22.7180, lon: 75.8590, cat: 'shop', kw: ['mt', 'cloth', 'market', 'kapda'] },
  { name: 'Sitlamata Bazaar', area: 'Indore', lat: 22.7170, lon: 75.8570, cat: 'shop', kw: ['sitlamata', 'bazaar', 'bazar'] },
  { name: 'Topkhana Market', area: 'Indore', lat: 22.7200, lon: 75.8560, cat: 'shop', kw: ['topkhana', 'market'] },
  { name: 'Kotwali Market', area: 'Indore', lat: 22.7190, lon: 75.8570, cat: 'shop', kw: ['kotwali', 'market'] },
  { name: 'Malwa Mill Cloth Market', area: 'Indore', lat: 22.7175, lon: 75.8585, cat: 'shop', kw: ['malwa', 'mill', 'cloth'] },
  { name: 'Vishal Mega Mart', area: 'Vijay Nagar', lat: 22.7560, lon: 75.8870, cat: 'shop', kw: ['vishal', 'mega', 'mart'] },
  { name: 'More Supermarket', area: 'Scheme 54', lat: 22.7510, lon: 75.8960, cat: 'shop', kw: ['more', 'supermarket'] },
  { name: 'Sabji Mandi', area: 'Manorama Ganj', lat: 22.7225, lon: 75.8745, cat: 'shop', kw: ['sabji', 'mandi', 'vegetable', 'market'] },

  // ==================== MALLS ====================
  { name: 'C21 Mall', area: 'Vijay Nagar', lat: 22.7440, lon: 75.8943, cat: 'mall', kw: ['c21', 'mall'] },
  { name: 'Treasure Island Mall', area: 'MG Road', lat: 22.7210, lon: 75.8785, cat: 'mall', kw: ['treasure', 'island', 'ti', 'mall'] },
  { name: 'Mangal City Mall', area: 'Vijay Nagar', lat: 22.7525, lon: 75.8965, cat: 'mall', kw: ['mangal', 'city', 'mall'] },
  { name: 'Phoenix Citadel', area: 'MR 10 Road', lat: 22.7466, lon: 75.9364, cat: 'mall', kw: ['phoenix', 'citadel'] },
  { name: 'Central Mall (Nexus)', area: 'RNT Marg', lat: 22.7180, lon: 75.8710, cat: 'mall', kw: ['central', 'mall', 'nexus'] },
  { name: 'Orbit Mall', area: 'Scheme 54', lat: 22.7455, lon: 75.8943, cat: 'mall', kw: ['orbit', 'mall'] },
  { name: 'DB City Mall', area: 'Arandia', lat: 22.7230, lon: 75.8680, cat: 'mall', kw: ['db', 'city', 'mall'] },
  { name: 'Malhar Mega Mall', area: 'AB Road', lat: 22.7240, lon: 75.8720, cat: 'mall', kw: ['malhar', 'mega', 'mall'] },

  // ==================== SCHOOLS ====================
  { name: 'Daly College', area: 'Indore', lat: 22.7120, lon: 75.8530, cat: 'school', kw: ['daly', 'college', 'school'] },
  { name: 'Choithram School', area: 'Manik Bagh Road', lat: 22.6885, lon: 75.8544, cat: 'school', kw: ['choithram', 'school'] },
  { name: "St. Raphael's School", area: 'Palasia', lat: 22.7190, lon: 75.8730, cat: 'school', kw: ['raphael', 'school', 'st'] },
  { name: 'Delhi Public School', area: 'AB Road', lat: 22.7500, lon: 75.8800, cat: 'school', kw: ['dps', 'delhi', 'public', 'school'] },
  { name: 'Emerald Heights School', area: 'AB Road', lat: 22.7480, lon: 75.8780, cat: 'school', kw: ['emerald', 'heights', 'school'] },
  { name: "Queen's College", area: 'MG Road', lat: 22.7160, lon: 75.8680, cat: 'school', kw: ['queens', 'college', 'school'] },
  { name: 'Shri Vaishnav School', area: 'Indore', lat: 22.7100, lon: 75.8650, cat: 'school', kw: ['vaishnav', 'school'] },
  { name: "St. Paul's School", area: 'Race Course', lat: 22.7130, lon: 75.8590, cat: 'school', kw: ['paul', 'school', 'st'] },
  { name: 'The Shishukunj School', area: 'AB Road', lat: 22.7300, lon: 75.8730, cat: 'school', kw: ['shishukunj', 'school'] },
  { name: 'Bombay Cambridge School', area: 'Nipania', lat: 22.7700, lon: 75.8990, cat: 'school', kw: ['bombay', 'cambridge', 'school'] },
  { name: 'Sri Sathya Sai Vidya Vihar', area: 'Indore', lat: 22.7420, lon: 75.8850, cat: 'school', kw: ['sathya', 'sai', 'vidya', 'vihar', 'school'] },
  { name: 'Sanskriti School', area: 'Super Corridor', lat: 22.7590, lon: 75.8190, cat: 'school', kw: ['sanskriti', 'school'] },
  { name: 'Indore Public School', area: 'Scheme 54', lat: 22.7510, lon: 75.8950, cat: 'school', kw: ['indore', 'public', 'school', 'ips'] },

  // ==================== COLLEGES & UNIVERSITIES ====================
  { name: 'IIT Indore', area: 'Simrol', lat: 22.5273, lon: 75.9344, cat: 'school', kw: ['iit', 'indore', 'simrol'] },
  { name: 'IIM Indore', area: 'Rau-Pithampur Road', lat: 22.6241, lon: 75.7956, cat: 'school', kw: ['iim', 'indore'] },
  { name: 'DAVV University', area: 'Khandwa Road', lat: 22.6893, lon: 75.8705, cat: 'school', kw: ['davv', 'university', 'devi', 'ahilya'] },
  { name: 'Medicaps University', area: 'Rau', lat: 22.6332, lon: 75.7775, cat: 'school', kw: ['medicaps', 'university'] },
  { name: 'Prestige Institute', area: 'Scheme 74', lat: 22.7630, lon: 75.8970, cat: 'school', kw: ['prestige', 'institute', 'pimr'] },
  { name: 'SGSITS', area: 'Park Road', lat: 22.7140, lon: 75.8760, cat: 'school', kw: ['sgsits', 'engineering', 'college'] },
  { name: 'Holkar Science College', area: 'Indore', lat: 22.7170, lon: 75.8700, cat: 'school', kw: ['holkar', 'science', 'college'] },
  { name: 'Shri Vaishnav Vidyapeeth', area: 'Indore', lat: 22.6350, lon: 75.7950, cat: 'school', kw: ['vaishnav', 'vidyapeeth', 'university'] },
  { name: 'Acropolis Institute', area: 'Manglia', lat: 22.6380, lon: 75.8060, cat: 'school', kw: ['acropolis', 'institute', 'college'] },
  { name: 'Govt. Holkar College', area: 'Indore', lat: 22.7165, lon: 75.8690, cat: 'school', kw: ['holkar', 'college', 'government'] },
  { name: 'Renaissance University', area: 'Sanwer Road', lat: 22.7700, lon: 75.8300, cat: 'school', kw: ['renaissance', 'university'] },
  { name: 'IIST Indore', area: 'DAVV Campus', lat: 22.6890, lon: 75.8710, cat: 'school', kw: ['iist', 'information', 'technology'] },

  // ==================== GYMS & FITNESS ====================
  { name: "Gold's Gym", area: 'Vijay Nagar', lat: 22.7550, lon: 75.8880, cat: 'gym', kw: ['golds', 'gold', 'gym'] },
  { name: "Talwalkar's Gym", area: 'MG Road', lat: 22.7200, lon: 75.8760, cat: 'gym', kw: ['talwalkars', 'talwalkar', 'gym'] },
  { name: 'Anytime Fitness', area: 'Vijay Nagar', lat: 22.7560, lon: 75.8890, cat: 'gym', kw: ['anytime', 'fitness', 'gym'] },
  { name: 'Snap Fitness', area: 'Scheme 54', lat: 22.7510, lon: 75.8955, cat: 'gym', kw: ['snap', 'fitness', 'gym'] },
  { name: 'O2 Gym', area: 'Palasia', lat: 22.7175, lon: 75.8840, cat: 'gym', kw: ['o2', 'gym'] },
  { name: 'The Iron Factory Gym', area: 'Bhawarkuan', lat: 22.7425, lon: 75.8920, cat: 'gym', kw: ['iron', 'factory', 'gym'] },
  { name: 'CrossFit Indore', area: 'Vijay Nagar', lat: 22.7590, lon: 75.8870, cat: 'gym', kw: ['crossfit', 'gym'] },
  { name: 'Fitness First Gym', area: 'Nipania', lat: 22.7705, lon: 75.8995, cat: 'gym', kw: ['fitness', 'first', 'gym'] },
  { name: 'Muscle Factory Gym', area: 'Scheme 78', lat: 22.7650, lon: 75.8980, cat: 'gym', kw: ['muscle', 'factory', 'gym'] },
  { name: 'Body Fuel Gym', area: 'Bengali Square', lat: 22.7085, lon: 75.9225, cat: 'gym', kw: ['body', 'fuel', 'gym'] },

  // ==================== APARTMENTS & BUILDINGS ====================
  { name: 'Anand Heritage', area: 'Bicholi Mardana', lat: 22.7000, lon: 75.9297, cat: 'apartment', kw: ['anand', 'heritage'] },
  { name: 'Shreeji Heights', area: 'Shreeji Valley, Bicholi Mardana', lat: 22.6990, lon: 75.9290, cat: 'apartment', kw: ['shreeji', 'heights'] },
  { name: 'Shreeji Valley', area: 'Bicholi Mardana', lat: 22.6985, lon: 75.9285, cat: 'apartment', kw: ['shreeji', 'valley'] },
  { name: 'Omaxe City', area: 'Bicholi Mardana', lat: 22.6980, lon: 75.9300, cat: 'apartment', kw: ['omaxe', 'city'] },
  { name: 'Shalimar Township', area: 'AB Road', lat: 22.7600, lon: 75.8200, cat: 'apartment', kw: ['shalimar', 'township'] },
  { name: 'Royal Heritage', area: 'Nipania', lat: 22.7710, lon: 75.9000, cat: 'apartment', kw: ['royal', 'heritage'] },
  { name: 'Green Meadows', area: 'Super Corridor', lat: 22.7595, lon: 75.8185, cat: 'apartment', kw: ['green', 'meadows'] },
  { name: 'Sagar Royal Villas', area: 'Khandwa Road', lat: 22.6910, lon: 75.8710, cat: 'apartment', kw: ['sagar', 'royal', 'villas'] },
  { name: 'Purvanchal Royal City', area: 'Bypass Road', lat: 22.7310, lon: 75.9210, cat: 'apartment', kw: ['purvanchal', 'royal', 'city'] },
  { name: 'Maya Palace', area: 'LIG', lat: 22.7380, lon: 75.8885, cat: 'apartment', kw: ['maya', 'palace'] },
  { name: 'Residency Club', area: 'AB Road', lat: 22.7240, lon: 75.8690, cat: 'apartment', kw: ['residency', 'club'] },
  { name: 'Sun City', area: 'Nipania', lat: 22.7700, lon: 75.9010, cat: 'apartment', kw: ['sun', 'city'] },
  { name: 'Sai Kripa Colony', area: 'Nanda Nagar', lat: 22.7345, lon: 75.8565, cat: 'apartment', kw: ['sai', 'kripa', 'colony'] },
  { name: 'Brilliant Convention Centre', area: 'Scheme 78', lat: 22.7645, lon: 75.8975, cat: 'apartment', kw: ['brilliant', 'convention', 'centre'] },
  { name: 'Life Republic', area: 'Nipania', lat: 22.7715, lon: 75.9005, cat: 'apartment', kw: ['life', 'republic'] },

  // ==================== TEMPLES & RELIGIOUS ====================
  { name: 'Khajrana Ganesh Temple', area: 'Khajrana', lat: 22.7312, lon: 75.9081, cat: 'temple', kw: ['khajrana', 'ganesh', 'temple', 'mandir'] },
  { name: 'Annapurna Temple', area: 'Sudama Nagar', lat: 22.6901, lon: 75.8379, cat: 'temple', kw: ['annapurna', 'temple', 'mandir'] },
  { name: 'Lalbagh Palace', area: 'Indore', lat: 22.7000, lon: 75.8470, cat: 'temple', kw: ['lalbagh', 'palace'] },
  { name: 'Bada Ganpati', area: 'Juni Indore', lat: 22.7175, lon: 75.8595, cat: 'temple', kw: ['bada', 'ganpati', 'ganesh'] },
  { name: 'Geeta Bhawan Temple', area: 'Indore', lat: 22.7188, lon: 75.8845, cat: 'temple', kw: ['geeta', 'bhawan', 'temple'] },
  { name: 'Ranjeet Hanuman Temple', area: 'Indore', lat: 22.7082, lon: 75.8472, cat: 'temple', kw: ['ranjeet', 'hanuman', 'temple'] },
  { name: 'ISKCON Temple', area: 'Scheme 54', lat: 22.7500, lon: 75.8940, cat: 'temple', kw: ['iskcon', 'temple', 'krishna'] },

  // ==================== HOSPITALS ====================
  { name: 'MY Hospital', area: 'Indore', lat: 22.7133, lon: 75.8800, cat: 'hospital', kw: ['my', 'hospital', 'maharaja', 'yeshwantrao'] },
  { name: 'CHL Hospital', area: 'AB Road', lat: 22.7320, lon: 75.8890, cat: 'hospital', kw: ['chl', 'hospital'] },
  { name: 'Medanta Hospital', area: 'Super Corridor', lat: 22.7580, lon: 75.8200, cat: 'hospital', kw: ['medanta', 'hospital'] },
  { name: 'Choithram Hospital', area: 'Manik Bagh Road', lat: 22.6885, lon: 75.8544, cat: 'hospital', kw: ['choithram', 'hospital'] },
  { name: 'Bombay Hospital', area: 'Ring Road', lat: 22.7568, lon: 75.9037, cat: 'hospital', kw: ['bombay', 'hospital'] },
  { name: 'Arihant Hospital', area: 'Scheme 74', lat: 22.7535, lon: 75.8875, cat: 'hospital', kw: ['arihant', 'hospital'] },
  { name: 'Gokuldas Hospital', area: 'Indore', lat: 22.7140, lon: 75.8670, cat: 'hospital', kw: ['gokuldas', 'hospital'] },
  { name: 'Index Medical College', area: 'Nemawar Road', lat: 22.7150, lon: 75.7800, cat: 'hospital', kw: ['index', 'medical', 'hospital'] },

  // ==================== TRANSPORT ====================
  { name: 'Indore Junction', area: 'Railway Station', lat: 22.7167, lon: 75.8678, cat: 'transport', kw: ['indore', 'junction', 'railway', 'station', 'rail'] },
  { name: 'Sarwate Bus Stand', area: 'Indore', lat: 22.7140, lon: 75.8680, cat: 'transport', kw: ['sarwate', 'bus', 'stand'] },
  { name: 'Gangwal Bus Stand', area: 'Indore', lat: 22.7129, lon: 75.8410, cat: 'transport', kw: ['gangwal', 'bus', 'stand'] },
  { name: 'Indore Airport', area: 'Devi Ahilyabai Holkar Airport', lat: 22.7214, lon: 75.8005, cat: 'transport', kw: ['airport', 'devi', 'ahilyabai'] },

  // ==================== PARKS & LANDMARKS ====================
  { name: 'Rajwada Palace', area: 'Indore', lat: 22.7196, lon: 75.8577, cat: 'landmark', kw: ['rajwada', 'palace'] },
  { name: 'Meghdoot Garden', area: 'Indore', lat: 22.7100, lon: 75.8500, cat: 'landmark', kw: ['meghdoot', 'garden', 'park'] },
  { name: 'Nehru Park', area: 'Indore', lat: 22.7130, lon: 75.8610, cat: 'landmark', kw: ['nehru', 'park'] },
  { name: 'Regional Park', area: 'AB Road', lat: 22.7050, lon: 75.8430, cat: 'landmark', kw: ['regional', 'park'] },
  { name: 'Ralamandal Wildlife Sanctuary', area: 'Indore', lat: 22.6700, lon: 75.8100, cat: 'landmark', kw: ['ralamandal', 'wildlife', 'sanctuary'] },
  { name: 'Patalpani Waterfall', area: 'Mhow', lat: 22.5500, lon: 75.7700, cat: 'landmark', kw: ['patalpani', 'waterfall'] },
  { name: 'Pipliyapala Regional Park', area: 'AB Road', lat: 22.7055, lon: 75.8435, cat: 'landmark', kw: ['pipliyapala', 'regional', 'park', 'lake'] },
  { name: 'Indore Zoo', area: 'Navlakha', lat: 22.7275, lon: 75.8750, cat: 'landmark', kw: ['zoo', 'kamla', 'nehru', 'prani'] },
  { name: 'Gandhi Hall', area: 'Indore', lat: 22.7188, lon: 75.8572, cat: 'landmark', kw: ['gandhi', 'hall', 'town'] },
  { name: 'Kanch Mandir', area: 'Indore', lat: 22.7185, lon: 75.8570, cat: 'landmark', kw: ['kanch', 'mandir', 'glass', 'temple'] },
];

// =====================================================================
// SEARCH — scored ranking for better results
// =====================================================================
export const searchIndorePlaces = (query: string, category?: PlaceCategory): any[] => {
  const q = query.toLowerCase().trim();

  // No query but category selected → show top entries for that category
  if (q.length < 2) {
    if (category) {
      return PLACES
        .filter((p) => p.cat === category)
        .slice(0, 8)
        .map(formatResult);
    }
    return [];
  }

  const words = q.split(/\s+/);

  const scored = PLACES
    .filter((p) => !category || p.cat === category)
    .map((place) => {
      let score = 0;
      const nameLower = place.name.toLowerCase();
      const areaLower = place.area.toLowerCase();

      // Exact name match → highest priority
      if (nameLower === q) score += 100;
      // Name starts with query → high priority
      else if (nameLower.startsWith(q)) score += 80;
      // Name contains full query → good match
      else if (nameLower.includes(q)) score += 60;

      // Area contains query
      if (areaLower.includes(q)) score += 25;

      // Keyword scoring — exact word match beats partial
      for (const kw of place.kw) {
        for (const w of words) {
          if (kw === w) score += 40;
          else if (kw.startsWith(w) || w.startsWith(kw)) score += 25;
          else if (kw.includes(w) || w.includes(kw)) score += 15;
        }
      }

      // Bonus: multiple query words matching → higher relevance
      const matchedWords = words.filter((w) =>
        place.kw.some((kw) => kw.includes(w) || w.includes(kw)) ||
        nameLower.includes(w) ||
        areaLower.includes(w),
      );
      if (matchedWords.length > 1) score += matchedWords.length * 10;

      return { place, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ place }) => formatResult(place));

  return scored;
};
