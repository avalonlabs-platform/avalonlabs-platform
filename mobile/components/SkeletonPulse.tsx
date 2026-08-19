import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";

const LINE_WIDTHS = ["88%", "72%", "94%", "58%"] as const;

/**
 * Animated pulse-loader shown in place of the bare ActivityIndicator while
 * an agent response is streaming/generating — sketches the shape of an
 * incoming ResultCard (a label bar plus a few text lines) rather than a
 * generic spinner. Built on React Native's core Animated API (opacity only,
 * useNativeDriver: true) rather than react-native-reanimated — reanimated
 * is already a project dependency, but its worklets require an exact babel
 * plugin setup that isn't present in babel.config.js, and a plain opacity
 * loop doesn't need reanimated's extra power; Animated avoids introducing
 * that babel-config risk for a purely cosmetic loader.
 */
export function SkeletonPulse() {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.labelBar, { opacity }]} />
      {LINE_WIDTHS.map((width, idx) => (
        // eslint-disable-next-line react/no-array-index-key -- static list, order never changes
        <Animated.View key={idx} style={[styles.line, { width, opacity }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 10,
  },
  labelBar: {
    width: 120,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 4,
  },
  line: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
  },
});
