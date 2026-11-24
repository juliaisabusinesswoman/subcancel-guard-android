import type { BillingCycle, SubscriptionRow } from "../types/database.types";
import { supabase } from "./supabase";

export interface CategoryBreakdown {
  category: string;
  monthlyTotal: number;
  percentage: number;
  count: number;
  color: string;
}

export interface CategoryOverlap {
  category: string;
  subscriptions: SubscriptionRow[];
  count: number;
  totalMonthly: number;
  suggestion: string;
}

export const CATEGORY_COLORS: Record<string, string> = {
  Entertainment: "#e11d48", // Crimson Rose
  Productivity: "#2563eb", // Royal Blue
  "AI & Software": "#7c3aed", // Deep Violet
  "Cloud Storage": "#0d9488", // Emerald Teal
  "Health & Fitness": "#16a34a", // Forest Green
  "News & Reading": "#d97706", // Warm Amber
  Shopping: "#db2777", // Magenta Pink
  Delivery: "#ea580c", // Burnt Orange
  Security: "#0284c7", // Ocean Blue
  Audio: "#c026d3", // Fuchsia
  Utilities: "#475569", // Charcoal Slate
  Other: "#65a30d", // Lime Olive
  // Legacy aliases for any previously saved subscriptions
  "Productivity & Communication": "#2563eb",
  "Cloud & Hosting": "#0d9488",
  "Reading & Comics": "#d97706",
  "News & Media": "#d97706",
  Health: "#16a34a",
  Fitness: "#16a34a",
  "Fitness & Learning": "#16a34a",
  News: "#d97706",
  Food: "#ea580c",
};

const DISTINCT_FALLBACK_PALETTE = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#ea580c",
  "#0d9488",
  "#4f46e5",
  "#c026d3",
  "#65a30d",
];

export function normalizeToMonthly(cost: number, billingCycle: BillingCycle): number {
  switch (billingCycle) {
    case "annual":
      return cost / 12;
    case "quarterly":
      return cost / 3;
    case "weekly":
      return cost * 4.333;
    case "monthly":
    default:
      return cost;
  }
}

export function normalizeToAnnual(cost: number, billingCycle: BillingCycle): number {
  return normalizeToMonthly(cost, billingCycle) * 12;
}

export function getDaysUntilRenewal(renewalDateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = renewalDateStr.split("-").map(Number);
  const renewal = new Date(year, month - 1, day);
  renewal.setHours(0, 0, 0, 0);

  const diffMs = renewal.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function formatLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addOneCycle(date: Date, billingCycle: BillingCycle): void {
  switch (billingCycle) {
    case "annual":
      date.setFullYear(date.getFullYear() + 1);
      break;
    case "quarterly":
      date.setDate(date.getDate() + 90);
      break;
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "monthly":
    default:
      date.setDate(date.getDate() + 30);
      break;
  }
}

export function calculateNextRenewalDate(
  renewalDateStr: string,
  billingCycle: BillingCycle,
  forceAdvanceOneCycle = false
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = renewalDateStr.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day);
  nextDate.setHours(0, 0, 0, 0);

  if (forceAdvanceOneCycle) {
    addOneCycle(nextDate, billingCycle);
  }

  let safetyCounter = 0;
  while (nextDate.getTime() < today.getTime() && safetyCounter < 500) {
    addOneCycle(nextDate, billingCycle);
    safetyCounter++;
  }

  return formatLocalISODate(nextDate);
}

