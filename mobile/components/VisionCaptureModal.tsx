import { useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { colors } from "@/lib/theme";

// Claude's recommended longest-edge resolution — larger images cost more
// tokens without improving reading accuracy.
const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.7;

interface VisionCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onCaptured: (base64: string, mediaType: string) => void;
}

async function compressToBase64(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_EDGE });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!result.base64) throw new Error("Image compression failed.");
  return result.base64;
}

export function VisionCaptureModal({ visible, onClose, onCaptured }: VisionCaptureModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  async function handleCapture() {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error("No photo captured.");
      const base64 = await compressToBase64(photo.uri);
      onCaptured(base64, "image/jpeg");
    } catch {
      // Silently drop — the Action screen shows its own error state once
      // onCaptured never fires, no need to duplicate messaging here.
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFromGallery() {
    if (busy) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setBusy(true);
    try {
      const base64 = await compressToBase64(result.assets[0].uri);
      onCaptured(base64, "image/jpeg");
    } catch {
      // Same as above — Action screen owns the error state.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Camera access is needed to take a photo.</Text>
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Grant permission</Text>
            </Pressable>
            <Pressable style={styles.galleryLinkFallback} onPress={handlePickFromGallery}>
              <Text style={styles.galleryLinkFallbackText}>Or pick from gallery instead</Text>
            </Pressable>
            <Pressable onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

            <View style={styles.reticleOverlay} pointerEvents="none">
              <View style={styles.reticle}>
                <View style={[styles.reticleTick, styles.reticleTickTL]} />
                <View style={[styles.reticleTick, styles.reticleTickTR]} />
                <View style={[styles.reticleTick, styles.reticleTickBL]} />
                <View style={[styles.reticleTick, styles.reticleTickBR]} />
              </View>
              <Text style={styles.hint}>Frame code, an error, or a diagram</Text>
            </View>

            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </Pressable>

            <View style={styles.controls}>
              <Pressable style={styles.galleryButton} onPress={handlePickFromGallery} disabled={busy}>
                <Text style={styles.galleryButtonText}>🖼️</Text>
              </Pressable>

              <Pressable
                style={[styles.shutterButton, busy && { opacity: 0.6 }]}
                onPress={handleCapture}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
              </Pressable>

              <View style={styles.controlsSpacer} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const RETICLE_SIZE = 220;
const TICK_LENGTH = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  reticle: {
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    borderRadius: RETICLE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: "rgba(34,211,238,0.5)",
    borderStyle: "dashed",
  },
  reticleTick: {
    position: "absolute",
    width: TICK_LENGTH,
    height: TICK_LENGTH,
    borderColor: colors.cyan,
  },
  reticleTickTL: {
    top: -1.5,
    left: -1.5,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 8,
  },
  reticleTickTR: {
    top: -1.5,
    right: -1.5,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 8,
  },
  reticleTickBL: {
    bottom: -1.5,
    left: -1.5,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 8,
  },
  reticleTickBR: {
    bottom: -1.5,
    right: -1.5,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 8,
  },
  hint: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  closeButton: {
    position: "absolute",
    top: 60,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  controls: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  galleryButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryButtonText: {
    fontSize: 22,
  },
  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.35)",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  controlsSpacer: {
    width: 52,
    height: 52,
  },
  permissionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 40,
  },
  permissionText: {
    color: colors.text,
    fontSize: 15,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: colors.indigo,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  galleryLinkFallback: {
    paddingVertical: 4,
  },
  galleryLinkFallbackText: {
    color: colors.cyan,
    fontSize: 14,
    fontWeight: "500",
  },
  cancelText: {
    color: colors.textFaint,
    fontSize: 14,
  },
});
