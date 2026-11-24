import { Platform, Linking } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { getDaysUntilRenewal } from "./auditUtils";
import type { SubscriptionRow } from "../types/database.types";

const PUSH_ENABLED_STORAGE_KEY = "subcancel_push_enabled_v1";
const IMMEDIATE_ALERT_LOG_KEY = "subcancel_immediate_push_log_v1";

// Dedicated Android 8.0+ (API 26+) Notification Channels
export const ANDROID_URGENT_CHANNEL_ID = "renewal-urgent";
export const ANDROID_ADVANCE_CHANNEL_ID = "renewal-advance";

// Configure foreground push presentation (Heads-up Banner + Sound + Badge on Android)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export interface ScheduledPushSummary {
  identifier: string;
  subscriptionId: string;
  subscriptionName: string;
  alertType: "3-day" | "1-day" | "today" | "test";
  title: string;
  body: string;
  triggerDate: string;
}

export interface SimulatedAndroidBanner {
  id: string;
  title: string;
  body: string;
  channelName: string;
  subscriptionId?: string;
}

type BannerListener = (banner: SimulatedAndroidBanner) => void;
const bannerListeners = new Set<BannerListener>();

export function subscribeToSimulatedPushBanners(
  listener: BannerListener
): () => void {
  bannerListeners.add(listener);
  return () => {
    bannerListeners.delete(listener);
  };
}

function emitSimulatedBanner(banner: SimulatedAndroidBanner) {
  bannerListeners.forEach((fn) => fn(banner));
}

// In-memory scheduled queue used only when previewing on Mac web browser
let webSimulatedQueue: ScheduledPushSummary[] = [];

/**
 * Opens the Android App Notification Settings screen if the user previously
 * denied Android 13+ POST_NOTIFICATIONS permission ("Don't allow").
 */
export async function openAndroidNotificationSettings(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Linking.openSettings();
  } catch {
    // ignore
  }
}

/**
 * Registers Android 8.0+ Notification Channels (Urgent 24h & 3-Day Advance)
 * and requests Android 13+ (API 33+) POST_NOTIFICATIONS runtime permission.
 */
