import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  BackHandler,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { Feather } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { supabase } from "./src/lib/supabase";
import {
  rolloverPastDueSubscriptions,
  getDaysUntilRenewal,
  syncRenewalNotifications,
} from "./src/lib/auditUtils";
import {
  requestPushNotificationPermissions,
  getPushPreferenceEnabled,
  setPushPreferenceEnabled,
  registerExpoPushTokenInSupabase,
  scheduleAllSubscriptionPushNotifications,
  subscribeToSimulatedPushBanners,
  type ScheduledPushSummary,
  type SimulatedAndroidBanner,
} from "./src/lib/pushNotifications";
import { AuthScreen } from "./src/screens/AuthScreen";
import { SpendAuditScreen } from "./src/screens/SpendAuditScreen";
import { VaultScreen } from "./src/screens/VaultScreen";
import { PushAlertsScreen } from "./src/screens/PushAlertsScreen";
import { AccountSettingsScreen } from "./src/screens/AccountSettingsScreen";
import { SubscriptionFormModal } from "./src/components/SubscriptionFormModal";
import { SafePortalLinkModal } from "./src/components/SafePortalLinkModal";
import { ProUpgradeModal } from "./src/components/ProUpgradeModal";
import type {
  SubscriptionRow,
  NotificationRow,
} from "./src/types/database.types";

type ActiveTab = "audit" | "vault" | "alerts" | "account";
const FREE_TIER_LIMIT = 3;

