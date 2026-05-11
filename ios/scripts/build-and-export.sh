#!/usr/bin/env bash
# Archive + export Jarvnote.ipa for sideload distribution.
#
# Usage:
#   ./scripts/build-and-export.sh                # development export (default)
#   ./scripts/build-and-export.sh development    # same as above
#   ./scripts/build-and-export.sh adhoc          # ad-hoc distribution
#
# Output: build/Jarvnote.ipa  (drop into AltStore / Sideloadly / Apple
# Configurator / Xcode → Devices & Simulators to install on iPhone).
#
# Prerequisites:
#   - Xcode 16+ with your Apple Developer team selected for the project
#   - Device registered in the developer portal (Devices & Capabilities)
#   - `xcodegen generate` ran cleanly

set -euo pipefail

method="${1:-development}"
case "$method" in
    development) options_plist="ExportOptions-development.plist" ;;
    adhoc)       options_plist="ExportOptions-adhoc.plist" ;;
    *) echo "usage: $0 [development|adhoc]"; exit 64 ;;
esac

cd "$(dirname "$0")/.."   # ios/ root

if [[ ! -f Jarvnote.xcodeproj/project.pbxproj ]]; then
    echo ">> Regenerating Jarvnote.xcodeproj"
    xcodegen generate
fi

archive_path="build/Jarvnote.xcarchive"
export_dir="build/export"

rm -rf "$archive_path" "$export_dir"
mkdir -p build

echo ">> Archiving (Release)…"
xcodebuild \
    -project Jarvnote.xcodeproj \
    -scheme Jarvnote \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$archive_path" \
    archive | xcbeautify --quieter 2>/dev/null || \
xcodebuild \
    -project Jarvnote.xcodeproj \
    -scheme Jarvnote \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$archive_path" \
    archive

echo ">> Exporting IPA ($method)…"
xcodebuild \
    -exportArchive \
    -archivePath "$archive_path" \
    -exportOptionsPlist "$options_plist" \
    -exportPath "$export_dir"

ipa_path="$export_dir/Jarvnote.ipa"
if [[ ! -f "$ipa_path" ]]; then
    echo "!! Expected $ipa_path but it's not there. Check $export_dir for diagnostics."
    ls -la "$export_dir"
    exit 1
fi

# Move into a stable location for tooling pipelines.
mv "$ipa_path" build/Jarvnote.ipa

echo
echo "✓ Built build/Jarvnote.ipa"
echo "  Install via:"
echo "    – AltStore (drag the IPA in)"
echo "    – Sideloadly (open IPA, plug in iPhone)"
echo "    – Apple Configurator 2 (drag IPA onto device)"
echo "    – Xcode → Window → Devices and Simulators → drag IPA onto Installed Apps"
