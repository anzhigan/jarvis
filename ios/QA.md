# QA Test Matrix — Jarvnote iOS

Чеклист для прогонки **перед каждой sideload-раздачей**. Цель — поймать
функциональные регрессии, визуальные расхождения с веб-моб версией и
очевидные краш-сценарии до того, как IPA попадёт на iPhone.

Запуск:
```bash
./scripts/check-build.sh        # автоматическая часть (lint + build + smoke)
# затем — мануальный прогон по этому документу
```

---

## 0. Pre-flight (автоматизировано)

`./scripts/check-build.sh` проверяет:

- [ ] `xcodegen generate` отрабатывает без warnings
- [ ] Debug-сборка собирается без errors
- [ ] Release-сборка собирается (require code signing skip)
- [ ] `swift package` syntax-check всех `.swift` файлов
- [ ] `plutil -lint` на всех `.plist` файлах
- [ ] `bash -n` на всех `.sh` скриптах
- [ ] Нет TODO / FIXME / XXX в production-коде (DEBUG-блоки игнорируются)
- [ ] Все Asset Catalog colorsets имеют валидный JSON
- [ ] AppIcon 1024×1024 присутствует и валиден

`./scripts/smoke-test.sh` запускает приложение в симуляторе и снимает
baseline-скриншоты всех 5 вкладок + Profile sheet.

---

## 1. Авторизация (`AuthGate` / `LoginView` / `RegisterView`)

| # | Сценарий | Ожидание |
|---|---|---|
| 1.1 | Холодный старт без токенов | Splash с лого → Login screen |
| 1.2 | Холодный старт с валидным токеном в Keychain | Splash → MobileShell |
| 1.3 | Холодный старт с истёкшим access-токеном | API клиент авто-рефрешит → MobileShell |
| 1.4 | Холодный старт с битым refresh-токеном | Keychain очищается, показывается Login |
| 1.5 | Login c правильными credentials | Tabs появляются, аватар-инициал верный |
| 1.6 | Login c неправильным паролем | Inline error, без креша |
| 1.7 | Register → автологин → Tabs | Только что созданный пользователь сразу видит пустые вкладки |
| 1.8 | Logout из Profile | Tabs ⇒ Login screen |
| 1.9 | Биометрия включена → cold-start | Splash → биометрия overlay → Tabs (после Face ID) |
| 1.10 | Биометрия cancel → retry | Overlay остаётся, кнопка Use Face ID повторяет prompt |

---

## 2. Notes

| # | Сценарий | Ожидание |
|---|---|---|
| 2.1 | Tab "Notes" — empty state | Видны секции `Ways` (count 0), `+ Way`, `+ Note` (full-width dashed) |
| 2.2 | `+ Way` → ввод имени → Create | Way появляется в списке мгновенно |
| 2.3 | Тап на Way → детали | Шеврон уезжает, открывается WayDetailView с topics |
| 2.4 | Создать Topic внутри Way | Появляется в списке topics |
| 2.5 | Создать Note внутри Topic | Note появляется, открывается editor |
| 2.6 | Editor: bold / italic / underline / strikethrough | Стиль применяется к выделенному тексту, виден сразу |
| 2.7 | Editor: heading H1/H2/H3 | Применяется к строке, виден правильный font-size |
| 2.8 | Editor: вставка изображения через PhotosPicker | Картинка загружается на S3 (или MinIO), URL появляется в HTML |
| 2.9 | Закрыть editor (back) | Note сохраняется, ноут видим в TopicDetailView |
| 2.10 | Search: ввести запрос | Совпадения подсвечиваются, breadcrumb показывает родителя |
| 2.11 | Pin Note → Way root | Note всплывает наверх в карточках of Topic |
| 2.12 | Delete Way через swipe | Confirmation → Way исчезает с топиками и заметками |
| 2.13 | Note с длинным титлом | Не уезжает за края, обрезается с `…` |

---

## 3. Goals (Kanban / Go / Step)

