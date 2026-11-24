-- ==============================================================================
-- SubCancel Guard Mobile: Native Push Notification Tokens (Zero SMS / Zero Phone)
-- Stores Expo Push Tokens per authenticated user under strict Row-Level Security
-- so optional server-side cron jobs can send remote push notifications alongside
-- on-device scheduled local push notifications.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expo_push_token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    device_name TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can view their own push tokens"
    ON public.push_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can insert their own push tokens"
    ON public.push_tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can update their own push tokens"
    ON public.push_tokens
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can delete their own push tokens"
    ON public.push_tokens
    FOR DELETE
    USING (auth.uid() = user_id);
