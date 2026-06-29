/**
 * SpeedTracker — High-accuracy GPS speedometer engine for Suvega
 *
 * This is the core speed computation module. It produces the most accurate
 * real-time speed reading possible from smartphone GPS hardware.
 *
 * Architecture (5-layer pipeline):
 *
 *   Layer 1: GPS Doppler Speed (Primary source)
 *     - GPS chipsets measure velocity from carrier frequency Doppler shift
 *     - Accuracy: ~0.1 m/s (0.36 km/h) — MORE accurate than position
 *     - Available when `coords.speed` is non-null and >= 0
 *
 *   Layer 2: Position-Delta Speed (Fallback source)
 *     - Computed from consecutive GPS positions via Haversine formula
 *     - Accuracy: ~2-5 m/s depending on GPS position accuracy & interval
 *     - Only used when GPS Doppler speed is unavailable
 *
 *   Layer 3: 1D Kalman Filter (Sensor fusion)
 *     - Optimal recursive estimator that fuses noisy measurements
 *     - Weights each reading by estimated accuracy (low noise = more trust)
 *     - Produces mathematically optimal speed estimate
 *     - Self-adapts: trusts GPS speed more, position-delta less
 *
 *   Layer 4: Adaptive Exponential Moving Average (Display smoothing)
 *     - Fast alpha (0.4) when speed changes rapidly → responsive feel
 *     - Slow alpha (0.12) when speed is stable → silky smooth display
 *     - Prevents jitter while keeping the display alive
 *
 *   Layer 5: Hysteresis Stationary Detection
 *     - Prevents GPS drift from showing phantom 1-5 km/h when stopped
 *     - Entry: speed < 1.5 km/h for 6+ consecutive readings → show 0
 *     - Exit: speed > 3.5 km/h for 3+ consecutive readings → resume
 *     - The asymmetric thresholds prevent flickering at the boundary
 */

// ---------------------------------------------------------------------------
// Haversine (local copy — avoids circular dependency with trafficSignals)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// SpeedTracker class
// ---------------------------------------------------------------------------
export class SpeedTracker {
  // ── Kalman Filter state ──
  /** Estimated speed in m/s (Kalman state) */
  private kfSpeed: number = 0;
  /** Estimation uncertainty (Kalman covariance) */
  private kfP: number = 100;
  /**
   * Process noise (Q): how much speed can change between readings.
   * Higher = responds faster to acceleration/braking.
   * Tuned for vehicle driving (moderate acceleration).
   */
  private readonly KF_Q = 1.0;
  /**
   * Measurement noise for GPS Doppler speed.
   * GPS Doppler is very accurate — ~0.1-0.3 m/s standard deviation.
   * We use 0.25 (squared in Kalman = 0.0625 variance).
   */
  private readonly KF_R_GPS = 0.5;
  /**
   * Measurement noise for position-delta speed.
   * Much noisier — depends on GPS position accuracy and time interval.
   * We use a high value to give it less weight in the filter.
   */
  private readonly KF_R_DELTA = 8.0;

  // ── Adaptive EMA state ──
  /** Smoothed display speed in km/h */
  private emaSpeed: number = 0;
  /** Fast alpha — for when speed is changing (responsive) */
  private readonly EMA_ALPHA_FAST = 0.4;
  /** Slow alpha — for when speed is stable (smooth) */
  private readonly EMA_ALPHA_SLOW = 0.12;
  /** Speed change threshold (km/h) to switch between fast/slow alpha */
  private readonly EMA_DELTA_THRESHOLD = 5;

  // ── Position history for delta-based fallback ──
  private lastPos: { lat: number; lng: number; time: number } | null = null;

  // ── Stationary detection with hysteresis ──
  private lowSpeedCount: number = 0;
  private highSpeedCount: number = 0;
  private _isStationary: boolean = true;
  /** Speed below this for N readings → stationary */
  private readonly STATIONARY_ENTER_KMH = 1.5;
  /** Speed above this for M readings → moving */
  private readonly STATIONARY_EXIT_KMH = 3.5;
  /** Readings needed to enter stationary state */
  private readonly STATIONARY_ENTER_COUNT = 6;
  /** Readings needed to exit stationary state */
  private readonly STATIONARY_EXIT_COUNT = 3;

  // ── Spike rejection ──
  /** Maximum plausible acceleration in m/s² (reject readings beyond this) */
  private readonly MAX_ACCELERATION = 8.0; // ~0-100 in 3.5s — very generous
  private lastTimestamp: number = 0;

  // ── Raw speed for advisory (unsmoothed Kalman output) ──
  private rawKmh: number = 0;

