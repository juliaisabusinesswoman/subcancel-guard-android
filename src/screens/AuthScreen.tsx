import React, { useState } from "react";
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
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  generateVaultRecoveryKey,
  copyTextToClipboard,
} from "../lib/recoveryKey";
import { POPULAR_PRESETS } from "../lib/presets";

type AuthMode = "signin" | "signup" | "forgot" | "recovery_created";

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "guerrillamail.com",
  "sharklasers.com",
  "yopmail.com",
  "trashmail.com",
  "dispostable.com",
  "fakeinbox.com",
  "maildrop.cc",
  "throwawaymail.com",
  "getnada.com",
  "tempail.com",
  "mohmal.com",
]);

export function AuthScreen() {
  const {
    signInWithPassword,
    signUpWithPassword,
    saveRecoveryKey,
    confirmRecoveryKeyCopied,
    recoverPasswordWithKey,
    completeSignupRecovery,
  } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [hasCopiedOnce, setHasCopiedOnce] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleCopyRecoveryKey = async () => {
    if (!generatedKey) return;
    await copyTextToClipboard(generatedKey);
    await confirmRecoveryKeyCopied();
    setCopiedKey(true);
    setHasCopiedOnce(true);
    setErrorMsg(null);
    setTimeout(() => setCopiedKey(false), 2200);
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMsg("Please enter your email address.");
      return;
    }

    if (mode === "signup") {
      const emailDomain = trimmedEmail.split("@")[1] || "";
      if (!emailDomain || DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
        setErrorMsg(
          "Please use a permanent personal or work email address so you never lose access to your vault."
        );
        return;
      }
      if (password.length < 6) {
        setErrorMsg("Password must be at least 6 characters long.");
        return;
      }
      if (!agreedToTerms) {
        setErrorMsg(
          "Please confirm you are at least 18 years old and agree to the Terms of Service & Privacy Policy."
        );
        return;
      }
    }

    if (mode === "forgot") {
      if (newPassword.length < 6) {
        setErrorMsg("Your new password must be at least 6 characters long.");
        return;
      }
      if (recoveryKeyInput.replace(/[^A-Za-z0-9]/g, "").length < 12) {
        setErrorMsg(
          "Please enter your full Vault Recovery Key (e.g. SCG-XXXX-XXXX-XXXX)."
        );
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { error, sessionCreated } = await signUpWithPassword(
          trimmedEmail,
          password,
          { agreedToTerms }
        );
        if (error) {
          setErrorMsg(error.message);
        } else if (sessionCreated) {
          const freshKey = generateVaultRecoveryKey();
          const { error: keyError } = await saveRecoveryKey(freshKey);
          setMode("recovery_created");
          setGeneratedKey(!keyError ? freshKey : freshKey);
        } else {
          setMode("signin");
          setSuccessMsg(
            "Account created! Sign in below to open your SubCancel Guard vault."
          );
        }
      } else if (mode === "signin") {
        const { error } = await signInWithPassword(trimmedEmail, password);
        if (error) {
          setErrorMsg(error.message);
        }
      } else if (mode === "forgot") {
        const { error } = await recoverPasswordWithKey(
          trimmedEmail,
          recoveryKeyInput,
          newPassword
        );
        if (error) {
          setErrorMsg(error.message);
        } else {
          const { error: signInErr } = await signInWithPassword(
            trimmedEmail,
            newPassword
          );
          if (signInErr) {
            setPassword("");
            setMode("signin");
            setSuccessMsg(
              "Password updated! You can now sign in with your new password."
            );
          }
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Authentication failed";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "android" ? "height" : "padding"}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Brand Bar */}
        <View style={styles.brandRow}>
          <View style={styles.logoLeft}>
            <View style={[styles.shieldBox, { backgroundColor: colors.gold }]}>
              <Feather name="shield" size={20} color="#020617" />
            </View>
            <View>
              <Text style={[styles.brandTitle, { color: colors.text }]}>
                SubCancel <Text style={{ color: colors.gold }}>Guard</Text>
              </Text>
              <Text style={[styles.brandSub, { color: colors.textMuted }]}>
                Android Edition • Zero Bank Access
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={toggleTheme}
            style={[
              styles.themeBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Feather
              name={isDark ? "sun" : "moon"}
              size={16}
              color={colors.gold}
            />
          </TouchableOpacity>
        </View>

        {/* Hero Pill & Headline */}
        <View style={styles.heroSection}>
          <View
            style={[
              styles.heroPill,
              {
                backgroundColor: colors.forestBg,
                borderColor: colors.forestBorder,
              },
            ]}
          >
            <Feather name="bell" size={12} color={colors.forest} />
            <Text style={[styles.heroPillText, { color: colors.forest }]}>
              100% Private • Native Push Alerts (No SMS)
            </Text>
          </View>

          <Text style={[styles.heroHeadline, { color: colors.text }]}>
            Take Control of Your Subscriptions.{" "}
            <Text style={{ color: colors.gold }}>
              Cancel Unwanted Charges with Ease.
            </Text>
          </Text>

          <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>
            SubCancel Guard tracks recurring expenses, provides direct links to
            official account portals, and sends native 3-day & 1-day push
            notifications to your phone — without bank logins or SMS spam.
          </Text>
        </View>

        {/* Main Auth Card */}
        <View
          style={[
            styles.authCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.cardIconBox,
                {
                  backgroundColor: colors.goldBg,
                  borderColor: colors.goldBorder,
                },
              ]}
            >
              <Feather
                name={
                  mode === "forgot" || mode === "recovery_created"
                    ? "key"
                    : "shield"
                }
                size={18}
                color={colors.gold}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {mode === "signup"
                  ? "Create Your Guard Vault"
                  : mode === "recovery_created"
                  ? "Save Your Private Recovery Key"
                  : mode === "forgot"
                  ? "Reset Password with Recovery Key"
                  : "Sign In to Your Vault"}
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                {mode === "recovery_created"
                  ? "Required step — copy this key before opening your vault."
                  : mode === "forgot"
                  ? "Instant in-app reset — no email or SMS required."
                  : "Syncs seamlessly with your SubCancel Guard account."}
              </Text>
            </View>
          </View>

          {errorMsg && (
            <View
              style={[
                styles.alertBox,
                {
                  backgroundColor: colors.roseBg,
                  borderColor: colors.roseBorder,
                },
              ]}
            >
              <Feather name="alert-circle" size={14} color={colors.rose} />
              <Text style={[styles.alertText, { color: colors.rose }]}>
                {errorMsg}
              </Text>
            </View>
          )}

          {successMsg && (
            <View
              style={[
                styles.alertBox,
                {
                  backgroundColor: colors.forestBg,
                  borderColor: colors.forestBorder,
                },
              ]}
            >
              <Feather name="check-circle" size={14} color={colors.forest} />
              <Text style={[styles.alertText, { color: colors.forest }]}>
                {successMsg}
              </Text>
            </View>
          )}

          {mode === "recovery_created" && generatedKey ? (
            <View style={{ gap: 12 }}>
              <View
                style={[
                  styles.recoveryNotice,
                  {
                    backgroundColor: colors.forestBg,
                    borderColor: colors.forestBorder,
                  },
                ]}
              >
                <Text
                  style={[styles.recoveryNoticeTitle, { color: colors.text }]}
                >
                  Tap &ldquo;Copy Key&rdquo; and save it somewhere safe:
                </Text>
                <Text
                  style={[
                    styles.recoveryNoticeText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Because SubCancel Guard sends zero automated emails or SMS,
                  this key is the only way to reset a forgotten password.
                </Text>
              </View>

              <View
                style={[
                  styles.keyBox,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.goldBorder,
                  },
                ]}
              >
                <Text style={[styles.keyCode, { color: colors.text }]}>
                  {generatedKey}
                </Text>
                <TouchableOpacity
                  onPress={handleCopyRecoveryKey}
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

              <TouchableOpacity
                onPress={() => {
                  if (!hasCopiedOnce) {
                    setErrorMsg(
                      "Please tap 'Copy Key' above first so your Recovery Key is saved to your clipboard."
                    );
                    return;
                  }
                  completeSignupRecovery();
                }}
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: colors.gold,
                    opacity: hasCopiedOnce ? 1 : 0.5,
                  },
                ]}
              >
                <Text style={styles.submitBtnText}>
                  {hasCopiedOnce
                    ? "I've Saved My Recovery Key — Open Vault"
                    : "Tap 'Copy Key' Above to Continue"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Email Address
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@example.com"
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

              {mode === "forgot" ? (
                <>
                  <View style={styles.fieldGroup}>
                    <Text
                      style={[styles.label, { color: colors.textSecondary }]}
                    >
                      Vault Recovery Key
                    </Text>
                    <TextInput
                      value={recoveryKeyInput}
                      onChangeText={(t) => setRecoveryKeyInput(t.toUpperCase())}
                      autoCapitalize="characters"
                      placeholder="SCG-XXXX-XXXX-XXXX"
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

                  <View style={styles.fieldGroup}>
                    <Text
                      style={[styles.label, { color: colors.textSecondary }]}
                    >
                      New Password
                    </Text>
                    <View style={styles.passwordWrap}>
                      <TextInput
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry={!showPassword}
                        placeholder="At least 6 characters"
                        placeholderTextColor={colors.textMuted}
                        style={[
                          styles.input,
                          {
                            flex: 1,
                            backgroundColor: colors.surfaceHighlight,
                            borderColor: colors.border,
                            color: colors.text,
                          },
                        ]}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword((prev) => !prev)}
                        style={styles.eyeBtn}
                      >
                        <Feather
                          name={showPassword ? "eye-off" : "eye"}
                          size={16}
                          color={colors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.fieldGroup}>
                  <View style={styles.passwordLabelRow}>
                    <Text
                      style={[styles.label, { color: colors.textSecondary }]}
                    >
                      Password
                    </Text>
                    {mode === "signin" && (
                      <TouchableOpacity
                        onPress={() => {
                          setMode("forgot");
                          setErrorMsg(null);
                        }}
                      >
                        <Text
                          style={[styles.forgotLink, { color: colors.gold }]}
                        >
                          Forgot password?
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.passwordWrap}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.input,
                        {
                          flex: 1,
                          backgroundColor: colors.surfaceHighlight,
                          borderColor: colors.border,
                          color: colors.text,
                        },
                      ]}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((prev) => !prev)}
                      style={styles.eyeBtn}
                    >
                      <Feather
                        name={showPassword ? "eye-off" : "eye"}
                        size={16}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {mode === "signup" && (
                <TouchableOpacity
                  onPress={() => setAgreedToTerms((prev) => !prev)}
                  style={[
                    styles.checkboxRow,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: agreedToTerms
                        ? colors.goldBorder
                        : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      {
                        backgroundColor: agreedToTerms
                          ? colors.gold
                          : "transparent",
                        borderColor: agreedToTerms
                          ? colors.gold
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {agreedToTerms && (
                      <Feather name="check" size={12} color="#ffffff" />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.checkboxText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    I confirm I am at least{" "}
                    <Text style={{ fontWeight: "800", color: colors.text }}>
                      18 years old
                    </Text>{" "}
                    and agree to the{" "}
                    <Text
                      onPress={() =>
                        Linking.openURL("https://www.subcancelguard.com/terms")
                      }
                      style={{
                        color: colors.gold,
                        fontWeight: "700",
                        textDecorationLine: "underline",
                      }}
                    >
                      Terms of Service
                    </Text>{" "}
                    and{" "}
                    <Text
                      onPress={() =>
                        Linking.openURL(
                          "https://www.subcancelguard.com/privacy"
                        )
                      }
                      style={{
                        color: colors.gold,
                        fontWeight: "700",
                        textDecorationLine: "underline",
                      }}
                    >
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: colors.gold,
                    opacity:
                      loading || (mode === "signup" && !agreedToTerms)
                        ? 0.65
                        : 1,
                  },
                ]}
              >
                {loading && (
                  <ActivityIndicator size="small" color="#ffffff" />
                )}
                <Text style={styles.submitBtnText}>
                  {mode === "signup"
                    ? "Create Private Vault"
                    : mode === "forgot"
                    ? "Reset Password Instantly"
                    : "Sign In"}
                </Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.switchModeRow,
                  { borderTopColor: colors.border },
                ]}
              >
                {mode === "forgot" ? (
                  <TouchableOpacity
                    onPress={() => {
                      setMode("signin");
                      setErrorMsg(null);
                    }}
                  >
                    <Text
                      style={[styles.switchModeText, { color: colors.gold }]}
                    >
                      ← Back to Sign In
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      setMode(mode === "signup" ? "signin" : "signup");
                      setErrorMsg(null);
                    }}
                  >
                    <Text
                      style={[styles.switchModeText, { color: colors.gold }]}
                    >
                      {mode === "signup"
                        ? "Already have an account? Sign In"
                        : "Don't have an account yet? Create one"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Popular Portal Shortcuts Preview */}
        <View
          style={[
            styles.presetsPreviewCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.previewTitle, { color: colors.text }]}>
            Popular Official Account Portal Shortcuts Included
          </Text>
          <Text style={[styles.previewSub, { color: colors.textMuted }]}>
            29 pre-verified Manage Subscription Links ready to arm with 3-day &
            1-day native push alerts:
          </Text>

          <View style={styles.previewGrid}>
            {POPULAR_PRESETS.slice(0, 6).map((preset) => (
              <View
                key={preset.name}
                style={[
                  styles.previewItem,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.previewItemName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {preset.name}
                </Text>
                <Text
                  style={[styles.previewItemCost, { color: colors.forest }]}
                >
                  ${preset.suggestedCost.toFixed(2)}/mo
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Legal Footer */}
        <View style={styles.legalFooterRow}>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL("https://www.subcancelguard.com/terms")
            }
          >
            <Text style={[styles.legalFooterLink, { color: colors.gold }]}>
              Terms of Service
            </Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>•</Text>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL("https://www.subcancelguard.com/privacy")
            }
          >
            <Text style={[styles.legalFooterLink, { color: colors.gold }]}>
              Privacy Policy
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 22,
    paddingBottom: 40,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  shieldBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: "900",
  },
  brandSub: {
    fontSize: 11,
  },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  heroSection: {
    gap: 10,
  },
  heroPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  heroHeadline: {
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 33,
  },
  heroDesc: {
    fontSize: 13,
    lineHeight: 20,
  },
  authCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  cardSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  recoveryNotice: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  recoveryNoticeTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  recoveryNoticeText: {
    fontSize: 12,
    lineHeight: 17,
  },
  keyBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  keyCode: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: "800",
  },
  fieldGroup: {
    gap: 6,
  },
  passwordLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  forgotLink: {
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    padding: 4,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 1,
  },
  checkboxText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  switchModeRow: {
    paddingTop: 14,
    borderTopWidth: 1,
    alignItems: "center",
  },
  switchModeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  presetsPreviewCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  previewSub: {
    fontSize: 12,
    lineHeight: 17,
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  previewItem: {
    width: "48%",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  previewItemName: {
    fontSize: 12,
    fontWeight: "700",
  },
  previewItemCost: {
    fontSize: 12,
    fontWeight: "800",
  },
  legalFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: 4,
  },
  legalFooterLink: {
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
