# SubCancel Guard Android 🛡️🤖
> Android / Google Play Store App (React Native + Expo) for **SubCancel Guard** with Native Android Push Notifications (Zero SMS, Zero Bank Access).

---

## ✨ Key Android Features

1. **Native Android Push Notifications (`expo-notifications` — Zero SMS / Zero Phone Numbers)**
   - **Android 8.0+ Notification Channels:**
     - `Urgent 24h Renewal Warnings` (`renewal-urgent`, `MAX` heads-up banner importance) for 1-day and same-day alerts.
     - `3-Day Advance Renewal Alerts` (`renewal-advance`, `HIGH` importance) for 3-day advance warnings.
   - **Android 13+ (`API 33+`) Runtime Permission Flow:** Requests `POST_NOTIFICATIONS` cleanly and includes a one-tap **Open Android Settings** shortcut if notifications were disabled at the OS level.
   - **Reboot Persistence:** Configured with `RECEIVE_BOOT_COMPLETED` and `SCHEDULE_EXACT_ALARM` so scheduled 3-day and 1-day push notifications survive Android phone restarts.
   - **Hardened Manifest (`blockedPermissions`):** Explicitly strips `SEND_SMS`, `READ_SMS`, `READ_PHONE_STATE`, `READ_CONTACTS`, `RECORD_AUDIO`, and location permissions in [app.json](file:///Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile/app.json) for a clean Google Play Data Safety scan.

2. **Full Feature Parity & Shared Supabase Vault**
   - Connects directly to your existing SubCancel Guard Supabase backend (`users`, `subscriptions`, `notifications`, and zero-email Vault Recovery Key RPCs).
   - **Android UX Polish:** Hardware/gesture `BackHandler` tab navigation, Android `KeyboardAvoidingView`, Dark/Light theme toggle, and native `.csv` / `.json` file export via the Android Share Sheet (`expo-file-system` + `expo-sharing`).
   - **Google Play Policy Compliance:** [ProUpgradeModal.tsx](file:///Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile/src/components/ProUpgradeModal.tsx) avoids external web checkout links inside Google Play builds to comply with Google Play's Payments Policy while syncing `users.is_pro` across platforms.

---

## 🚀 Quickstart (Android)

```bash
cd /Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile
npm install
npx expo start --android
```

- **Test on your Android phone:** Install **Expo Go** from Google Play and scan the QR code.
- **Build an installable `.apk`:** `npm run build:apk`
- **Build a Google Play Store `.aab` bundle:** `npm run build:aab`

See [PLAY_STORE_GUIDE.md](file:///Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile/PLAY_STORE_GUIDE.md) for the full Google Play Console submission & Data Safety walkthrough.
