# AAH2 — минимальное ядро и модули: подробная картина с кодом

Дата: 2026-06-03  
Дополнение к `ARCHITECTURE_REVIEW_MINIMAL_KERNEL.md`.

Цель этого документа: не просто назвать границы ядра, а показать, **как это может выглядеть в коде**, **как стартует приложение**, **как подключаются модули**, и **как мигрировать от текущего монолита без big-bang**.

---

## 1. Картина в целом

Я бы мысленно разделил систему на 5 уровней:

```text
1. Surfaces
   FastAPI / Web / VS Code / MCP

2. Application layer
   services, use-cases, handlers

3. Domain layer
   schemas, enums, domain errors, contracts

4. Ports
   repository interfaces, audit port, module contracts

5. Adapters
   SQL repositories, memory repositories, legacy store adapter, projection builders
```

Ключевая мысль:  
**роуты не должны знать, где лежат данные и как materialize кандидаты; они знают только `AppContext` и сервисы.**

---

## 2. Что я считаю ядром

### 2.1. Минимальный runtime

Это то, без чего приложение вообще не стартует:

- `Assessment`
- `Asset`
- `ImportBatch`
- `Candidate`
- `Object`
- `Audit`
- `DomainError`

### 2.2. Что это даёт пользователю

Даже такое маленькое ядро уже полезно:

1. создать assessment;
2. прикрепить asset;
3. загрузить import batch;
4. увидеть inbox кандидатов;
5. принять кандидата как `Object`;
6. вести дальнейшую аналитику уже через подключаемые capability.

То есть ядро уже является продуктом.  
Это важно: если ядро само по себе не жизнеспособно, значит оно не ядро, а недостроенный монолит.

---

## 3. Что я бы вынес из ядра

### 3.1. `Relation`

Я бы не делал relation частью обязательного boot path.

Почему:

- не каждый полезный сценарий требует граф;
- relation быстро тянет за собой правила предикатов;
- relation начинает определять shape для marks/checks/findings/evidence;
- dedupe можно прожить через `duplicate_of_id`, не через глобальное relation-ребро.

Итог:

- `Object` остаётся в kernel;
- `Relation` становится первым модулем `graph`.

### 3.2. `Mark`, `Check`, `Case`, `Finding`, `Evidence`

Это уже аналитические надстройки.

Их проблема не в том, что они плохие, а в том, что они делают ядро слишком "умным":

- `Mark` привносит доменную семантику `SOURCE/SINK/GUARD/...`;
- `Check` тянет workflow-состояния;
- `Case` тянет analyst process;
- `Finding` тянет severity/impact/reporting;
- `Evidence` тянет attachment/link semantics.

Все они должны жить как capability-слои, которые можно:

- включить;
- выключить;
- тестировать отдельно;
- переносить отдельно из legacy store.

### 3.3. `review_context` и `coverage`

Это не агрегаты и не ядро. Это projections.

То есть они:

- читают уже существующие сущности;
- собирают view model;
- не должны определять форму базового runtime.

---

## 4. Как бы я разложил каталоги

Вот реалистичная структура, в которую можно прийти постепенно:

```text
app/
├── bootstrap/
│   ├── app_builder.py
│   ├── capabilities.py
│   ├── context.py
│   └── module_registry.py
├── kernel/
│   ├── assessments/
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── repository.py
│   │   └── routes.py
│   ├── assets/
│   ├── imports/
│   ├── candidates/
│   ├── objects/
│   ├── audit/
│   └── errors.py
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
│   │   ├── sql/
│   │   └── memory/
│   ├── legacy/
│   │   └── legacy_store_adapter.py
│   └── audit/
└── api/
    └── capabilities.py
```

Важно: это не призыв "завтра всё переместить".  
Это целевая форма. Миграция должна идти кусками.

---

## 5. Главный объект композиции: `AppContext`

Сейчас приложение живёт вокруг `get_store()`.  
Я бы сделал центральной точкой `AppContext`.

