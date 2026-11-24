import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PhoneModal } from "./PhoneModal";
import { formatCurrency, formatDate } from "../lib/utils";
import { getDaysUntilRenewal } from "../lib/auditUtils";
import { useTheme } from "../context/ThemeContext";
import type { SubscriptionRow } from "../types/database.types";

interface PlaybookModalProps {
  visible: boolean;
  subscription: SubscriptionRow | null;
  onClose: () => void;
  onOpenSafeUrl: (url: string, serviceName: string) => void;
}

export function PlaybookModal({
  visible,
  subscription,
  onClose,
  onOpenSafeUrl,
}: PlaybookModalProps) {
  const { colors } = useTheme();
  if (!visible || !subscription) return null;

  const daysUntilRenewal = getDaysUntilRenewal(subscription.renewal_date);
  const isLinkBroken =
    subscription.link_status === "broken" ||
    subscription.link_status === "unreachable" ||
    subscription.link_status === "error";

  return (
    <PhoneModal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View
            style={[styles.header, { borderBottomColor: colors.border }]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.catBadge,
                    { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <Text
                    style={[
                      styles.catBadgeText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {subscription.category}
                  </Text>
                </View>

                <View
                  style={[
                    styles.verifiedBadge,
                    {
                      backgroundColor: colors.forestBg,
                      borderColor: colors.forestBorder,
                    },
                  ]}
                >
                  <Feather name="shield" size={11} color={colors.forest} />
                  <Text
                    style={[styles.verifiedText, { color: colors.forest }]}
                  >
                    Verified Portal Playbook
                  </Text>
                </View>
              </View>

              <Text style={[styles.title, { color: colors.text }]}>
                {subscription.name}
              </Text>

              <View style={styles.priceRow}>
                <Text style={[styles.price, { color: colors.forest }]}>
                  {formatCurrency(Number(subscription.cost))}
                </Text>
                <Text style={[styles.cycle, { color: colors.textMuted }]}>
                  / {subscription.billing_cycle}
                </Text>
              </View>
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

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
          >
            {/* Renewal Timing Banner */}
            <View
              style={[
                styles.renewalBanner,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.renewalLeft}>
                <Feather
                  name="calendar"
                  size={15}
                  color={colors.textSecondary}
                />
                <Text
                  style={[
                    styles.renewalLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  Next Renewal:{" "}
                  <Text style={{ fontWeight: "800", color: colors.text }}>
                    {formatDate(subscription.renewal_date)}
                  </Text>
                </Text>
              </View>

              <View
                style={[
                  styles.daysPill,
                  {
                    backgroundColor:
                      daysUntilRenewal <= 3
                        ? colors.roseBg
                        : colors.surfaceAlt,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.daysPillText,
                    {
                      color:
                        daysUntilRenewal <= 3
                          ? colors.rose
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {daysUntilRenewal <= 0
                    ? "Renews today"
                    : `${daysUntilRenewal}d remaining`}
                </Text>
              </View>
            </View>

            {/* Section 1: Manage Subscription Portal */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.sectionTitleRow}>
                <Feather name="compass" size={15} color={colors.gold} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Manage Subscription Portal
                </Text>
              </View>

              {subscription.cancel_url ? (
                <>
                  {isLinkBroken ? (
                    <View
                      style={[
                        styles.brokenBox,
                        {
                          backgroundColor: colors.goldBg,
                          borderColor: colors.goldBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.brokenTitle, { color: colors.gold }]}
                      >
                        ⚠️ Portal Link May Be Outdated ({subscription.link_status})
                      </Text>
                      <Text
                        style={[
                          styles.brokenDesc,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Our health check detected that this link may have
                        changed. You can still test the button below or sign in
                        to the provider’s main account portal directly.
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.sectionDesc,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Sign in to your official provider account portal below to
                      review, manage, or cancel your subscription:
                    </Text>
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      const url = subscription.cancel_url!;
                      onClose();
                      onOpenSafeUrl(url, subscription.name);
                    }}
                    style={[
                      styles.portalBtn,
                      {
                        backgroundColor: isLinkBroken
                          ? colors.surfaceAlt
                          : "#e11d48",
                      },
                    ]}
                  >
                    <Text style={styles.portalBtnText}>
                      {isLinkBroken
                        ? "Attempt Link Anyway"
                        : "Open Manage Subscription Link"}
                    </Text>
                    <Feather name="external-link" size={15} color="#ffffff" />
                  </TouchableOpacity>
                </>
              ) : (
                <Text
                  style={[
                    styles.sectionDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  No direct URL configured for {subscription.name}. Sign in to
                  your provider account and navigate to{" "}
                  <Text style={{ fontWeight: "700", color: colors.text }}>
                    Settings → Account / Billing → Manage Plan
                  </Text>
                  .
                </Text>
              )}
            </View>

            {/* Section 2: Standard Cancellation Checklist */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.sectionTitleRow}>
                <Feather name="check-square" size={15} color={colors.forest} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Anti-Dark-Pattern Cancellation Checklist
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <View
                  style={[styles.dot, { backgroundColor: colors.forest }]}
                />
                <Text
                  style={[styles.bulletText, { color: colors.textSecondary }]}
                >
                  Follow the direct portal link above to bypass marketing
                  homepages and go straight to Account / Billing settings.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <View
                  style={[styles.dot, { backgroundColor: colors.forest }]}
                />
                <Text
                  style={[styles.bulletText, { color: colors.textSecondary }]}
                >
                  Watch out for &ldquo;Pause Membership&rdquo; decoys — confirm
                  cancellation all the way to the final confirmation screen.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <View
                  style={[styles.dot, { backgroundColor: colors.forest }]}
                />
                <Text
                  style={[styles.bulletText, { color: colors.textSecondary }]}
                >
                  Save or screenshot your official cancellation confirmation
                  receipt.
                </Text>
              </View>
            </View>

            {/* Section 3: Paid Billing Period Protection */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.sectionTitleRow}>
                <Feather name="shield" size={15} color={colors.gold} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Paid Billing Period Protection
                </Text>
              </View>
              <Text
                style={[styles.sectionDesc, { color: colors.textSecondary }]}
              >
                When cancelling early, service providers typically maintain
                active access through the remainder of your current paid billing
                period ({formatDate(subscription.renewal_date)}).
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeFooterBtn,
                { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <Text style={[styles.closeFooterText, { color: colors.text }]}>
                Close Playbook
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </PhoneModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.8)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    gap: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: "700",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  price: {
    fontSize: 18,
    fontWeight: "900",
  },
  cycle: {
    fontSize: 12,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  body: {
    paddingHorizontal: 20,
  },
  bodyContent: {
    paddingVertical: 16,
    gap: 14,
  },
  renewalBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  renewalLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  renewalLabel: {
    fontSize: 12,
  },
  daysPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  daysPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  brokenBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  brokenTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  brokenDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  portalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 2,
  },
  portalBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  closeFooterBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  closeFooterText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
