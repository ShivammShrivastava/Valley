"""
Suvega Traffic Light Green Wave Prediction API

This Flask server computes:
1. The current state of a traffic signal (green/yellow/red) based on anchor timing
2. Speed advisory (min/max speed) for a user to hit the green light

The React Native app reads signal data from Firestore and sends it here
along with user position and speed for computation.
"""

import math
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allow requests from Expo/React Native


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in meters."""
    R = 6_371_000  # Earth radius in meters
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lon = to_rad(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_signal_state(anchor_time_iso: str,
                     green_interval: float,
                     yellow_interval: float,
                     red_interval: float,
                     current_time: datetime = None):
    """
    Determine the current signal state based on the anchor time and intervals.

    Cycle order: GREEN → YELLOW → RED

    anchor_time_iso: ISO 8601 timestamp when a green phase started (reference)
    green/yellow/red_interval: duration in seconds for each phase
    current_time: override for testing; defaults to now (UTC)

    Returns dict with:
      - state: "green" | "yellow" | "red"
      - remaining: seconds left in current state
      - cycle_position: seconds into the current cycle
      - total_cycle: total cycle length in seconds
    """
    if current_time is None:
        current_time = datetime.now(timezone.utc)

    # Parse anchor time
    anchor = datetime.fromisoformat(anchor_time_iso.replace("Z", "+00:00"))
    # Cycle: GREEN → YELLOW → RED
    total_cycle = green_interval + yellow_interval + red_interval

    # Seconds elapsed since anchor
    elapsed = (current_time - anchor).total_seconds()
    # Position within the current cycle (always positive via modulo)
    cycle_pos = elapsed % total_cycle

    if cycle_pos < green_interval:
        state = "green"
        remaining = green_interval - cycle_pos
    elif cycle_pos < green_interval + yellow_interval:
        state = "yellow"
        remaining = (green_interval + yellow_interval) - cycle_pos
    else:
        state = "red"
        remaining = total_cycle - cycle_pos

    return {
        "state": state,
        "remaining": round(remaining, 1),
        "cycle_position": round(cycle_pos, 1),
        "total_cycle": total_cycle,
    }


def compute_speed_advisory(distance_m: float,
                           signal_info: dict,
                           green_interval: float,
                           yellow_interval: float,
                           red_interval: float,
                           user_speed_kmh: float):
    """
    Compute the min and max speed for the user to hit a green light.

    max_speed: speed to arrive exactly when green STARTS (turns green)
    min_speed: speed to arrive when green is about to END (5s before yellow)

    Returns dict with min_speed, max_speed (km/h), and status message.
    """
    state = signal_info["state"]
    remaining = signal_info["remaining"]
    total_cycle = signal_info["total_cycle"]
    GREEN_END_BUFFER = 5  # seconds buffer before green ends

    # --- Calculate time windows to the NEXT green phase ---
    # Cycle order: GREEN → YELLOW → RED → GREEN ...
    if state == "green":
        # Option A: Catch THIS green (if reachable)
        time_to_current_green_end = remaining
        # Option B: Wait for NEXT green (after yellow + red)
        time_to_next_green_start = remaining + yellow_interval + red_interval
        time_to_next_green_end = time_to_next_green_start + green_interval

        # Check if user can reach during current green
        # Need at least GREEN_END_BUFFER seconds of green left
        if time_to_current_green_end > GREEN_END_BUFFER:
            # Can potentially catch this green
            min_time = GREEN_END_BUFFER  # minimum travel time (arrive with buffer)
            max_time = time_to_current_green_end - GREEN_END_BUFFER

            if distance_m > 0 and max_time > 0:
                min_speed_ms = distance_m / max_time  # slowest (arrive just before green ends)
                max_speed_ms = distance_m / min_time if min_time > 0 else 999

                min_speed_kmh = min_speed_ms * 3.6
                max_speed_kmh = max_speed_ms * 3.6

                # If min_speed is reasonable (< 60 km/h), use current green
                if min_speed_kmh <= 60:
                    return _build_advisory(min_speed_kmh, max_speed_kmh,
                                           user_speed_kmh, state, remaining,
                                           distance_m, "current")

        # Fall through to next green cycle
        time_to_green_start = time_to_next_green_start
        time_to_green_end = time_to_next_green_end

    elif state == "yellow":
        # After yellow → red → green
        time_to_green_start = remaining + red_interval
        time_to_green_end = time_to_green_start + green_interval

    else:  # red
        # After red → green
        time_to_green_start = remaining
        time_to_green_end = time_to_green_start + green_interval

    # --- Compute speeds for the next green window ---
    if distance_m <= 0:
        return {
            "min_speed": 0,
            "max_speed": 0,
            "user_speed": round(user_speed_kmh, 1),
            "status": "at_signal",
            "message": "You are at the signal",
            "signal_state": state,
            "signal_remaining": round(remaining, 1),
            "distance_m": 0,
            "target_green": "current",
        }

    # max_speed: arrive exactly when green starts
    if time_to_green_start > 0:
        max_speed_ms = distance_m / time_to_green_start
    else:
        max_speed_ms = 999  # signal is about to turn green

    # min_speed: arrive when green is about to end (with 5s buffer)
    safe_green_end_time = time_to_green_end - GREEN_END_BUFFER
    if safe_green_end_time > 0:
        min_speed_ms = distance_m / safe_green_end_time
    else:
        min_speed_ms = 0

    min_speed_kmh = min_speed_ms * 3.6
    max_speed_kmh = max_speed_ms * 3.6

    return _build_advisory(min_speed_kmh, max_speed_kmh,
                           user_speed_kmh, state, remaining,
                           distance_m, "next")


def _build_advisory(min_speed_kmh, max_speed_kmh, user_speed_kmh,
                    signal_state, signal_remaining, distance_m, target_green):
    """Build the advisory response with status message."""
    # Clamp to reasonable bounds
    min_speed_kmh = max(5, min(min_speed_kmh, 60))
    max_speed_kmh = max(5, min(max_speed_kmh, 60))

    # Ensure min <= max
    if min_speed_kmh > max_speed_kmh:
        min_speed_kmh, max_speed_kmh = max_speed_kmh, min_speed_kmh

    # Determine user status
    if user_speed_kmh < min_speed_kmh:
        status = "too_slow"
        message = "You are too slow"
    elif user_speed_kmh > max_speed_kmh:
        status = "too_fast"
        message = "You are going too fast"
    else:
        status = "perfect"
        message = "Perfect – you will hit green"

    return {
        "min_speed": round(min_speed_kmh, 1),
        "max_speed": round(max_speed_kmh, 1),
        "user_speed": round(user_speed_kmh, 1),
        "status": status,
        "message": message,
        "signal_state": signal_state,
        "signal_remaining": round(signal_remaining, 1),
        "distance_m": round(distance_m, 1),
        "target_green": target_green,
    }


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.route("/", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "Suvega Traffic Light API"})


@app.route("/signal-status", methods=["POST"])
def signal_status():
    """
    Get the current state of a traffic signal.

    Request JSON:
    {
        "anchor_time": "2025-01-01T00:00:00Z",
        "green_interval": 60,
        "yellow_interval": 5,
        "red_interval": 55
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body provided"}), 400

    required = ["anchor_time", "green_interval", "yellow_interval", "red_interval"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    try:
        result = get_signal_state(
            anchor_time_iso=data["anchor_time"],
            green_interval=float(data["green_interval"]),
            yellow_interval=float(data["yellow_interval"]),
            red_interval=float(data["red_interval"]),
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/speed-advisory", methods=["POST"])
def speed_advisory():
    """
    Compute speed advisory for hitting a green light.

    Request JSON:
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
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body provided"}), 400

    required = [
        "user_lat", "user_lng", "user_speed_kmh",
        "signal_lat", "signal_lng",
        "anchor_time", "green_interval", "yellow_interval", "red_interval",
    ]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    try:
        # Calculate distance
        distance = haversine_meters(
            float(data["user_lat"]), float(data["user_lng"]),
            float(data["signal_lat"]), float(data["signal_lng"]),
        )

        # Get current signal state
        signal_info = get_signal_state(
            anchor_time_iso=data["anchor_time"],
            green_interval=float(data["green_interval"]),
            yellow_interval=float(data["yellow_interval"]),
            red_interval=float(data["red_interval"]),
        )

        # Compute advisory
        advisory = compute_speed_advisory(
            distance_m=distance,
            signal_info=signal_info,
            green_interval=float(data["green_interval"]),
            yellow_interval=float(data["yellow_interval"]),
            red_interval=float(data["red_interval"]),
            user_speed_kmh=float(data["user_speed_kmh"]),
        )

        return jsonify(advisory)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("  Suvega Traffic Light API")
    print("  Running on http://0.0.0.0:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
