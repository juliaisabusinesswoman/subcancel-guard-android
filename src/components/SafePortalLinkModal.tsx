import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PhoneModal } from "./PhoneModal";
import { validateSafeHttpsUrl } from "../lib/utils";
import { useTheme } from "../context/ThemeContext";

interface SafePortalLinkModalProps {
  visible: boolean;
  url: string | null;
  serviceName?: string;
  onClose: () => void;
}

export function SafePortalLinkModal({
  visible,
  url,
  serviceName,
  onClose,
}: SafePortalLinkModalProps) {
  const { colors } = useTheme();
  if (!visible || !url) return null;

  const check = validateSafeHttpsUrl(url);

  const handleOpenExternal = async () => {
    if (!check.isValid || !check.normalizedUrl) return;
    try {
      const supported = await Linking.canOpenURL(check.normalizedUrl);
      if (supported) {
        await Linking.openURL(check.normalizedUrl);
        onClose();
      } else {
        Alert.alert("Cannot Open Link", `Unable to open ${check.normalizedUrl}`);
      }
    } catch {
      Alert.alert("Error", "Could not open external browser link.");
    }
  };

  return (
    <PhoneModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {!check.isValid ||
          !check.normalizedUrl ||
          !check.origin ||
          !check.hostname ? (
            <>
              <View style={styles.headerRow}>
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: colors.roseBg,
                      borderColor: colors.roseBorder,
                    },
                  ]}
                >
                  <Feather name="alert-triangle" size={20} color={colors.rose} />
                </View>
                <View style={styles.headerTextWrap}>
                  <Text style={[styles.title, { color: colors.text }]}>
                    Insecure Link Blocked
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    SubCancel Guard strictly blocks non-HTTPS links.
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.alertBox,
                  {
                    backgroundColor: colors.roseBg,
                    borderColor: colors.roseBorder,
                  },
                ]}
              >
                <Text style={[styles.alertText, { color: colors.rose }]}>
                  {check.error ||
                    "This link does not use an encrypted https:// connection and was blocked for your protection."}
                </Text>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={[
                  styles.secondaryBtn,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                  Close
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.headerRow}>
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: colors.goldBg,
                      borderColor: colors.goldBorder,
                    },
                  ]}
                >
                  <Feather name="shield" size={20} color={colors.gold} />
                </View>
                <View style={styles.headerTextWrap}>
                  <Text style={[styles.title, { color: colors.text }]}>
                    Leaving SubCancel Guard
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    {serviceName
                      ? `Opening official account portal for ${serviceName}`
                      : "Opening external website in your browser"}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.domainBox,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.domainLabel, { color: colors.textMuted }]}>
                  DESTINATION DOMAIN
                </Text>
                <View style={styles.domainOriginRow}>
                  <Feather name="lock" size={14} color={colors.forest} />
                  <Text style={[styles.domainOrigin, { color: colors.forest }]}>
                    {check.origin}
                  </Text>
                </View>
                <Text
                  style={[styles.fullUrl, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {check.normalizedUrl}
                </Text>
              </View>

              <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
                Please verify the address bar in your mobile browser matches{" "}
                <Text style={[styles.boldMono, { color: colors.text }]}>
                  {check.origin}
                </Text>{" "}
                before entering any login credentials.
              </Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  onPress={onClose}
                  style={[
                    styles.cancelBtn,
                    {
                      backgroundColor: colors.surfaceAlt,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleOpenExternal}
                  style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
                >
                  <Text style={styles.primaryBtnText} numberOfLines={1}>
                    Continue to {check.hostname}
                  </Text>
                  <Feather name="external-link" size={14} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </PhoneModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  alertBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertText: {
    fontSize: 12,
    lineHeight: 18,
  },
  domainBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  domainLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  domainOriginRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  domainOrigin: {
    fontSize: 14,
    fontWeight: "800",
  },
  fullUrl: {
    fontSize: 11,
    marginTop: 2,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  boldMono: {
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
});
