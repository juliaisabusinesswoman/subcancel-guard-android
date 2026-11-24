import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PhoneModal } from "./PhoneModal";
import {
  POPULAR_PRESETS,
  toPresetId,
  type SubscriptionPreset,
} from "../lib/presets";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { formatLocalISODate } from "../lib/auditUtils";
import { triggerInstantRenewalTestPush } from "../lib/pushNotifications";
import { validateSafeHttpsUrl } from "../lib/utils";
import type { BillingCycle, SubscriptionRow } from "../types/database.types";

interface SubscriptionFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  subscriptionToEdit?: SubscriptionRow | null;
  existingSubscriptions?: SubscriptionRow[];
}

export const CATEGORIES = [
  "Entertainment",
  "Productivity",
  "AI & Software",
  "Cloud Storage",
  "Health & Fitness",
  "News & Reading",
  "Shopping",
  "Delivery",
  "Security",
  "Audio",
  "Utilities",
  "Other",
];

const BILLING_CYCLES: { label: string; value: BillingCycle }[] = [
  { label: "Monthly", value: "monthly" },
  { label: "Annual", value: "annual" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Weekly", value: "weekly" },
];

export function SubscriptionFormModal({
  visible,
  onClose,
  onSaved,
  subscriptionToEdit,
  existingSubscriptions = [],
}: SubscriptionFormModalProps) {
  const { user } = useAuth();
  const { colors } = useTheme();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Entertainment");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [cost, setCost] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [renewalDate, setRenewalDate] = useState("");
  const [cancelUrl, setCancelUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingDuplicatePreset, setPendingDuplicatePreset] =
    useState<SubscriptionPreset | null>(null);

  const trackedPresetKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const sub of existingSubscriptions) {
      const normalizedName = sub.name.trim().toLowerCase();
      if (normalizedName) {
        keys.add(normalizedName);
        keys.add(toPresetId(sub.name));
      }
    }
    return keys;
  }, [existingSubscriptions]);

  const isPresetTracked = (preset: SubscriptionPreset): boolean => {
    const normalizedName = preset.name.trim().toLowerCase();
    const presetSlug = preset.id || toPresetId(preset.name);
    return (
      trackedPresetKeys.has(normalizedName) || trackedPresetKeys.has(presetSlug)
    );
  };

  useEffect(() => {
    if (subscriptionToEdit) {
      setName(subscriptionToEdit.name);
      setCategory(subscriptionToEdit.category);
      setCost(String(subscriptionToEdit.cost));
      setBillingCycle(subscriptionToEdit.billing_cycle);
      setRenewalDate(subscriptionToEdit.renewal_date);
      setCancelUrl(subscriptionToEdit.cancel_url || "");
    } else {
      setName("");
      setCategory("Entertainment");
      setCost("");
      setBillingCycle("monthly");
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      setRenewalDate(formatLocalISODate(thirtyDays));
      setCancelUrl("");
    }
    setErrorMsg(null);
    setPendingDuplicatePreset(null);
    setIsCategoryDropdownOpen(false);
  }, [subscriptionToEdit, visible]);

  if (!visible) return null;

  const applyPresetToForm = (preset: SubscriptionPreset) => {
    setName(preset.name);
    setCategory(preset.category);
    setCost(preset.suggestedCost.toString());
    setBillingCycle(preset.billingCycle);
    setCancelUrl(preset.cancelUrl);
    setErrorMsg(null);
  };

  const handleSelectPreset = (preset: SubscriptionPreset) => {
    if (isPresetTracked(preset)) {
      setPendingDuplicatePreset(preset);
      return;
    }
    applyPresetToForm(preset);
  };

  const setQuickDateOffset = (daysFromToday: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    setRenewalDate(formatLocalISODate(d));

    if (daysFromToday === 1 || daysFromToday === 3) {
      triggerInstantRenewalTestPush(daysFromToday, name, cost, billingCycle);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      setErrorMsg("You must be signed in to save subscriptions.");
      return;
    }
    if (!name.trim()) {
      setErrorMsg("Please enter a subscription name.");
      return;
    }

    const parsedCost = parseFloat(cost);
    if (isNaN(parsedCost) || parsedCost < 0) {
      setErrorMsg("Please enter a valid positive cost.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate.trim())) {
      setErrorMsg("Please enter a renewal date in YYYY-MM-DD format.");
      return;
    }

    let safeCancelUrl: string | null = null;
    if (cancelUrl.trim()) {
      const urlCheck = validateSafeHttpsUrl(cancelUrl);
      if (!urlCheck.isValid || !urlCheck.normalizedUrl) {
        setErrorMsg(
          urlCheck.error || "Only encrypted https:// links are allowed."
        );
        return;
      }
      safeCancelUrl = urlCheck.normalizedUrl;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      if (subscriptionToEdit) {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            name: name.trim(),
            category,
            cost: parsedCost,
            billing_cycle: billingCycle,
            renewal_date: renewalDate.trim(),
            cancel_url: safeCancelUrl,
            playbook_tips: [],
          })
          .eq("id", subscriptionToEdit.id)
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").insert({
          user_id: user.id,
          name: name.trim(),
          category,
          cost: parsedCost,
          billing_cycle: billingCycle,
          renewal_date: renewalDate.trim(),
          cancel_url: safeCancelUrl,
          playbook_tips: [],
        });

        if (error) throw error;
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save subscription";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PhoneModal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "android" ? "height" : "padding"}
        style={styles.backdrop}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Sheet Header */}
          <View
            style={[styles.headerRow, { borderBottomColor: colors.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                {subscriptionToEdit
                  ? "Edit Subscription"
                  : "Add Subscription Guard"}
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

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick Presets (Only on Add) */}
            {!subscriptionToEdit && (
              <View
                style={[
                  styles.presetBox,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.presetTitleRow}>
                  <Feather name="zap" size={13} color={colors.gold} />
                  <Text style={[styles.presetTitle, { color: colors.gold }]}>
                    Quick Presets with Official Portal Links:
                  </Text>
                </View>

                <ScrollView
                  nestedScrollEnabled
                  style={styles.presetScrollArea}
                  contentContainerStyle={styles.presetWrapGrid}
                >
                  {POPULAR_PRESETS.map((p) => {
                    const alreadyTracked = isPresetTracked(p);
                    return (
                      <TouchableOpacity
                        key={p.id || p.name}
                        onPress={() => handleSelectPreset(p)}
                        style={[
                          styles.presetChip,
                          {
                            backgroundColor: alreadyTracked
                              ? colors.forestBg
                              : colors.surface,
                            borderColor: alreadyTracked
                              ? colors.forestBorder
                              : colors.border,
                          },
                        ]}
                      >
                        {alreadyTracked && (
                          <Feather
                            name="check-circle"
                            size={11}
                            color={colors.forest}
                          />
                        )}
                        <Text
                          style={[
                            styles.presetChipText,
                            { color: colors.text },
                          ]}
                        >
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {errorMsg && (
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
                  {errorMsg}
                </Text>
              </View>
            )}

            {/* Subscription Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Subscription Name *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Netflix, ChatGPT Plus, Gym"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
            </View>

            {/* Category Dropdown Selector */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Category
              </Text>
              <TouchableOpacity
                onPress={() => setIsCategoryDropdownOpen((prev) => !prev)}
                style={[
                  styles.dropdownTrigger,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: isCategoryDropdownOpen
                      ? colors.gold
                      : colors.border,
                  },
                ]}
              >
                <Text style={[styles.dropdownTriggerText, { color: colors.text }]}>
                  {category}
                </Text>
                <Feather
                  name={isCategoryDropdownOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              {isCategoryDropdownOpen && (
                <View
                  style={[
                    styles.dropdownMenu,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <ScrollView
                    nestedScrollEnabled
                    style={styles.dropdownScroll}
                  >
                    {(category && !CATEGORIES.includes(category)
                      ? [category, ...CATEGORIES]
                      : CATEGORIES
                    ).map((cat) => {
                      const selected = category === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          onPress={() => {
                            setCategory(cat);
                            setIsCategoryDropdownOpen(false);
                          }}
                          style={[
                            styles.dropdownItem,
                            {
                              backgroundColor: selected
                                ? colors.goldBg
                                : "transparent",
                              borderBottomColor: colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              {
                                color: selected ? colors.gold : colors.text,
                                fontWeight: selected ? "800" : "600",
                              },
                            ]}
                          >
                            {cat}
                          </Text>
                          {selected && (
                            <Feather
                              name="check"
                              size={14}
                              color={colors.gold}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Cost & Billing Cycle */}
            <View style={styles.rowGap}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Cost ($ USD) *
                </Text>
                <TextInput
                  value={cost}
                  onChangeText={setCost}
                  keyboardType="decimal-pad"
                  placeholder="15.99"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1.4 }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Billing Cycle
                </Text>
                <View style={styles.cycleGrid}>
                  {BILLING_CYCLES.map((item) => {
                    const active = billingCycle === item.value;
                    return (
                      <TouchableOpacity
                        key={item.value}
                        onPress={() => setBillingCycle(item.value)}
                        style={[
                          styles.cycleBtn,
                          {
                            backgroundColor: active
                              ? colors.gold
                              : colors.surfaceHighlight,
                            borderColor: active ? colors.gold : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.cycleBtnText,
                            {
                              color: active ? "#ffffff" : colors.textSecondary,
                            },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Next Renewal Date */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Next Renewal Date (YYYY-MM-DD) *
                </Text>
              </View>
              <TextInput
                value={renewalDate}
                onChangeText={setRenewalDate}
                placeholder="2026-12-23"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
              {/* Quick Date Preset Helpers (great for testing 3-day & 1-day push notifications!) */}
              <View style={styles.quickDatesRow}>
                <TouchableOpacity
                  onPress={() => setQuickDateOffset(1)}
                  style={[
                    styles.quickDateChip,
                    {
                      backgroundColor: colors.roseBg,
                      borderColor: colors.roseBorder,
                    },
                  ]}
                >
                  <Text style={[styles.quickDateText, { color: colors.rose }]}>
                    +1 Day (Test 24h Alert)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setQuickDateOffset(3)}
                  style={[
                    styles.quickDateChip,
                    {
                      backgroundColor: colors.goldBg,
                      borderColor: colors.goldBorder,
                    },
                  ]}
                >
                  <Text style={[styles.quickDateText, { color: colors.gold }]}>
                    +3 Days (Test 3d Alert)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setQuickDateOffset(30)}
                  style={[
                    styles.quickDateChip,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.quickDateText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    +30 Days
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Rollover Tenor Helper Note */}
            <View
              style={[
                styles.infoBox,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="info" size={14} color={colors.gold} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                Note: Renewal dates roll over automatically based on a standard
                30-day monthly tenor. Native push alerts trigger 3 days and 1
                day before your renewal date.
              </Text>
            </View>

            {/* Manage Subscription Link */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Manage Subscription Link (Official Account Portal URL)
              </Text>
              <TextInput
                value={cancelUrl}
                onChangeText={setCancelUrl}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://vendor.com/account"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />
              <Text style={[styles.helperText, { color: colors.textMuted }]}>
                Opens your official account portal (sign-in required). Only
                encrypted https:// links are accepted.
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
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
              <Text style={[styles.cancelBtnText, { color: colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={[
                styles.saveBtn,
                { backgroundColor: colors.gold, opacity: loading ? 0.6 : 1 },
              ]}
            >
              {loading && <ActivityIndicator size="small" color="#ffffff" />}
              <Text style={styles.saveBtnText}>
                {subscriptionToEdit
                  ? "Update Subscription"
                  : "Save & Arm Push"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Duplicate Preset Prompt Overlay */}
          {pendingDuplicatePreset && (
            <View style={styles.dupOverlay}>
              <View
                style={[
                  styles.dupCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.dupHeader}>
                  <Feather name="alert-triangle" size={20} color={colors.gold} />
                  <Text style={[styles.dupTitle, { color: colors.text }]}>
                    Duplicate Subscription Notice
                  </Text>
                </View>
                <Text
                  style={[styles.dupBody, { color: colors.textSecondary }]}
                >
                  You are already tracking{" "}
                  <Text style={{ fontWeight: "800", color: colors.text }}>
                    {pendingDuplicatePreset.name}
                  </Text>
                  . Do you want to add another entry (e.g., for a separate plan
                  or account)?
                </Text>
                <View style={styles.dupBtnRow}>
                  <TouchableOpacity
                    onPress={() => setPendingDuplicatePreset(null)}
                    style={[
                      styles.cancelBtn,
                      {
                        backgroundColor: colors.surfaceAlt,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.text }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      applyPresetToForm(pendingDuplicatePreset);
                      setPendingDuplicatePreset(null);
                    }}
                    style={[styles.saveBtn, { backgroundColor: colors.gold }]}
                  >
                    <Text style={styles.saveBtnText}>Add Anyway</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
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
  presetBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  presetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  presetTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  presetScrollArea: {
    maxHeight: 185,
  },
  presetWrapGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "600",
  },
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dropdownTriggerText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dropdownMenu: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownItemText: {
    fontSize: 13,
  },
  rowGap: {
    flexDirection: "column",
    gap: 14,
  },
  cycleGrid: {
    flexDirection: "row",
    gap: 6,
  },
  cycleBtn: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  cycleBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  quickDatesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  quickDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickDateText: {
    fontSize: 11,
    fontWeight: "700",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  helperText: {
    fontSize: 11,
    lineHeight: 15,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  saveBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  dupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dupCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  dupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dupTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  dupBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  dupBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
});
