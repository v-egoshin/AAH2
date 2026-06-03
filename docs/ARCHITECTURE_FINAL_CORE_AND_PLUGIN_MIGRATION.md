# AAH2 — согласованная структура core и миграция к подключаемым модулям

Дата: 2026-06-03  
Это итоговая версия после уточнений по `Assessment`, `core` и роли модулей.

---

## 1. Финальная позиция

Я бы зафиксировал архитектуру так:

### Core AAH2

Это минимальная полезная доменная платформа, без которой продукт теряет смысл.

В core входят:

- `Assessment`
- `Asset`
- `Object`
- `Audit`
- `DomainError`

### Ingest / Inbox layer

Это слой загрузки и triage, но не само ядро:

- `ImportBatch`
- `Candidate`

### Capability modules

Это подключаемые функциональные вертикали:

- `Relation` (`graph`)
- `Mark` (`marks`)
- `Check` (`checks`)
- `Case` (`cases`)
- `Finding` (`findings`)
- `Evidence` (`evidence`)

### Projections

Это read-model слои поверх уже включённых capability:

- `review_context`
- `coverage`

---

## 2. Почему именно так

### Почему `Assessment` в core

`Assessment` — это root context системы.

Он нужен как:

- точка сборки всего анализа;
- граница изоляции данных;
- основной корень для `assets`, `objects` и модулей;
- минимальный контейнер, в котором система имеет смысл.

Без него всё остальное начинает жить либо в воздухе, либо через неявные scope-id.

### Почему `ImportBatch` и `Candidate` не в core

Потому что они описывают не сущность анализа, а путь попадания данных в систему.

Это:

- ingest pipeline;
- triage workflow;
- промежуточные формы до materialization.

Они важны, но они надстраиваются над ядром, а не определяют его.

### Почему `Relation` не в core

`Relation` уже начинает задавать богатую семантику графа.

Это хороший первый модуль, но не обязательная часть минимального доменного ядра.

---

## 3. Как должна выглядеть структура слоёв

Лучше всего думать о системе как о 4 слоях:

```text
Layer 1. Core
  Assessment
  Asset
  Object
  Audit
  DomainError

Layer 2. Ingest / Inbox
  ImportBatch
  Candidate

Layer 3. Capability modules
  graph
  marks
  checks
  cases
  findings
  evidence

Layer 4. Projections
  review_context
  coverage
```

Смысл:

- core отвечает за базовую модель;
- ingest/inbox поставляет материал в core;
- capability modules расширяют домен;
- projections собирают read-only представления.

---

## 4. Структура каталогов

Я бы целился в такую форму:

```text
app/
├── bootstrap/
│   ├── app_builder.py
│   ├── context.py
│   ├── module_registry.py
│   └── settings.py
├── core/
│   ├── assessments/
│   │   ├── schemas.py
│   │   ├── repository.py
│   │   ├── service.py
│   │   └── routes.py
│   ├── assets/
│   ├── objects/
│   ├── audit/
│   └── errors.py
├── ingest/
│   ├── imports/
│   ├── candidates/
│   ├── accept_registry.py
│   └── routes.py
├── modules/
│   ├── graph/
│   ├── marks/
│   ├── checks/
│   ├── cases/
│   ├── findings/
│   ├── evidence/
│   └── projections/
│       ├── review_context/
│       └── coverage/
├── infrastructure/
│   ├── db/
│   ├── repositories/
│   │   ├── memory/
│   │   └── sql/
│   ├── audit/
│   └── legacy/
└── api/
    └── capabilities.py
```

---

## 5. Что лежит в каждом слое

## 5.1. Core

### `Assessment`

Поля:

- `id`
- `title`
- `description`
- `status`
- `metadata`

Действия:

- `create_assessment`
- `get_assessment`
- `list_assessments`
- `update_assessment`

### `Asset`

Поля:

- `id`
- `assessment_id`
- `type`
- `name`
- `locator`
- `version_ref`
- `metadata`

Действия:

- `create_asset`
- `get_asset`
- `list_assets`
- `update_asset`

### `Object`

Поля:

- `id`
- `assessment_id`
- `asset_id`
- `type`
- `kind`
- `name`
- `locator`
- `range`
- `properties`

Действия:

- `create_object`
- `get_object`
- `list_objects`
- `update_object`
- `find_objects_by_locator`

### `Audit`

Поля:

- `id`
- `event_type`
- `entity_type`
- `entity_id`
- `actor_type`
- `actor_id`
- `payload`
- `created_at`

Действия:

- `record_event`
- `list_events`

### `DomainError`

Поля:

- `code`
- `message`
- `status_code`
- `details`

Действия:

- `raise DomainError(...)`
- `domain_error_handler(...)`
- `map_exception(...)`

---

## 5.2. Ingest / Inbox

### `ImportBatch`

Поля:

- `id`
- `assessment_id`
- `asset_id`
- `source_type`
- `source_name`
- `tool_name`
- `tool_version`
- `status`
- `summary`

Действия:

