# AAH2 — ревью архитектуры и более узкое ядро

Дата: 2026-06-03  
Контекст: в репозитории уже есть направление `core + plugins`, но текущая кодовая база всё ещё собрана как единый backend с общим store и полным набором маршрутов.

---

## 1. Что в текущих документах уже правильно

Идея двигаться к `core + modules` правильная. Особенно полезны:

- отказ от единого store-контракта на весь домен;
- вынос бизнес-логики из route handlers;
- feature flags для backend/web/VS Code/MCP;
- поэтапное подключение модулей вместо попытки поднять весь аналитический стек сразу.

Это соответствует реальному состоянию кода:

- `app/main.py` регистрирует все routers безусловно;
- `app/repositories/sql_store.py` держит почти весь домен в одном классе;
- `app/services/store.py` повторяет ту же модель для in-memory;
- `app/api/routes/review_context.py` и `app/api/routes/coverage.py` уже работают как агрегирующие read-models, но пока завязаны на глобальный store.

---

## 2. Где текущее предложение всё ещё слишком широкое

Документ `ARCHITECTURE.md` уже сужает ядро, но всё ещё оставляет в нём больше, чем нужно для первого устойчивого runtime.

### 2.1. `Relation` не обязательно держать в минимальном ядре

Сейчас `Relation` считается частью core. Я бы сделал жёстче:

- **Kernel 0**: `Assessment`, `Asset`, `ImportBatch`, `Candidate`, `Object`, `Audit`, `DomainError`
- **Graph module**: `Relation`

Причина простая: систему можно эксплуатировать как inbox + materialization в objects без общего relation graph.  
Глобальный граф полезен, но он быстро тянет за собой:

- доменную семантику предикатов;
- инварианты целостности между сущностями;
- read-models наподобие coverage/review-context;
- каскадные сценарии marks/checks/findings/evidence.

Если цель действительно "уменьшить ядро", `Relation` лучше подключать следующим слоем, а не считать обязательной частью boot path.

### 2.2. Dedupe не должен зависеть от `Relation`

Сейчас duplicate-сценарий материализуется ещё и relation-ребром `DUPLICATE_OF`. Это удобно, но не является обязательным для ядра.

Минимальная модель проще:

- у `Candidate` уже есть `duplicate_of_id`;
- для inbox и merge этого достаточно;
- relation `DUPLICATE_OF` можно строить позже в graph-модуле или вообще вычислять как projection.

Иначе мы незаметно тащим graph в ядро через технический сценарий dedupe.

### 2.3. `review_context` и `coverage` надо считать не модулями домена, а projections

Они не являются корневыми агрегатами и не должны влиять на форму ядра.

Их лучше явно описать как:

- **read-only projections**;
- зависящие от включённых модулей;
- допускающие частичную деградацию.

Например:

- `review_context` при включённом только kernel может отдавать `objects + candidates`;
- после `marks` добавляет `marks`;
- после `checks/cases/evidence` расширяет контекст, не меняя базовый контракт ядра.

### 2.4. `Case` и `Finding` нельзя тащить даже как "почти core"

Текущие документы уже выносят их из ядра, и это правильно. Я бы зафиксировал это жёстче:

- `Case` не контейнер системы, а контейнер аналитической работы;
- `Finding` не факт ядра, а результат интерпретации и отчётности;
- ядро должно жить без них полностью, включая API bootstrap, миграции и UI shell.

---

## 3. Моё целевое разбиение

### 3.1. Kernel 0

Это то, что обязано существовать в любом запуске.

#### Состав

- `Assessment`
- `Asset`
- `ImportBatch`
- `Candidate`
- `Object`
- `Audit`
- `DomainError`

#### Что умеет

- создать assessment;
- добавить asset;
- импортировать batch кандидатов;
- triage кандидатов: `accept`, `reject`, `merge`;
- materialize только `OBJECT`;
- отдавать audit trail;
- поднимать минимальный web shell и candidate inbox.

#### Что принципиально не умеет

- не создаёт `MARK`, `CHECK`, `CASE`, `FINDING`, `EVIDENCE`;
- не строит глобальный relation graph;
- не считает coverage;
- не агрегирует полный review context;
- не требует VS Code или MCP parity для всех будущих доменов.

### 3.2. Module 1: Graph

Первый модуль после ядра.

#### Состав

- `Relation`
- relation validation
- relation-specific accept handlers

#### Зачем выделять отдельно

- это реальный шаг расширения, а не скрытая часть ядра;
- можно запускать AAH2 вообще без graph;
- графовые инварианты и предикаты не блокируют запуск inbox/runtime.

### 3.3. Module 2: Marks

Первый прикладной модуль аналитика.

#### Состав

- `Mark`
- accept handler для `MARK`
- VS Code UX вокруг code-local разметки

Marks хорошо подходят первым модулем, потому что они ближе всего к объектам и не требуют тяжёлой workflow-семантики.

### 3.4. Module 3: Checks

- `Check`
- статусы проверки
- связи `Check -> Object/Mark/Relation`

### 3.5. Module 4: Cases

- `Case`
- группировка работы аналитика
- не влияет на ingest и базовую графовую модель

### 3.6. Module 5: Findings

- `Finding`
- конверсия из checks/manual flow
- отчётный уровень, не runtime-ядро

### 3.7. Module 6: Evidence

