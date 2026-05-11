# Sideload Jarvnote на iPhone

Установка `Jarvnote.app` на свой iPhone без публикации в App Store.
Работает с платным аккаунтом Apple Developer ($99/год).

## TL;DR

```bash
cd ios
./scripts/build-and-export.sh           # → build/Jarvnote.ipa
```

Затем перетащи `build/Jarvnote.ipa` в AltStore (или Sideloadly / Apple Configurator / Xcode → Devices and Simulators).

---

## 1. Подготовка (один раз)

### 1.1. Зарегистрировать iPhone в developer-аккаунте

1. Открой **Xcode → Settings → Accounts** → выбери свой Apple ID → **Manage Certificates** → если ещё нет — `+` → **Apple Development**.
2. Подключи iPhone к Mac кабелем.
3. **Xcode → Window → Devices and Simulators** → выбери iPhone → **Use for Development** (если ещё не добавлен).
4. Сайт <https://developer.apple.com/account/resources/devices/list> должен показывать твой iPhone (Xcode добавляет автоматически).

Лимит: 100 устройств в год на каждую категорию (iPhone / iPad / Mac / Apple Watch / Apple TV) на developer-аккаунт.

### 1.2. Прописать команду в Xcode

```bash
cd ios
xcodegen generate
open Jarvnote.xcodeproj
```

В Xcode:

1. Выбери target **Jarvnote** → вкладка **Signing & Capabilities**.
2. **Team**: выбери свой Apple Developer team. Слева внизу должно появиться "Provisioning Profile: Xcode Managed Profile" — это означает что Xcode сам управляет профилем подписи.
3. **Bundle Identifier**: `ru.jarvnote.app` — менять не нужно.

Закрой Xcode (или оставь открытым — скрипт всё равно соберёт через `xcodebuild`).

---

## 2. Сборка IPA

### Через скрипт (рекомендованно)

```bash
./scripts/build-and-export.sh                # development export по умолчанию
./scripts/build-and-export.sh adhoc          # ad-hoc подпись (для AltStore с другого аккаунта)
```

Скрипт делает три шага:

1. `xcodegen generate` — пересобирает `.xcodeproj` если нужно.
2. `xcodebuild archive` (Release) — собирает `build/Jarvnote.xcarchive`.
3. `xcodebuild -exportArchive` с одной из `ExportOptions-*.plist` — выкатывает `build/Jarvnote.ipa`.

### Через Xcode UI

Если хочешь визуально:

1. **Product → Scheme → Edit Scheme** → **Archive** → **Build Configuration: Release** (уже стоит в `project.yml`).
2. Выбери destination **Any iOS Device** (не Simulator) сверху.
3. **Product → Archive**.
4. Когда Organizer откроется — нажми **Distribute App** → **Custom** → **Development** (или **Ad Hoc**) → **Next** → **Next** → **Export** → выбери папку.

---

## 3. Установка на iPhone

Любой из четырёх способов:

### 3.1. Xcode (самый простой)

1. **Window → Devices and Simulators**.
2. Выбери iPhone слева → раздел **Installed Apps**.
3. Перетащи `build/Jarvnote.ipa` прямо в этот список. Установка занимает 5–15 секунд.

### 3.2. Apple Configurator 2

`Apple Configurator 2.app` — бесплатно в Mac App Store.
1. Подключи iPhone, открой Configurator → выбери устройство.
2. **Add → Apps** → выбери IPA.

### 3.3. AltStore

`AltStore` — для установки IPA с другого Apple ID без developer-аккаунта на этом ID. Полезно, если хочешь раздать тестерам.

1. Установи AltServer на Mac: <https://altstore.io>.
2. AltStore на iPhone → Settings → Sign In with свой Apple ID.
3. AltStore → My Apps → `+` → выбери IPA.

Подпись AltStore истекает через 7 дней (free Apple ID) или 1 год (paid). Для платного аккаунта используй `development` IPA.

### 3.4. Sideloadly

`Sideloadly` (<https://sideloadly.io>) — графическая обёртка вокруг Cydia Impactor. Проще чем AltStore для разовых установок. Drag-and-drop IPA + Apple ID + iPhone подключён.

---

## 4. Что обновлять

| Действие | Когда |
|---|---|
| `xcodegen generate` | После правки `project.yml` или после `git pull` |
| `./scripts/build-and-export.sh` | Каждый раз перед заливкой свежей сборки на iPhone |
| Bump `MARKETING_VERSION` в `project.yml` | При значимом изменении (1.0.0 → 1.0.1) — без этого iOS не обновит уже установленную сборку |
| Bump `CURRENT_PROJECT_VERSION` | Каждый release-билд (1 → 2 → 3 …) |

Сейчас стоит `MARKETING_VERSION: 1.0.0`, `CURRENT_PROJECT_VERSION: 1`. Подними оба перед раздачей следующей версии.

---

## 5. Срок действия подписи

| Кто подписал | Срок |
|---|---|
| Платный Apple Developer ($99) | **365 дней** (до истечения сертификата, обычно автоматически продляется) |
| Free Apple ID (sideload через AltStore) | **7 дней** — после нужно пере-подписать через AltStore |

После истечения профиля приложение перестаёт запускаться: иконка остаётся, но при нажатии — `Untrusted Enterprise Developer` или просто крэш на старте. Решение: пере-собрать → пере-залить.

---

## 6. Если что-то пошло не так

### "No matching profiles found"
Не выбрал team в **Signing & Capabilities** в Xcode → Settings auto-management не включился. Проверь что Apple ID добавлен в **Xcode → Settings → Accounts** и тебе видны команды.

### "No such device available for `generic/platform=iOS`"
Это нормально — `generic/platform=iOS` означает "архивная сборка под любое iOS-устройство", не требует подключённого iPhone.

### IPA не устанавливается, "Unable to install"
1. Проверь что iPhone зарегистрирован в developer portal.
2. Удали старую версию Jarvnote с iPhone, попробуй ещё раз (иногда конфликт сертификатов).
3. Перезагрузи iPhone.
4. На новом iPhone iOS 17+ — **Settings → Privacy & Security** → пролистай вниз до **Developer Mode** → включи и перезагрузи.

### Сборка падает на этапе подписи
```
error: No signing certificate "iOS Development" found
```
Открой Xcode → **Settings → Accounts** → выбери Apple ID → **Manage Certificates** → `+` → **Apple Development**.

### IPA весит подозрительно много
Стандартный размер — 8–15 MB (без custom fonts) или 20–35 MB (со всеми Fraunces / Inter / Source Serif TTF).
Если IPA > 50 MB — где-то закомитили лишнее. Проверь `Resources/` на случайные `.psd` / `.zip` / `.mov`.