Пример:

```python
# app/bootstrap/context.py
from dataclasses import dataclass, field


@dataclass
class AppContext:
    modules: set[str]
    repositories: dict[str, object] = field(default_factory=dict)
    services: dict[str, object] = field(default_factory=dict)
    handlers: dict[str, object] = field(default_factory=dict)
    projections: dict[str, object] = field(default_factory=dict)
```

Зачем это нужно:

- роуты получают не global store, а context;
- модули регистрируют себя в одном месте;
- появляется реальное понятие runtime capability;
- можно запускать разные профили системы.

---

## 6. Как стартует приложение

### 6.1. Конфигурация модулей

Например, через env:

```bash
AAH2_MODULES=kernel
AAH2_MODULES=kernel,graph
AAH2_MODULES=kernel,graph,marks
```

### 6.2. Сборка приложения

```python
# app/bootstrap/app_builder.py
from fastapi import FastAPI

from app.bootstrap.context import AppContext
from app.bootstrap.module_registry import register_module
from app.kernel.bootstrap import register_kernel
from app.api.capabilities import router as capabilities_router


def build_app(enabled_modules: set[str]) -> FastAPI:
    app = FastAPI(title="AAH2", version="0.4.0")
    ctx = AppContext(modules=enabled_modules)

    register_kernel(app, ctx)

    for module_name in sorted(enabled_modules - {"kernel"}):
        register_module(app, ctx, module_name)

    app.state.ctx = ctx
    app.include_router(capabilities_router)
    return app
```

`register_kernel()` всегда вызывается.  
Остальное подключается отдельно.

### 6.3. Реестр модулей

```python
# app/bootstrap/module_registry.py
from app.modules.graph.bootstrap import register_graph
from app.modules.marks.bootstrap import register_marks
from app.modules.checks.bootstrap import register_checks
from app.modules.cases.bootstrap import register_cases
from app.modules.findings.bootstrap import register_findings
from app.modules.evidence.bootstrap import register_evidence
from app.modules.projections.review_context.bootstrap import register_review_context
from app.modules.projections.coverage.bootstrap import register_coverage


MODULES = {
    "graph": register_graph,
    "marks": register_marks,
    "checks": register_checks,
    "cases": register_cases,
    "findings": register_findings,
    "evidence": register_evidence,
    "review_context": register_review_context,
    "coverage": register_coverage,
}


def register_module(app, ctx, module_name: str) -> None:
    try:
        fn = MODULES[module_name]
    except KeyError as exc:
        raise RuntimeError(f"Unknown module: {module_name}") from exc
    fn(app, ctx)
```

Это простая, но очень полезная точка контроля.  
Она убирает безусловное `include_router(...)` из `app/main.py`.

---

## 7. Как должен выглядеть kernel

### 7.1. Пример repository contract

```python
# app/kernel/candidates/repository.py
from typing import Protocol
from uuid import UUID

from app.kernel.candidates.schemas import CandidateRead, CandidateWrite


class CandidateRepository(Protocol):
    def get(self, candidate_id: UUID) -> CandidateRead | None: ...
    def list_by_assessment(self, assessment_id: UUID) -> list[CandidateRead]: ...
    def create_many(self, assessment_id: UUID, payload: CandidateWrite) -> list[CandidateRead]: ...
    def mark_accepted(self, candidate_id: UUID) -> None: ...
    def mark_rejected(self, candidate_id: UUID) -> None: ...
    def mark_duplicate(self, candidate_id: UUID, duplicate_of_id: UUID) -> None: ...
```

Контракт маленький.  
Он не знает ничего про checks, marks, findings и остальное.

### 7.2. Пример сервиса `CandidateService`