- `create_import_batch`
- `get_import_batch`
- `list_import_batches`

### `Candidate`

Поля:

- `id`
- `assessment_id`
- `import_batch_id`
- `candidate_type`
- `proposed_payload`
- `status`
- `confidence`
- `dedupe_key`
- `duplicate_of_id`
- `validation_errors`
- `source`

Действия:

- `create_candidates`
- `get_candidate`
- `list_candidates`
- `accept_candidate`
- `reject_candidate`
- `merge_candidate`

---

## 5.3. Capability modules

Каждый модуль должен иметь одинаковую форму:

```text
modules/<module_name>/
├── bootstrap.py
├── schemas.py
├── repository.py
├── service.py
├── routes.py
└── handlers/
```

### Пример: `graph`

```text
modules/graph/
├── bootstrap.py
├── schemas.py
├── repository.py
├── service.py
├── routes.py
└── handlers/
    └── relation_handler.py
```

### Пример: `marks`

```text
modules/marks/
├── bootstrap.py
├── schemas.py
├── repository.py
├── service.py
├── routes.py
└── handlers/
    └── mark_handler.py
```

### Что делает `bootstrap.py`

У каждого модуля bootstrap одинаковый:

1. регистрирует repositories;
2. создаёт services;
3. регистрирует candidate handlers, если надо;
4. подключает routes;
5. объявляет capability для `/api/capabilities`.

---

## 6. Как стартует приложение

### 6.1. Конфиг

```bash
AAH2_MODULES=graph,marks
STORE_BACKEND=sql
```

Важно: `core` всегда активен.  
В env перечисляются только подключаемые модули.

### 6.2. Bootstrap

```python
def build_app(settings) -> FastAPI:
    app = FastAPI(...)
    ctx = AppContext(settings=settings)

    register_core(app, ctx)
    register_ingest(app, ctx)

    for module_name in settings.enabled_modules:
        register_module(app, ctx, module_name)

    app.state.ctx = ctx
    return app
```

### 6.3. Почему ingest лучше регистрировать отдельно от core

Потому что это позволяет мыслить так:

- core = базовая доменная платформа;
- ingest = поставщик материала в платформу;
- modules = расширения платформы.

Это чище, чем прятать ingest внутрь core.

---

## 7. Как будут работать подключаемые плагины

Под "плагинами" в AAH2 я бы понимал не внешние бинарные расширения, а **встроенные модульные capability packages**, которые:

- живут в том же репозитории;
- имеют единый bootstrap-контракт;
- включаются конфигом;
- могут иметь свои таблицы, роуты, handlers и projections.

То есть это application plugins, а не dynamic shared libraries.

### Плагин умеет 5 вещей

1. добавить свой домен;
2. зарегистрировать свои services;
3. добавить routes;
4. добавить candidate accept handlers;
5. добавить свои миграции и projections.

---

## 8. Как будет выглядеть контракт плагина

```python
# modules/marks/bootstrap.py
def register_marks(app, ctx) -> None:
    repo = build_mark_repository(ctx)
    service = MarkService(repo=repo, audit=ctx.audit)

    ctx.repositories["mark_repo"] = repo
    ctx.services["mark_service"] = service
    ctx.capabilities.add("marks")

    ctx.accept_registry.register("MARK", MarkCandidateHandler(service))
    app.include_router(router)
```

Минимальная идея:

- плагин сам себя подключает;
- core не знает деталей плагина;
- ingest знает только registry;
- routes знают только service.

---

## 9. Как будет работать миграция к подключаемым модулям

Здесь есть 3 разные миграции, и их важно не путать.

### 9.1. Миграция кода

Это переход от текущего монолита к новой структуре.

### 9.2. Миграция схемы БД

Это Alembic-эволюция таблиц и индексов.

### 9.3. Миграция runtime поведения

Это переключение маршрутов и workflows на новые services/modules.

Нужно вести все 3 параллельно, но отдельно.

---

## 10. Миграция кода: пошагово

### Шаг 1. Ввести `AppContext` и `build_app()`

Не меняя бизнес-логики:

- новый bootstrap;
- новый module registry;
- новый capabilities endpoint.

На этом этапе `main.py` просто перестаёт быть местом ручного `include_router(...)`.

### Шаг 2. Выделить core routes

Первыми переводим:

- `assessments`
- `assets`
- `objects`
- `audit`

Их надо оторвать от `get_store()`.

### Шаг 3. Выделить ingest layer

Отдельно переводим:

- `imports`
- `candidates`
- `accept_registry`

Здесь важно убрать доменный switch-case из store.

### Шаг 4. Создать `legacy adapter`

Пока новые модули не готовы, старый код может жить через адаптер:

```text
new routes/services -> new repositories
old module routes   -> legacy store adapter
```

Это позволяет не переписывать всё сразу.

### Шаг 5. Вынести `graph`

Первым модулем:

- `Relation`
- relation routes
- relation repo/service
- relation handler

### Шаг 6. По одному переносить analyst modules

Порядок:

