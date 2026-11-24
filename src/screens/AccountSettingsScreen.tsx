import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
  Platform,
  Linking,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { PhoneModal } from "../components/PhoneModal";
import { useAuth, type RecoveryKeyInfo } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  generateVaultRecoveryKey,
  copyTextToClipboard,
} from "../lib/recoveryKey";
import { formatLocalISODate, normalizeToMonthly } from "../lib/auditUtils";
import type { SubscriptionRow } from "../types/database.types";

interface AccountSettingsScreenProps {
  subscriptions: SubscriptionRow[];
  onOpenProModal: () => void;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const str = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function AccountSettingsScreen({
  subscriptions,
  onOpenProModal,
}: AccountSettingsScreenProps) {
  const {
    user,
    isPro,
    getRecoveryKeyInfo,
    saveRecoveryKey,
    confirmRecoveryKeyCopied,
    deleteOwnAccount,
    signOut,
  } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  const [keyInfo, setKeyInfo] = useState<RecoveryKeyInfo | null>(null);
  const [freshRecoveryKey, setFreshRecoveryKey] = useState<string | null>(null);
  const [confirmingRotateKey, setConfirmingRotateKey] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [hasCopiedFreshKey, setHasCopiedFreshKey] = useState(false);
  const [keyErrorMsg, setKeyErrorMsg] = useState<string | null>(null);

  const [recentExportFormat, setRecentExportFormat] = useState<"json" | "csv" | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      getRecoveryKeyInfo().then(setKeyInfo);
    }
  }, [user?.id]);

  const handleGenerateOrRotateKey = async () => {
    setGeneratingKey(true);
    setKeyErrorMsg(null);
    setCopiedKey(false);
    setHasCopiedFreshKey(false);
    setConfirmingRotateKey(false);

    try {
      const candidateKey = generateVaultRecoveryKey();
      const { error } = await saveRecoveryKey(candidateKey);
      if (error) {
        setKeyErrorMsg(
          "Could not save Recovery Key yet. Ensure the Vault Recovery SQL migration has been applied in Supabase."
        );
      } else {
        const cleanHint = candidateKey.replace(/[^A-Z0-9]/g, "").slice(-4);
        setFreshRecoveryKey(candidateKey);
        setKeyInfo({
          configured: true,
          key_hint: cleanHint,
          copied_at: null,
          updated_at: new Date().toISOString(),
        });
      }
    } catch {
      setKeyErrorMsg("Failed to generate Recovery Key.");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleCopyFreshKey = async () => {
    if (!freshRecoveryKey) return;
    await copyTextToClipboard(freshRecoveryKey);
    await confirmRecoveryKeyCopied();
    const nowIso = new Date().toISOString();
    setKeyInfo((prev) => (prev ? { ...prev, copied_at: nowIso } : prev));
    setCopiedKey(true);
    setHasCopiedFreshKey(true);
    setKeyErrorMsg(null);
    setTimeout(() => setCopiedKey(false), 2200);
  };

  const handleCloseFreshKeyModal = () => {
    if (!hasCopiedFreshKey) {
      setKeyErrorMsg(
        "Please tap 'Copy Key' first so your new Recovery Key is saved to your clipboard before closing."
      );
      return;
    }
    setFreshRecoveryKey(null);
    setHasCopiedFreshKey(false);
    setKeyErrorMsg(null);
  };

  const handleExportData = async (format: "json" | "csv") => {
    if (subscriptions.length === 0) {
      Alert.alert(
        "No Subscriptions to Export",
        "Add at least one subscription to your vault before exporting."
      );
      return;
    }

    const dateStamp = formatLocalISODate(new Date());
    let content = "";

    if (format === "json") {
      const totalMonthly = subscriptions.reduce(
        (sum, sub) =>
          sum + normalizeToMonthly(Number(sub.cost), sub.billing_cycle),
        0
      );
      const payload = {
        app: "SubCancel Guard Mobile",
        exported_at: new Date().toISOString(),
        privacy_notice:
          "Generated 100% locally on your device with zero third-party sharing.",
        summary: {
          total_subscriptions: subscriptions.length,
          normalized_monthly_spend_usd: Number(totalMonthly.toFixed(2)),
          projected_annual_burn_usd: Number((totalMonthly * 12).toFixed(2)),
        },
        subscriptions: subscriptions.map((sub) => ({
          name: sub.name,
          category: sub.category,
          cost_usd: Number(Number(sub.cost).toFixed(2)),
          billing_cycle: sub.billing_cycle,
          normalized_monthly_usd: Number(
            normalizeToMonthly(Number(sub.cost), sub.billing_cycle).toFixed(2)
          ),
          renewal_date: sub.renewal_date,
          manage_subscription_url: sub.cancel_url || null,
          created_at: sub.created_at,
        })),
      };
      content = JSON.stringify(payload, null, 2);
    } else {
      const headers = [
        "Service Name",
        "Category",
        "Cost (USD)",
        "Billing Cycle",
        "Normalized Monthly (USD)",
        "Next Renewal Date",
        "Manage Subscription Link",
        "Created At",
      ];
      const rows = subscriptions.map((sub) => [
        escapeCsvCell(sub.name),
        escapeCsvCell(sub.category),
        escapeCsvCell(Number(sub.cost).toFixed(2)),
        escapeCsvCell(sub.billing_cycle),
        escapeCsvCell(
          normalizeToMonthly(Number(sub.cost), sub.billing_cycle).toFixed(2)
        ),
        escapeCsvCell(sub.renewal_date),
        escapeCsvCell(sub.cancel_url || ""),
        escapeCsvCell(sub.created_at),
      ]);
      content = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    }

    const filename = `subcancel-guard-${dateStamp}.${format}`;
    const mimeType =
      format === "json" ? "application/json" : "text/csv";

    try {
      // On Web Preview (Mac browser), trigger a direct browser file download
      const webDoc = (globalThis as Record<string, any>).document;
      if (Platform.OS === "web" && webDoc) {
        const fileContent = format === "csv" ? "\uFEFF" + content : content;
        const blob = new Blob([fileContent], {
          type: `${mimeType};charset=utf-8`,
        } as unknown as BlobOptions);
        const url = URL.createObjectURL(blob);
        const anchor = webDoc.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        webDoc.body.appendChild(anchor);
        anchor.click();
        webDoc.body.removeChild(anchor);
        URL.revokeObjectURL(url);

        setRecentExportFormat(format);
        setTimeout(() => {
          setRecentExportFormat((prev) => (prev === format ? null : prev));
        }, 2200);
        return;
      }

      // On Android, write a real .csv / .json file and invoke the native Android file Share Sheet
      // (allows saving directly to Files by Google, Google Drive, Gmail, etc.)
      if (
        Platform.OS !== "web" &&
        FileSystem.cacheDirectory &&
        (await Sharing.isAvailableAsync())
      ) {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, content, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: `Export ${filename}`,
        });
        setRecentExportFormat(format);
        setTimeout(() => {
          setRecentExportFormat((prev) => (prev === format ? null : prev));
        }, 2200);
        return;
      }

      await Share.share({
        title: filename,
        message: content,
      });
    } catch {
      await copyTextToClipboard(content);
      Alert.alert(
        "Copied to Clipboard",
        `Your ${format.toUpperCase()} export has been copied to your Android clipboard.`
      );
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (confirmText.trim().toUpperCase() !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteOwnAccount();
    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Account Summary Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
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
            <Feather name="user" size={18} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Account & Privacy Settings
            </Text>
            <Text style={[styles.cardSub, { color: colors.textMuted }]}>
              Manage your private vault, recovery key & data exports
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.summaryBox,
            {
              backgroundColor: colors.surfaceHighlight,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              Signed in as
            </Text>
            <Text
              style={[styles.summaryValue, { color: colors.text }]}
              numberOfLines={1}
            >
              {user?.email}
            </Text>
          </View>

          <View
            style={[
              styles.summaryRow,
              {
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 10,
              },
            ]}
          >
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              Current Plan
            </Text>
            {isPro ? (
              <View
                style={[
                  styles.proPill,
                  {
                    backgroundColor: colors.goldBg,
                    borderColor: colors.goldBorder,
                  },
                ]}
              >
                <Feather name="zap" size={11} color={colors.gold} />
                <Text style={[styles.proPillText, { color: colors.gold }]}>
                  Pro • Unlimited
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={onOpenProModal}
                style={[
                  styles.proPill,
                  {
                    backgroundColor: colors.goldBg,
                    borderColor: colors.goldBorder,
                  },
                ]}
              >
                <Feather name="zap" size={11} color={colors.gold} />
                <Text style={[styles.proPillText, { color: colors.gold }]}>
                  Free ({subscriptions.length}/3) • Upgrade Pro
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View
            style={[
              styles.summaryRow,
              {
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 10,
              },
            ]}
          >
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              Appearance Theme
            </Text>
            <TouchableOpacity
              onPress={toggleTheme}
              style={[
                styles.themeToggleBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather
                name={isDark ? "moon" : "sun"}
                size={13}
                color={colors.gold}
              />
              <Text style={[styles.themeToggleText, { color: colors.text }]}>
                {isDark ? "Dark Mode" : "Light Mode"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Zero-Email Vault Recovery Key Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.keyHeaderRow}>
          <View style={styles.keyTitleLeft}>
            <Feather name="key" size={16} color={colors.gold} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Vault Recovery Key
            </Text>
          </View>
          <View
            style={[
              styles.keyStatusPill,
              {
                backgroundColor: keyInfo?.configured
                  ? colors.forestBg
                  : colors.surfaceAlt,
              },
            ]}
          >
            <Text
              style={[
                styles.keyStatusText,
                {
                  color: keyInfo?.configured
                    ? colors.forest
                    : colors.textMuted,
                },
              ]}
            >
              {keyInfo === null
                ? "Checking..."
                : keyInfo.configured
                ? keyInfo.key_hint
                  ? `Active • Ends in ${keyInfo.key_hint}`
                  : "Active"
                : "Not Set"}
            </Text>
          </View>
        </View>

        <Text style={[styles.descText, { color: colors.textSecondary }]}>
          Reset a forgotten password right inside the mobile or web app without
          automated emails or SMS. Generating a new key immediately replaces any
          previous key.
        </Text>

        {keyErrorMsg && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: colors.roseBg,
                borderColor: colors.roseBorder,
              },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.rose }]}>
              {keyErrorMsg}
            </Text>
          </View>
        )}

        {confirmingRotateKey ? (
          <View
            style={[
              styles.rotateConfirmBox,
              {
                backgroundColor: colors.goldBg,
                borderColor: colors.goldBorder,
              },
            ]}
          >
            <Text style={[styles.rotateConfirmTitle, { color: colors.gold }]}>
              Replace Existing Recovery Key?
            </Text>
            <Text
              style={[styles.rotateConfirmDesc, { color: colors.textSecondary }]}
            >
              Generating a new Recovery Key immediately deactivates your
              current key
              {keyInfo?.key_hint ? ` (ending in ${keyInfo.key_hint})` : ""}. You
              will be required to copy the new key before closing.
            </Text>
            <View style={styles.exportBtnsRow}>
              <TouchableOpacity
                onPress={() => setConfirmingRotateKey(false)}
                disabled={generatingKey}
                style={[
                  styles.exportBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleGenerateOrRotateKey}
                disabled={generatingKey}
                style={[
                  styles.exportBtn,
                  {
                    backgroundColor: colors.gold,
                    borderColor: colors.gold,
                  },
                ]}
              >
                {generatingKey && (
                  <ActivityIndicator size="small" color="#ffffff" />
                )}
                <Text style={[styles.actionBtnText, { color: "#ffffff" }]}>
                  Yes, Generate New
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              if (keyInfo?.configured) {
                setConfirmingRotateKey(true);
              } else {
                handleGenerateOrRotateKey();
              }
            }}
            disabled={generatingKey}
            style={[
              styles.actionBtn,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
          >
            {generatingKey ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <Feather name="refresh-cw" size={14} color={colors.gold} />
            )}
            <Text style={[styles.actionBtnText, { color: colors.text }]}>
              {keyInfo?.configured
                ? "Generate New Recovery Key"
                : "Generate Recovery Key"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Local Data Export & Portability Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.keyTitleLeft}>
          <Feather name="download" size={16} color={colors.forest} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Local Data Export (CSV / JSON)
          </Text>
        </View>
        <Text style={[styles.descText, { color: colors.textSecondary }]}>
          Your data belongs to you. Export or share a snapshot of your active
          subscriptions locally at any time.
        </Text>

        <View style={styles.exportBtnsRow}>
          <TouchableOpacity
            onPress={() => handleExportData("csv")}
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor:
                  recentExportFormat === "csv"
                    ? colors.forestBorder
                    : colors.border,
              },
            ]}
          >
            <Feather
              name={recentExportFormat === "csv" ? "check" : "file-text"}
              size={14}
              color={colors.forest}
            />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>
              {recentExportFormat === "csv" ? "CSV Downloaded" : "Export CSV"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleExportData("json")}
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor:
                  recentExportFormat === "json"
                    ? colors.goldBorder
                    : colors.border,
              },
            ]}
          >
            <Feather
              name={recentExportFormat === "json" ? "check" : "code"}
              size={14}
              color={colors.gold}
            />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>
              {recentExportFormat === "json"
                ? "JSON Downloaded"
                : "Export JSON"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Legal, Terms of Service & Privacy Policy Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.keyTitleLeft}>
          <Feather name="shield" size={16} color={colors.forest} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Your Data Rights & Legal
          </Text>
        </View>
        <Text style={[styles.descText, { color: colors.textSecondary }]}>
          Review how SubCancel Guard protects your zero-bank-access privacy and
          your rights under our Terms of Service and Privacy Policy.
        </Text>

        <View style={styles.exportBtnsRow}>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL("https://www.subcancelguard.com/privacy")
            }
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
          >
            <Feather name="lock" size={14} color={colors.forest} />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>
              Privacy Policy
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              Linking.openURL("https://www.subcancelguard.com/terms")
            }
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
          >
            <Feather name="file-text" size={14} color={colors.gold} />
            <Text style={[styles.actionBtnText, { color: colors.text }]}>
              Terms of Service
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sign Out & Account Deletion */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={signOut}
          style={[
            styles.actionBtn,
            {
              backgroundColor: colors.surfaceHighlight,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="log-out" size={15} color={colors.text} />
          <Text style={[styles.actionBtnText, { color: colors.text }]}>
            Sign Out of SubCancel Guard
          </Text>
        </TouchableOpacity>

        {!confirmingDelete ? (
          <TouchableOpacity
            onPress={() => setConfirmingDelete(true)}
            style={[
              styles.deleteTriggerBtn,
              {
                backgroundColor: colors.roseBg,
                borderColor: colors.roseBorder,
              },
            ]}
          >
            <Feather name="trash-2" size={15} color={colors.rose} />
            <Text style={[styles.deleteTriggerText, { color: colors.rose }]}>
              Delete Account & Vault Permanently...
            </Text>
          </TouchableOpacity>
        ) : (
          <View
            style={[
              styles.deleteConfirmBox,
              {
                backgroundColor: colors.roseBg,
                borderColor: colors.roseBorder,
              },
            ]}
          >
            <Text style={[styles.deleteWarnTitle, { color: colors.rose }]}>
              ⚠️ Permanent Account Deletion
            </Text>
            <Text
              style={[styles.deleteWarnDesc, { color: colors.textSecondary }]}
            >
              This permanently erases your login, saved subscriptions, and push
              alerts. Type DELETE below to confirm:
            </Text>

            {deleteError && (
              <Text style={[styles.errorText, { color: colors.rose }]}>
                {deleteError}
              </Text>
            )}

            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              placeholder="DELETE"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.deleteInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.roseBorder,
                  color: colors.text,
                },
              ]}
            />

            <View style={styles.exportBtnsRow}>
              <TouchableOpacity
                onPress={() => {
                  setConfirmingDelete(false);
                  setConfirmText("");
                }}
                style={[
                  styles.exportBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.actionBtnText, { color: colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmDeleteAccount}
                disabled={
                  confirmText.trim().toUpperCase() !== "DELETE" || deleting
                }
                style={[
                  styles.exportBtn,
                  {
                    backgroundColor: "#e11d48",
                    borderColor: "#e11d48",
                    opacity:
                      confirmText.trim().toUpperCase() === "DELETE" ? 1 : 0.45,
                  },
                ]}
              >
                {deleting && (
                  <ActivityIndicator size="small" color="#ffffff" />
                )}
                <Text style={[styles.actionBtnText, { color: "#ffffff" }]}>
                  Confirm Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      {/* Blocking Mandatory-Copy Modal for Newly Generated Recovery Key */}
      <PhoneModal
        visible={Boolean(freshRecoveryKey)}
        transparent
        animationType="fade"
        onRequestClose={handleCloseFreshKeyModal}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
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
                <Feather name="key" size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Save Your New Recovery Key
                </Text>
                <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                  Required step — copy before closing
                </Text>
              </View>
            </View>

            <Text style={[styles.descText, { color: colors.textSecondary }]}>
              Because SubCancel Guard sends zero automated emails or SMS, this
              key is the only way to reset a forgotten password.
            </Text>

            {keyErrorMsg && (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: colors.roseBg,
                    borderColor: colors.roseBorder,
                  },
                ]}
              >
                <Text style={[styles.errorText, { color: colors.rose }]}>
                  {keyErrorMsg}
                </Text>
              </View>
            )}

            <View
              style={[
                styles.freshKeyRow,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.goldBorder,
                },
              ]}
            >
              <Text style={[styles.freshKeyCode, { color: colors.text }]}>
                {freshRecoveryKey}
              </Text>
              <TouchableOpacity
                onPress={handleCopyFreshKey}
                style={[
                  styles.copyBtn,
                  {
                    backgroundColor: colors.goldBg,
                    borderColor: colors.goldBorder,
                  },
                ]}
              >
                <Feather
                  name={copiedKey ? "check" : "copy"}
                  size={13}
                  color={copiedKey ? colors.forest : colors.gold}
                />
                <Text
                  style={[
                    styles.copyBtnText,
                    { color: copiedKey ? colors.forest : colors.gold },
                  ]}
                >
                  {copiedKey ? "Copied!" : "Copy Key"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.helperNote, { color: colors.gold }]}>
              {hasCopiedFreshKey
                ? "Copied! Paste this new key into your password manager or Notes app before closing."
                : "Required: Tap 'Copy Key' above to save your new Recovery Key before closing."}
            </Text>

            <TouchableOpacity
              onPress={handleCloseFreshKeyModal}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: colors.gold,
                  borderColor: colors.gold,
                  opacity: hasCopiedFreshKey ? 1 : 0.5,
                },
              ]}
            >
              <Text style={[styles.actionBtnText, { color: "#ffffff" }]}>
                {hasCopiedFreshKey
                  ? "I've Saved My New Key — Done"
                  : "Tap 'Copy Key' Above to Continue"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </PhoneModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 36,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  summaryBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "800",
    maxWidth: 210,
  },
  proPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
  },
  proPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  themeToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  themeToggleText: {
    fontSize: 11,
    fontWeight: "700",
  },
  keyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  keyTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  keyStatusPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
  },
  keyStatusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  descText: {
    fontSize: 12,
    lineHeight: 18,
  },
  errorBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "600",
  },
  freshKeyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  freshKeyCode: {
    fontSize: 13,
    fontWeight: "900",
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: "800",
  },
  helperNote: {
    fontSize: 11,
    fontWeight: "700",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  exportBtnsRow: {
    flexDirection: "row",
    gap: 10,
  },
  exportBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteTriggerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  deleteTriggerText: {
    fontSize: 13,
    fontWeight: "800",
  },
  deleteConfirmBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  deleteWarnTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  deleteWarnDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  deleteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: "700",
  },
  rotateConfirmBox: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  rotateConfirmTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  rotateConfirmDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
});