| # | Сценарий | Ожидание |
|---|---|---|
| 3.1 | Tab "Goals" — Kanban mode по умолчанию | Сегментированный переключатель показывает Kanban active |
| 3.2 | Status pill "Active · N" highlighted на старте | Default selection = active |
| 3.3 | Тап на другой status pill | Переключение статуса, пилл подсвечивается, список фильтруется |
| 3.4 | Priority pill (High/Medium/Low) → multi-select | Можно включить несколько, фильтр кумулятивный |
| 3.5 | `+ Goal` → форма → создать | Goal появляется в списке Active |
| 3.6 | Тап на goal-карточку → детали (TBD на iOS — может только swipe) | swipe `Edit/Delete` работают |
| 3.7 | Прогресс-бар отражает % done | Заливка indigo, число справа mono |
| 3.8 | TODAY block: ochre tint когда нет логов сегодня | Колор-кодинг работает |
| 3.9 | DEADLINE block: правильная дата + days-until | "Jun 30" + "58d" суб-текст mono |
| 3.10 | "Show N items" — раскрытие | Mini-cards для steps + standalone gos |
| 3.11 | Mode → Go: список Go items | Карточки tg-card |
| 3.12 | Mode → Step: constellation view | Узлы с пунктирной линией |
| 3.13 | Тап Go log → toggle done | Карточка получает done-tint, аватар обновляется |

---

## 4. Routines

| # | Сценарий | Ожидание |
|---|---|---|
| 4.1 | Tab "Routines" — top stat row | 3 блока: Done today / Best streak / 30d overall |
| 4.2 | Filter pills row: All · N (active), Due today, Slipping, On hold | All-pill индиго, остальные cream |
| 4.3 | `+ Routine` → форма (boolean / numeric) | Создаётся routine, появляется в списке |
| 4.4 | 7-day heatmap: правильные цвета | Done = moss, Skipped = rust, Empty = cream-dashed |
| 4.5 | Сегодняшняя ячейка имеет indigo ring | 1.5px stroke |
| 4.6 | Тап на ячейку прошлого дня | Selected indigo 2px ring + scale 1.08 |
| 4.7 | Тап ✓ Today → done | Heatmap-ячейка зеленеет, today-кнопка становится moss-fill |
| 4.8 | Тап ✕ Today → skipped | Ячейка станет rust, X-кнопка станет rust-fill |
| 4.9 | Streak count обновляется | После Done → +1 day |
| 4.10 | Numeric routine: лог числа | Partial = верхняя половина moss + нижняя cream |
| 4.11 | Pause routine | Уезжает в "On hold" фильтр |
| 4.12 | Delete routine через swipe | Confirmation → исчезает |

---

## 5. Sprints

| # | Сценарий | Ожидание |
|---|---|---|
| 5.1 | Tab "Sprints" — без спринтов | "+ Sprint" + "No sprints yet" placeholder |
| 5.2 | `+ Sprint` → создать (title + start/end + color) | Активный sprint появляется в секции "Active" |
| 5.3 | Disc-card: 4px accent strip сверху | Цвет sprint'а |
| 5.4 | Disc 130×130 с двумя кольцами | Outer = time elapsed, inner = items done |
| 5.5 | "15 DAYS LEFT" в центре | Fraunces 34, mono caption |
| 5.6 | Side-info: SPRINT + title + period | "May 5 — May 25" формат |
| 5.7 | Two legend rows: ● TIME / ● DONE | Совпадает с цветом колец |
| 5.8 | Status pill: Active/At risk/Closing soon/Closed | Цвет соответствует pace |
| 5.9 | Pace label: ↗ N ahead / ↘ N behind / On pace / Closed | Mono шрифт |
| 5.10 | "Add items" (если items=0) | Solid indigo CTA, открывает picker |
| 5.11 | "Show N items" → раскрывается | Tree с recursive sub-cards (goal → step → go) |
| 5.12 | Pick goal/step/go/routine → multi-select | Chips появляются, "Add N" собирает |

---

## 6. Analysis

| # | Сценарий | Ожидание |
|---|---|---|
| 6.1 | Tab "Analysis" — hero | "MAY 2026, IN FIGURES" + 2-line headline с italic emphasis |
| 6.2 | KPI grid 2×2 | Routines on track / Goals advancing / Longest streak / Notes added |
| 6.3 | Period pills 7d / 30d / 90d / 1y | 30d active по умолчанию |
| 6.4 | Сменить период | Все графики обновляются |
| 6.5 | Daily completion chart | Indigo + moss area marks с заливкой 0.10 |
| 6.6 | Goals vs plan | Горизонтальные бары + dashed expected line |
| 6.7 | Status donut | 4 сегмента, центр-число + "ROUTINES" caption |
| 6.8 | Top streaks | Ranked rows + sparkline + "Nd" suffix |
| 6.9 | Year heatmap | 53×7 grid, today подсвечен indigo border |
| 6.10 | Pull-to-refresh | Перезагружает все данные |

