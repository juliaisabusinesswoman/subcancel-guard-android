import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";

// Unambiguous Crockford-style alphabet (excludes 0/O and 1/I/L to avoid visual confusion)
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates a cryptographically random Vault Recovery Key in the format:
 * SCG-XXXX-XXXX-XXXX (60 bits of entropy, >1.15 quintillion combinations).
 */
export function generateVaultRecoveryKey(): string {
  const bytes = Crypto.getRandomBytes(12);

  let chars = "";
  for (let i = 0; i < bytes.length; i++) {
    chars += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }

  return `SCG-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * Copies text to the native Android clipboard via expo-clipboard.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
