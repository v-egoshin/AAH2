# AAH2 — более строгая версия ядра

Дата: 2026-06-03  
Это уточнение к предыдущим заметкам. После дополнительного обсуждения я бы ещё сильнее сузил ядро.

---

## 1. Что я теперь не включал бы в ядро

Я согласен, что следующие сущности не стоит относить к kernel:

- `Assessment`
- `ImportBatch`
- `Candidate`

Причина одна и та же: это не "физика" системы, а контур orchestration/workflow.

### Почему не `Assessment`

`Assessment` задаёт рамку процесса и сессии работы, но не является минимальным техническим примитивом.  
Если смотреть на самое маленькое ядро, оно должно уметь хранить и связывать артефакты анализа, а не моделировать сам процесс их ведения.

То есть `Assessment` лучше считать:

- контейнером уровня приложения;
- организационной оболочкой;
- outer workflow layer, а не inner kernel.

### Почему не `ImportBatch`

`ImportBatch` нужен для ingestion-пайплайна, трассировки источников и пакетной загрузки.  
Это важный модуль, но не минимальная сущность ядра.

Он описывает:

- откуда данные пришли;
- как они сгруппированы;
- как их повторно прогонять и дебажить.

Это полезно, но уже выше базового слоя.

### Почему не `Candidate`

`Candidate` вообще является чисто workflow-понятием:

- "предлагаемый факт";
- объект triage;
- промежуточная форма до materialization.

Если смотреть строго, ядро не обязано знать о triage.  
Оно должно уметь хранить уже принятые сущности и давать минимальные операции над ними.

Итог:

- `Candidate` лучше размещать в ingest/inbox модуле;
- `ImportBatch` рядом с ним;
- `Assessment` либо во внешнем app-layer, либо в orchestration-модуле.

---

## 2. Что тогда остаётся в строгом ядре

Если резать максимально жёстко, я бы оставил в kernel только:

- `Asset`
- `Object`
- `Audit`
- `DomainError`

Это уже действительно минимальный внутренний слой.

Его смысл:

- есть нечто, что мы анализируем: `Asset`;
- есть нечто, что мы нашли внутри/около него: `Object`;
- есть единый способ фиксировать действия и следы: `Audit`;
- есть единый способ выражать доменные сбои: `DomainError`.

---

## 3. `Asset`

## 3.1. Что это такое

`Asset` — это цель анализа.  
Не workflow-объект, а "носитель" контекста: репозиторий, сервис, URL, бинарь, пакет, контейнерный образ и т.п.

Если говорить грубо:

- `Asset` отвечает на вопрос: **что именно мы исследуем**.

## 3.2. Какие поля я бы оставил

Минимально:

```python
class Asset(BaseModel):
    id: UUID
    type: AssetType
    name: str
    locator: str | None = None
    version_ref: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
```

### Смысл полей

- `id`
  Внутренний стабильный идентификатор.

- `type`
  Тип актива: `repo`, `service`, `url`, `binary`, `package`, `image`.

- `name`
  Человекочитаемое имя.

- `locator`
  Где актив находится: git URL, filesystem path, service hostname, package coordinate.

- `version_ref`
  Какая именно версия анализировалась: branch, tag, commit SHA, version string.

- `metadata`
  Неструктурированный хвост, который не должен раздувать базовую схему.

## 3.3. Какие действия ядра ему нужны

Минимум:

- `create_asset`
- `get_asset`
- `list_assets`
- `update_asset`

Опционально:

- `archive_asset`

Я бы не давал ему в ядре сложное поведение.  
`Asset` должен быть максимально тупой reference-entity.

## 3.4. Почему он должен быть в ядре

Потому что почти всё в системе так или иначе должно к чему-то крепиться.

Без `Asset`:

- `Object` повисает в воздухе;
- непонятно, к какому коду/сервису/артефакту относится находка;
- появляется соблазн тащить source locator в каждую сущность отдельно.

То есть `Asset` нужен не как workflow, а как минимальная точка привязки.

---

## 4. `Object`

## 4.1. Что это такое

`Object` — это найденный или созданный аналитический узел.  
Самый базовый атом модели.

Он отвечает на вопрос:

- **что именно внутри актива мы хотим зафиксировать**.

Это может быть:

- файл;
- функция;
- endpoint;
- callsite;
- variable;
- SQL query fragment;
- route handler;
- внешний sink/source;
- любой другой локализуемый объект.

## 4.2. Какие поля я бы оставил

Минимально:

```python
class Object(BaseModel):
    id: UUID
    asset_id: UUID | None = None
    type: str
    kind: str
    name: str
    locator: str | None = None
    range: dict[str, Any] | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
```

### Смысл полей

- `id`
  Стабильный идентификатор объекта.

- `asset_id`
  Ссылка на `Asset`, если объект найден внутри конкретной цели.

- `type`
  Класс объекта: `FILE`, `FUNCTION`, `ENDPOINT`, `CALLSITE`, `QUERY`, `PARAMETER`.

