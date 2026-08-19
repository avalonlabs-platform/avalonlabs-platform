import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileAttachment } from "@/lib/attachments";
import { colors } from "@/lib/theme";

interface AttachmentPreviewBarProps {
  attachments: MobileAttachment[];
  onRemove: (id: string) => void;
}

function formatSize(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Horizontal strip of removable photo thumbnails shown above the chat
 *  input bar once one or more photos have been captured/picked but not yet
 *  sent — lets the user review (and drop) an attachment before running the
 *  analysis, instead of the old flow where a capture fired the request
 *  immediately. */
export function AttachmentPreviewBar({ attachments, onRemove }: AttachmentPreviewBarProps) {
  if (attachments.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowContent}
    >
      {attachments.map((attachment) => (
        <View key={attachment.id} style={styles.badge}>
          <Image source={{ uri: attachment.uri }} style={styles.thumb} resizeMode="cover" />
          <Pressable
            style={styles.removeButton}
            onPress={() => onRemove(attachment.id)}
            hitSlop={8}
            accessibilityLabel="Remove attachment"
            accessibilityRole="button"
          >
            <Text style={styles.removeButtonText}>×</Text>
          </Pressable>
          <Text style={styles.sizeLabel}>{formatSize(attachment.sizeBytes)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 10,
  },
  rowContent: {
    gap: 12,
    paddingRight: 4,
    paddingTop: 4,
  },
  badge: {
    width: 60,
    alignItems: "center",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeButton: {
    position: "absolute",
    top: -6,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 15,
  },
  sizeLabel: {
    color: colors.textFaint,
    fontSize: 9,
    marginTop: 3,
  },
});
