import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PhoneModal } from "./PhoneModal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { WEB_API_URL } from "../lib/supabase";

interface ProUpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  reason?: "limit_reached" | "manual";
}

/**
 * Google Play Store–Compliant Pro Unlock Modal:
 * - Syncs existing Pro entitlements (`users.is_pro`) from Supabase across platforms.
 * - Avoids opening external web Stripe checkout links inside Google Play builds
 *   (preventing Google Play Payments Policy rejection), while providing a clean
 *   hook for Google Play Billing (`com.subcancelguard.pro_unlock` via `react-native-iap` / RevenueCat)
 *   and a dev-only testing toggle in `__DEV__`.
 */
export function ProUpgradeModal({
  visible,
  onClose,
  reason = "limit_reached",
}: ProUpgradeModalProps) {
  const { user, session, isPro, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [simulatingDev, setSimulatingDev] = useState(false);

  if (!visible) return null;

  const handleSyncProEntitlement = async () => {
    setRefreshingStatus(true);
    try {
      await refreshProfile();
      Alert.alert(
        "Account Status Synced",
        isPro
          ? "SubCancel Guard Pro (Unlimited) is active on your account!"
          : "Your account is currently on the Free Tier (up to 3 active subscriptions). Once Google Play Billing (`com.subcancelguard.pro_unlock`) is published in Play Console, in-app purchase unlocks immediately here."
      );
      if (isPro) onClose();
    } finally {
      setRefreshingStatus(false);
    }
  };

  const handleDevTestUpgrade = async () => {
    if (!user) return;
    setSimulatingDev(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${WEB_API_URL}/api/stripe/simulate-upgrade`, {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: user.id, proStatus: true }),
      });

      if (res.ok) {
        await refreshProfile();
        onClose();
        Alert.alert(
          "Dev Testing: Pro Unlocked!",
          "Your account is now set to Pro (Unlimited) for testing."
        );
      } else {
        Alert.alert(
          "Dev Server Notice",
          "Run the local dev API (`npm run dev` in subcancel-guard) to use the dev-mode Pro toggle."
        );
      }
    } catch {
      Alert.alert(
        "Dev Server Offline",
        "Start `subcancel-guard` locally on port 3000 if you want to simulate Pro unlock in dev mode."
      );
    } finally {
      setSimulatingDev(false);
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
          <View style={styles.topRow}>
            <View
              style={[
                styles.launchBadge,
                {
                  backgroundColor: colors.goldBg,
                  borderColor: colors.goldBorder,
                },
              ]}
            >
              <Feather name="zap" size={12} color={colors.gold} />
              <Text style={[styles.launchBadgeText, { color: colors.gold }]}>
                Google Play Edition • One-Time Pro
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <Feather name="x" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            {reason === "limit_reached"
              ? "Free Tier Limit Reached (3/3 Used)"
              : "SubCancel Guard Pro (Unlimited)"}
          </Text>

          <Text style={[styles.desc, { color: colors.textSecondary }]}>
            {reason === "limit_reached"
              ? "Free accounts track up to 3 active subscriptions. Unlock Pro once for unlimited subscriptions with Android 3-day & 24h push alerts — zero monthly fees."
              : "Track unlimited recurring services in one private Android vault with 3-day & 24h heads-up push notifications."}
          </Text>

          {/* Price Box */}
          <View
            style={[
              styles.priceCard,
              {
                backgroundColor: colors.forestBg,
                borderColor: colors.forestBorder,
              },
            ]}
          >
            <View style={styles.priceHeader}>
              <Text style={[styles.priceLabel, { color: colors.text }]}>
                One-Time Pro Unlock
              </Text>
              <Text style={[styles.noFeesTag, { color: colors.forest }]}>
                No Monthly Fees
              </Text>
            </View>

            <View style={styles.priceNumbersRow}>
              <Text style={[styles.strikePrice, { color: colors.textMuted }]}>
                $9.99
              </Text>
              <Text style={[styles.mainPrice, { color: colors.text }]}>
                $4.99
              </Text>
              <Text style={[styles.usdLabel, { color: colors.forest }]}>
                USD • One-Time
              </Text>
            </View>
          </View>

          {/* Features Checklist (aligned with Web ProUpgradeModal) */}
          <View style={styles.checklist}>
            {[
              {
                title: "Unlimited Subscriptions:",
                desc: "Remove the 3-subscription free tier cap permanently.",
              },
              {
                title: "3-Day & 1-Day Renewal Push Alerts:",
                desc: "Push notifications 3 days & 1 day before auto-renewal charges.",
              },
              {
                title: "Direct Official Portal Links:",
                desc: "One-tap shortcuts to official provider account portals.",
              },
              {
                title: "Zero-Bank & Zero-Third-Party Privacy:",
                desc: "No bank syncing and no external email data sharing.",
              },
            ].map((item) => (
              <View key={item.title} style={styles.checkRow}>
                <Feather name="check-circle" size={15} color={colors.forest} />
                <Text
                  style={[styles.checkText, { color: colors.textSecondary }]}
                >
                  <Text style={{ fontWeight: "800", color: colors.text }}>
                    {item.title}{" "}
                  </Text>
                  {item.desc}
                </Text>
              </View>
            ))}
          </View>

          {/* Sync Entitlement / Play Billing Action */}
          <TouchableOpacity
            onPress={handleSyncProEntitlement}
            disabled={refreshingStatus}
            style={[
              styles.checkoutBtn,
              {
                backgroundColor: "#15803d",
                opacity: refreshingStatus ? 0.6 : 1,
              },
            ]}
          >
            {refreshingStatus ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Feather name="refresh-cw" size={15} color="#ffffff" />
            )}
            <Text style={styles.checkoutBtnText}>
              Restore / Sync Pro Status
            </Text>
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity
              onPress={handleDevTestUpgrade}
              disabled={simulatingDev}
              style={[
                styles.devBtn,
                {
                  backgroundColor: colors.goldBg,
                  borderColor: colors.goldBorder,
                },
              ]}
            >
              {simulatingDev && (
                <ActivityIndicator size="small" color={colors.gold} />
              )}
              <Text style={[styles.devBtnText, { color: colors.gold }]}>
                [Dev Mode] Simulate Instant Pro Unlock
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onClose}
            style={[
              styles.dismissBtn,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.dismissBtnText, { color: colors.text }]}>
              Return to Dashboard
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </PhoneModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.84)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    gap: 13,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  launchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: 1,
  },
  launchBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
  },
  desc: {
    fontSize: 13,
    lineHeight: 19,
  },
  priceCard: {
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  priceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  noFeesTag: {
    fontSize: 11,
    fontWeight: "800",
  },
  priceNumbersRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  strikePrice: {
    fontSize: 18,
    fontWeight: "700",
    textDecorationLine: "line-through",
  },
  mainPrice: {
    fontSize: 30,
    fontWeight: "900",
  },
  usdLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  checklist: {
    gap: 9,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  checkText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 2,
  },
  checkoutBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  devBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  devBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
  dismissBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  dismissBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