export async function rolloverPastDueSubscriptions(
  userId: string,
  subscriptions: SubscriptionRow[]
): Promise<{ updatedSubscriptions: SubscriptionRow[]; rolledOverCount: number }> {
  if (!userId || subscriptions.length === 0) {
    return { updatedSubscriptions: subscriptions, rolledOverCount: 0 };
  }

  const pastDueSubs = subscriptions.filter(
    (sub) => getDaysUntilRenewal(sub.renewal_date) < 0
  );

  if (pastDueSubs.length === 0) {
    return { updatedSubscriptions: subscriptions, rolledOverCount: 0 };
  }

  const rolledMap = new Map<string, string>();
  const rolloverNotifications: {
    user_id: string;
    title: string;
    message: string;
    is_read: boolean;
  }[] = [];

  for (const sub of pastDueSubs) {
    const nextRenewalDate = calculateNextRenewalDate(
      sub.renewal_date,
      sub.billing_cycle,
      false
    );

    if (nextRenewalDate !== sub.renewal_date) {
      const { error } = await supabase
        .from("subscriptions")
        .update({ renewal_date: nextRenewalDate })
        .eq("id", sub.id)
        .eq("user_id", userId);

      if (!error) {
        rolledMap.set(sub.id, nextRenewalDate);
        const tenorText =
          sub.billing_cycle === "monthly"
            ? "30-day monthly tenor"
            : sub.billing_cycle === "quarterly"
            ? "90-day quarterly tenor"
            : sub.billing_cycle === "weekly"
            ? "7-day weekly cycle"
            : "1-year annual cycle";

        rolloverNotifications.push({
          user_id: userId,
          title: `🔄 Cycle Rolled Over: ${sub.name}`,
          message: `${sub.name} passed its previous billing date and automatically rolled forward to ${nextRenewalDate} (${tenorText}). Please verify your billing date is accurate.`,
          is_read: false,
        });
      }
    }
  }

  if (rolloverNotifications.length > 0) {
    await supabase.from("notifications").insert(rolloverNotifications);
  }

  const updatedSubscriptions = subscriptions
    .map((sub) => {
      const updatedDate = rolledMap.get(sub.id);
      return updatedDate ? { ...sub, renewal_date: updatedDate } : sub;
    })
    .sort(
      (a, b) =>
        getDaysUntilRenewal(a.renewal_date) - getDaysUntilRenewal(b.renewal_date)
    );

  return {
    updatedSubscriptions,
    rolledOverCount: rolledMap.size,
  };
}

export function calculateCategoryBreakdown(
  subscriptions: SubscriptionRow[]
): CategoryBreakdown[] {
  const categoryMap = new Map<string, { total: number; count: number }>();
  let totalMonthlySpend = 0;

  for (const sub of subscriptions) {
    const monthlyCost = normalizeToMonthly(Number(sub.cost), sub.billing_cycle);
    totalMonthlySpend += monthlyCost;

    const current = categoryMap.get(sub.category) || { total: 0, count: 0 };
    categoryMap.set(sub.category, {
      total: current.total + monthlyCost,
      count: current.count + 1,
    });
  }

  const breakdown: CategoryBreakdown[] = [];
  const usedColors = new Set<string>();

  categoryMap.forEach((val, category) => {
    const percentage =
      totalMonthlySpend > 0 ? (val.total / totalMonthlySpend) * 100 : 0;
    let color = CATEGORY_COLORS[category] || "";
    if (!color || usedColors.has(color)) {
      color =
        DISTINCT_FALLBACK_PALETTE.find((c) => !usedColors.has(c)) ||
        DISTINCT_FALLBACK_PALETTE[breakdown.length % DISTINCT_FALLBACK_PALETTE.length];
    }
    usedColors.add(color);

    breakdown.push({
      category,
      monthlyTotal: val.total,
      percentage,
      count: val.count,
      color,
    });
  });

  return breakdown.sort((a, b) => b.monthlyTotal - a.monthlyTotal);
}

export function compareSubscriptionsExpensiveFirst(
  a: SubscriptionRow,
  b: SubscriptionRow
): number {
  const monthlyDiff =
    normalizeToMonthly(Number(b.cost), b.billing_cycle) -
    normalizeToMonthly(Number(a.cost), a.billing_cycle);
  if (Math.abs(monthlyDiff) > 0.001) return monthlyDiff;

  const rawCostDiff = Number(b.cost) - Number(a.cost);
  if (Math.abs(rawCostDiff) > 0.001) return rawCostDiff;

  return getDaysUntilRenewal(a.renewal_date) - getDaysUntilRenewal(b.renewal_date);
}