function MainShell() {
  const { user, loading: authLoading, isPro, pendingSignupRecovery } = useAuth();
  const { colors, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<ActiveTab>("audit");
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [scheduledPushes, setScheduledPushes] = useState<
    ScheduledPushSummary[]
  >([]);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [canAskPermissionAgain, setCanAskPermissionAgain] = useState(true);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [subToEdit, setSubToEdit] = useState<SubscriptionRow | null>(null);
  const [safePortalTarget, setSafePortalTarget] = useState<{
    url: string | null;
    serviceName?: string;
  }>({ url: null });
  const [proModalState, setProModalState] = useState<{
    open: boolean;
    reason: "limit_reached" | "manual";
  }>({ open: false, reason: "limit_reached" });
  const [simulatedBanner, setSimulatedBanner] =
    useState<SimulatedAndroidBanner | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToSimulatedPushBanners((banner) => {
      setSimulatedBanner(banner);
      setTimeout(() => {
        setSimulatedBanner((current) =>
          current?.id === banner.id ? null : current
        );
      }, 6500);
    });
    return unsubscribe;
  }, []);

  // Sync subscriptions, rollovers, in-app notifications, and native OS push notifications
  const syncAllVaultData = useCallback(
    async (isPullToRefresh = false) => {
      if (!user) return;
      if (isPullToRefresh) setRefreshing(true);
      else setLoadingData(true);

      try {
        // 1. Load subscriptions
        const { data: subsData, error: subsErr } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .order("renewal_date", { ascending: true });

        if (subsErr) throw subsErr;

        // 2. Roll over past-due dates and sync 3-day / 1-day renewal alerts
        const { updatedSubscriptions } = await rolloverPastDueSubscriptions(
          user.id,
          subsData || []
        );
        setSubscriptions(updatedSubscriptions);

        await syncRenewalNotifications(user.id, updatedSubscriptions);

        // 3. Load notifications from Supabase
        const { data: notifData } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        setNotifications(notifData || []);

        // 4. Schedule native 3-day & 1-day push notifications on device
        const enabledPref = await getPushPreferenceEnabled();
        setPushEnabled(enabledPref);

        const perm = await requestPushNotificationPermissions();
        setPermissionGranted(perm.granted);
        setCanAskPermissionAgain(perm.canAskAgain);

        if (enabledPref && perm.granted) {
          const armed = await scheduleAllSubscriptionPushNotifications(
            updatedSubscriptions
          );
          setScheduledPushes(armed);

          const token = await registerExpoPushTokenInSupabase(user.id);
          if (token) setExpoPushToken(token);
        } else {
          setScheduledPushes([]);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load vault data";
        Alert.alert("Sync Error", msg);
      } finally {
        setLoadingData(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (user) {
      syncAllVaultData(false);
    } else {
      setSubscriptions([]);
      setNotifications([]);
      setScheduledPushes([]);
    }
  }, [user, syncAllVaultData]);

  // Listen for user tapping on a native push notification
  useEffect(() => {
    if (Platform.OS === "web") return;
    const responseSub =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = (response.notification.request.content.data ||
          {}) as Record<string, unknown>;
        if (data.subscriptionId) {
          setActiveTab("vault");
        } else {
          setActiveTab("alerts");
        }
      });

    return () => {
      responseSub.remove();
    };
  }, []);

  // Android Hardware / Gesture Back Button handling:
  // Returns from secondary tabs (Vault / Push Alerts / Account) back to Spend Audit
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activeTab !== "audit") {
        setActiveTab("audit");
        return true;
      }
      return false;
    });
    return () => backSub.remove();
  }, [activeTab]);

  const handleOpenAddSubscription = () => {
    if (!isPro && subscriptions.length >= FREE_TIER_LIMIT) {
      setProModalState({ open: true, reason: "limit_reached" });
      return;
    }
    setSubToEdit(null);
    setIsFormOpen(true);
  };

  const handleDeleteSubscription = async (sub: SubscriptionRow) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("id", sub.id)
        .eq("user_id", user.id);

      if (error) throw error;
      const nextList = subscriptions.filter((item) => item.id !== sub.id);
      setSubscriptions(nextList);
      const armed = await scheduleAllSubscriptionPushNotifications(nextList);
      setScheduledPushes(armed);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete subscription";
      Alert.alert("Error", msg);
    }
  };

  const handleTogglePushEnabled = async (enabled: boolean) => {
    setPushEnabled(enabled);
    await setPushPreferenceEnabled(enabled, user?.id, subscriptions);
    if (enabled) {
      const armed = await scheduleAllSubscriptionPushNotifications(
        subscriptions
      );
      setScheduledPushes(armed);
    } else {
      setScheduledPushes([]);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  const handleClearReadNotifications = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id)
      .eq("is_read", true);

    if (!error) {
      setNotifications((prev) => prev.filter((n) => !n.is_read));
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView
        style={[
          styles.loadingScreen,
          { backgroundColor: colors.background },
        ]}
      >
        <StatusBar style={isDark ? "light" : "dark"} />
        <ActivityIndicator size="large" color={colors.gold} />
      </SafeAreaView>
    );
  }

  if (!user || pendingSignupRecovery) {
    return (
      <View
        style={[
          styles.outerDesktopWrap,
          Platform.OS === "web" ? styles.webOuterBackdrop : null,
        ]}
      >
        <SafeAreaView
          style={[
            styles.root,
            { backgroundColor: colors.background },
            Platform.OS === "web"
              ? [styles.webPhoneFrame, { borderColor: colors.border }]
              : null,
          ]}
        >
          <StatusBar style={isDark ? "light" : "dark"} />
          {Platform.OS === "web" && (
            <View style={styles.androidSystemStatusBar}>
              <Text style={styles.androidSystemClock}>9:41</Text>
              <View style={styles.androidCameraPunchHole} />
              <View style={styles.androidSystemIcons}>
                <Feather name="wifi" size={12} color="#cbd5e1" />
                <Feather name="battery-charging" size={13} color="#4ade80" />
              </View>
            </View>
          )}
          <AuthScreen />
        </SafeAreaView>
      </View>
    );
  }

  const unreadAlertsCount = notifications.filter((n) => !n.is_read).length;

  return (
    <View
      style={[
        styles.outerDesktopWrap,
        Platform.OS === "web" ? styles.webOuterBackdrop : null,
      ]}
    >
      <SafeAreaView
        style={[
          styles.root,
          { backgroundColor: colors.background },
          Platform.OS === "web"
            ? [styles.webPhoneFrame, { borderColor: colors.border }]
            : null,
        ]}
      >
        <StatusBar style={isDark ? "light" : "dark"} />

        {/* Simulated Android System Status Bar (on Mac Web Preview) */}
        {Platform.OS === "web" && (
          <View style={styles.androidSystemStatusBar}>
            <Text style={styles.androidSystemClock}>9:41</Text>
            <View style={styles.androidCameraPunchHole} />
            <View style={styles.androidSystemIcons}>
              <Feather name="wifi" size={12} color="#cbd5e1" />
              <Feather name="battery-charging" size={13} color="#4ade80" />
            </View>
          </View>
        )}

        {/* Top App Bar */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.brandLeft}>
          <View style={[styles.logoBox, { backgroundColor: colors.gold }]}>
            <Feather name="shield" size={18} color="#020617" />
          </View>
          <View>
            <View style={styles.brandNameRow}>
              <Text style={[styles.brandName, { color: colors.text }]}>
                SubCancel <Text style={{ color: colors.gold }}>Guard</Text>
              </Text>
              <View
                style={[
                  styles.tierPill,
                  {
                    backgroundColor: isPro ? colors.goldBg : colors.surfaceAlt,
                    borderColor: isPro ? colors.goldBorder : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tierPillText,
                    { color: isPro ? colors.gold : colors.textSecondary },
                  ]}
                >
                  {isPro
                    ? "PRO"
                    : `${subscriptions.length}/${FREE_TIER_LIMIT} Free`}
                </Text>
              </View>
            </View>
            <Text style={[styles.brandTagline, { color: colors.textMuted }]}>
              Zero-Bank Privacy • Native Push Alerts
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleOpenAddSubscription}
          style={[styles.topAddBtn, { backgroundColor: colors.gold }]}
        >
          <Feather name="plus" size={15} color="#ffffff" />
          <Text style={styles.topAddBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Main Screen Content */}
      <View style={styles.contentArea}>
        {loadingData && subscriptions.length === 0 ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={[styles.loaderText, { color: colors.textMuted }]}>
              Auditing vault & arming native push notifications...
            </Text>
          </View>
        ) : activeTab === "audit" ? (
          <SpendAuditScreen
            subscriptions={subscriptions}
            scheduledPushCount={scheduledPushes.length}
            refreshing={refreshing}
            onRefresh={() => syncAllVaultData(true)}
            onNavigateToVault={() => setActiveTab("vault")}
            onNavigateToPushAlerts={() => setActiveTab("alerts")}
            onOpenAddModal={handleOpenAddSubscription}
            onOpenSafeUrl={(url, serviceName) =>
              setSafePortalTarget({ url, serviceName })
            }
          />
        ) : activeTab === "vault" ? (
          <VaultScreen
            subscriptions={subscriptions}
            refreshing={refreshing}
            onRefresh={() => syncAllVaultData(true)}
            onOpenAdd={handleOpenAddSubscription}
            onEdit={(sub) => {
              setSubToEdit(sub);
              setIsFormOpen(true);
            }}
            onDelete={handleDeleteSubscription}
            onOpenSafeUrl={(url, serviceName) =>
              setSafePortalTarget({ url, serviceName })
            }
          />
        ) : activeTab === "alerts" ? (
          <PushAlertsScreen
            notifications={notifications}
            scheduledPushes={scheduledPushes}
            pushEnabled={pushEnabled}
            permissionGranted={permissionGranted}
            canAskPermissionAgain={canAskPermissionAgain}
            expoPushToken={expoPushToken}
            refreshing={refreshing}
            onRefresh={() => syncAllVaultData(true)}
            onTogglePushEnabled={handleTogglePushEnabled}
            onRequestPermissions={async () => {
              const res = await requestPushNotificationPermissions();
              setPermissionGranted(res.granted);
              setCanAskPermissionAgain(res.canAskAgain);
              if (res.granted) {
                const armed = await scheduleAllSubscriptionPushNotifications(
                  subscriptions
                );
                setScheduledPushes(armed);
              }
            }}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onClearRead={handleClearReadNotifications}
          />
        ) : (
          <AccountSettingsScreen
            subscriptions={subscriptions}
            onOpenProModal={() =>
              setProModalState({ open: true, reason: "manual" })
            }
          />
        )}
      </View>

      {/* Bottom Tab Navigation Bar */}
      <View
        style={[
          styles.bottomTabBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => setActiveTab("audit")}
          style={styles.tabItem}
        >
          <Feather
            name="pie-chart"
            size={19}
            color={activeTab === "audit" ? colors.gold : colors.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === "audit" ? colors.gold : colors.textMuted,
              },
            ]}
          >
            Spend Audit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("vault")}
          style={styles.tabItem}
        >
          <Feather
            name="shield"
            size={19}
            color={activeTab === "vault" ? colors.gold : colors.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === "vault" ? colors.gold : colors.textMuted,
              },
            ]}
          >
            Vault ({subscriptions.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("alerts")}
          style={styles.tabItem}
        >
          <View>
            <Feather
              name="bell"
              size={19}
              color={activeTab === "alerts" ? colors.gold : colors.textMuted}
            />
            {unreadAlertsCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {unreadAlertsCount > 9 ? "9+" : unreadAlertsCount}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === "alerts" ? colors.gold : colors.textMuted,
              },
            ]}
          >
            Push Alerts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("account")}
          style={styles.tabItem}
        >
          <Feather
            name="settings"
            size={19}
            color={activeTab === "account" ? colors.gold : colors.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color: activeTab === "account" ? colors.gold : colors.textMuted,
              },
            ]}
          >
            Account
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <SubscriptionFormModal
        visible={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSubToEdit(null);
        }}
        onSaved={() => syncAllVaultData(false)}
        subscriptionToEdit={subToEdit}
        existingSubscriptions={subscriptions}
      />

      <SafePortalLinkModal
        visible={Boolean(safePortalTarget.url)}
        url={safePortalTarget.url}
        serviceName={safePortalTarget.serviceName}
        onClose={() => setSafePortalTarget({ url: null })}
      />

      <ProUpgradeModal
        visible={proModalState.open}
        reason={proModalState.reason}
        onClose={() => setProModalState((prev) => ({ ...prev, open: false }))}
      />

      {/* Interactive Android Heads-Up Push Notification Banner (always above modals) */}
      {simulatedBanner && (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => {
            const targetSub = simulatedBanner.subscriptionId;
            setSimulatedBanner(null);
            setIsFormOpen(false);
            setActiveTab(targetSub ? "vault" : "alerts");
          }}
          style={styles.androidHeadsUpBanner}
        >
          <View style={styles.headsUpTopRow}>
            <View style={styles.headsUpAppRow}>
              <View style={styles.headsUpBadgeIcon}>
                <Feather name="shield" size={11} color="#020617" />
              </View>
              <Text style={styles.headsUpAppName}>
                SubCancel Guard • {simulatedBanner.channelName}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSimulatedBanner(null)}>
              <Feather name="x" size={15} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headsUpTitle}>{simulatedBanner.title}</Text>
          <Text style={styles.headsUpBody}>{simulatedBanner.body}</Text>
        </TouchableOpacity>
      )}
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <MainShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  outerDesktopWrap: {
    flex: 1,
  },
  webOuterBackdrop: {
    backgroundColor: "#090d16",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  webPhoneFrame: {
    position: "relative",
    width: "100%",
    maxWidth: 420,
    maxHeight: 880,
    borderRadius: 34,
    borderWidth: 3,
    overflow: "hidden",
  },
  androidSystemStatusBar: {
    height: 30,
    backgroundColor: "#020617",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  androidSystemClock: {
    color: "#e2e8f0",
    fontSize: 11,
    fontWeight: "700",
  },
  androidCameraPunchHole: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#1e293b",
  },
  androidSystemIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  androidHeadsUpBanner: {
    position: "absolute",
    top: 38,
    left: 12,
    right: 12,
    zIndex: 999,
    backgroundColor: "#0f172a",
    borderColor: "#d4a017",
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 13,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  headsUpTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headsUpAppRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headsUpBadgeIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: "#d4a017",
    alignItems: "center",
    justifyContent: "center",
  },
  headsUpAppName: {
    color: "#fde047",
    fontSize: 10,
    fontWeight: "800",
  },
  headsUpTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  headsUpBody: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 16,
  },
  root: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  brandLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  brandNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  brandName: {
    fontSize: 17,
    fontWeight: "900",
  },
  tierPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    borderWidth: 1,
  },
  tierPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  brandTagline: {
    fontSize: 10,
    marginTop: 1,
  },
  topAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 11,
  },
  topAddBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  contentArea: {
    flex: 1,
  },
  centerLoader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loaderText: {
    fontSize: 12,
  },
  bottomTabBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 68,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  tabBadge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: "#e11d48",
    borderRadius: 99,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  tabBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
});