- `kind`
  Более узкая прикладная категоризация внутри `type`.

- `name`
  Имя объекта для UI/API.

- `locator`
  Строковый локатор: путь, URL, symbol path, endpoint signature.

- `range`
  Координаты, если объект привязан к коду: файл, линии, колонки.

- `properties`
  Расширяемый JSON-хвост под специфические модули.

## 4.3. Какие действия ядра ему нужны

Минимум:

- `create_object`
- `get_object`
- `list_objects`
- `update_object`
- `find_objects_by_locator`

Опционально:

- `merge_objects`
- `archive_object`

Я бы не вкладывал в `Object` семантику `source/sink/check/finding`.  
Это всё уже сверху.

## 4.4. Почему он должен быть в ядре

Потому что `Object` — это главный атом всех будущих модулей.

На него потом можно навешивать:

- marks;
- relations;
- checks;
- evidence links;
- findings projections.

Если `Object` не находится в ядре, тогда каждый модуль начинает заводить свои собственные "точки в коде", "узлы графа", "локаторы", "элементы", и модель быстро расползается.

Именно поэтому `Object` я считаю самой важной сущностью ядра.

---

## 5. `Audit`

## 5.1. Что это такое

`Audit` — это не бизнес-сущность, а системный след.

Он отвечает на вопрос:

- **кто, что и когда сделал в системе**.

Причём это важно и для человека, и для автоматизации, и для отладки.

## 5.2. Какие поля я бы оставил

Минимально:

```python
class AuditEvent(BaseModel):
    id: UUID
    event_type: str
    entity_type: str | None = None
    entity_id: str | None = None
    actor_type: str | None = None
    actor_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
```

### Смысл полей

- `id`
  Идентификатор события.

- `event_type`
  Тип действия: `asset.created`, `object.updated`, `mark.created`, `check.failed`.

- `entity_type`
  Над чем совершено действие.

- `entity_id`
  Идентификатор сущности.

- `actor_type`
  Кто совершил действие: `user`, `agent`, `system`.

- `actor_id`
  Идентификатор актора.

- `payload`
  Детали события.

- `created_at`
  Время события.

## 5.3. Какие действия ядра ему нужны

Минимум:

- `record_event`
- `list_events`
- `filter_events`

Я бы не делал здесь сложную аналитику в ядре.  
Сначала нужен просто надёжный append-only след.

## 5.4. Почему он должен быть в ядре

Потому что без аудита система быстро становится непрозрачной.

Особенно для AAH2, где будут:

- люди;
- агенты;
- полуавтоматические потоки;
- постепенное подключение модулей.

Без `Audit` непонятно:

- откуда появился `Object`;
- кто создал mark/check;
- какой модуль/materializer это сделал;
- как отлаживать автоматические переходы.

`Audit` — это часть инфраструктурного ядра, а не опциональный сервис.

---

## 6. `DomainError`

## 6.1. Что это такое

`DomainError` — это единый язык ошибок внутри системы.

Он нужен, чтобы ошибки были:

- одинаково устроены;
- предсказуемы для API;
- пригодны для логирования и автоматизации;
- отделены от низкоуровневых исключений Python/SQL.

## 6.2. Какие поля я бы оставил

Минимально:

```python
class DomainError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
```

### Смысл полей

- `code`
  Машиночитаемый код: `OBJECT_NOT_FOUND`, `INVALID_LOCATOR`, `MODULE_REQUIRED`.

- `message`
  Человекочитаемое описание.

- `status_code`
  HTTP-статус для transport layer.

- `details`
  Дополнительный структурированный контекст.

## 6.3. Какие действия ядра ему нужны

Это не CRUD-сущность.  
Ему нужны не "действия", а единые точки использования:

- `raise DomainError(...)`
- `domain_error_handler(...)`
- `map low-level error -> DomainError`

Пример:

```python
if asset is None:
    raise DomainError(
        "ASSET_NOT_FOUND",
        "Asset not found",
        status_code=404,
        details={"asset_id": str(asset_id)},
    )
```

## 6.4. Почему он должен быть в ядре

Потому что это базовый контракт между доменом и внешним миром.

Если его нет:

- модули начинают кидать разные типы исключений;
- API становится непредсказуемым;
- automation и UI сложнее интерпретировать ошибки;
- невозможно аккуратно добавлять capability-слои.

`DomainError` — это скелет согласованности всей системы.

---

## 7. Итоговая формулировка

Если уж резать ядро максимально строго, то я бы оставил так:

- `Asset` — минимальная точка привязки анализа;
- `Object` — базовый атом доменной модели;
- `Audit` — обязательный системный след;
- `DomainError` — единый язык ошибок.

А уже выше этого слоя размещал бы:

- `Assessment` как orchestration container;
- `ImportBatch` и `Candidate` как ingest/inbox workflow;
- `Relation`, `Mark`, `Check`, `Case`, `Finding`, `Evidence` как подключаемые capability-модули.
