# Jarvnote iOS — Getting Started

Native SwiftUI app talking to the Jarvnote FastAPI backend at `https://jarvnote.ru/api`.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| macOS | 14+ | Confirmed working: 26.3.1 |
| Xcode | 16+ | Confirmed working: 26.4.1 |
| Homebrew | 4+ | https://brew.sh |
| xcodegen | 2.45+ | `brew install xcodegen` |
| Apple ID | — | Signed into Xcode (Xcode → Settings → Accounts) |
| Apple Developer Program | $99/yr | Required for sideload + biometric/push entitlements |

## Why xcodegen?

`.xcodeproj` is a tangled folder of XML that's painful to merge through git and easy
to corrupt by hand-editing. xcodegen generates it from a single `project.yml` spec —
the project file becomes a deterministic build artifact, like a bundler output, and
`project.yml` is the source of truth that lives in git.

## First-time setup

```bash
cd ios
xcodegen generate          # creates Jarvnote.xcodeproj
open Jarvnote.xcodeproj    # opens in Xcode
```

In Xcode:

1. Select the `Jarvnote` target → Signing & Capabilities tab
2. Set **Team** to your Apple Developer team
3. Bundle Identifier is `ru.jarvnote.app` (set in `project.yml` — change if needed)
4. ⌘R to run on simulator, or plug in an iPhone and select it as the run destination

## Re-generating the Xcode project

After any change to `project.yml` or after pulling from git:

```bash
cd ios
xcodegen generate
```

This is safe — it overwrites the `.xcodeproj` from spec. Your Xcode-side scheme
selection and breakpoints persist (they live in `xcuserdata/`, gitignored).

## Build configurations

- **Debug**: API points at the local `docker compose` backend (`http://localhost:8000/api`)
- **Release**: API points at production (`https://jarvnote.ru/api`)

Switch via Edit Scheme → Run → Build Configuration.

## Sideload distribution

See `Stage 13 — Sideload distribution setup` documentation (added later in the build).
TL;DR: `xcodebuild archive` → Organizer → Export for development distribution
→ install via Xcode (Window → Devices & Simulators → drag .ipa).

## Project layout

```
ios/
├── project.yml          # xcodegen spec (source of truth)
├── Sources/             # All Swift code
│   ├── App/             # App entry + root navigation
│   ├── Features/        # Per-feature modules (Notes, Goals, …)
│   ├── Models/          # Codable types matching backend schemas
│   ├── Services/        # Networking, Auth, Keychain, Storage
│   └── DesignSystem/    # Colors, fonts, reusable views
├── Resources/
│   ├── Assets.xcassets/ # App icon, colors, images
│   ├── Fonts/           # Fraunces, Inter, Source Serif 4 (.ttf/.otf)
│   ├── Info.plist       # Entitlements, permissions, supported orientations
│   └── LaunchScreen.storyboard
└── GETTING_STARTED.md   # this file
```

## Backend dependency

The iOS app is a thin client. All persistence is on the FastAPI backend.
For local dev pointed at localhost: backend must be running (`docker compose up`)
and the simulator/device must be on the same network.

For physical-device debug pointed at localhost backend: replace `localhost` with
your Mac's LAN IP (e.g. `http://192.168.1.20:8000/api`) in the Debug build config,
or use a tool like `ngrok` to tunnel.
