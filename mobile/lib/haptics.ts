import * as Haptics from "expo-haptics";

/**
 * Thin, defensive wrappers around expo-haptics for the three trigger points
 * called out in the Sprint 3 spec: light impact on send, medium/success
 * feedback when generation completes, and selection feedback on copying a
 * code snippet. (A fourth — a warning notification on a failed run — was
 * added as a small, obviously-consistent extension using the same API;
 * flagged here rather than added silently.)
 *
 * Every call is fire-and-forget and swallows its own promise rejection —
 * haptics are a pure UX nicety, and a device/simulator without a vibration
 * motor (or a user with system haptics disabled) should never be able to
 * throw and interrupt the actual send/copy/share action it's attached to.
 */

export function hapticSend(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticComplete(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticError(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function hapticSelect(): void {
  Haptics.selectionAsync().catch(() => {});
}
