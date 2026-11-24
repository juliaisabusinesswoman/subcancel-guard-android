import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase, WEB_API_URL } from "../lib/supabase";
import type { UserProfileRow } from "../types/database.types";

export interface RecoveryKeyInfo {
  configured: boolean;
  key_hint?: string | null;
  copied_at?: string | null;
  updated_at?: string | null;
}

export interface SignUpGuardMeta {
  agreedToTerms?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfileRow | null;
  loading: boolean;
  isPro: boolean;
  pendingSignupRecovery: boolean;
  completeSignupRecovery: () => void;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    guardMeta?: SignUpGuardMeta
  ) => Promise<{ error: Error | null; sessionCreated?: boolean }>;
  hasRecoveryKey: () => Promise<boolean>;
  getRecoveryKeyInfo: () => Promise<RecoveryKeyInfo>;
  saveRecoveryKey: (rawKey: string) => Promise<{ error: Error | null }>;
  confirmRecoveryKeyCopied: () => Promise<void>;
  recoverPasswordWithKey: (
    email: string,
    rawKey: string,
    newPassword: string
  ) => Promise<{ error: Error | null }>;
  deleteOwnAccount: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSignupRecovery, setPendingSignupRecovery] = useState(false);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      return { error };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  };

  const signUpWithPassword = async (
    email: string,
    password: string,
    guardMeta?: SignUpGuardMeta
  ) => {
    const trimmedEmail = email.trim().toLowerCase();

    try {
      // First try the web backend instant signup route if available, otherwise fall back directly to Supabase Auth
      try {
        const res = await fetch(`${WEB_API_URL}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmedEmail,
            password,
            honeypot: "",
            elapsedMs: 3000,
            agreedToTerms: guardMeta?.agreedToTerms ?? true,
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          created?: boolean;
          error?: string;
          fallbackToClientInDev?: boolean;
        };

        if (res.ok && payload.created) {
          // Keep AuthScreen mounted so the user sees & copies their new Vault Recovery Key
          // before entering the dashboard.
          setPendingSignupRecovery(true);
          const { data: signInData, error: signInError } =
            await supabase.auth.signInWithPassword({
              email: trimmedEmail,
              password,
            });
          if (signInError || !signInData?.session) {
            setPendingSignupRecovery(false);
          }
          return {
            error: signInError,
            sessionCreated: Boolean(signInData?.session),
          };
        }

        // If the backend rejected the signup (e.g. 409 already exists, 400 validation, 429 rate limit),
        // return that exact error instead of falling back to client signUp.
        if (!res.ok && !payload.fallbackToClientInDev && res.status !== 404 && res.status < 500) {
          return {
            error: new Error(payload.error || "Unable to create account."),
            sessionCreated: false,
          };
        }
      } catch {
        // Fallback to direct Supabase client signUp when backend API is unreachable
      }

      setPendingSignupRecovery(true);
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            terms_accepted_at: new Date().toISOString(),
            age_confirmed_18_plus: true,
          },
        },
      });

      if (error || !data?.session) {
        setPendingSignupRecovery(false);
      }

      if (error && error.message.toLowerCase().includes("signups not allowed")) {
        return {
          error: new Error(
            "New account sign-ups are currently restricted to the main SubCancel Guard server. Please sign in with an existing account, or enable 'Allow new users to sign up' in your Supabase Dashboard."
          ),
          sessionCreated: false,
        };
      }

      return { error, sessionCreated: Boolean(data?.session) };
    } catch (err: unknown) {
      return { error: err as Error, sessionCreated: false };
    }
  };

  const hasRecoveryKey = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc("has_recovery_key");
      if (error) return false;
      return Boolean(data);
    } catch {
      return false;
    }
  };

  const getRecoveryKeyInfo = async (): Promise<RecoveryKeyInfo> => {
    try {
      const { data, error } = await supabase.rpc("get_recovery_key_info");
      if (error || !data) {
        const fallback = await hasRecoveryKey();
        return { configured: fallback };
      }
      const parsed = data as {
        configured?: boolean;
        key_hint?: string | null;
        copied_at?: string | null;
        updated_at?: string | null;
      };
      return {
        configured: Boolean(parsed.configured),
        key_hint: parsed.key_hint ?? null,
        copied_at: parsed.copied_at ?? null,
        updated_at: parsed.updated_at ?? null,
      };
    } catch {
      return { configured: false };
    }
  };

  const saveRecoveryKey = async (rawKey: string) => {
    try {
      const { error } = await supabase.rpc("set_recovery_key", {
        raw_key: rawKey,
      });
      return { error: error ? new Error(error.message) : null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  };

  const confirmRecoveryKeyCopied = async () => {
    try {
      await supabase.rpc("confirm_recovery_key_copied");
    } catch {
      // non-blocking audit timestamp
    }
  };

  const recoverPasswordWithKey = async (
    email: string,
    rawKey: string,
    newPassword: string
  ) => {
    try {
      const { data, error } = await supabase.rpc("recover_password_with_key", {
        target_email: email.trim().toLowerCase(),
        raw_key: rawKey.trim(),
        new_password: newPassword,
      });

      if (error) {
        return { error: new Error(error.message) };
      }

      const result = data as { success?: boolean; error?: string } | null;
      if (!result || !result.success) {
        return {
          error: new Error(
            result?.error || "Invalid email address or Recovery Key."
          ),
        };
      }

      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  };

  const deleteOwnAccount = async (): Promise<{ error: Error | null }> => {
    if (!user) return { error: new Error("Not signed in") };
    try {
      await supabase.from("notifications").delete().eq("user_id", user.id);
      await supabase.from("subscriptions").delete().eq("user_id", user.id);
      const { error: rpcError } = await supabase.rpc("delete_own_account");
      if (rpcError) {
        return { error: new Error(rpcError.message) };
      }
      await signOut();
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    setPendingSignupRecovery(false);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const completeSignupRecovery = () => {
    setPendingSignupRecovery(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const isPro = useMemo(() => Boolean(profile?.is_pro), [profile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isPro,
        pendingSignupRecovery,
        completeSignupRecovery,
        signInWithPassword,
        signUpWithPassword,
        hasRecoveryKey,
        getRecoveryKeyInfo,
        saveRecoveryKey,
        confirmRecoveryKeyCopied,
        recoverPasswordWithKey,
        deleteOwnAccount,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
