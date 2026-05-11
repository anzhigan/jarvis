#!/usr/bin/env bash
# Pre-release sanity script. Runs the automated half of QA.md §0 — every
# check that doesn't need a human looking at pixels. Exit non-zero on the
# first failure so this can wire into a pre-commit hook or CI later.
#
# Usage:
#   ./scripts/check-build.sh

set -euo pipefail

cd "$(dirname "$0")/.."   # ios/ root

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; exit 1; }
step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }

step "1. Регенерация project.xcodeproj"
xcodegen generate >/dev/null && ok "xcodegen generate отработал"

step "2. Валидация .plist"
for plist in ExportOptions-development.plist ExportOptions-adhoc.plist Resources/Info.plist; do
    if [[ -f "$plist" ]]; then
        plutil -lint "$plist" >/dev/null && ok "$plist"
    fi
done

step "3. Валидация JSON в Asset Catalog"
fail_json=0
while IFS= read -r json; do
    if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$json" 2>/dev/null; then
        printf "  \033[31m✗\033[0m %s\n" "$json"
        fail_json=1
    fi
done < <(find Resources/Assets.xcassets -name 'Contents.json')
[[ $fail_json -eq 0 ]] && ok "все Contents.json валидные" || exit 1

step "4. AppIcon 1024×1024"
icon="Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png"
if [[ -f "$icon" ]]; then
    dims=$(sips -g pixelWidth -g pixelHeight "$icon" 2>/dev/null | grep pixel | awk '{print $2}' | paste -sd× -)
    if [[ "$dims" == "1024×1024" ]]; then
        ok "icon-1024.png 1024×1024"
    else
        fail "icon-1024.png не 1024×1024 (есть $dims)"
    fi
else
    fail "icon-1024.png отсутствует"
fi

step "5. Bash-синтаксис скриптов"
for sh in scripts/*.sh; do
    bash -n "$sh" && ok "$sh"
done

step "6. Debug-сборка (iOS Simulator)"
sim_id=$(xcrun simctl list devices available | grep -E "iPhone 17|iPhone 16|iPhone 15" | grep -oE '\([A-F0-9-]{36}\)' | head -1 | tr -d '()')
if [[ -z "$sim_id" ]]; then
    fail "не нашёл подходящий iPhone simulator (нужен iPhone 15/16/17)"
fi
xcodebuild -project Jarvnote.xcodeproj -scheme Jarvnote \
    -destination "platform=iOS Simulator,id=$sim_id" \
    -configuration Debug build 2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED" | tail -3
if xcodebuild -project Jarvnote.xcodeproj -scheme Jarvnote \
    -destination "platform=iOS Simulator,id=$sim_id" \
    -configuration Debug build 2>&1 | grep -q "BUILD SUCCEEDED"; then
    ok "Debug-сборка"
else
    fail "Debug-сборка упала"
fi

step "7. TODO / FIXME в production-коде"
# Игнорируем DEBUG-блоки (там часто тестовые TODO) и комментарии-инструкции,
# смотрим только на Swift-код production.
hits=$(grep -rn -E "(TODO|FIXME|XXX)\b" Sources/ \
    --include='*.swift' \
    | grep -vE "//.*(Stage|future|Wrap|Placeholder)" \
    | grep -vE "#if DEBUG" \
    || true)
if [[ -z "$hits" ]]; then
    ok "нет open TODO / FIXME"
else
    printf "%s\n" "$hits"
    printf "  \033[33m⚠\033[0m %d open TODO/FIXME — проверь прежде чем релизить\n" "$(echo "$hits" | wc -l | tr -d ' ')"
fi

printf "\n\033[1;32m✓ Все автоматические проверки прошли.\033[0m\n"
printf "Дальше — мануальный прогон по \033[1mQA.md\033[0m §1–§9.\n"
