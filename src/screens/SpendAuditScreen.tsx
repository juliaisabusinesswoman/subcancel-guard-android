import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatCurrency, formatDate } from "../lib/utils";
import {
  normalizeToMonthly,
  getDaysUntilRenewal,
  calculateCategoryBreakdown,
  detectCategoryOverlaps,
  calculateAutoSuggestedCuts,
  compareSubscriptionsExpensiveFirst,
} from "../lib/auditUtils";
import { useTheme } from "../context/ThemeContext";
import type { SubscriptionRow } from "../types/database.types";

interface SpendAuditScreenProps {
  subscriptions: SubscriptionRow[];
  scheduledPushCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onNavigateToVault: () => void;
  onNavigateToPushAlerts: () => void;
  onOpenAddModal: () => void;
  onOpenSafeUrl: (url: string, serviceName: string) => void;
}

const TARGET_PERCENT_STEPS = [10, 20, 30, 40, 50, 75, 100];

export function SpendAuditScreen({
  subscriptions,
  scheduledPushCount,
  refreshing,
  onRefresh,
  onNavigateToVault,
  onNavigateToPushAlerts,
  onOpenAddModal,
  onOpenSafeUrl,
}: SpendAuditScreenProps) {
  const { colors } = useTheme();

  // Savings Simulator States
  const [markedToCancel, setMarkedToCancel] = useState<Set<string>>(new Set());
  const [overlapOverrideActive, setOverlapOverrideActive] = useState(false);
  const [targetPercentage, setTargetPercentage] = useState<number>(30);

  const totalMonthlySpend = useMemo(() => {
    return subscriptions.reduce(
      (sum, s) => sum + normalizeToMonthly(Number(s.cost), s.billing_cycle),
      0
    );
  }, [subscriptions]);

  const totalAnnualBurn = totalMonthlySpend * 12;
  const activeCount = subscriptions.length;
  const averageMonthlyPerSub =
    activeCount > 0 ? totalMonthlySpend / activeCount : 0;

  const categoryBreakdown = useMemo(
    () => calculateCategoryBreakdown(subscriptions),
    [subscriptions]
  );

  const categoryOverlaps = useMemo(
    () => detectCategoryOverlaps(subscriptions),
    [subscriptions]
  );

  const overlappingSubIds = useMemo(() => {
    const ids = new Set<string>();
    for (const overlap of categoryOverlaps) {
      if (overlap.subscriptions.length >= 2) {
        const sorted = [...overlap.subscriptions].sort(
          compareSubscriptionsExpensiveFirst
        );
        for (const sub of sorted.slice(0, -1)) {
          ids.add(sub.id);
        }
      }
    }
    return ids;
  }, [categoryOverlaps]);

  const targetMonthlySavings = (totalMonthlySpend * targetPercentage) / 100;

  const toggleMarked = (id: string) => {
    setOverlapOverrideActive(false);
    setMarkedToCancel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAutoSuggest = () => {
    const { selectedIds, overrodeSliderGuardrail } = calculateAutoSuggestedCuts(
      subscriptions,
      targetMonthlySavings,
      categoryOverlaps
    );
    setMarkedToCancel(selectedIds);
    setOverlapOverrideActive(overrodeSliderGuardrail);
  };

  const handleResetSimulator = () => {
    setMarkedToCancel(new Set());
    setOverlapOverrideActive(false);
  };

  const simulatedMonthlySavings = useMemo(() => {
    return subscriptions
      .filter((s) => markedToCancel.has(s.id))
      .reduce(
        (sum, s) => sum + normalizeToMonthly(Number(s.cost), s.billing_cycle),
        0
      );
  }, [subscriptions, markedToCancel]);

  const simulatedAnnualSavings = simulatedMonthlySavings * 12;
  const newMonthlySpend = Math.max(
    0,
    totalMonthlySpend - simulatedMonthlySavings
  );
  const simulatedReductionPercent =
    totalMonthlySpend > 0
      ? Math.round((simulatedMonthlySavings / totalMonthlySpend) * 100)
      : 0;
  const goalProgress =
    targetMonthlySavings > 0
      ? Math.min(
          100,
          Math.round((simulatedMonthlySavings / targetMonthlySavings) * 100)
        )
      : 0;

  const budgetMilestone = useMemo(() => {
    if (simulatedMonthlySavings >= 150) {
      return "Covers a weekend getaway flight, hotel stay, or $1,800+/year emergency fund boost!";
    } else if (simulatedMonthlySavings >= 75) {
      return "Funds regular dining-out & entertainment outings or primary home utility bills!";
    } else if (simulatedMonthlySavings >= 30) {
      return "Offsets a consolidated family streaming bundle, cloud workspace, or gym membership!";
    } else if (simulatedMonthlySavings > 0) {
      return "Covers your monthly coffee runs or weekly cafe work sessions!";
    }
    return null;
  }, [simulatedMonthlySavings]);

  const sortedUpcomingRenewals = useMemo(() => {
    return [...subscriptions].sort(
      (a, b) =>
        getDaysUntilRenewal(a.renewal_date) -
        getDaysUntilRenewal(b.renewal_date)
    );
  }, [subscriptions]);

  if (subscriptions.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.emptyIconBox,
              {
                backgroundColor: colors.goldBg,
                borderColor: colors.goldBorder,
              },
            ]}
          >
            <Feather name="pie-chart" size={24} color={colors.gold} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No Subscriptions Tracked Yet
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Add your first subscription to generate Spend Audit analytics,
            detect overlapping categories, run the Savings Simulator, and arm
            native 3-day & 1-day push notifications.
          </Text>
          <TouchableOpacity
            onPress={onOpenAddModal}
            style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
          >
            <Feather name="plus" size={16} color="#ffffff" />
            <Text style={styles.primaryBtnText}>
              Add Your First Subscription
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Top Native Push Renewal Defense Banner */}
      <TouchableOpacity
        onPress={onNavigateToPushAlerts}
        activeOpacity={0.85}
        style={[
          styles.defenseBanner,
          {
            backgroundColor: colors.surface,
            borderColor: colors.forestBorder,
          },
        ]}
      >
        <View
          style={[
            styles.defenseIconBox,
            { backgroundColor: colors.forestBg },
          ]}
        >
          <Feather name="bell" size={16} color={colors.forest} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.defenseHeaderRow}>
            <Text style={[styles.defenseTitle, { color: colors.text }]}>
              Native Push Renewal Defense Active
            </Text>
            <View
              style={[
                styles.armedBadge,
                { backgroundColor: colors.forestBg },
              ]}
            >
              <Text style={[styles.armedBadgeText, { color: colors.forest }]}>
                {scheduledPushCount} Push Armed
              </Text>
            </View>
          </View>
          <Text
            style={[styles.defenseSubtitle, { color: colors.textSecondary }]}
          >
            3-day & 1-day native OS push alerts scheduled on device (Zero SMS).
            Tap to view or test push notifications →
          </Text>
        </View>
      </TouchableOpacity>

      {/* 1. 2x2 Metrics Grid (matches Web SpendDashboard KPI styling) */}
      <View style={styles.statsGrid}>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopWidth: colors.isDark ? 1 : 3,
              borderTopColor: colors.isDark ? colors.border : colors.gold,
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: colors.isDark ? colors.textMuted : colors.textSecondary },
            ]}
          >
            TOTAL MONTHLY SPEND
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatCurrency(totalMonthlySpend)}
          </Text>
          <Text
            style={[
              styles.statSub,
              { color: colors.isDark ? colors.textMuted : colors.textSecondary },
            ]}
          >
            Normalized across all cycles
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopWidth: colors.isDark ? 1 : 3,
              borderTopColor: colors.isDark ? colors.border : colors.rose,
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: colors.isDark ? colors.textMuted : colors.textSecondary },
            ]}
          >
            ANNUAL PROJECTED BURN
          </Text>
          <Text style={[styles.statValue, { color: colors.rose }]}>
            {formatCurrency(totalAnnualBurn)}
          </Text>
          <Text
            style={[
              styles.statSub,
              { color: colors.isDark ? colors.textMuted : colors.textSecondary },
            ]}
          >
            Full 12-month footprint
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopWidth: colors.isDark ? 1 : 3,
              borderTopColor: colors.isDark ? colors.border : colors.gold,
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: colors.isDark ? colors.textMuted : colors.textSecondary },
            ]}
          >
            ACTIVE SUBSCRIPTIONS
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {activeCount}
          </Text>
          <Text
            style={[
              styles.statSub,
              { color: colors.isDark ? colors.textMuted : colors.textSecondary },
            ]}
          >
            Zero bank access required
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopWidth: colors.isDark ? 1 : 3,
              borderTopColor: colors.isDark ? colors.border : colors.gold,
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: colors.isDark ? colors.textMuted : colors.textSecondary },
            ]}
          >
            AVG COST / SUB
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {formatCurrency(averageMonthlyPerSub)}
          </Text>
          <Text
            style={[
              styles.statSub,
              { color: colors.isDark ? colors.textMuted : colors.textSecondary },
            ]}
          >
            Average monthly burn
          </Text>
        </View>
      </View>

      {/* 2. Category Expense Distribution */}
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
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Category Expense Distribution
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              Spending share across your active subscriptions
            </Text>
          </View>
          <Text style={[styles.monoBadge, { color: colors.textMuted }]}>
            {categoryBreakdown.length} Categories
          </Text>
        </View>

        {/* Stacked Progress Bar */}
        <View
          style={[
            styles.stackedBar,
            {
              backgroundColor: colors.surfaceHighlight,
              borderColor: colors.border,
            },
          ]}
        >
          {categoryBreakdown.map((cat) => (
            <View
              key={cat.category}
              style={{
                width: `${Math.max(2, cat.percentage)}%`,
                backgroundColor: cat.color,
                height: "100%",
              }}
            />
          ))}
        </View>

        <View style={{ gap: 8 }}>
          {categoryBreakdown.map((cat) => (
            <View
              key={cat.category}
              style={[
                styles.catRow,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.catLeft}>
                <View
                  style={[styles.catDot, { backgroundColor: cat.color }]}
                />
                <Text style={[styles.catName, { color: colors.text }]}>
                  {cat.category}
                </Text>
                <Text style={[styles.catCount, { color: colors.textMuted }]}>
                  ({cat.count})
                </Text>
              </View>
              <View style={styles.catRight}>
                <Text style={[styles.catPct, { color: colors.textMuted }]}>
                  {cat.percentage.toFixed(1)}%
                </Text>
                <Text style={[styles.catTotal, { color: colors.text }]}>
                  {formatCurrency(cat.monthlyTotal)}/mo
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 3. Category Overlaps & Redundancy Guard */}
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
              Category Overlaps & Redundancy Guard
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              Identifies duplicate categories where consolidation saves money
            </Text>
          </View>

          <View
            style={[
              styles.overlapCountPill,
              {
                backgroundColor:
                  categoryOverlaps.length > 0
                    ? colors.goldBg
                    : colors.forestBg,
                borderColor:
                  categoryOverlaps.length > 0
                    ? colors.goldBorder
                    : colors.forestBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.overlapCountText,
                {
                  color:
                    categoryOverlaps.length > 0
                      ? colors.gold
                      : colors.forest,
                },
              ]}
            >
              {categoryOverlaps.length > 0
                ? `${categoryOverlaps.length} Overlap${
                    categoryOverlaps.length === 1 ? "" : "s"
                  }`
                : "Zero Overlaps"}
            </Text>
          </View>
        </View>

        {categoryOverlaps.length === 0 ? (
          <View
            style={[
              styles.zeroOverlapBox,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
          >
            <Feather name="check-circle" size={24} color={colors.forest} />
            <Text style={[styles.zeroOverlapTitle, { color: colors.text }]}>
              No Category Redundancies
            </Text>
            <Text
              style={[styles.zeroOverlapDesc, { color: colors.textSecondary }]}
            >
              Your subscriptions are lean and diversified without duplicate
              streaming services or redundant software suites.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {categoryOverlaps.map((overlap) => (
              <View
                key={overlap.category}
                style={[
                  styles.overlapCard,
                  {
                    backgroundColor: colors.goldBg,
                    borderColor: colors.goldBorder,
                  },
                ]}
              >
                <View style={styles.overlapHeader}>
                  <View style={styles.overlapTitleRow}>
                    <Feather
                      name="alert-triangle"
                      size={14}
                      color={colors.gold}
                    />
                    <Text
                      style={[styles.overlapCatTitle, { color: colors.gold }]}
                    >
                      {overlap.category} ({overlap.count} services)
                    </Text>
                  </View>
                  <Text style={[styles.overlapTotal, { color: colors.text }]}>
                    {formatCurrency(overlap.totalMonthly)}/mo
                  </Text>
                </View>

                <Text
                  style={[
                    styles.overlapSuggestion,
                    { color: colors.textSecondary },
                  ]}
                >
                  {overlap.suggestion}
                </Text>

                <View style={styles.overlapChipsWrap}>
                  {overlap.subscriptions.map((s) => (
                    <View
                      key={s.id}
                      style={[
                        styles.overlapSubChip,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.overlapSubChipText,
                          { color: colors.text },
                        ]}
                      >
                        {s.name} ({formatCurrency(Number(s.cost))}/
                        {s.billing_cycle})
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 4. Interactive Savings & Cut Simulator */}
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.simTopRow}>
          <View style={{ flex: 1 }}>
            <View
              style={[
                styles.simBadge,
                {
                  backgroundColor: colors.forestBg,
                  borderColor: colors.forestBorder,
                },
              ]}
            >
              <Feather name="trending-down" size={12} color={colors.forest} />
              <Text style={[styles.simBadgeText, { color: colors.forest }]}>
                Interactive Savings Simulator
              </Text>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Potential Savings & Cut Simulator
            </Text>
          </View>

          <View style={styles.simActionsRow}>
            <TouchableOpacity
              onPress={handleAutoSuggest}
              style={[
                styles.autoSuggestBtn,
                {
                  backgroundColor: colors.goldBg,
                  borderColor: colors.goldBorder,
                },
              ]}
            >
              <Feather name="zap" size={13} color={colors.gold} />
              <Text style={[styles.autoSuggestText, { color: colors.gold }]}>
                Auto-Suggest Cuts
              </Text>
            </TouchableOpacity>

            {markedToCancel.size > 0 && (
              <TouchableOpacity
                onPress={handleResetSimulator}
                style={[
                  styles.resetBtn,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Feather
                  name="rotate-ccw"
                  size={13}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Target Goal Selector */}
        <View
          style={[
            styles.targetBox,
            {
              backgroundColor: colors.surfaceHighlight,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.targetHeader}>
            <Text
              style={[styles.targetLabel, { color: colors.textSecondary }]}
            >
              Target Monthly Savings Goal:
            </Text>
            <Text style={[styles.targetValue, { color: colors.forest }]}>
              {targetPercentage}% ({formatCurrency(targetMonthlySavings)}/mo)
            </Text>
          </View>

          <View style={styles.percentStepsRow}>
            {TARGET_PERCENT_STEPS.map((pct) => {
              const active = targetPercentage === pct;
              return (
                <TouchableOpacity
                  key={pct}
                  onPress={() => setTargetPercentage(pct)}
                  style={[
                    styles.pctStepBtn,
                    {
                      backgroundColor: active
                        ? colors.forest
                        : colors.surface,
                      borderColor: active ? colors.forest : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pctStepText,
                      {
                        color: active ? "#020617" : colors.textSecondary,
                      },
                    ]}
                  >
                    {pct}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Outcome Cards */}
        <View style={styles.simOutcomesRow}>
          <View
            style={[
              styles.simOutcomeCard,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.simOutcomeLabel, { color: colors.textMuted }]}>
              MONTHLY SAVINGS
            </Text>
            <Text style={[styles.simOutcomeValue, { color: colors.forest }]}>
              +{formatCurrency(simulatedMonthlySavings)}
            </Text>
            <Text style={[styles.simOutcomeSub, { color: colors.textMuted }]}>
              {markedToCancel.size} cut{markedToCancel.size === 1 ? "" : "s"}
            </Text>
          </View>

          <View
            style={[
              styles.simOutcomeCard,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.simOutcomeLabel, { color: colors.textMuted }]}>
              ANNUAL SAVINGS
            </Text>
            <Text style={[styles.simOutcomeValue, { color: colors.forest }]}>
              +{formatCurrency(simulatedAnnualSavings)}
            </Text>
            <Text style={[styles.simOutcomeSub, { color: colors.textMuted }]}>
              Per year saved
            </Text>
          </View>

          <View
            style={[
              styles.simOutcomeCard,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.simOutcomeLabel, { color: colors.textMuted }]}>
              NEW SPEND
            </Text>
            <Text style={[styles.simOutcomeValue, { color: colors.text }]}>
              {formatCurrency(newMonthlySpend)}
            </Text>
            <Text style={[styles.simOutcomeSub, { color: colors.forest }]}>
              {simulatedReductionPercent}% reduction
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={{ gap: 6 }}>
          <View style={styles.progressLabelRow}>
            <Text
              style={[styles.progressLabel, { color: colors.textSecondary }]}
            >
              Progress toward {targetPercentage}% Goal:
            </Text>
            <Text style={[styles.progressValue, { color: colors.forest }]}>
              {goalProgress}%
            </Text>
          </View>
          <View
            style={[
              styles.progressBarBg,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={{
                width: `${Math.min(100, goalProgress)}%`,
                height: "100%",
                backgroundColor: colors.forest,
              }}
            />
          </View>
        </View>

        {overlapOverrideActive &&
          simulatedReductionPercent > targetPercentage && (
            <View
              style={[
                styles.overrideBox,
                {
                  backgroundColor: colors.goldBg,
                  borderColor: colors.goldBorder,
                },
              ]}
            >
              <Feather name="zap" size={14} color={colors.gold} />
              <Text
                style={[styles.overrideText, { color: colors.textSecondary }]}
              >
                <Text style={{ fontWeight: "800", color: colors.gold }}>
                  Overlap Priority Active:{" "}
                </Text>
                Locked in your higher-cost category duplicate (
                {simulatedReductionPercent}% savings vs. {targetPercentage}%
                target) because cutting direct category redundancy delivers the
                highest value.
              </Text>
            </View>
          )}

        {budgetMilestone && (
          <View
            style={[
              styles.milestoneBox,
              {
                backgroundColor: colors.forestBg,
                borderColor: colors.forestBorder,
              },
            ]}
          >
            <Feather name="award" size={16} color={colors.forest} />
            <Text
              style={[styles.milestoneText, { color: colors.textSecondary }]}
            >
              <Text style={{ fontWeight: "800", color: colors.forest }}>
                Budget Milestone:{" "}
              </Text>
              {budgetMilestone}
            </Text>
          </View>
        )}

        {/* Tap to Toggle Subscriptions for Cancellation */}
        <View style={{ gap: 8 }}>
          <Text
            style={[
              styles.toggleSectionLabel,
              { color: colors.textSecondary },
            ]}
          >
            Tap subscriptions below to test cancelling:
          </Text>

          {subscriptions.map((sub) => {
            const isMarked = markedToCancel.has(sub.id);
            const isOverlap = overlappingSubIds.has(sub.id);
            const monthlyCost = normalizeToMonthly(
              Number(sub.cost),
              sub.billing_cycle
            );

            return (
              <TouchableOpacity
                key={sub.id}
                onPress={() => toggleMarked(sub.id)}
                style={[
                  styles.simSubRow,
                  {
                    backgroundColor: isMarked
                      ? colors.roseBg
                      : colors.surfaceHighlight,
                    borderColor: isMarked ? colors.roseBorder : colors.border,
                  },
                ]}
              >
                <View style={styles.simSubLeft}>
                  <View
                    style={[
                      styles.simCheck,
                      {
                        backgroundColor: isMarked
                          ? colors.rose
                          : "transparent",
                        borderColor: isMarked ? colors.rose : colors.textMuted,
                      },
                    ]}
                  >
                    {isMarked && (
                      <Feather name="check" size={12} color="#ffffff" />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.simNameRow}>
                      <Text
                        style={[styles.simSubName, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {sub.name}
                      </Text>
                      {isOverlap && (
                        <View
                          style={[
                            styles.miniTag,
                            { backgroundColor: colors.goldBg },
                          ]}
                        >
                          <Text
                            style={[styles.miniTagText, { color: colors.gold }]}
                          >
                            OVERLAP
                          </Text>
                        </View>
                      )}
                      {isMarked && (
                        <View
                          style={[
                            styles.miniTag,
                            { backgroundColor: colors.roseBg },
                          ]}
                        >
                          <Text
                            style={[styles.miniTagText, { color: colors.rose }]}
                          >
                            CUT
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.simSubMeta, { color: colors.textMuted }]}
                    >
                      {sub.category} • {formatCurrency(Number(sub.cost))}/
                      {sub.billing_cycle}
                    </Text>
                  </View>
                </View>

                <View style={styles.simSubRight}>
                  <Text
                    style={[styles.simMonthlySave, { color: colors.text }]}
                  >
                    +{formatCurrency(monthlyCost)}/mo
                  </Text>
                  {isMarked && sub.cancel_url && (
                    <TouchableOpacity
                      onPress={() => onOpenSafeUrl(sub.cancel_url!, sub.name)}
                      style={[
                        styles.simPortalIconBtn,
                        { backgroundColor: colors.rose },
                      ]}
                    >
                      <Feather
                        name="external-link"
                        size={12}
                        color="#ffffff"
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 5. Upcoming Renewal Schedule & Push Watchlist */}
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
              Upcoming Renewal Schedule
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              Armed with automated 3-day & 1-day native push alerts
            </Text>
          </View>
          <TouchableOpacity onPress={onNavigateToVault}>
            <Text style={[styles.linkText, { color: colors.gold }]}>
              Open Vault →
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ gap: 10 }}>
          {sortedUpcomingRenewals.map((sub) => {
            const daysLeft = getDaysUntilRenewal(sub.renewal_date);
            const isCritical = daysLeft <= 1;
            const isWarning = daysLeft > 1 && daysLeft <= 3;

            return (
              <View
                key={sub.id}
                style={[
                  styles.scheduleItem,
                  {
                    backgroundColor: isCritical
                      ? colors.roseBg
                      : isWarning
                      ? colors.goldBg
                      : colors.surfaceHighlight,
                    borderColor: isCritical
                      ? colors.roseBorder
                      : isWarning
                      ? colors.goldBorder
                      : colors.border,
                  },
                ]}
              >
                <View style={styles.scheduleTopRow}>
                  <View>
                    <Text
                      style={[styles.scheduleName, { color: colors.text }]}
                    >
                      {sub.name}
                    </Text>
                    <Text
                      style={[
                        styles.scheduleDate,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Renews {formatDate(sub.renewal_date)} •{" "}
                      {formatCurrency(Number(sub.cost))}/{sub.billing_cycle}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.scheduleUrgencyPill,
                      {
                        backgroundColor: isCritical
                          ? colors.rose
                          : isWarning
                          ? colors.gold
                          : colors.surfaceAlt,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scheduleUrgencyText,
                        {
                          color:
                            isCritical || isWarning
                              ? "#ffffff"
                              : colors.textSecondary,
                        },
                      ]}
                    >
                      {daysLeft <= 0
                        ? "TODAY"
                        : daysLeft === 1
                        ? "TOMORROW"
                        : `IN ${daysLeft}D`}
                    </Text>
                  </View>
                </View>

                {sub.cancel_url && (
                  <TouchableOpacity
                    onPress={() => onOpenSafeUrl(sub.cancel_url!, sub.name)}
                    style={[
                      styles.schedulePortalBtn,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.roseBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.schedulePortalText,
                        { color: colors.rose },
                      ]}
                    >
                      Manage Subscription Link
                    </Text>
                    <Feather
                      name="external-link"
                      size={13}
                      color={colors.rose}
                    />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    padding: 20,
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  emptyIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 6,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  defenseBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  defenseIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  defenseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    flexWrap: "wrap",
  },
  defenseTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  armedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  armedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  defenseSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "48.3%",
    borderRadius: 16,
    borderWidth: 1,
    borderTopWidth: 3,
    padding: 14,
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  statSub: {
    fontSize: 11,
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
    fontSize: 16,
    fontWeight: "800",
  },
  sectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  monoBadge: {
    fontSize: 11,
    fontWeight: "700",
  },
  stackedBar: {
    height: 12,
    borderRadius: 99,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  catLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catName: {
    fontSize: 13,
    fontWeight: "700",
  },
  catCount: {
    fontSize: 12,
  },
  catRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  catPct: {
    fontSize: 12,
    fontWeight: "600",
  },
  catTotal: {
    fontSize: 13,
    fontWeight: "800",
  },
  overlapCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
  },
  overlapCountText: {
    fontSize: 11,
    fontWeight: "800",
  },
  zeroOverlapBox: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  zeroOverlapTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  zeroOverlapDesc: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  overlapCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  overlapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overlapTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  overlapCatTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  overlapTotal: {
    fontSize: 13,
    fontWeight: "900",
  },
  overlapSuggestion: {
    fontSize: 12,
    lineHeight: 17,
  },
  overlapChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  overlapSubChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  overlapSubChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  simTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  simBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    marginBottom: 4,
  },
  simBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  simActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  autoSuggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  autoSuggestText: {
    fontSize: 11,
    fontWeight: "800",
  },
  resetBtn: {
    padding: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  targetBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  targetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  targetValue: {
    fontSize: 12,
    fontWeight: "800",
  },
  percentStepsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  pctStepBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  pctStepText: {
    fontSize: 11,
    fontWeight: "800",
  },
  simOutcomesRow: {
    flexDirection: "row",
    gap: 8,
  },
  simOutcomeCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  simOutcomeLabel: {
    fontSize: 9,
    fontWeight: "800",
  },
  simOutcomeValue: {
    fontSize: 15,
    fontWeight: "900",
  },
  simOutcomeSub: {
    fontSize: 10,
    fontWeight: "600",
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: 12,
  },
  progressValue: {
    fontSize: 12,
    fontWeight: "800",
  },
  progressBarBg: {
    height: 10,
    borderRadius: 99,
    borderWidth: 1,
    overflow: "hidden",
  },
  overrideBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  overrideText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  milestoneBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  milestoneText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  toggleSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  simSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  simSubLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  simCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  simNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  simSubName: {
    fontSize: 13,
    fontWeight: "800",
  },
  miniTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  miniTagText: {
    fontSize: 9,
    fontWeight: "800",
  },
  simSubMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  simSubRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  simMonthlySave: {
    fontSize: 12,
    fontWeight: "800",
  },
  simPortalIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  linkText: {
    fontSize: 12,
    fontWeight: "700",
  },
  scheduleItem: {
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  scheduleTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  scheduleName: {
    fontSize: 14,
    fontWeight: "800",
  },
  scheduleDate: {
    fontSize: 12,
    marginTop: 2,
  },
  scheduleUrgencyPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scheduleUrgencyText: {
    fontSize: 10,
    fontWeight: "800",
  },
  schedulePortalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  schedulePortalText: {
    fontSize: 12,
    fontWeight: "800",
  },
});
