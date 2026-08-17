import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { colors } from "@/lib/theme";

const BARCODE_TYPES = [
  "qr",
  "code128",
  "code39",
  "code93",
  "codabar",
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "pdf417",
  "aztec",
  "datamatrix",
  "itf14",
] as const;

interface ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (data: string) => void;
}

export function ScannerModal({ visible, onClose, onScanned }: ScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  // Guards against onBarcodeScanned firing repeatedly for the same frame burst.
  const scannedRef = useRef(false);

  function handleScan(result: BarcodeScanningResult) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    onScanned(result.data);
  }

  function handleClose() {
    scannedRef.current = false;
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              Camera access is needed to scan codes.
            </Text>
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Grant permission</Text>
            </Pressable>
            <Pressable onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={scannedRef.current ? undefined : handleScan}
            />
            <View style={styles.frameOverlay} pointerEvents="none">
              <View style={styles.frame} />
              <Text style={styles.hint}>Point the camera at a code</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: colors.cyan,
    borderRadius: 16,
  },
  hint: {
    color: "#fff",
    fontSize: 14,
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
  cancelText: {
    color: colors.textFaint,
    fontSize: 14,
  },
});