export function detectCategoryOverlaps(
  subscriptions: SubscriptionRow[]
): CategoryOverlap[] {
  const groups = new Map<string, SubscriptionRow[]>();

  for (const sub of subscriptions) {
    const list = groups.get(sub.category) || [];
    list.push(sub);
    groups.set(sub.category, list);
  }

  const overlaps: CategoryOverlap[] = [];

  groups.forEach((subs, category) => {
    if (subs.length >= 2) {
      const sortedSubs = [...subs].sort(compareSubscriptionsExpensiveFirst);
      const totalMonthly = sortedSubs.reduce(
        (sum, s) => sum + normalizeToMonthly(Number(s.cost), s.billing_cycle),
        0
      );

      let suggestion = `Multiple active subscriptions detected in ${category} (${sortedSubs
        .map((s) => s.name)
        .join(
          ", "
        )}). Audit your actual usage to permanently cancel unused duplicate services, or consider family/shared plan consolidation to save money annually.`;
      if (category === "Entertainment") {
        suggestion = `Multiple active streaming services detected (${sortedSubs
          .map((s) => s.name)
          .join(
            ", "
          )}). Audit your actual watch time to permanently cancel underutilized services, or consolidate into family/shared plans to reduce recurring annual costs.`;
      } else if (category === "AI & Software") {
        suggestion = `Multiple active AI/Software tools detected (${sortedSubs
          .map((s) => s.name)
          .join(
            ", "
          )}). Audit your actual daily workflow usage and permanently cancel overlapping tool subscriptions or downgrade duplicate tiers.`;
      } else if (category === "Productivity") {
        suggestion = `Multiple productivity suites active (${sortedSubs
          .map((s) => s.name)
          .join(
            ", "
          )}). Audit your feature utilization, cancel duplicate licenses, or consolidate under an institutional/team license.`;
      } else if (category === "Cloud & Hosting" || category === "Cloud Storage") {
        suggestion = `Multiple cloud storage or hosting services active (${sortedSubs
          .map((s) => s.name)
          .join(
            ", "
          )}). Audit current storage usage and consolidate data onto a single primary provider to avoid duplicate storage fees.`;
      }

      overlaps.push({
        category,
        subscriptions: sortedSubs,
        count: sortedSubs.length,
        totalMonthly,
        suggestion,
      });
    }
  });

  return overlaps.sort((a, b) => b.totalMonthly - a.totalMonthly);
}

export interface AutoSuggestResult {
  selectedIds: Set<string>;
  lockedOverlapIds: Set<string>;
  protectedKeeperIds: Set<string>;
  overrodeSliderGuardrail: boolean;
}