  /**
   * Process a new location reading.
   *
   * Call this every time `Location.watchPositionAsync` fires.
   *
   * @param lat         Latitude from coords.latitude
   * @param lng         Longitude from coords.longitude
   * @param gpsSpeedMs  GPS Doppler speed from coords.speed (null if unavailable)
   * @param accuracy    Position accuracy from coords.accuracy (meters, null if unknown)
   * @param timestamp   Reading timestamp in milliseconds (from location.timestamp)
   * @returns           Best speed estimate in km/h (for display)
   */
  update(
    lat: number,
    lng: number,
    gpsSpeedMs: number | null,
    accuracy: number | null,
    timestamp: number,
  ): number {
    let rawSpeedMs: number;
    let measurementNoise: number;

    // ── Choose best speed source ──
    if (gpsSpeedMs !== null && gpsSpeedMs >= 0) {
      // Primary: GPS Doppler speed (high accuracy, ~0.1 m/s)
      rawSpeedMs = gpsSpeedMs;
      measurementNoise = this.KF_R_GPS;

      // Scale noise by reported accuracy if available
      // Better GPS fix → trust speed more
      if (accuracy !== null && accuracy > 0) {
        // Accuracy < 5m → excellent, use low noise
        // Accuracy > 15m → poor, increase noise
        const accuracyFactor = Math.max(0.5, Math.min(accuracy / 10, 3.0));
        measurementNoise = this.KF_R_GPS * accuracyFactor;
      }
    } else {
      // Fallback: Position-delta speed (noisier)
      if (this.lastPos !== null) {
        const dtSec = (timestamp - this.lastPos.time) / 1000;
        if (dtSec > 0.1 && dtSec < 10) {
          const distM = haversineM(this.lastPos.lat, this.lastPos.lng, lat, lng);
          rawSpeedMs = distM / dtSec;
          // Scale noise inversely with time interval (longer = more accurate)
          measurementNoise = this.KF_R_DELTA / Math.min(dtSec, 5);
        } else {
          // Stale or too-fast reading — use current estimate
          rawSpeedMs = this.kfSpeed;
          measurementNoise = 50; // Very uncertain
        }
      } else {
        rawSpeedMs = 0;
        measurementNoise = 100; // First reading, very uncertain
      }
    }

    // ── Spike rejection ──
    // Reject physically implausible speed jumps (GPS glitches)
    if (this.lastTimestamp > 0) {
      const dtSec = (timestamp - this.lastTimestamp) / 1000;
      if (dtSec > 0 && dtSec < 10) {
        const acceleration = Math.abs(rawSpeedMs - this.kfSpeed) / dtSec;
        if (acceleration > this.MAX_ACCELERATION) {
          // Implausible jump — heavily penalize this measurement
          measurementNoise *= 20;
        }
      }
    }

    // Update history
    this.lastPos = { lat, lng, time: timestamp };
    this.lastTimestamp = timestamp;

    // ── Kalman Filter ──
    // Predict step (constant velocity model)
    const predSpeed = this.kfSpeed; // x_pred = x (speed persists)
    const predP = this.kfP + this.KF_Q; // P_pred = P + Q

    // Update step
    const kalmanGain = predP / (predP + measurementNoise);
    this.kfSpeed = predSpeed + kalmanGain * (rawSpeedMs - predSpeed);
    this.kfP = (1 - kalmanGain) * predP;

    // Clamp to non-negative
    this.kfSpeed = Math.max(0, this.kfSpeed);

    // Prevent uncertainty from collapsing to zero (numerical stability)
    this.kfP = Math.max(0.01, this.kfP);

    // Convert Kalman output to km/h
    const kalmanKmh = this.kfSpeed * 3.6;
    this.rawKmh = kalmanKmh;

    // ── Stationary detection (hysteresis) ──
    if (this._isStationary) {
      // Currently stationary — need sustained high speed to start moving
      if (kalmanKmh > this.STATIONARY_EXIT_KMH) {
        this.highSpeedCount++;
        this.lowSpeedCount = 0;
        if (this.highSpeedCount >= this.STATIONARY_EXIT_COUNT) {
          this._isStationary = false;
          // Bootstrap EMA to current Kalman speed to avoid lag
          this.emaSpeed = kalmanKmh;
        }
      } else {
        this.highSpeedCount = 0;
      }
    } else {
      // Currently moving — need sustained low speed to go stationary
      if (kalmanKmh < this.STATIONARY_ENTER_KMH) {
        this.lowSpeedCount++;
        this.highSpeedCount = 0;
        if (this.lowSpeedCount >= this.STATIONARY_ENTER_COUNT) {
          this._isStationary = true;
          this.emaSpeed = 0;
        }
      } else {
        this.lowSpeedCount = 0;
      }
    }

    // If stationary, output 0
    if (this._isStationary) {
      return 0;
    }

    // ── Adaptive EMA for display smoothing ──
    const speedDelta = Math.abs(kalmanKmh - this.emaSpeed);
    const alpha =
      speedDelta > this.EMA_DELTA_THRESHOLD
        ? this.EMA_ALPHA_FAST
        : this.EMA_ALPHA_SLOW;

    this.emaSpeed = this.emaSpeed + alpha * (kalmanKmh - this.emaSpeed);

    return Math.max(0, this.emaSpeed);
  }

  /**
   * Get the current speed in km/h for advisory computation.
   * Uses the Kalman-filtered speed (less smoothed than display speed)
   * for more responsive advisory updates.
   */
  getSpeedKmh(): number {
    if (this._isStationary) return 0;
    return Math.max(0, this.rawKmh);
  }

  /**
   * Get display speed in km/h (EMA-smoothed, for UI)
   */
  getDisplaySpeedKmh(): number {
    if (this._isStationary) return 0;
    return Math.max(0, this.emaSpeed);
  }

  /** Whether the user is currently stationary */
  get isStationary(): boolean {
    return this._isStationary;
  }

  /** Reset all state (e.g., when entering a new navigation session) */
  reset(): void {
    this.kfSpeed = 0;
    this.kfP = 100;
    this.emaSpeed = 0;
    this.rawKmh = 0;
    this.lastPos = null;
    this.lastTimestamp = 0;
    this.lowSpeedCount = 0;
    this.highSpeedCount = 0;
    this._isStationary = true;
  }
}
