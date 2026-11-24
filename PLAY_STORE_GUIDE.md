# Google Play Store Launch & Data Safety Guide 🤖🛡️
> Step-by-step guide to testing **SubCancel Guard** on Android, building an installable `.apk`, and publishing the signed `.aab` (Android App Bundle) to Google Play Console.

---

## 1. Test Immediately on Your Android Phone (Zero Local Android Studio Needed)

```bash
cd /Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile
npm install
npx expo start --android
```
- **On a Physical Android Phone:** Install **Expo Go** from the Google Play Store and scan the QR code shown in your terminal.
- **On Android Studio Emulator:** Open Android Studio → Virtual Device Manager → launch an Android 13/14/15 Pixel emulator, then press **`a`** in the Expo terminal.

---

## 2. Build an Installable Android `.apk` or Play Store `.aab` (Cloud Build via EAS)

Because [eas.json](file:///Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile/eas.json) is already configured, Expo's cloud builders compile the Android binaries for you (no local Gradle/Android SDK setup required on your Mac):

1. **Install EAS CLI & Sign In (one-time):**
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. **Generate a Sideloadable Android `.apk` (for testing on any Android phone):**
   ```bash
   npm run build:apk
   ```
   *(Runs `eas build --platform android --profile preview` and gives you a direct download link/QR code for the `.apk`.)*

3. **Generate the Signed Production `.aab` for Google Play Console:**
   ```bash
   npm run build:aab
   ```
   *(Runs `eas build --platform android --profile production`, manages your Android Upload Keystore securely, auto-increments `versionCode`, and produces the `.aab` file to upload to Google Play Console → Internal / Closed / Production testing.)*

---

## 3. Android Push Notifications Architecture (Zero SMS)

Configured in [app.json](file:///Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile/app.json) and [pushNotifications.ts](file:///Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile/src/lib/pushNotifications.ts):
- **On-Device Scheduled Push Notifications (Works Out of the Box — No Firebase Required):**
  - Uses Android's native `AlarmManager` + `NotificationManager` with `RECEIVE_BOOT_COMPLETED` (so scheduled alerts survive phone restarts) and `POST_NOTIFICATIONS` (Android 13+ runtime prompt).
  - Creates two Android 8.0+ Notification Channels visible in Android App Settings:
    - **`Urgent 24h Renewal Warnings` (`renewal-urgent`)**: `MAX` importance (heads-up pop-over banner + sound + vibration).
    - **`3-Day Advance Renewal Alerts` (`renewal-advance`)**: `HIGH` importance.
- **Optional Remote Server Push via Firebase Cloud Messaging (FCM V1):**
  - Only needed if you also want the Supabase Edge Function ([send-renewal-push/index.ts](file:///Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile/supabase/functions/send-renewal-push/index.ts)) to wake devices remotely from the server.
  - To enable later: create a free Firebase project for `com.subcancelguard.app`, download `google-services.json` into the project root, add `"googleServicesFile": "./google-services.json"` under `expo.android` in `app.json`, and upload your FCM V1 Service Account key via `eas credentials`.

---

## 4. Google Play Console Checklist & Data Safety Answers

SubCancel Guard's manifest in [app.json](file:///Users/juliasoh/.gemini/antigravity/scratch/subcancel-guard-mobile/app.json) explicitly **blocks** `SEND_SMS`, `RECEIVE_SMS`, `READ_SMS`, `READ_PHONE_STATE`, `READ_CONTACTS`, `RECORD_AUDIO`, `ACCESS_FINE_LOCATION`, and external storage permissions (`blockedPermissions`), making Google Play review fast and clean:

| Google Play Console Section | Recommended Answer for SubCancel Guard |
| :--- | :--- |
| **Package Name** | `com.subcancelguard.app` |
| **Target Audience** | `18 and over` (matches Terms of Service clickwrap) |
| **Ads Declaration** | **No**, my app does not contain ads |
| **Financial Features Declaration** | Select *"My app doesn't provide any financial features"* OR *"Budgeting / Expense tracker (manual entry only — no bank linking, lending, or money transfer)"* |
| **Data Collected (Data Safety)** | • **Email address** (Account management / Authentication, Encrypted in transit)<br>• **App interactions / User-entered subscription items** (App functionality, Encrypted in transit, Not shared with third parties) |
| **Data Shared with Third Parties** | **None** (Zero ad networks, zero analytics brokers, zero bank aggregators) |
| **Account Deletion Requirement** | **Compliant!** Both in-app deletion (*Account tab → Delete Account & Vault Permanently*) AND web instructions (`https://www.subcancelguard.com/privacy`) are provided. |
| **Privacy Policy URL** | `https://www.subcancelguard.com/privacy` |
