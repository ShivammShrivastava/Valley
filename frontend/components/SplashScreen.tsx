import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Animated, Easing } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ICON_SIZE = SCREEN_WIDTH * 0.52;

// Gauge dimensions
const GAUGE_SIZE = ICON_SIZE * 0.66;
const STROKE = ICON_SIZE * 0.048;
const NEEDLE_LEN = GAUGE_SIZE * 0.38;

export default function SplashScreen({ onFinish }: { onFinish?: () => void }) {
  const needleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate needle from left to right across the gauge face
    Animated.timing(needleAnim, {
      toValue: 1,
      duration: 1800,
      easing: Easing.bezier(0.22, 0.61, 0.36, 1), // Smooth ease-out
      useNativeDriver: true,
    }).start(() => {
      // After sweep completes, wait briefly then transition to home
      if (onFinish) {
        setTimeout(onFinish, 400);
      }
    });
  }, []);

  // Interpolate: 150deg (lower-right, start of gauge) → 340deg (upper-left, end of gauge)
  const needleRotation = needleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['150deg', '340deg'],
  });

  return (
    <View style={styles.container}>
      {/* Card */}
      <View style={styles.iconBox}>
        {/* Gauge area */}
        <View style={styles.gaugeArea}>
          {/* Arc ring: gray with green right segment, transparent bottom for gap */}
          <View style={[styles.arcRing, { transform: [{ rotate: '20deg' }] }]} />

          {/* Bottom mask to widen the gap cleanly */}
          <View style={styles.gapMask} />

          {/* Animated needle: sweeps from left to right like a speedometer revving */}
          <Animated.View
            style={[
              styles.needleWrapper,
              { transform: [{ rotate: needleRotation }] },
            ]}
          >
            <View style={styles.needle} />
          </Animated.View>

          {/* Pivot outer ring */}
          <View style={styles.pivotRing}>
            {/* Pivot inner dot */}
            <View style={styles.pivotDot} />
          </View>
        </View>
      </View>

      {/* Text */}
      <Text style={styles.brandName}>Suvega</Text>
      <Text style={styles.tagline}>R I D E   T H E   G R E E N</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE * 0.22,
    backgroundColor: '#1A1A1F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
  },
  gaugeArea: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arcRing: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    borderRadius: GAUGE_SIZE / 2,
    borderWidth: STROKE,
    borderTopColor: '#3A3A40',
    borderLeftColor: '#3A3A40',
    borderRightColor: '#00E676',
    borderBottomColor: 'transparent',
  },
  gapMask: {
    position: 'absolute',
    bottom: -STROKE,
    width: GAUGE_SIZE * 0.5,
    height: GAUGE_SIZE * 0.22,
    backgroundColor: '#1A1A1F',
  },
  needleWrapper: {
    position: 'absolute',
    width: 2,
    height: NEEDLE_LEN * 2,
  },
  needle: {
    width: 2,
    height: NEEDLE_LEN,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  pivotRing: {
    position: 'absolute',
    width: ICON_SIZE * 0.08,
    height: ICON_SIZE * 0.08,
    borderRadius: ICON_SIZE * 0.04,
    borderWidth: 2,
    borderColor: '#00E676',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pivotDot: {
    width: ICON_SIZE * 0.03,
    height: ICON_SIZE * 0.03,
    borderRadius: ICON_SIZE * 0.015,
    backgroundColor: '#00E676',
  },
  brandName: {
    fontSize: 46,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 2,
    fontStyle: 'italic',
    marginBottom: 8,
    ...(Platform.OS === 'ios' ? { fontFamily: 'System' } : {}),
  },
  tagline: {
    fontSize: 14,
    color: '#00E676',
    letterSpacing: 4,
    fontWeight: '500',
  },
});