---

## 7. Profile

| # | Сценарий | Ожидание |
|---|---|---|
| 7.1 | Тап на аватар (любой tab) | Profile sheet поднимается |
| 7.2 | Header: 72×72 gradient avatar + имя + tagline | "Active since {month}" если есть entries |
| 7.3 | 4-stat row | Entries / Weeks / Routines / Goals |
| 7.4 | Account: Name + Email | Текущий пользователь |
| 7.5 | Appearance: Theme | Light (placeholder) |
| 7.6 | Security: показывается **только** если устройство поддерживает биометрию | На iPhone без Face ID — секция скрыта |
| 7.7 | Toggle Biometry → ON | Face ID prompt → success → toggle на |
| 7.8 | Toggle Biometry → ON → cancel | Toggle откатывается на off |
| 7.9 | Toggle Biometry → OFF | Без prompt, мгновенно |
| 7.10 | Sign out | Confirmation → возврат на Login |
| 7.11 | Send feedback | Открывает `mailto:support@jarvnote.ru` |
| 7.12 | Back chevron | Sheet закрывается |

---

## 8. Cross-cutting

### 8.1. Offline (`JARV_FORCE_OFFLINE YES`)

| # | Сценарий | Ожидание |
|---|---|---|
| 8.1.1 | Запуск с force-offline + кэш есть | Banner `Offline · showing cached data` сверху, данные из SwiftData видны |
| 8.1.2 | Запуск с force-offline + кэш пуст | Banner есть, списки пустые без креша |
| 8.1.3 | Restoring connection — banner исчезает | После выключения flag и hot-reload |
| 8.1.4 | Write-операции offline | Failed silently или показывается inline error (не creash) |

### 8.2. Haptics (на реальном устройстве, не в симуляторе)

- [ ] Tab switch — selection tick
- [ ] Mode picker (Kanban/Go/Step) — selection tick
- [ ] StatusPill tap — selection tick
- [ ] AddButton tap — light impact
- [ ] Routine ✓ Today — success notification
- [ ] Routine ✕ Today — medium impact
- [ ] Biometry enable success — success notification
- [ ] Biometry fail — error notification

### 8.3. Шрифты

- [ ] Все display-заголовки имеют засечки (New York fallback)
- [ ] UI labels (кнопки, пилл) — sans-serif
- [ ] Числа в KPI / streak — serif tabular
- [ ] Mono шрифт для счётчиков, дат, процентов

---

## 9. Device matrix

Минимум прогнать smoke-test на:

| Устройство | Цель |
|---|---|
| iPhone SE (3rd gen) | 4.7" — самый маленький поддерживаемый размер |
| iPhone 15 / 16 | 6.1" — основной target |
| iPhone 17 Pro Max | 6.7" — проверка широких layout'ов |
| iPad mini | tablet — проверка что portrait-only нигде не упирается в landscape |

`xcrun simctl list devices` для проверки доступных симуляторов.

---

## 10. Pre-release checklist (бамп версии)

Перед раздачей IPA:

- [ ] `MARKETING_VERSION` поднят в `project.yml` (1.0.0 → 1.0.1)
- [ ] `CURRENT_PROJECT_VERSION` поднят (1 → 2 → 3)
- [ ] `xcodegen generate`
- [ ] Релизные NOTES задокументированы (что нового / что починено)
- [ ] `./scripts/check-build.sh` зелёный
- [ ] Smoke test пройден на одном симуляторе минимум
- [ ] `./scripts/build-and-export.sh` собирает `build/Jarvnote.ipa`
- [ ] IPA установлен на свой iPhone, базовый smoke-test пройден на устройстве
- [ ] Биометрия проверена на устройстве (Face ID / Touch ID)
- [ ] Push-уведомления (если будут добавлены) — проверить permissions

---

## 11. Известные ограничения / TODO

- Theme dark mode — placeholder в Profile, не подключён ко всему UI
- Offline write queue — не реализован, writes падают если offline
- Steps — backend не имеет `GET /sprints` (legacy), steps берутся nested из goals
- Step view — может тормозить при много children через GeometryReader
- iPad — UI оптимизирован под iPhone, на iPad layout растягивается без отдельных layout'ов

См. также `SIDELOAD.md` для типовых проблем с подписью / установкой.
