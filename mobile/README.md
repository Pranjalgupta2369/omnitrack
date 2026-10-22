# OmniTrack mobile (Expo SDK 57, TypeScript, expo-router)

```bash
cp .env.example .env          # Windows: copy .env.example .env   then fill in the two values
npm install
npx expo start                # scan the QR code with Expo Go
```

Works in Expo Go: sign-in, Today, Habits, Progress, hubs, realtime updates.
**Does not work in Expo Go on Android: push reminders** (SDK 53+). For those you need a development build:

```bash
npm install -g eas-cli
eas login
eas init                                           # writes extra.eas.projectId into app.json
eas build --profile development --platform android  # or ios (needs an Apple developer account)
```
Change `ios.bundleIdentifier` / `android.package` in `app.json` before the first build (`com.example.omnitrack` is a
placeholder). Android push also needs FCM credentials; follow Expo's "push notifications setup" page.

## Where things live
- `src/lib/dashboard.tsx`: one shared store. Calls `my_today()`, `my_stats()`, `my_week()` and re-fetches on Realtime
  changes to `logs` / `user_stats`. No streak or XP maths in this app, by design.
- `src/app/(tabs)/`: Today, Habits, Progress, You (hubs, time zone, reminders).
- `src/components/`: ProgressRing and XpBar (Animated), StreakBadge, HabitRow, AddHabitSheet.

Type-check: `npm run typecheck`. Bundle check: `npx expo export --platform android`.
