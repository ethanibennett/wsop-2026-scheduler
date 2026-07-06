# WSOP Console — native iOS wrapper (Capacitor)

A thin native shell around the live console at **futurega.me/console**, for
testing it as an actual app on the simulator or a device. It's the web app in a
native WebView — not a bundled/offline build.

## Run it in Xcode

```bash
cd wsop-console/native-ios
npm install            # first time only (Capacitor CLI + iOS)
npx cap open ios       # opens ios/App in Xcode
```

Then in Xcode: pick a simulator (or your device) and hit **▶ Run**.

Or straight to the simulator from the terminal:

```bash
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath ./build \
  CODE_SIGNING_ALLOWED=NO build
DEV=$(xcrun simctl list devices booted | grep -oE '\(([0-9A-F-]{36})\)' | head -1 | tr -d '()')
xcrun simctl install "$DEV" "$(find ./build/Build/Products -name App.app | head -1)"
xcrun simctl launch "$DEV" me.futurega.console
```

## First launch

The console is behind HTTP Basic Auth, so on first load the app shows a native
**"Sign in to WSOP Console"** prompt (username pre-filled `ham`). Enter your
futurega.me password. Credentials are held **in memory for the session only** —
nothing is stored on disk (see `BasicAuthPlugin` in `ios/App/App/AppDelegate.swift`).

## Known limits (by design — this is the quick wrapper)

- **In-app push doesn't fire.** iOS only allows web push in Safari/PWA, not in an
  app WebView. Backer text/email digests are unaffected (server-side). Your own
  push still works via the Safari "Add to Home Screen" PWA.
- **Not distributable** without an Apple Developer account (simulator + a wired
  device via a free personal team work for testing).

## Config

- Target URL: `capacitor.config.json` → `server.url`.
- App id: `me.futurega.console`, name: **WSOP Console**.
- Capacitor 8, Swift Package Manager (no CocoaPods).

The "proper" native app (offline bundle + token auth + native APNs push +
TestFlight) is a separate, larger effort — see the chat history for the estimate.
