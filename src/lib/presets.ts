import { validateSafeHttpsUrl } from "./utils";

export interface SubscriptionPreset {
  id?: string;
  name: string;
  category: string;
  suggestedCost: number;
  billingCycle: "monthly" | "annual";
  cancelUrl: string;
}

export function toPresetId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PRESET_CATALOG: SubscriptionPreset[] = [
  {
    name: "1Password / Bitwarden",
    category: "Security",
    suggestedCost: 2.99,
    billingCycle: "monthly",
    cancelUrl: "https://my.1password.com/billing",
  },
  {
    name: "Adobe Creative Cloud",
    category: "Productivity",
    suggestedCost: 54.99,
    billingCycle: "monthly",
    cancelUrl: "https://account.adobe.com/plans",
  },
  {
    name: "Amazon Prime",
    category: "Shopping",
    suggestedCost: 14.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.amazon.com/mc/manage",
  },
  {
    name: "Apple Music",
    category: "Audio",
    suggestedCost: 10.99,
    billingCycle: "monthly",
    cancelUrl: "https://support.apple.com/en-us/118428",
  },
  {
    name: "Apple TV+",
    category: "Entertainment",
    suggestedCost: 9.99,
    billingCycle: "monthly",
    cancelUrl: "https://support.apple.com/en-us/118428",
  },
  {
    name: "Audible",
    category: "Audio",
    suggestedCost: 14.95,
    billingCycle: "monthly",
    cancelUrl: "https://www.audible.com/account/overview",
  },
  {
    name: "ChatGPT Plus",
    category: "Productivity",
    suggestedCost: 20.0,
    billingCycle: "monthly",
    cancelUrl: "https://chatgpt.com/#settings/Subscription",
  },
  {
    name: "Disney+",
    category: "Entertainment",
    suggestedCost: 13.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.disneyplus.com/account/subscription",
  },
  {
    name: "DoorDash DashPass",
    category: "Delivery",
    suggestedCost: 9.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.doordash.com/dashpass/",
  },
  {
    name: "Dropbox",
    category: "Cloud Storage",
    suggestedCost: 11.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.dropbox.com/account/plan",
  },
  {
    name: "Duolingo Plus",
    category: "Health & Fitness",
    suggestedCost: 6.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.duolingo.com/settings/super",
  },
  {
    name: "ExpressVPN / NordVPN",
    category: "Security",
    suggestedCost: 8.32,
    billingCycle: "monthly",
    cancelUrl: "https://my.nordaccount.com/billing/my-subscriptions/",
  },
  {
    name: "Google One / Workspace",
    category: "Cloud Storage",
    suggestedCost: 2.99,
    billingCycle: "monthly",
    cancelUrl: "https://one.google.com/settings",
  },
  {
    name: "Headspace / Calm",
    category: "Health & Fitness",
    suggestedCost: 12.99,
    billingCycle: "monthly",
    cancelUrl: "https://my.headspace.com/profile/subscription/manage",
  },
  {
    name: "HelloFresh / Meal Kits",
    category: "Delivery",
    suggestedCost: 69.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.hellofresh.com/account-settings/account-info",
  },
  {
    name: "iCloud+",
    category: "Cloud Storage",
    suggestedCost: 2.99,
    billingCycle: "monthly",
    cancelUrl: "https://support.apple.com/en-us/108318",
  },
  {
    name: "iQIYI",
    category: "Entertainment",
    suggestedCost: 11.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.iq.com/personal",
  },
  {
    name: "LINE Stamp Premium",
    category: "Productivity",
    suggestedCost: 2.99,
    billingCycle: "monthly",
    cancelUrl: "https://store.line.me/mypage",
  },
  {
    name: "Max (HBO Max)",
    category: "Entertainment",
    suggestedCost: 15.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.hbomax.com/subscription",
  },
  {
    name: "Microsoft 365",
    category: "Productivity",
    suggestedCost: 6.99,
    billingCycle: "monthly",
    cancelUrl: "https://account.microsoft.com/services",
  },
  {
    name: "Naver Webtoon / Series Pass",
    category: "News & Reading",
    suggestedCost: 4.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.webtoons.com/en/",
  },
  {
    name: "Netflix",
    category: "Entertainment",
    suggestedCost: 15.49,
    billingCycle: "monthly",
    cancelUrl: "https://www.netflix.com/youraccount",
  },
  {
    name: "Peloton App",
    category: "Health & Fitness",
    suggestedCost: 12.99,
    billingCycle: "monthly",
    cancelUrl: "https://account.onepeloton.com/mymembership",
  },
  {
    name: "Rakuten Viki",
    category: "Entertainment",
    suggestedCost: 9.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.viki.com/user-account-settings",
  },
  {
    name: "Spotify",
    category: "Entertainment",
    suggestedCost: 11.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.spotify.com/account/change-plan/",
  },
  {
    name: "The New York Times",
    category: "News & Reading",
    suggestedCost: 4.0,
    billingCycle: "monthly",
    cancelUrl: "https://www.nytimes.com/account/subscription",
  },
  {
    name: "Uber One",
    category: "Delivery",
    suggestedCost: 9.99,
    billingCycle: "monthly",
    cancelUrl: "https://account.uber.com/",
  },
  {
    name: "Walmart+",
    category: "Shopping",
    suggestedCost: 12.95,
    billingCycle: "monthly",
    cancelUrl: "https://www.walmart.com/account/plus/manage",
  },
  {
    name: "YouTube Premium",
    category: "Entertainment",
    suggestedCost: 13.99,
    billingCycle: "monthly",
    cancelUrl: "https://www.youtube.com/paid_memberships",
  },
];

export const POPULAR_PRESETS: SubscriptionPreset[] = [...PRESET_CATALOG]
  .filter((preset) => validateSafeHttpsUrl(preset.cancelUrl).isValid)
  .map((preset) => ({
    ...preset,
    id: preset.id || toPresetId(preset.name),
  }))
  .sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
  );
