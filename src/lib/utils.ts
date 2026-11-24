export function formatCurrency(amount: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

export function formatDate(dateString: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateString));
}

export interface SafeHttpsUrlResult {
  isValid: boolean;
  normalizedUrl: string | null;
  origin: string | null;
  hostname: string | null;
  error?: string;
}

/**
 * Strictly validates that an external URL uses the encrypted https:// protocol,
 * has a valid domain hostname, and blocks insecure or executable schemes
 * (http://, javascript:, data:, file:, vbscript:, etc.) as well as embedded credentials.
 */
export function validateSafeHttpsUrl(rawUrl: string | null | undefined): SafeHttpsUrlResult {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    return {
      isValid: false,
      normalizedUrl: null,
      origin: null,
      hostname: null,
      error: "URL cannot be empty.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      normalizedUrl: null,
      origin: null,
      hostname: null,
      error:
        "Please enter a valid URL starting with https:// (for example, https://www.netflix.com/youraccount).",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      isValid: false,
      normalizedUrl: null,
      origin: null,
      hostname: null,
      error:
        "For your security, only encrypted https:// links are allowed (http:// and script links are blocked).",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      normalizedUrl: null,
      origin: null,
      hostname: null,
      error: "URLs containing embedded login credentials are blocked for security.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    !hostname.includes(".") ||
    hostname.startsWith(".") ||
    hostname.endsWith(".")
  ) {
    return {
      isValid: false,
      normalizedUrl: null,
      origin: null,
      hostname: null,
      error: "Please enter a valid https:// domain name.",
    };
  }

  return {
    isValid: true,
    normalizedUrl: parsed.toString(),
    origin: parsed.origin,
    hostname,
  };
}
