# Jarvnote iOS — setup инструкции

Этот документ описывает как собрать и запустить iOS-приложение на твоём Mac.

## Раунд 1 — первая сборка (то что делаешь сейчас)

### Шаг 1. Установи Node.js на Mac (если не установлен)
```bash
# Через homebrew (рекомендуется)
brew install node

# Или скачай с https://nodejs.org (LTS версия)
node --version  # должно быть v18+ или v20+
```

### Шаг 2. Установи Xcode
1. Открой App Store на Mac
2. Найди Xcode → установи (бесплатно, ~10ГБ)
3. После установки запусти Xcode → согласись с лицензией

### Шаг 3. Установи Xcode Command Line Tools
```bash
xcode-select --install
```

### Шаг 4. Установи CocoaPods (для Capacitor)
```bash
sudo gem install cocoapods
# или через homebrew:
brew install cocoapods

pod --version  # должно показать версию
```

### Шаг 5. Скопируй проект на Mac
Скачай архив `jarvnote.zip` → разархивируй в любую папку, например `~/Projects/jarvnote`.

```bash
cd ~/Projects/jarvnote/frontend
```

### Шаг 6. Установи зависимости фронтенда
```bash
npm install
```

Это поставит React, TipTap, и **Capacitor пакеты**.

### Шаг 7. Собери веб-фронт
```bash
npm run build
```

Получишь папку `dist/` со скомпилированным веб-приложением.

### Шаг 8. Создай iOS-проект (один раз!)
```bash
npx cap add ios
```

Эта команда создаст папку `ios/` с нативным Xcode-проектом. Она нужна только при первой сборке. Потом — только `cap sync`.

### Шаг 9. Синхронизируй код в iOS-проект
```bash
npx cap sync ios
```

Каждый раз когда меняешь веб-код — пересобираешь и синхронизируешь:
```bash
npm run cap:sync
```

(Это `vite build && cap sync ios` одной командой.)

### Шаг 10. Открой в Xcode
```bash
npx cap open ios
```

Откроется Xcode с проектом `Jarvnote`.

### Шаг 11. Подпись в Xcode (для запуска на твоём iPhone)
1. В Xcode выбери проект **App** в левом сайдбаре
2. Перейди на вкладку **Signing & Capabilities**
3. В **Team** выбери свой **Personal Team** (создаётся автоматически если ты залогинен в Apple ID на Mac)
4. **Bundle Identifier** уже стоит `ru.jarvnote.app`. Если Xcode ругается что bundle занят — поменяй на `ru.jarvnote.app.dev` или `<твой_apple_id>.jarvnote`

### Шаг 12. Подключи iPhone к Mac
1. Подключи iPhone USB-кабелем
2. На iPhone разреши доверять Mac
3. На Mac в Xcode сверху выбери свой iPhone из списка устройств

### Шаг 13. Запусти приложение
1. Нажми **▶️ Play** в Xcode (или ⌘R)
2. Первый запуск может ругаться "Untrusted Developer" — на iPhone:
   - Настройки → Основные → VPN и управление устройством
   - Найди свой Apple ID → "Доверять"
3. Запусти приложение с домашнего экрана

🎉 **Готово.** Первая сборка работает.

## Дальше — каждый новый раунд

Когда я даю новый архив:

```bash
cd ~/Projects/jarvnote
unzip -o /path/to/jarvis.zip            # перезаписать файлы

cd frontend
npm install                              # если поменялся package.json
npm run cap:sync                         # build + sync в Xcode
npx cap open ios                         # открой Xcode
# нажми ▶️ Play в Xcode
```

## Troubleshooting

**"Pod install failed"**:
```bash
cd ios/App
pod repo update
pod install
```

**"Untrusted Developer" каждые 7 дней**: личный сертификат Apple Developer работает 7 дней. Чтобы снять лимит — нужен платный аккаунт ($99/год).

**Белый экран в приложении**: убедись что `dist/` существует и `npx cap sync ios` отработал без ошибок. Проверь в Xcode → Console.

**Приложение не видит API**: в `capacitor.config.ts` сейчас webDir=dist (offline-режим, все запросы к API через Internet). Если хочешь live-режим (фронт грузится прямо с jarvnote.ru) — раскомментируй `server.url` в `capacitor.config.ts` и пересобери.

## Текущий статус Раунда 1

После Шага 13 ты должен увидеть:
- ✅ Splash screen с фоном `#FAFAF9`
- ✅ Приложение `Jarvnote` запускается на iPhone
- ✅ Видишь обычный jarvnote интерфейс — **внутри нативной обёртки** (без браузерной строки)
- ✅ Status bar адаптируется под тему (светлая/тёмная)
- ✅ Иконка приложения — пока что дефолтная Capacitor (заменим в Раунде 2)
- ✅ Splash screen — пока что белый (заменим в Раунде 2)

**Что НЕ работает в Раунде 1** (сделаем дальше):
- ❌ Иконка приложения (Раунд 2)
- ❌ Кастомный splash screen с лого (Раунд 2)
- ❌ Поддержка safe-area корректно (Раунд 3)
- ❌ Биометрия Face ID (Раунд 4)
- ❌ Haptics на свайпы и чекбоксы (Раунд 5)
- ❌ Push notifications (Раунд 6, нужен Apple Dev аккаунт)
- ❌ Полноценный offline mode (Раунд 7)
- ❌ TestFlight / App Store (Раунд 10, нужен Apple Dev аккаунт)
