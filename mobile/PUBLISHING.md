# Publishing the Android app

Three build profiles in `eas.json`, each for a different purpose:

| Profile | Output | Use for |
|---|---|---|
| `development` | Internal APK, dev client | Local development, live-reload against Metro |
| `preview` | Internal APK | Sideload-testing a real build without a store — this is what's been used and verified so far |
| `production` | Android App Bundle (`.aab`) | Google Play Console submission |

All three bake `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and
`EXPO_PUBLIC_API_BASE_URL` directly into `eas.json`'s `env` block per profile — see
`OPERATING_SYSTEM.md` §4 for why (`.env.local` is gitignored, and EAS Build excludes gitignored
files from what it uploads, so those vars would otherwise be undefined in the built app).

## One-time setup (do this before any of the commands below)

```
cd mobile
npx eas-cli login
npx eas-cli build:configure
```

`login` needs the Expo account holder's credentials interactively — this can't be scripted or run on
anyone's behalf. `build:configure` links the project to an EAS project id (writes
`extra.eas.projectId` into `app.json`) and only needs to run once.

## Building

From `mobile/`:

```
npm run build:preview       # internal APK — same profile already tested end-to-end
npm run build:production    # Android App Bundle, for Play Console
```

(equivalent to `eas build --profile <preview|production> --platform android` — the npm scripts are
just shorthand.)

Both queue a cloud build; EAS gives you a download link for the `.apk` (preview) or a Play
Console–ready `.aab` (production) when it finishes. `production` also has `autoIncrement: true` in
`eas.json`, so `versionCode` bumps automatically on each production build — no manual bump needed.

## Submitting to Google Play

Requires a Google Play Console developer account and a service account JSON key with the right
permissions (Expo's docs: [Submitting to Google Play](https://docs.expo.dev/submit/android/)) —
neither of those can be set up from here; both are account-level, credential-holding steps for
whoever owns the Play Console account.

Once that key exists and `eas.json`'s `submit.production` is pointed at it:

```
npm run submit:production
```

This uploads the most recent `production` build's `.aab` to Play Console (defaults to the internal
testing track — promote through Play Console's own UI from there).

## Before the first production submission

- [ ] Confirm the Android `package` name in `app.json` (`com.avalonlabs.mobile`) is final — it
      cannot be changed after the first Play Store submission.
- [ ] Confirm EAS Build's managed Android keystore is what you want used for signing (Expo manages
      this automatically for a project that's never had a manual keystore uploaded — check
      `eas credentials` if unsure which is active).
- [ ] Run through Play Console's own content rating, data safety, and store listing requirements —
      none of that lives in this repo or in EAS Build config.