export function calculateAutoSuggestedCuts(
  subscriptions: SubscriptionRow[],
  targetMonthlySavings: number,
  precomputedOverlaps?: CategoryOverlap[]
): AutoSuggestResult {
  const selectedIds = new Set<string>();
  const lockedOverlapIds = new Set<string>();
  const protectedKeeperIds = new Set<string>();

  if (subscriptions.length === 0) {
    return {
      selectedIds,
      lockedOverlapIds,
      protectedKeeperIds,
      overrodeSliderGuardrail: false,
    };
  }

  const overlaps = precomputedOverlaps ?? detectCategoryOverlaps(subscriptions);
  const redundantDuplicates: SubscriptionRow[] = [];

  for (const overlap of overlaps) {
    if (overlap.subscriptions.length >= 2) {
      const sortedGroup = [...overlap.subscriptions].sort(
        compareSubscriptionsExpensiveFirst
      );
      const cheapestKeeper = sortedGroup[sortedGroup.length - 1];
      protectedKeeperIds.add(cheapestKeeper.id);
      redundantDuplicates.push(...sortedGroup.slice(0, -1));
    }
  }

  redundantDuplicates.sort(compareSubscriptionsExpensiveFirst);

  let accumulated = 0;

  for (const dupSub of redundantDuplicates) {
    const monthlyCost = normalizeToMonthly(Number(dupSub.cost), dupSub.billing_cycle);
    selectedIds.add(dupSub.id);
    lockedOverlapIds.add(dupSub.id);
    accumulated += monthlyCost;
  }

  const overrodeSliderGuardrail =
    selectedIds.size > 0 && accumulated > targetMonthlySavings + 0.01;

  if (accumulated < targetMonthlySavings - 0.01) {
    const needed = targetMonthlySavings - accumulated;
    const otherCategorySubs = subscriptions
      .filter((s) => !selectedIds.has(s.id) && !protectedKeeperIds.has(s.id))
      .sort(compareSubscriptionsExpensiveFirst);

    const costs = otherCategorySubs.map((s) =>
      normalizeToMonthly(Number(s.cost), s.billing_cycle)
    );
    const totalOtherAvailable = costs.reduce((sum, c) => sum + c, 0);

    if (totalOtherAvailable <= needed + 0.01) {
      for (let i = 0; i < otherCategorySubs.length; i++) {
        if (costs[i] > 0) {
          selectedIds.add(otherCategorySubs[i].id);
          accumulated += costs[i];
        }
      }
    } else if (otherCategorySubs.length <= 20) {
      let bestSum = Infinity;
      let bestIndices: number[] = [];

      const suffixSums = new Array<number>(costs.length + 1).fill(0);
      for (let i = costs.length - 1; i >= 0; i--) {
        suffixSums[i] = suffixSums[i + 1] + costs[i];
      }

      const currentIndices: number[] = [];

      const dfs = (idx: number, currentSum: number) => {
        if (currentSum >= needed - 0.001) {
          const isStrictlyCloser = currentSum < bestSum - 0.005;
          const isTiedButFewerCuts =
            Math.abs(currentSum - bestSum) <= 0.005 &&
            currentIndices.length < bestIndices.length;

          if (isStrictlyCloser || isTiedButFewerCuts) {
            bestSum = currentSum;
            bestIndices = [...currentIndices];
          }
          return;
        }

        if (idx >= costs.length) return;
        if (currentSum + suffixSums[idx] < needed - 0.001) return;
        if (currentSum >= bestSum + 0.005) return;

        if (costs[idx] > 0) {
          currentIndices.push(idx);
          dfs(idx + 1, currentSum + costs[idx]);
          currentIndices.pop();
        }

        dfs(idx + 1, currentSum);
      };

      dfs(0, 0);

      for (const idx of bestIndices) {
        selectedIds.add(otherCategorySubs[idx].id);
        accumulated += costs[idx];
      }
    } else {
      const remaining = otherCategorySubs
        .map((sub, i) => ({ sub, cost: costs[i] }))
        .filter((r) => r.cost > 0);

      while (accumulated < targetMonthlySavings - 0.01 && remaining.length > 0) {
        const gap = targetMonthlySavings - accumulated;
        let reachingIdx = -1;
        for (let i = remaining.length - 1; i >= 0; i--) {
          if (remaining[i].cost >= gap - 0.001) {
            reachingIdx = i;
            break;
          }
        }
        const underIdx = remaining.findIndex((r) => r.cost <= gap + 0.001);

        let pickIdx = 0;
        if (reachingIdx !== -1 && underIdx === -1) {
          pickIdx = reachingIdx;
        } else if (reachingIdx !== -1 && underIdx !== -1) {
          const overshoot = remaining[reachingIdx].cost - gap;
          const shortfall = gap - remaining[underIdx].cost;
          pickIdx = overshoot <= shortfall ? reachingIdx : underIdx;
        }

        const [picked] = remaining.splice(pickIdx, 1);
        selectedIds.add(picked.sub.id);
        accumulated += picked.cost;
      }
    }
  }

  return {
    selectedIds,
    lockedOverlapIds,
    protectedKeeperIds,
    overrodeSliderGuardrail,
  };
}

export async function syncRenewalNotifications(
  userId: string,
  subscriptions: SubscriptionRow[]
): Promise<number> {
  if (!userId || subscriptions.length === 0) return 0;

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentNotifs, error } = await supabase
      .from("notifications")
      .select("title, message, created_at")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo.toISOString());

    if (error) {
      return 0;
    }

    const existingMessages = new Set(recentNotifs?.map((n) => n.message) || []);
    const newNotificationsToInsert: {
      user_id: string;
      title: string;
      message: string;
      is_read: boolean;
    }[] = [];

    for (const sub of subscriptions) {
      const days = getDaysUntilRenewal(sub.renewal_date);

      if (days === 3) {
        const title = `⚠️ 3-Day Renewal Alert: ${sub.name}`;
        const message = `${sub.name} renews in 3 days ($${Number(sub.cost).toFixed(
          2
        )}/${sub.billing_cycle}). Cancel now to prevent the automatic charge.`;
        if (!existingMessages.has(message)) {
          newNotificationsToInsert.push({
            user_id: userId,
            title,
            message,
            is_read: false,
          });
        }
      } else if (days === 1) {
        const title = `🚨 Final 24h Warning: ${sub.name}`;
        const message = `${sub.name} renews tomorrow! Your Manage Subscription Link (official account portal, sign-in required) is available in your SubCancel Guard vault.`;
        if (!existingMessages.has(message)) {
          newNotificationsToInsert.push({
            user_id: userId,
            title,
            message,
            is_read: false,
          });
        }
      }
    }

    if (newNotificationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("notifications")
        .insert(newNotificationsToInsert);

      if (insertError) {
        return 0;
      }
      return newNotificationsToInsert.length;
    }

    return 0;
  } catch {
    return 0;
  }
}
