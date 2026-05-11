#!/usr/bin/env bash
# Smoke test: устанавливает свежесобранный Debug-IPA в booted simulator,
# проходится по всем 5 вкладкам с автологином и снимает baseline-скриншоты
# в /tmp/jarvnote-smoke/. Затем открывает Profile sheet через DEBUG-флаг.
#
# Полезно как:
#   - финальный sanity-check перед раздачей IPA
#   - источник истины для визуальных регрессий между релизами
#   - быстрый способ убедиться что cold-start, autologin и базовый
#     рендеринг каждой вкладки не упали
#
# Не заменяет мануальный QA.md прогон — проверяет только что не крэшит.

set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR="${SMOKE_OUT:-/tmp/jarvnote-smoke}"
APP_BUNDLE_ID="ru.jarvnote.app"
EMAIL="${JARV_TEST_EMAIL:-ios-test@gmail.com}"
PASSWORD="${JARV_TEST_PASSWORD:-test123456}"

echo ">> Output: $OUT_DIR"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.png

# 1. Найти booted simulator. Если ни одного не запущено — поднимаем iPhone 17.
sim_id=$(xcrun simctl list devices booted 2>/dev/null | grep -oE '\([A-F0-9-]{36}\)' | head -1 | tr -d '()' || true)
if [[ -z "$sim_id" ]]; then
    sim_id=$(xcrun simctl list devices available | grep "iPhone 17 " | grep -oE '\([A-F0-9-]{36}\)' | head -1 | tr -d '()')
    [[ -z "$sim_id" ]] && { echo "!! не нашёл iPhone 17 simulator"; exit 1; }
    echo ">> Booting simulator $sim_id"
    xcrun simctl boot "$sim_id" >/dev/null 2>&1 || true
    sleep 3
fi
echo ">> Using simulator $sim_id"

# 2. Установить свежую сборку. Предполагаем что Debug build уже в DerivedData.
APP=$(find ~/Library/Developer/Xcode/DerivedData -name 'Jarvnote.app' \
    -path '*/Build/Products/Debug-iphonesimulator/*' 2>/dev/null | head -1)
if [[ -z "$APP" ]]; then
    echo ">> Debug-сборки нет в DerivedData. Запускаю xcodebuild…"
    xcodebuild -project Jarvnote.xcodeproj -scheme Jarvnote \
        -destination "platform=iOS Simulator,id=$sim_id" \
        -configuration Debug build >/dev/null 2>&1
    APP=$(find ~/Library/Developer/Xcode/DerivedData -name 'Jarvnote.app' \
        -path '*/Build/Products/Debug-iphonesimulator/*' 2>/dev/null | head -1)
fi
echo ">> App: $APP"

xcrun simctl uninstall "$sim_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl install "$sim_id" "$APP" >/dev/null

# 3. Прогнать по всем 5 вкладкам.
TABS=(notes routines goals sprints analysis)
for tab in "${TABS[@]}"; do
    echo ">> tab: $tab"
    xcrun simctl terminate "$sim_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
    xcrun simctl launch "$sim_id" "$APP_BUNDLE_ID" \
        -JARV_AUTOLOGIN_EMAIL "$EMAIL" \
        -JARV_AUTOLOGIN_PASSWORD "$PASSWORD" \
        -JARV_INITIAL_TAB "$tab" >/dev/null
    sleep 3
    xcrun simctl io "$sim_id" screenshot "$OUT_DIR/$tab.png" >/dev/null 2>&1
done

# 4. Profile sheet (через DEBUG-флаг JARV_OPEN_PROFILE).
echo ">> profile sheet"
xcrun simctl terminate "$sim_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$sim_id" "$APP_BUNDLE_ID" \
    -JARV_AUTOLOGIN_EMAIL "$EMAIL" \
    -JARV_AUTOLOGIN_PASSWORD "$PASSWORD" \
    -JARV_INITIAL_TAB notes \
    -JARV_OPEN_PROFILE YES >/dev/null
sleep 3
xcrun simctl io "$sim_id" screenshot "$OUT_DIR/profile.png" >/dev/null 2>&1

# 5. Offline mode (force-offline DEBUG flag).
echo ">> offline banner"
xcrun simctl terminate "$sim_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$sim_id" "$APP_BUNDLE_ID" \
    -JARV_AUTOLOGIN_EMAIL "$EMAIL" \
    -JARV_AUTOLOGIN_PASSWORD "$PASSWORD" \
    -JARV_INITIAL_TAB notes \
    -JARV_FORCE_OFFLINE YES >/dev/null
sleep 3
xcrun simctl io "$sim_id" screenshot "$OUT_DIR/offline.png" >/dev/null 2>&1

# 6. Reset и финал.
xcrun simctl terminate "$sim_id" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true

echo
echo "✓ Smoke test пройден. Скриншоты:"
ls -la "$OUT_DIR"
