# Suvega Backend — Traffic Light Green Wave API

A Flask REST API server that computes traffic signal states and speed advisories for the Suvega green wave prediction system.

> **Note:** The mobile app currently performs all signal computations on-device for speed and offline capability. This backend server is a standalone reference implementation that can be deployed as a centralized API if needed.

## Setup

```bash
pip install -r requirements.txt
python app.py
```

The server starts at `http://0.0.0.0:5000`.

## API Endpoints

### `GET /` — Health Check

Returns server status.

**Response:**
```json
{
  "status": "ok",
  "service": "Suvega Traffic Light API"
}
```

---

### `POST /signal-status` — Get Traffic Signal State

Determines the current state of a traffic signal (green/yellow/red) based on anchor timing and cycle intervals.

**Request Body:**
```json
{
  "anchor_time": "2025-01-01T00:00:00Z",
  "green_interval": 60,
  "yellow_interval": 5,
  "red_interval": 55
}
```

| Field | Type | Description |
|-------|------|-------------|
| `anchor_time` | string (ISO 8601) | Reference timestamp when a green phase started |
| `green_interval` | number | Green phase duration in seconds |
| `yellow_interval` | number | Yellow phase duration in seconds |
| `red_interval` | number | Red phase duration in seconds |

**Response:**
```json
{
  "state": "green",
  "remaining": 42.5,
  "cycle_position": 17.5,
  "total_cycle": 120
}
```

---

### `POST /speed-advisory` — Get Speed Advisory

Computes the min/max speed for a user to arrive at a signal during its green phase.

**Request Body:**
```json
{
  "user_lat": 22.7196,
  "user_lng": 75.8577,
  "user_speed_kmh": 30,
  "signal_lat": 22.7241,
  "signal_lng": 75.8839,
  "anchor_time": "2025-01-01T00:00:00Z",
  "green_interval": 60,
  "yellow_interval": 5,
  "red_interval": 55
}
```

| Field | Type | Description |
|-------|------|-------------|
| `user_lat` | number | User's current latitude |
| `user_lng` | number | User's current longitude |
| `user_speed_kmh` | number | User's current speed in km/h |
| `signal_lat` | number | Traffic signal latitude |
| `signal_lng` | number | Traffic signal longitude |
| `anchor_time` | string (ISO 8601) | Green phase reference timestamp |
| `green_interval` | number | Green phase duration in seconds |
| `yellow_interval` | number | Yellow phase duration in seconds |
| `red_interval` | number | Red phase duration in seconds |

**Response:**
```json
{
  "min_speed": 25.3,
  "max_speed": 42.8,
  "user_speed": 30.0,
  "status": "perfect",
  "message": "Perfect – you will hit green",
  "signal_state": "red",
  "signal_remaining": 15.2,
  "distance_m": 450.6,
  "target_green": "next"
}
```

| Status | Meaning |
|--------|---------|
| `perfect` | User's speed is within the green window |
| `too_fast` | User needs to slow down |
| `too_slow` | User needs to speed up |
| `at_signal` | User is at the signal location |

## Dependencies

- `flask` — Web framework
- `flask-cors` — Cross-origin request support
- `firebase-admin` — Firebase Admin SDK (listed but not currently used by the API)
