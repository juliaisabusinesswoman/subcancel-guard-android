import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatDate } from "../lib/utils";
import {
  sendTestPushNotification,
  openAndroidNotificationSettings,
  type ScheduledPushSummary,
} from "../lib/pushNotifications";
import { useTheme } from "../context/ThemeContext";
import type { NotificationRow } from "../types/database.types";

interface PushAlertsScreenProps {
  notifications: NotificationRow[];
  scheduledPushes: ScheduledPushSummary[];
  pushEnabled: boolean;
  permissionGranted: boolean;
  canAskPermissionAgain?: boolean;
  expoPushToken: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onTogglePushEnabled: (enabled: boolean) => void;
  onRequestPermissions: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearRead?: () => void;
}

export function PushAlertsScreen({
  notifications,
  scheduledPushes,
  pushEnabled,
  permissionGranted,
  canAskPermissionAgain = true,
  expoPushToken,
  refreshing,
  onRefresh,
  onTogglePushEnabled,
  onRequestPermissions,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearRead,
}: PushAlertsScreenProps) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [sendingTest, setSendingTest] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const readCount = notifications.length - unreadCount;
  const displayedNotifications =
    filter === "unread"
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  const handleTestPush = async () => {
    setSendingTest(true);
    try {
      const result = await sendTestPushNotification();
      if (!result.sent && result.error) {
        if (result.canAskAgain === false) {
          Alert.alert("Android Notifications Disabled", result.error, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Android Settings",
              onPress: () => openAndroidNotificationSettings(),
            },
          ]);
        } else {
          Alert.alert("Push Notification Notice", result.error);
        }
      }
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* 1. Native Push Notification Control Center (Zero SMS) */}
      <View
        style={[
          styles.pushCenterCard,
          {
            backgroundColor: colors.surface,
            borderColor:
              pushEnabled && permissionGranted
                ? colors.forestBorder
                : colors.border,
          },
        ]}
      >
        <View style={styles.pushHeaderRow}>
          <View style={styles.pushTitleLeft}>
            <View
              style={[
                styles.pushIconBox,
                {
                  backgroundColor:
                    pushEnabled && permissionGranted
                      ? colors.forestBg
                      : colors.surfaceAlt,
                },
              ]}
            >
              <Feather
                name={pushEnabled ? "bell" : "bell-off"}
                size={18}
                color={
                  pushEnabled && permissionGranted
                    ? colors.forest
                    : colors.textMuted
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pushTitle, { color: colors.text }]}>
                Android Push Notifications
              </Text>
              <Text
                style={[styles.pushSubtitle, { color: colors.textSecondary }]}
              >
                Android Notification Channels & FCM • Zero SMS or Phone Numbers
              </Text>
            </View>
          </View>

          <Switch
            value={pushEnabled}
            onValueChange={onTogglePushEnabled}
            trackColor={{ false: colors.surfaceAlt, true: "#16a34a" }}
            thumbColor="#ffffff"
          />
        </View>

        {/* Permission & Status Pills */}
        <View
          style={[
            styles.statusBox,
            {
              backgroundColor: colors.surfaceHighlight,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.statusItemRow}>
            <Text style={[styles.statusLabel, { color: colors.textMuted }]}>
              OS Push Permission
            </Text>
            {!pushEnabled ? (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <Feather name="pause-circle" size={12} color={colors.textMuted} />
                <Text
                  style={[styles.statusBadgeText, { color: colors.textMuted }]}
                >
                  Paused (Switch Off)
                </Text>
              </View>
            ) : permissionGranted ? (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: colors.forestBg },
                ]}
              >
                <Feather name="check-circle" size={12} color={colors.forest} />
                <Text
                  style={[styles.statusBadgeText, { color: colors.forest }]}
                >
                  Granted & Active
                </Text>
              </View>
            ) : canAskPermissionAgain ? (
              <TouchableOpacity
                onPress={onRequestPermissions}
                style={[
                  styles.statusBadge,
                  { backgroundColor: colors.goldBg },
                ]}
              >
                <Feather name="alert-circle" size={12} color={colors.gold} />
                <Text style={[styles.statusBadgeText, { color: colors.gold }]}>
                  Tap to Allow on Android
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={openAndroidNotificationSettings}
                style={[
                  styles.statusBadge,
                  { backgroundColor: colors.roseBg },
                ]}
              >
                <Feather name="settings" size={12} color={colors.rose} />
                <Text style={[styles.statusBadgeText, { color: colors.rose }]}>
                  Open Android Settings
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.statusItemRow}>
            <Text style={[styles.statusLabel, { color: colors.textMuted }]}>
              Upcoming Reminders
            </Text>
            <Text style={[styles.statusValText, { color: colors.text }]}>
              {scheduledPushes.length} scheduled (3-day & 1-day)
            </Text>
          </View>

          {expoPushToken && (
            <View style={styles.statusItemRow}>
              <Text style={[styles.statusLabel, { color: colors.textMuted }]}>
                Device Push Token
              </Text>
              <Text
                style={[styles.statusValText, { color: colors.forest }]}
                numberOfLines={1}
              >
                {expoPushToken.slice(0, 26)}...
              </Text>
            </View>
          )}
        </View>

        {/* Test Push Notification Button */}
        <TouchableOpacity
          onPress={handleTestPush}
          disabled={sendingTest}
          style={[styles.testPushBtn, { backgroundColor: colors.gold }]}
        >
          <Feather name="send" size={14} color="#ffffff" />
          <Text style={styles.testPushBtnText}>
            Send Test Push Notification Now
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. In-App Renewal Alert Log (Synced with Supabase notifications table) */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Renewal Alert History
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              Synced with your SubCancel Guard vault
            </Text>
          </View>

          <View style={styles.historyActionsRow}>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={onMarkAllAsRead}
                style={styles.markAllBtn}
              >
                <Feather name="check-square" size={13} color={colors.forest} />
                <Text style={[styles.markAllText, { color: colors.forest }]}>
                  Mark all read
                </Text>
              </TouchableOpacity>
            )}

            {readCount > 0 && onClearRead && (
              <TouchableOpacity
                onPress={onClearRead}
                style={[
                  styles.clearReadBtn,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Feather name="trash-2" size={12} color={colors.textSecondary} />
                <Text
                  style={[styles.clearReadText, { color: colors.textSecondary }]}
                >
                  Clear Read
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter Tabs */}
        <View
          style={[
            styles.tabSwitchRow,
            {
              backgroundColor: colors.surfaceHighlight,
              borderColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => setFilter("all")}
            style={[
              styles.tabBtn,
              {
                backgroundColor:
                  filter === "all" ? colors.surface : "transparent",
              },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                {
                  color: filter === "all" ? colors.text : colors.textSecondary,
                },
              ]}
            >
              All ({notifications.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilter("unread")}
            style={[
              styles.tabBtn,
              {
                backgroundColor:
                  filter === "unread" ? colors.surface : "transparent",
              },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                {
                  color:
                    filter === "unread" ? colors.text : colors.textSecondary,
                },
              ]}
            >
              Unread ({unreadCount})
            </Text>
          </TouchableOpacity>
        </View>

        {displayedNotifications.length === 0 ? (
          <View style={styles.emptyNotifBox}>
            <Feather name="bell" size={24} color={colors.textMuted} />
            <Text style={[styles.emptyNotifTitle, { color: colors.text }]}>
              {filter === "unread"
                ? "No unread alerts"
                : "No renewal alerts logged yet"}
            </Text>
            <Text
              style={[styles.emptyNotifDesc, { color: colors.textSecondary }]}
            >
              SubCancel Guard logs alerts 3 days and 1 day before scheduled
              renewals, and whenever past-due cycles roll over.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {displayedNotifications.map((n) => (
              <View
                key={n.id}
                style={[
                  styles.notifCard,
                  {
                    backgroundColor: n.is_read
                      ? colors.surfaceHighlight
                      : colors.surface,
                    borderColor: n.is_read
                      ? colors.border
                      : colors.forestBorder,
                  },
                ]}
              >
                <View style={styles.notifTopRow}>
                  <View style={styles.notifTitleWrap}>
                    {!n.is_read && (
                      <View
                        style={[
                          styles.unreadDot,
                          { backgroundColor: colors.forest },
                        ]}
                      />
                    )}
                    <Text
                      style={[styles.notifTitle, { color: colors.text }]}
                    >
                      {n.title}
                    </Text>
                  </View>

                  {!n.is_read && (
                    <TouchableOpacity
                      onPress={() => onMarkAsRead(n.id)}
                      style={[
                        styles.markReadIconBtn,
                        { backgroundColor: colors.forestBg },
                      ]}
                    >
                      <Feather name="check" size={13} color={colors.forest} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text
                  style={[styles.notifMsg, { color: colors.textSecondary }]}
                >
                  {n.message}
                </Text>

                <View
                  style={[
                    styles.notifFooter,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <Text
                    style={[styles.notifDate, { color: colors.textMuted }]}
                  >
                    {formatDate(n.created_at)}
                  </Text>
                  {n.is_read && (
                    <Text
                      style={[styles.readLabel, { color: colors.textMuted }]}
                    >
                      Read
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  pushCenterCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  pushHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  pushTitleLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pushIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  pushTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  pushSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  statusBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  statusItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusValText: {
    fontSize: 12,
    fontWeight: "700",
  },
  testPushBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  testPushBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  sectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyQueueBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  emptyQueueText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  queueRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  queueTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  queueTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
  },
  queueTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  queueTypeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  queueBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  queueTime: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "700",
  },
  historyActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clearReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearReadText: {
    fontSize: 11,
    fontWeight: "700",
  },
  tabSwitchRow: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyNotifBox: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyNotifTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  emptyNotifDesc: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  notifCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  notifTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  notifTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notifTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
  },
  markReadIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  notifMsg: {
    fontSize: 12,
    lineHeight: 18,
  },
  notifFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
  },
  notifDate: {
    fontSize: 11,
  },
  readLabel: {
    fontSize: 11,
  },
});
