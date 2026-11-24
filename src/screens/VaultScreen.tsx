import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PhoneModal } from "../components/PhoneModal";
import { formatCurrency, formatDate } from "../lib/utils";
import { getDaysUntilRenewal } from "../lib/auditUtils";
import { useTheme } from "../context/ThemeContext";
import type { SubscriptionRow } from "../types/database.types";

interface VaultScreenProps {
  subscriptions: SubscriptionRow[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenAdd: () => void;
  onEdit: (sub: SubscriptionRow) => void;
  onDelete: (sub: SubscriptionRow) => void;
  onOpenSafeUrl: (url: string, serviceName: string) => void;
}

export function VaultScreen({
  subscriptions,
  refreshing,
  onRefresh,
  onOpenAdd,
  onEdit,
  onDelete,
  onOpenSafeUrl,
}: VaultScreenProps) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"renewal" | "cost_desc" | "name">(
    "renewal"
  );
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionRow | null>(
    null
  );

  const categories = useMemo(() => {
    const set = new Set(subscriptions.map((s) => s.category));
    return ["all", ...Array.from(set)];
  }, [subscriptions]);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions
      .filter((sub) => {
        const matchesSearch =
          sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          sub.category.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
          selectedCategory === "all" || sub.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        if (sortBy === "renewal") {
          return (
            getDaysUntilRenewal(a.renewal_date) -
            getDaysUntilRenewal(b.renewal_date)
          );
        }
        if (sortBy === "cost_desc") {
          return Number(b.cost) - Number(a.cost);
        }
        return a.name.localeCompare(b.name);
      });
  }, [subscriptions, searchQuery, selectedCategory, sortBy]);

  return (
    <>
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      keyboardShouldPersistTaps="handled"
    >
      {/* Search & Controls Card */}
      <View
        style={[
          styles.controlsCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surfaceHighlight,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search subscriptions or categories..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Feather name="x-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.filterPill,
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
                    styles.filterPillText,
                    { color: active ? "#ffffff" : colors.textSecondary },
                  ]}
                >
                  {cat === "all" ? "All Categories" : cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Sort Row */}
        <View style={styles.sortRow}>
          <Text style={[styles.sortLabel, { color: colors.textMuted }]}>
            Sort by:
          </Text>
          {(
            [
              { key: "renewal", label: "Next Renewal" },
              { key: "cost_desc", label: "Highest Cost" },
              { key: "name", label: "Name (A-Z)" },
            ] as const
          ).map((item) => {
            const active = sortBy === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setSortBy(item.key)}
                style={[
                  styles.sortBtn,
                  {
                    backgroundColor: active
                      ? colors.surfaceAlt
                      : "transparent",
                    borderColor: active ? colors.goldBorder : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sortBtnText,
                    { color: active ? colors.gold : colors.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Subscriptions List */}
      {filteredSubscriptions.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Feather name="shield" size={28} color={colors.gold} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {subscriptions.length === 0
              ? "No subscriptions in your vault yet"
              : "No matching subscriptions found"}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Add your recurring services to save official Manage Subscription
            Links, monitor renewal dates, and receive 3-day & 1-day native push
            alerts.
          </Text>
          {subscriptions.length === 0 && (
            <TouchableOpacity
              onPress={onOpenAdd}
              style={[styles.addBtn, { backgroundColor: colors.gold }]}
            >
              <Feather name="plus" size={16} color="#ffffff" />
              <Text style={styles.addBtnText}>Add First Subscription</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        filteredSubscriptions.map((sub) => {
          const diffDays = getDaysUntilRenewal(sub.renewal_date);
          const isUrgent = diffDays >= 0 && diffDays <= 3;
          const isSoon = diffDays > 3 && diffDays <= 7;

          return (
            <View
              key={sub.id}
              style={[
                styles.subCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isUrgent ? colors.roseBorder : colors.border,
                },
              ]}
            >
              {/* Card Header */}
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.subName, { color: colors.text }]}>
                      {sub.name}
                    </Text>
                    <View
                      style={[
                        styles.catBadge,
                        { backgroundColor: colors.surfaceHighlight },
                      ]}
                    >
                      <Text
                        style={[
                          styles.catBadgeText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {sub.category}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.renewalText, { color: colors.textSecondary }]}
                  >
                    Next renewal: {formatDate(sub.renewal_date)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.urgencyBadge,
                    {
                      backgroundColor: isUrgent
                        ? colors.roseBg
                        : isSoon
                        ? colors.goldBg
                        : colors.surfaceAlt,
                      borderColor: isUrgent
                        ? colors.roseBorder
                        : isSoon
                        ? colors.goldBorder
                        : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.urgencyText,
                      {
                        color: isUrgent
                          ? colors.rose
                          : isSoon
                          ? colors.gold
                          : colors.textSecondary,
                      },
                    ]}
                  >
                    {diffDays < 0
                      ? `Overdue ${Math.abs(diffDays)}d`
                      : diffDays === 0
                      ? "Renews today!"
                      : `Renews in ${diffDays}d`}
                  </Text>
                </View>
              </View>

              {/* Price */}
              <View style={styles.priceRow}>
                <Text style={[styles.priceValue, { color: colors.text }]}>
                  {formatCurrency(Number(sub.cost))}
                </Text>
                <Text style={[styles.priceCycle, { color: colors.textMuted }]}>
                  / {sub.billing_cycle}
                </Text>
              </View>

              {/* Rollover Note */}
              <View
                style={[
                  styles.rolloverNote,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rolloverNoteText,
                    { color: colors.textMuted },
                  ]}
                >
                  Note: Renewal dates roll over automatically (30-day monthly
                  tenor). Push notifications are armed for 3 days & 1 day prior.
                </Text>
              </View>

              {/* Actions Footer */}
              <View
                style={[
                  styles.cardFooter,
                  { borderTopColor: colors.border },
                ]}
              >
                {sub.cancel_url ? (
                  <TouchableOpacity
                    onPress={() => onOpenSafeUrl(sub.cancel_url!, sub.name)}
                    style={[
                      styles.manageLinkBtn,
                      {
                        backgroundColor: colors.roseBg,
                        borderColor: colors.roseBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.manageLinkText, { color: colors.rose }]}
                    >
                      Manage Subscription Link
                    </Text>
                    <Feather
                      name="external-link"
                      size={13}
                      color={colors.rose}
                    />
                  </TouchableOpacity>
                ) : (
                  <Text
                    style={[
                      styles.noLinkText,
                      { color: colors.textMuted },
                    ]}
                  >
                    No official portal URL configured
                  </Text>
                )}

                <View style={styles.actionBtnsRow}>
                  <TouchableOpacity
                    onPress={() => onEdit(sub)}
                    style={[
                      styles.iconActionBtn,
                      { backgroundColor: colors.surfaceAlt },
                    ]}
                  >
                    <Feather
                      name="edit-3"
                      size={14}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setDeleteTarget(sub)}
                    style={[
                      styles.iconActionBtn,
                      { backgroundColor: colors.surfaceAlt },
                    ]}
                  >
                    <Feather name="trash-2" size={14} color={colors.rose} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>

    {/* Cross-Platform Delete Confirmation Modal */}
    <PhoneModal
      visible={Boolean(deleteTarget)}
      transparent
      animationType="fade"
      onRequestClose={() => setDeleteTarget(null)}
    >
      <View style={styles.deleteBackdrop}>
        <View
          style={[
            styles.deleteModalCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.deleteModalTitle, { color: colors.text }]}>
            Delete Subscription?
          </Text>
          <Text
            style={[styles.deleteModalDesc, { color: colors.textSecondary }]}
          >
            Are you sure you want to remove{" "}
            <Text style={{ fontWeight: "800", color: colors.text }}>
              {deleteTarget?.name}
            </Text>{" "}
            from your guard vault? Its scheduled push alerts will also be
            cancelled.
          </Text>

          <View style={styles.deleteModalBtns}>
            <TouchableOpacity
              onPress={() => setDeleteTarget(null)}
              style={[
                styles.deleteCancelBtn,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.deleteCancelText, { color: colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (deleteTarget) {
                  onDelete(deleteTarget);
                }
                setDeleteTarget(null);
              }}
              style={[
                styles.deleteConfirmBtn,
                { backgroundColor: "#e11d48" },
              ]}
            >
              <Feather name="trash-2" size={13} color="#ffffff" />
              <Text style={styles.deleteConfirmText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </PhoneModal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  controlsCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  filterRow: {
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  sortLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  sortBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  sortBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 26,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  addBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  subCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  subName: {
    fontSize: 17,
    fontWeight: "800",
  },
  catBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  renewalText: {
    fontSize: 12,
    marginTop: 3,
  },
  urgencyBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: "800",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: "900",
  },
  priceCycle: {
    fontSize: 12,
  },
  rolloverNote: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  rolloverNoteText: {
    fontSize: 11,
    lineHeight: 16,
  },
  cardFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  manageLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  manageLinkText: {
    fontSize: 12,
    fontWeight: "800",
  },
  noLinkText: {
    flex: 1,
    fontSize: 12,
    fontStyle: "italic",
  },
  actionBtnsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  iconActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  deleteModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  deleteModalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  deleteModalDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  deleteModalBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  deleteCancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  deleteCancelText: {
    fontSize: 12,
    fontWeight: "700",
  },
  deleteConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  deleteConfirmText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
});