```python
# app/kernel/candidates/service.py
from uuid import UUID

from app.kernel.errors import DomainError


class CandidateService:
    def __init__(self, repo, accept_registry, audit):
        self._repo = repo
        self._accept_registry = accept_registry
        self._audit = audit

    def accept(self, candidate_id: UUID, override_payload: dict | None = None) -> dict:
        candidate = self._repo.get(candidate_id)
        if candidate is None:
            raise DomainError("CANDIDATE_NOT_FOUND", "Candidate not found", status_code=404)

        handler = self._accept_registry.get(candidate.candidate_type)
        if handler is None:
            raise DomainError(
                "MODULE_REQUIRED",
                f"No handler registered for {candidate.candidate_type}",
                status_code=501,
            )

        created = handler.accept(candidate, override_payload=override_payload)
        self._repo.mark_accepted(candidate.id)
        self._audit.record("candidate.accepted", {
            "candidate_id": str(candidate.id),
            "candidate_type": candidate.candidate_type,
        })
        return created
```

Критично: сервис не содержит `if candidate_type == ...` на весь домен.  
Это и есть граница между ядром и модулями.

---

## 8. Как работает `AcceptRegistry`

Это центральная идея всей модульности.

```python
# app/kernel/candidates/accept_registry.py
class AcceptRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, object] = {}

    def register(self, candidate_type: str, handler: object) -> None:
        self._handlers[candidate_type] = handler

    def get(self, candidate_type: str):
        return self._handlers.get(candidate_type)
```

### 8.1. Handler ядра

```python
# app/kernel/candidates/handlers/object_handler.py
class ObjectCandidateHandler:
    candidate_type = "OBJECT"

    def __init__(self, object_service):
        self._object_service = object_service

    def accept(self, candidate, override_payload=None) -> dict:
        payload = override_payload or candidate.proposed_payload or {}
        obj = self._object_service.create(
            assessment_id=candidate.assessment_id,
            payload={
                "asset_id": payload.get("asset_id"),
                "type": payload.get("type", "UNKNOWN"),
                "kind": payload.get("kind", "UNKNOWN"),
                "name": payload.get("name", "Unnamed object"),
                "locator": payload.get("locator"),
                "range": payload.get("range"),
                "properties": payload.get("properties", {}),
                "source": candidate.source,
            },
        )
        return {"object_ids": [obj.id]}
```

Ядро знает только один гарантированный handler: `OBJECT`.

### 8.2. Handler модуля `graph`

```python
# app/modules/graph/handlers/relation_handler.py
class RelationCandidateHandler:
    candidate_type = "RELATION"

    def __init__(self, relation_service):
        self._relation_service = relation_service

    def accept(self, candidate, override_payload=None) -> dict:
        payload = override_payload or candidate.proposed_payload or {}
        rel = self._relation_service.create(
            assessment_id=candidate.assessment_id,
            payload=payload,
        )
        return {"relation_ids": [rel.id]}
```

### 8.3. Handler модуля `marks`

```python
# app/modules/marks/handlers/mark_handler.py
class MarkCandidateHandler:
    candidate_type = "MARK"

    def __init__(self, mark_service):
        self._mark_service = mark_service

    def accept(self, candidate, override_payload=None) -> dict:
        payload = override_payload or candidate.proposed_payload or {}
        created = self._mark_service.create_from_candidate(candidate, payload)
        return {
            "object_ids": [created.object_id] if created.object_id else [],
            "mark_ids": [created.mark_id],
        }
```

Этот паттерн заменяет нынешний `accept_candidate()` из store, который знает сразу про `OBJECT`, `MARK`, `CHECK` и дальше будет только разрастаться.

---

## 9. Как должны выглядеть модули

Каждый модуль должен иметь один и тот же shape.

### 9.1. Пример модуля `marks`

```text
app/modules/marks/
├── bootstrap.py
├── schemas.py
├── service.py
├── repository.py
├── routes.py
└── handlers/
    └── mark_handler.py
```

### 9.2. `bootstrap.py`

