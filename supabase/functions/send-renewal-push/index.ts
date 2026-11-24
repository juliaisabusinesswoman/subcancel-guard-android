// ==============================================================================
// SubCancel Guard: Optional Supabase Edge Function for Remote Push Notifications
// Evaluates subscriptions renewing in 3 days or 1 day and dispatches native push
// notifications via the Expo Push API (https://exp.host/--/api/v2/push/send).
// Zero SMS, zero phone numbers, zero third-party marketing trackers.
// ==============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req: Request) => {
  try {
    // 0. Require secret bearer authorization so public callers cannot spam push dispatches
    const cronSecret = Deno.env.get("CRON_SECRET")?.trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const expectedSecret = cronSecret || serviceRoleKey;
    const authHeader = req.headers.get("authorization") ?? "";
    const providedToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!expectedSecret || !providedToken || providedToken !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch active subscriptions
    const { data: subscriptions, error: subErr } = await admin
      .from("subscriptions")
      .select("*");

    if (subErr) throw subErr;

    // 2. Fetch enabled push tokens
    const { data: tokens, error: tokErr } = await admin
      .from("push_tokens")
      .select("user_id, expo_push_token")
      .eq("enabled", true);

    if (tokErr) throw tokErr;

    const tokensByUser = new Map<string, string[]>();
    for (const row of tokens || []) {
      const list = tokensByUser.get(row.user_id) || [];
      list.push(row.expo_push_token);
      tokensByUser.set(row.user_id, list);
    }

    const messagesToSend: Record<string, unknown>[] = [];

    for (const sub of subscriptions || []) {
      const days = getDaysUntil(sub.renewal_date);
      if (days !== 3 && days !== 1) continue;

      const userTokens = tokensByUser.get(sub.user_id) || [];
      if (userTokens.length === 0) continue;

      const title =
        days === 3
          ? `⚠️ 3-Day Renewal Alert: ${sub.name}`
          : `🚨 Final 24h Warning: ${sub.name}`;
      const body =
        days === 3
          ? `${sub.name} renews in 3 days ($${Number(sub.cost).toFixed(2)}/${sub.billing_cycle}). Cancel now to prevent the automatic charge.`
          : `${sub.name} renews tomorrow! Open SubCancel Guard to access your Manage Subscription Link.`;

      for (const to of userTokens) {
        messagesToSend.push({
          to,
          sound: "default",
          title,
          body,
          data: {
            subscriptionId: sub.id,
            subscriptionName: sub.name,
            cancelUrl: sub.cancel_url,
            alertType: days === 3 ? "3-day" : "1-day",
          },
        });
      }
    }

    if (messagesToSend.length > 0) {
      await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messagesToSend),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: messagesToSend.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Push dispatch error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