- `Evidence`
- attachment/link semantics
- relations к findings/checks/objects

### 3.8. Projections

Подключаются после появления базовых модулей:

- `review_context`
- `coverage`

Это не core и не отдельные агрегаты, а композиции поверх уже включённых capability.

---

## 4. Как это ложится на текущий код

### 4.1. Главная проблема не в схемах, а в точке композиции

Сейчас композиция зашита в двух местах:

- `app/main.py` всегда включает все route modules;
- `get_store()` выбирает один из двух god-object stores.

Значит, главный первый рефакторинг не "разнести папки", а ввести **bootstrap + capability registry**.

Минимально:

```python
app/
├── bootstrap/
│   ├── app_builder.py
│   ├── capabilities.py
│   └── module_registry.py
├── kernel/
├── modules/
└── infrastructure/
```

### 4.2. Нельзя начинать с полного распила `SqlStore`

Если сначала пытаться разложить весь `SqlStore` по репозиториям на все агрегаты, получится очередной большой-bang.

Надёжнее идти так:

1. Ввести `AppContext`.
2. Изолировать kernel-операции в первые сервисы и репозитории.
3. Перевести на них только `assessments`, `assets`, `imports`, `candidates`, `objects`.
4. Остальное оставить за legacy adapter.
5. Потом по одному вытаскивать модули из legacy.

То есть целевая промежуточная архитектура должна допускать coexistence:

- `kernel repositories`
- `legacy workflow adapter`

Без этого рефакторинг получится слишком дорогим.

### 4.3. Нужен слой `legacy module`, а не мгновенный "идеальный мир"

Практически полезная схема:

```text
Kernel services
  -> kernel repositories

Legacy modules
  -> legacy store adapter

Module registry
  -> decides what routers/handlers are visible
```

Так можно быстро получить запуск в режиме:

- `AAH2_MODULES=kernel`
- `AAH2_MODULES=kernel,graph`
- `AAH2_MODULES=kernel,graph,marks`

без немедленной переработки всего домена.

---

## 5. Предлагаемый runtime-контракт

### 5.1. Capabilities endpoint

Нужен явный runtime snapshot:

```json
GET /api/capabilities
{
  "modules": ["kernel", "graph", "marks"],
  "candidate_handlers": ["OBJECT", "RELATION", "MARK"],
  "projections": ["review_context"],
  "surfaces": {
    "web": true,
    "vscode": true,
    "mcp": false
  }
}
```

Это снимет жёсткую связанность между backend и клиентами:

- web сможет скрывать разделы;
- VS Code extension перестанет предполагать наличие всех workflow APIs;
- MCP сможет публиковать только доступные tools/resources.

### 5.2. Accept handlers только через registry

Ключевой инвариант:

- route не знает, как materialize candidate;
- kernel знает только про registry;
- каждый модуль регистрирует свои `CandidateType -> handler`.

Для старта:

- `OBJECT` в kernel;
- `RELATION` в graph;
- `MARK` в marks;
- `CHECK` в checks;
- `CASE` в cases.

### 5.3. Projection contracts с деградацией

`review_context` и `coverage` должны уметь отвечать "частично".

Например:

- `coverage` в kernel-only режиме возвращает только candidate/object counters;
- если модуль `checks` выключен, не считает check-метрики;
- если `findings` выключен, не возвращает finding-секцию или помечает её как unavailable.

Это лучше, чем текущая модель, где projection неявно ожидает весь домен.

---

## 6. Конкретный порядок внедрения

### Шаг 1. Зафиксировать реальную минимальную конфигурацию

Ввести runtime profile:

- `kernel`
- `graph`
- `marks`
- `checks`
- `cases`
- `findings`
- `evidence`
- `review_context`
- `coverage`

И научить `main.py` регистрировать routers по профилю.

### Шаг 2. Перевести только kernel routes на `AppContext`

Первыми:

- assessments
- assets
- imports
- candidates
- objects

Это даст рабочий "тонкий" запуск без переписывания остального.

### Шаг 3. Убрать `MARK` и `CHECK` из kernel accept path

Сейчас `accept_candidate()` в store создаёт и `Object`, и `Mark`, и `Check`.  
Это и есть главный источник расползания ядра.

После шага 3:

- kernel materialize только `OBJECT`;
- всё остальное возвращает `501 MODULE_REQUIRED`, если handler не зарегистрирован.

### Шаг 4. Вынести `Relation` из обязательного boot path

- оставить таблицу/схему можно;
- но router, service и accept handler должны включаться отдельно;
- dedupe больше не должен требовать relation-side effect.

### Шаг 5. Переводить модули по одному

Порядок:

1. `graph`
2. `marks`
3. `checks`
4. `cases`
5. `findings`
6. `evidence`
7. projections

Этот порядок лучше соответствует зависимостям, чем параллельный перенос всего домена.

---

## 7. Короткий вывод

Моё основное отличие от уже написанных документов:

- я бы сделал ядро **ещё меньше**;
- убрал бы `Relation` из обязательного runtime;
- считал бы `review_context` и `coverage` projections, а не полноценными модулями домена;
- строил бы миграцию не через "сразу новая идеальная структура", а через `kernel + legacy adapter + module registry`.

Если формулировать в одну строку:  
**AAH2 стоит свести сначала к inbox-driven object workbench, и только потом наращивать graph, marks, checks, cases и findings как независимые capability-слои.**
