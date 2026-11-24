import React from "react";
import { Modal, View, StyleSheet, Platform } from "react-native";

interface PhoneModalProps {
  visible: boolean;
  transparent?: boolean;
  animationType?: "none" | "slide" | "fade";
  onRequestClose?: () => void;
  children: React.ReactNode;
}

/**
 * Renders a native OS <Modal> on Android devices, and an in-frame overlay
 * on Mac Web Preview so sheets stay strictly inside the 420px Android phone bezel
 * (and below the simulated Android Heads-Up Push Notification banner).
 */
export function PhoneModal({
  visible,
  transparent = true,
  animationType = "fade",
  onRequestClose,
  children,
}: PhoneModalProps) {
  if (!visible) return null;

  if (Platform.OS === "web") {
    return <View style={styles.inPhoneOverlay}>{children}</View>;
  }

  return (
    <Modal
      visible={visible}
      transparent={transparent}
      animationType={animationType}
      onRequestClose={onRequestClose}
    >
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  inPhoneOverlay: {
    position: "absolute",
    top: 30, // sits right below the 30px Android status bar inside the phone frame
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 120,
  },
});