1. `graph`
2. `marks`
3. `checks`
4. `cases`
5. `findings`
6. `evidence`

### Шаг 7. Вынести projections в конце

Последними:

- `review_context`
- `coverage`

Их нельзя проектировать правильно, пока не стабилизированы core + modules.

---

## 11. Миграция БД для модулей

У каждого модуля должны быть собственные миграции, но в общей Alembic-цепочке.

Принцип такой:

- core-таблицы создаются в baseline;
- ingest-таблицы идут отдельным набором ревизий;
- каждый модуль добавляет только свои таблицы/индексы/constraints;
- выключение модуля не удаляет таблицы автоматически.

Почему так:

- rollback модулей проще делать на уровне runtime flag, а не drop table;
- данные модулей могут временно не использоваться, но не должны теряться;
- production migration не должна зависеть от того, включён ли модуль в конкретном поде.

### Практическое правило

- migrations всегда "вперёд";
- runtime activation отдельно;
- data backfill отдельно.

То есть:

1. накатываем миграцию;
2. выкатываем код модуля;
3. включаем модуль флагом;
4. при необходимости запускаем backfill job.

---

## 12. Миграция runtime поведения

Самый важный принцип:

**наличие таблиц не означает включённость модуля.**

Это значит:

- модуль может быть задеплоен, но выключен;
- роуты модуля могут не регистрироваться;
- candidate handler модуля может быть неактивен;
- projection учитывает только активные capability.

Например:

```bash
AAH2_MODULES=graph,marks
```

Тогда:

- `Relation` и `Mark` доступны;
- `Check`, `Case`, `Finding`, `Evidence` недоступны;
- `accept_candidate(type=CHECK)` вернёт `MODULE_REQUIRED`;
- `coverage` не пытается считать check/finding метрики.

---

## 13. Что происходит при включении нового модуля

Допустим, подключаем `checks`.

### До включения

- таблицы уже могут существовать;
- код уже задеплоен;
- handler `CHECK` не зарегистрирован;
- routes `/checks/*` не видны;
- UI не показывает раздел.

### После включения флага

- `register_checks(...)` вызывается в bootstrap;
- добавляются routes;
- `CHECK`-handler попадает в accept registry;
- `/api/capabilities` отражает новый модуль;
- UI/VS Code/MCP могут открыть новую функциональность.

Это хороший, управляемый rollout.

---

## 14. Что делать со старыми данными

Если модуль включается позже, возможны два случая.

### Случай 1. Модуль не требует backfill

Пример: `marks`.

Новые marks просто начинают создаваться после включения модуля.  
Старые `Object` остаются валидны без изменений.

### Случай 2. Модуль требует backfill/projection build

Пример: `coverage` или `review_context`.

Тогда нужен отдельный rebuild-процесс:

- read existing objects/relations/marks/checks;
- пересчитать projection data;
- записать read model или кеш;
- после этого включить UI-видимость.

Это должно быть отдельной операцией, не частью обычной web request обработки.

---

## 15. Как это работает для клиента

### Web

Web читает `/api/capabilities` и строит меню по нему.

### VS Code

Extension тоже читает capabilities и скрывает команды, которых нет.

### MCP

MCP публикует только те resources/tools, для которых модуль реально включён.

Это критично: иначе фронты и агенты будут ожидать API, которого нет в текущем runtime.

---

## 16. Самая практичная схема миграции для текущего репозитория

Если приземлить на текущий AAH2, я бы делал так:

### Фаза A. Bootstrap

- вынести сборку приложения из `app/main.py`;
- ввести `AppContext`;
- ввести `module_registry`;
- добавить `/api/capabilities`.

### Фаза B. Core

- перевести `assessments`, `assets`, `objects`, `audit`;
- оторвать их от god-store интерфейса.

### Фаза C. Ingest

- вынести `imports` и `candidates` в `app/ingest/`;
- ввести `accept_registry`;
- убрать `MARK/CHECK/...` логику из `accept_candidate()` store.

### Фаза D. First plugin

- вынести `relations` в `modules/graph`.

### Фаза E. Analyst plugins

- вынести `marks`;
- затем `checks`;
- затем `cases/findings`;
- затем `evidence`.

### Фаза F. Projections

- переписать `review_context`;
- переписать `coverage`.

---

## 17. Итог

Итоговая архитектура, которую я считаю наиболее согласованной для AAH2:

- `Assessment`, `Asset`, `Object`, `Audit`, `DomainError` — это core;
- `ImportBatch`, `Candidate` — это ingest/inbox слой над core;
- `Relation`, `Mark`, `Check`, `Case`, `Finding`, `Evidence` — подключаемые capability-модули;
- `review_context`, `coverage` — projections поверх активных модулей;
- миграция идёт через `AppContext + module registry + legacy adapter`, а не через одномоментный распил всего `SqlStore`.

Если в одну строку:

**AAH2 должен стать системой с жёстким core-контекстом `Assessment -> Asset -> Object`, поверх которого отдельно живут ingest workflow, capability-плагины и projections.**