```python
# app/modules/marks/bootstrap.py
from app.modules.marks.routes import router
from app.modules.marks.service import MarkService
from app.modules.marks.handlers.mark_handler import MarkCandidateHandler


def register_marks(app, ctx) -> None:
    mark_repo = ctx.repositories["mark_repo"]
    object_repo = ctx.repositories["object_repo"]
    audit = ctx.services["audit"]

    mark_service = MarkService(mark_repo=mark_repo, object_repo=object_repo, audit=audit)
    ctx.services["mark_service"] = mark_service

    ctx.handlers["accept_registry"].register("MARK", MarkCandidateHandler(mark_service))
    app.include_router(router)
```

Это даёт предсказуемый lifecycle:

1. подключили репозиторий;
2. создали service;
3. зарегистрировали handler;
4. включили routes.

---

## 10. Как я вижу legacy-совместимость

Это самая практическая часть.  
Именно она позволяет не переписывать всё сразу.

### 10.1. Почему без legacy adapter не взлетит

Сейчас в коде уже много поведения сидит в:

- `app/services/store.py`
- `app/repositories/sql_store.py`
- route-модулях, которые ждут store-подобный интерфейс

Если сразу попытаться убрать их полностью, задача станет слишком большой.

### 10.2. Что такое legacy adapter

```python
# app/infrastructure/legacy/legacy_store_adapter.py
class LegacyStoreAdapter:
    def __init__(self, store):
        self._store = store

    def create_check(self, assessment_id, payload):
        return self._store.create_check(assessment_id, payload)

    def update_check_status(self, check_id, payload):
        return self._store.update_check_status(check_id, payload)

    def create_case(self, assessment_id, payload):
        return self._store.create_case(assessment_id, payload)
```

Задача этого слоя не в красоте, а в миграции.

Пока kernel уже живёт через новые сервисы, legacy-модули ещё могут временно жить через адаптер.

### 10.3. Промежуточное состояние

На одном этапе архитектура может быть такой:

```text
kernel routes
  -> kernel services
  -> kernel repositories

legacy module routes
  -> legacy adapter
  -> old sql_store / in-memory store
```

Это нормально.  
Главное, чтобы новое ядро уже не зависело от старого workflow-хвоста.

---

## 11. Как я вижу projections

### 11.1. `review_context`

Его надо делать как builder поверх capability.

```python
# app/modules/projections/review_context/service.py
class ReviewContextService:
    def __init__(self, ctx):
        self._ctx = ctx

    def build(self, assessment_id, payload) -> dict:
        result = {
            "objects": [],
            "candidates": [],
            "marks": [],
            "checks": [],
            "cases": [],
            "evidence": [],
            "available_sections": [],
        }

        object_service = self._ctx.services["object_service"]
        candidate_service = self._ctx.services["candidate_query_service"]
        result["objects"] = object_service.find_for_context(assessment_id, payload)
        result["candidates"] = candidate_service.find_for_context(assessment_id, payload)
        result["available_sections"].extend(["objects", "candidates"])

        if "marks" in self._ctx.modules:
            result["marks"] = self._ctx.services["mark_service"].find_for_context(assessment_id, payload)
            result["available_sections"].append("marks")

        if "checks" in self._ctx.modules:
            result["checks"] = self._ctx.services["check_service"].find_for_context(assessment_id, payload)
            result["available_sections"].append("checks")

        return result
```

То есть projection не ломается, если часть модулей выключена.

### 11.2. `coverage`

Та же идея:

```python
# app/modules/projections/coverage/service.py
class CoverageService:
    def __init__(self, ctx):
        self._ctx = ctx

    def summary(self, assessment_id):
        result = {
            "available_sections": ["candidates", "objects"],
            "candidates": self._candidate_summary(assessment_id),
            "objects": self._object_summary(assessment_id),
        }

        if "marks" in self._ctx.modules:
            result["marks"] = self._mark_summary(assessment_id)
            result["available_sections"].append("marks")

        if "checks" in self._ctx.modules:
            result["checks"] = self._check_summary(assessment_id)
            result["available_sections"].append("checks")

        return result
```