export async function requestPushNotificationPermissions(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (Platform.OS === "web") {
    // In lightweight Mac preview mode, simulate granted Android push permission
    return { granted: true, canAskAgain: true };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_URGENT_CHANNEL_ID, {
      name: "Urgent 24h Renewal Warnings",
      description:
        "Final 24-hour and same-day heads-up push alerts before subscription charges hit",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: "#b8860b",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync(ANDROID_ADVANCE_CHANNEL_ID, {
      name: "3-Day Advance Renewal Alerts",
      description:
        "Advance 3-day warning push notifications for upcoming subscription renewals",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: "#16a34a",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      sound: "default",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  let canAskAgain = existing.canAskAgain ?? true;

  if (existing.status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
    canAskAgain = requested.canAskAgain ?? false;
  }

  return {
    granted: finalStatus === "granted",
    canAskAgain,
  };
}

/**
 * Reads user preference for local & FCM push notifications (defaults to true).
 */
export async function getPushPreferenceEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(PUSH_ENABLED_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

/**
 * Toggles Android push notifications on or off on this device.
 */
export async function setPushPreferenceEnabled(
  enabled: boolean,
  userId?: string,
  subscriptions: SubscriptionRow[] = []
): Promise<void> {
  await AsyncStorage.setItem(PUSH_ENABLED_STORAGE_KEY, enabled ? "true" : "false");

  if (!enabled) {
    webSimulatedQueue = [];
    if (Platform.OS !== "web") {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
    if (userId) {
      try {
        await supabase
          .from("push_tokens")
          .update({ enabled: false })
          .eq("user_id", userId);
      } catch {
        // Optional remote push_tokens table may not be applied yet
      }
    }
  } else {
    await scheduleAllSubscriptionPushNotifications(subscriptions);
    if (userId) {
      await registerExpoPushTokenInSupabase(userId);
    }
  }
}

/**
 * Registers the Android device's Expo/FCM Push Token in Supabase (public.push_tokens)
 * for optional server-side remote push notifications (Zero SMS / Zero Phone Number).
 */
export async function registerExpoPushTokenInSupabase(
  userId: string
): Promise<string | null> {
  if (!userId || Platform.OS === "web") return null;

  try {
    const { granted } = await requestPushNotificationPermissions();
    if (!granted || !Device.isDevice) {
      return null;
    }

    const projectId =
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const expoPushToken = tokenResponse.data;
    if (!expoPushToken) return null;

    await supabase.from("push_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform: "android",
        device_name: Device.modelName || Device.deviceName || "Android Device",
        enabled: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,expo_push_token",
      }
    );

    return expoPushToken;
  } catch {
    return null;
  }
}

function getTriggerDateBeforeRenewal(
  renewalDateStr: string,
  daysBefore: number,
  hour = 9,
  minute = 0
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDateStr)) return null;
  const [year, month, day] = renewalDateStr.split("-").map(Number);
  const target = new Date(year, month - 1, day, hour, minute, 0, 0);
  target.setDate(target.getDate() - daysBefore);
  return target;
}

/**
 * Schedules native Android Push Notifications (3-Day Advance Warning on `renewal-advance` channel,
 * and 1-Day Final 24h Warning + Renewal Day Reminder on `renewal-urgent` channel).
 * Also simulates the exact Android notification queue & heads-up banner when previewing on Mac!
 */
export async function scheduleAllSubscriptionPushNotifications(
  subscriptions: SubscriptionRow[]
): Promise<ScheduledPushSummary[]> {
  const pushEnabled = await getPushPreferenceEnabled();
  if (!pushEnabled) {
    webSimulatedQueue = [];
    if (Platform.OS !== "web") {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
    return [];
  }

  const { granted } = await requestPushNotificationPermissions();
  if (!granted) return [];

  if (Platform.OS !== "web") {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  const now = new Date();
  const scheduledSummaries: ScheduledPushSummary[] = [];

  let immediateLog: Record<string, string> = {};
  try {
    const raw = await AsyncStorage.getItem(IMMEDIATE_ALERT_LOG_KEY);
    if (raw) immediateLog = JSON.parse(raw);
  } catch {
    immediateLog = {};
  }
  const todayKey = now.toISOString().slice(0, 10);
  let immediateLogChanged = false;

  for (const sub of subscriptions) {
    const costFormatted = `$${Number(sub.cost).toFixed(2)}/${sub.billing_cycle}`;
    const daysLeft = getDaysUntilRenewal(sub.renewal_date);

    // 1. 3-Day Advance Push Notification (9:00 AM local time, 3 days prior)
    const threeDayTrigger = getTriggerDateBeforeRenewal(sub.renewal_date, 3, 9, 0);
    const threeDayTitle = `⚠️ 3-Day Renewal Alert: ${sub.name}`;
    const threeDayBody = `${sub.name} renews in 3 days (${costFormatted}). Cancel now via your official portal link to prevent an unwanted charge.`;

    if (threeDayTrigger && threeDayTrigger.getTime() > now.getTime()) {
      let id = `sim_${sub.id}_3d`;
      if (Platform.OS !== "web") {
        id = await Notifications.scheduleNotificationAsync({
          content: {
            title: threeDayTitle,
            body: threeDayBody,
            sound: "default",
            color: "#b8860b",
            data: {
              subscriptionId: sub.id,
              subscriptionName: sub.name,
              cancelUrl: sub.cancel_url,
              alertType: "3-day",
              triggerDate: threeDayTrigger.toISOString(),
            },
            ...(Platform.OS === "android"
              ? { channelId: ANDROID_ADVANCE_CHANNEL_ID }
              : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: threeDayTrigger,
            ...(Platform.OS === "android"
              ? { channelId: ANDROID_ADVANCE_CHANNEL_ID }
              : {}),
          },
        });
      }

      scheduledSummaries.push({
        identifier: id,
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        alertType: "3-day",
        title: threeDayTitle,
        body: threeDayBody,
        triggerDate: threeDayTrigger.toISOString(),
      });
    }

    if (daysLeft === 3) {
      const logKey = `${sub.id}_3day_${sub.renewal_date}`;
      if (immediateLog[logKey] !== todayKey) {
        if (Platform.OS === "web") {
          emitSimulatedBanner({
            id: `${Date.now()}_${sub.id}_3d`,
            title: threeDayTitle,
            body: threeDayBody,
            channelName: "3-Day Advance Renewal Alerts • now",
            subscriptionId: sub.id,
          });
        } else {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: threeDayTitle,
              body: threeDayBody,
              sound: "default",
              color: "#b8860b",
              data: {
                subscriptionId: sub.id,
                subscriptionName: sub.name,
                cancelUrl: sub.cancel_url,
                alertType: "3-day",
              },
              ...(Platform.OS === "android"
                ? { channelId: ANDROID_ADVANCE_CHANNEL_ID }
                : {}),
            },
            trigger: null,
          });
        }
        immediateLog[logKey] = todayKey;
        immediateLogChanged = true;
      }
    }

    // 2. 1-Day Final 24h Push Notification (9:00 AM local time, 1 day prior)
    const oneDayTrigger = getTriggerDateBeforeRenewal(sub.renewal_date, 1, 9, 0);
    const oneDayTitle = `🚨 Final 24h Warning: ${sub.name}`;
    const oneDayBody = `${sub.name} (${costFormatted}) renews tomorrow! Tap to open SubCancel Guard and access your official Manage Subscription Link.`;

    if (oneDayTrigger && oneDayTrigger.getTime() > now.getTime()) {
      let id = `sim_${sub.id}_1d`;
      if (Platform.OS !== "web") {
        id = await Notifications.scheduleNotificationAsync({
          content: {
            title: oneDayTitle,
            body: oneDayBody,
            sound: "default",
            color: "#e11d48",
            data: {
              subscriptionId: sub.id,
              subscriptionName: sub.name,
              cancelUrl: sub.cancel_url,
              alertType: "1-day",
              triggerDate: oneDayTrigger.toISOString(),
            },
            ...(Platform.OS === "android"
              ? { channelId: ANDROID_URGENT_CHANNEL_ID }
              : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: oneDayTrigger,
            ...(Platform.OS === "android"
              ? { channelId: ANDROID_URGENT_CHANNEL_ID }
              : {}),
          },
        });
      }

      scheduledSummaries.push({
        identifier: id,
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        alertType: "1-day",
        title: oneDayTitle,
        body: oneDayBody,
        triggerDate: oneDayTrigger.toISOString(),
      });
    }

    if (daysLeft === 1) {
      const logKey = `${sub.id}_1day_${sub.renewal_date}`;
      if (immediateLog[logKey] !== todayKey) {
        if (Platform.OS === "web") {
          emitSimulatedBanner({
            id: `${Date.now()}_${sub.id}_1d`,
            title: oneDayTitle,
            body: oneDayBody,
            channelName: "Urgent 24h Renewal Warnings • now",
            subscriptionId: sub.id,
          });
        } else {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: oneDayTitle,
              body: oneDayBody,
              sound: "default",
              color: "#e11d48",
              data: {
                subscriptionId: sub.id,
                subscriptionName: sub.name,
                cancelUrl: sub.cancel_url,
                alertType: "1-day",
              },
              ...(Platform.OS === "android"
                ? { channelId: ANDROID_URGENT_CHANNEL_ID }
                : {}),
            },
            trigger: null,
          });
        }
        immediateLog[logKey] = todayKey;
        immediateLogChanged = true;
      }
    }

    // 3. Renewal Day Morning Reminder (8:30 AM local time on renewal date)
    const sameDayTrigger = getTriggerDateBeforeRenewal(sub.renewal_date, 0, 8, 30);
    const sameDayTitle = `🔔 Renewing Today: ${sub.name}`;
    const sameDayBody = `${sub.name} (${costFormatted}) is scheduled to renew today. Verify your billing status in SubCancel Guard.`;

    if (sameDayTrigger && sameDayTrigger.getTime() > now.getTime()) {
      let id = `sim_${sub.id}_0d`;
      if (Platform.OS !== "web") {
        id = await Notifications.scheduleNotificationAsync({
          content: {
            title: sameDayTitle,
            body: sameDayBody,
            sound: "default",
            color: "#b8860b",
            data: {
              subscriptionId: sub.id,
              subscriptionName: sub.name,
              cancelUrl: sub.cancel_url,
              alertType: "today",
              triggerDate: sameDayTrigger.toISOString(),
            },
            ...(Platform.OS === "android"
              ? { channelId: ANDROID_URGENT_CHANNEL_ID }
              : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: sameDayTrigger,
            ...(Platform.OS === "android"
              ? { channelId: ANDROID_URGENT_CHANNEL_ID }
              : {}),
          },
        });
      }

      scheduledSummaries.push({
        identifier: id,
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        alertType: "today",
        title: sameDayTitle,
        body: sameDayBody,
        triggerDate: sameDayTrigger.toISOString(),
      });
    }
  }

  if (immediateLogChanged) {
    try {
      await AsyncStorage.setItem(
        IMMEDIATE_ALERT_LOG_KEY,
        JSON.stringify(immediateLog)
      );
    } catch {
      // ignore
    }
  }

  const sorted = scheduledSummaries.sort(
    (a, b) =>
      new Date(a.triggerDate).getTime() - new Date(b.triggerDate).getTime()
  );
  webSimulatedQueue = sorted;
  return sorted;
}

export async function getScheduledPushNotifications(): Promise<
  ScheduledPushSummary[]
> {
  if (Platform.OS === "web") return webSimulatedQueue;
  try {
    const rawList = await Notifications.getAllScheduledNotificationsAsync();
    return rawList.map((item) => {
      const data = (item.content.data || {}) as Record<string, unknown>;
      return {
        identifier: item.identifier,
        subscriptionId: String(data.subscriptionId || ""),
        subscriptionName: String(data.subscriptionName || "Subscription"),
        alertType:
          (data.alertType as "3-day" | "1-day" | "today" | "test") || "3-day",
        title: item.content.title || "SubCancel Guard Alert",
        body: item.content.body || "",
        triggerDate: String(data.triggerDate || new Date().toISOString()),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fires an instant preview of the 24-hour or 3-day renewal push notification banner
 * when the user taps "+1 Day (Test 24h Alert)" or "+3 Days (Test 3d Alert)".
 */
export async function triggerInstantRenewalTestPush(
  daysBefore: 1 | 3,
  rawName?: string,
  rawCost?: string,
  billingCycle: string = "monthly"
): Promise<void> {
  const displaySubName = (rawName || "").trim() || "Sample Subscription";
  const parsedCost = parseFloat(rawCost || "");
  const costStr = !isNaN(parsedCost) && parsedCost >= 0 ? `$${parsedCost.toFixed(2)}/${billingCycle}` : `$15.99/${billingCycle}`;

  const title =
    daysBefore === 1
      ? `🚨 Final 24h Warning: ${displaySubName}`
      : `⚠️ 3-Day Renewal Alert: ${displaySubName}`;
  const body =
    daysBefore === 1
      ? `${displaySubName} (${costStr}) renews tomorrow! Tap to open SubCancel Guard and access your official Manage Subscription Link.`
      : `${displaySubName} renews in 3 days (${costStr}). Cancel now via your official portal link to prevent an unwanted charge.`;

  if (Platform.OS === "web") {
    emitSimulatedBanner({
      id: `instant_${daysBefore}d_${Date.now()}`,
      title,
      body,
      channelName:
        daysBefore === 1
          ? "Urgent 24h Renewal Warnings • now"
          : "3-Day Advance Renewal Alerts • now",
    });
    return;
  }

  const { granted } = await requestPushNotificationPermissions();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      color: daysBefore === 1 ? "#e11d48" : "#b8860b",
      data: { alertType: daysBefore === 1 ? "1-day" : "3-day" },
      ...(Platform.OS === "android"
        ? {
            channelId:
              daysBefore === 1
                ? ANDROID_URGENT_CHANNEL_ID
                : ANDROID_ADVANCE_CHANNEL_ID,
          }
        : {}),
    },
    trigger: null,
  });
}

/**
 * Fires an instant Android heads-up Push Notification (on real Android via `expo-notifications`,
 * and in Mac screen preview via the interactive Android Heads-Up Banner overlay!).
 */
export async function sendTestPushNotification(): Promise<{
  sent: boolean;
  canAskAgain?: boolean;
  error?: string;
}> {
  const pushEnabled = await getPushPreferenceEnabled();
  if (!pushEnabled) {
    return {
      sent: false,
      error: "Push notifications are currently turned off. Flip the switch above to enable them first!",
    };
  }

  if (Platform.OS === "web") {
    emitSimulatedBanner({
      id: `test_${Date.now()}`,
      title: "🛡️ SubCancel Guard Android Push Active!",
      body: "Native Android 3-day & 24h renewal push alerts are armed on your phone — zero SMS or phone number required.",
      channelName: "Urgent 24h Renewal Warnings • now",
    });
    return { sent: true };
  }

  const { granted, canAskAgain } = await requestPushNotificationPermissions();
  if (!granted) {
    return {
      sent: false,
      canAskAgain,
      error:
        "Android notification permission is turned off. Tap 'Open Android Settings' to allow notifications for SubCancel Guard.",
    };
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🛡️ SubCancel Guard Android Push Active!",
      body: "Native Android 3-day & 24h renewal push alerts are armed on your phone — zero SMS or phone number required.",
      sound: "default",
      color: "#b8860b",
      data: {
        alertType: "test",
      },
      ...(Platform.OS === "android"
        ? { channelId: ANDROID_URGENT_CHANNEL_ID }
        : {}),
    },
    trigger: null,
  });

  return { sent: true };
}
