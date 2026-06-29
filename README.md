# Suvega — Ride The Green 🟢

A traffic light green wave prediction app that helps drivers maintain the optimal speed to hit green lights consecutively.

## Project Structure

```
Suvega/
├── frontend/          ← React Native (Expo) mobile app
├── backend/           ← Python Flask API server (reference implementation)
├── scripts/           ← Utility & debug scripts
├── .gitignore
└── README.md
```

### `frontend/` — Mobile App (React Native + Expo)

The main mobile application built with React Native, Expo SDK 54, and Expo Router.

**Key features:**
- Google Maps integration with search (Nominatim)
- Turn-by-turn navigation with route polyline (OSRM)
- Real-time traffic signal state prediction (on-device computation)
- Speed advisory — tells you how fast to go to hit the next green light
- Firestore integration for traffic signal data
- Persistent caching for instant startup

```bash
cd frontend
npm install
npx expo start
```

### `backend/` — Flask API Server

A Python Flask REST API that provides signal state and speed advisory computation. This is a standalone reference server — the mobile app currently performs all computations on-device for speed and offline capability.

See [backend/README.md](backend/README.md) for API documentation.

```bash
cd backend
pip install -r requirements.txt
python app.py
```

### `scripts/` — Utility Scripts

Debug and maintenance scripts for the project:

- `read-firestore.js` — Read and display all Firestore data
- `test-firebase.js` — Quick Firebase connection test
- `reset-project.js` — Reset to fresh Expo template (in `frontend/scripts/`)

```bash
node scripts/read-firestore.js
node scripts/test-firebase.js
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native 0.81 + Expo SDK 54 |
| Navigation | Expo Router (file-based) |
| Maps | react-native-maps (Google Maps) |
| Database | Cloud Firestore |
| Routing Engine | OSRM (OpenStreetMap) |
| Geocoding | Nominatim (OpenStreetMap) |
| Backend API | Python Flask |
| Signal Computation | On-device TypeScript |