Это лучше текущего подхода, где projection неявно считает, что весь домен уже существует.

---

## 12. Как это меняет HTTP-слой

### 12.1. Сейчас

Сейчас route часто выглядит так:

```python
@router.post("/api/candidates/{candidate_id}/accept")
def accept_candidate(candidate_id: UUID, payload: CandidateAcceptRequest):
    created = get_store().accept_candidate(candidate_id, payload)
    return {"created": created}
```

То есть route напрямую зависит от реализации store.

### 12.2. Целевой вариант

```python
from fastapi import APIRouter, Depends, Request


router = APIRouter(tags=["candidates"])


def get_ctx(request: Request):
    return request.app.state.ctx


@router.post("/api/candidates/{candidate_id}/accept")
def accept_candidate(candidate_id, payload, ctx=Depends(get_ctx)):
    service = ctx.services["candidate_service"]
    created = service.accept(candidate_id, payload.override_payload)
    return {"candidate_id": str(candidate_id), "created": created}
```

Теперь:

- route тонкий;
- service управляет поведением;
- модули подключаются через registry;
- backend перестаёт быть завязан на один глобальный store interface.

---

## 13. Как бы я мигрировал текущий AAH2

Ниже порядок, который выглядит реалистично именно для этого репозитория.

### Этап 1. Ввести bootstrap и capabilities

Без переноса домена:

- новый `build_app()`;
- `AppContext`;
- `AAH2_MODULES`;
- `/api/capabilities`.

На этом этапе поведение почти не меняется, но появляется точка управления.

### Этап 2. Перевести kernel routes

Первыми:

- assessments
- assets
- imports
- candidates
- objects

Их надо вытащить из прямой зависимости на full store.

### Этап 3. Ограничить ядро по accept path

Самое важное изменение:

- `OBJECT` остаётся в kernel;
- `MARK`, `CHECK`, `CASE`, `RELATION` убираются из kernel accept path;
- без модуля возвращается `MODULE_REQUIRED`.

Именно это реально делает ядро маленьким.

### Этап 4. Перевести `Relation` в модуль `graph`

Здесь же:

- relation routes;
- relation service;
- validation rules;
- relation candidate handler.

### Этап 5. Переносить модули по одному

Порядок:

1. `graph`
2. `marks`
3. `checks`
4. `cases`
5. `findings`
6. `evidence`

### Этап 6. Собрать projections поверх capability

Последними:

- `review_context`
- `coverage`

Это позволит им корректно работать в частично включённой системе.

---

## 14. Что получится в итоге

### Профиль 1. Самое маленькое ядро

```bash
AAH2_MODULES=kernel
```

Умеет:

- assessment/assets;
- imports/candidates;
- object materialization;
- audit;
- базовый web shell.

### Профиль 2. Ядро + граф

```bash
AAH2_MODULES=kernel,graph
```

Добавляет:

- relation CRUD;
- relation candidate accept;
- базовые graph views.

### Профиль 3. Ядро + граф + marks

```bash
AAH2_MODULES=kernel,graph,marks
```

Добавляет:

- code-local analyst workflow;
- первые полезные VS Code сценарии;
- основу для review-context.

### Профиль 4. Полный analyst runtime

```bash
AAH2_MODULES=kernel,graph,marks,checks,cases,findings,evidence,review_context,coverage
```

Это уже полный продуктовый профиль, но он собирается из независимых слоёв.

---

## 15. Моя главная мысль в одной фразе

Если коротко, я вижу AAH2 так:

**ядро должно быть маленьким "ingest + candidate inbox + object materialization" runtime, а всё, что похоже на аналитическую интерпретацию, графовую семантику, workflow и отчётность, должно подключаться как отдельные capability-модули через registry и общий `AppContext`.**
