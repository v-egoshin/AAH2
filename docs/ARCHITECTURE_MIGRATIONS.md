# Расширение БД при подключении модуля

Как схема PostgreSQL (Alembic) стыкуется с **ядро + плагины** и edition/deploy-ролями.

---

## 1. Проблема

Сейчас (as-is):

- одна миграция `0001_initial` создаёт **все** таблицы сразу;
- ORM в монолитном `app/db/models.py`;
- runtime-модуль (`AAH2_MODULES`) и схема БД **не связаны** — ingest-worker получает таблицы `cases`, хотя модуль выключен.

Цель (to-be):

- **core-migrations** — только таблицы ядра;
- **module-migration** — отдельная revision на модуль (`cases`, `marks`, …);
- применять только миграции **включённых** модулей (edition / `AAH2_MODULES`);
- memory-backend без Alembic (как сейчас).

---

## 2. Принципы

| # | Правило |
|---|---------|
| M1 | Одна БД, линейная или ветвящаяся цепочка Alembic — **не** отдельная БД на модуль |
| M2 | Таблица модуля создаётся **только** migration этого модуля |
| M3 | ORM модели живут **рядом с модулем** (`app/modules/cases/models.py`) |
| M4 | Core FK только на core-таблицы (`assessment_id`); модули не FK на marks→cases между модулями без явного контракта |
| M5 | Relations — в core; ссылки на `case_id` без FK (polymorphic), как сейчас |
| M6 | `alembic upgrade` на deploy **до** старта API с включённым модулем |

---

## 3. Структура каталогов

```
alembic/
  env.py                    # собирает metadata из registry
  versions/
    core/
      0001_core_schema.py           # assessments, assets, import_batches,
                                    # candidates, objects, relations
      0002_core_audit_timestamps.py
    modules/
      0010_mod_marks.py             # depends_on: core head
      0020_mod_checks.py
      0030_mod_cases.py
      0040_mod_findings.py
      0050_mod_evidence.py
      0100_mod_tenancy.py           # enterprise-only

app/
  db/
    base.py
    registry.py             # import_models(enabled_modules)
  core/
    db/models.py            # AssessmentORM, AssetORM, ...
  modules/
    cases/
      models.py             # CaseORM
      migrations_meta.py    # revision id, depends_on — для документации/CI
```

---

## 4. Registry metadata (env.py)

```python
# app/db/registry.py
from app.db.base import Base

_CORE_MODELS = "app.core.db.models"
_MODULE_MODELS = {
    "marks": "app.modules.marks.models",
    "checks": "app.modules.checks.models",
    "cases": "app.modules.cases.models",
    "findings": "app.modules.findings.models",
    "evidence": "app.modules.evidence.models",
    "tenancy": "app.modules.tenancy.models",
}

def load_metadata(enabled_modules: set[str] | None = None):
    import importlib
    importlib.import_module(_CORE_MODELS)
    if enabled_modules:
        for name in enabled_modules:
            path = _MODULE_MODELS.get(name)
            if path:
                importlib.import_module(path)
    return Base.metadata
```

```python
# alembic/env.py
import os
modules = os.getenv("AAH2_MIGRATE_MODULES", "all")  # или список из edition
enabled = None if modules == "all" else set(modules.split(","))
target_metadata = load_metadata(enabled)
```

---

## 5. Revision на модуль

Пример: модуль `cases`

```python
# alembic/versions/modules/0030_mod_cases.py
"""module: cases — cases table

Revision ID: 0030_mod_cases
Revises: 0020_mod_checks
Module: cases
"""
revision = "0030_mod_cases"
down_revision = "0020_mod_checks"   # или "0002_core_audit" если checks нет
branch_labels = ("module",)

def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("assessment_id", sa.String(36), sa.ForeignKey("assessments.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        ...
    )
    op.create_index("ix_cases_assessment_id", "cases", ["assessment_id"])

def downgrade() -> None:
    op.drop_table("cases")
```

**Зависимости миграций** зеркалят `MODULE_DEPENDS`:

```python
MODULE_MIGRATION_CHAIN = {
    "marks": "0010_mod_marks",
    "checks": "0020_mod_checks",
    "cases": "0030_mod_cases",
    "findings": "0040_mod_findings",  # depends cases
}
```

---

## 6. Команды deploy

### 6.1. Полный стенд (standalone)

```bash
# все миграции до head (core + все module revisions в цепочке)
alembic upgrade head
```

### 6.2. Strict core (ingest worker)

```bash
# только core-ветка
alembic upgrade 0002_core_audit_timestamps
# или: alembic upgrade core@head  при branch_labels
```

Таблиц `cases`, `marks` **нет** — SQL store модуля не подключается.

### 6.3. Edition-aware (рекомендуется)

```bash
# app/cli/migrate.py
def migrate_for_edition(edition: EditionProfile):
    upgrade("core@head")
    for mod in edition.modules:
        rev = MODULE_MIGRATION_CHAIN.get(mod)
        if rev:
            upgrade(rev)
```

```yaml
# k8s initContainer (corporate app node)
command: ["python", "-m", "app.cli.migrate", "--edition", "enterprise"]
```

### 6.4. Startup guard

```python
# bootstrap.py — перед register модуля
def ensure_schema(module: str, ctx):
    if ctx.store_backend != "sql":
        return
    current = get_alembic_head_for(module)
    required = MODULE_MIGRATION_CHAIN[module]
    if current != required:
        raise RuntimeError(f"DB schema for module {module} not migrated; run alembic upgrade {required}")
```

---

## 7. Memory vs SQL

| Backend | Новый модуль |
|---------|----------------|
| **memory** | Расширить `InMemoryStore` / отдельный `CasesMemoryRepo` при `register()` — без Alembic |
| **sql** | Обязательна module-migration до включения модуля |

Parity-тест: один тест на модуль с `STORE_BACKEND=memory` и `sql` после migrate.

---

## 8. Эволюция схемы внутри модуля

Новое поле в `cases` — **только** новая revision в цепочке модуля:

```
0030_mod_cases.py      — create table
0031_cases_assignee.py — add column assignee (module cases)
```

Не смешивать с core-migrations. Cross-module ALTER — антипаттерн; только через relations/properties JSON в core graph.

---

## 9. Миграция с as-is (план)

1. Разбить `0001_initial` на `0001_core_schema` (без marks/checks/cases/findings/evidence).
2. Добавить `0010_mod_*` … по одной на таблицу (можно squash в один релиз 2.0).
3. Перенести ORM в `app/core/db` и `app/modules/*/models.py`.
4. `registry.load_metadata` в `alembic/env.py`.
5. CLI `migrate --edition standalone`.
6. Startup guard в bootstrap.

До шага 1–2: **временно** все таблицы в head; модули выключены runtime, но таблицы пустые — допустимо для dev, не для strict ingest prod.

---

## 10. Enterprise modules

`tenancy` добавляет:

```python
# 0100_mod_tenancy.py
op.add_column("assessments", sa.Column("org_id", sa.String(36), nullable=True))
op.create_index("ix_assessments_org_id", "assessments", ["org_id"])
```

Расширение **core-таблицы** — только enterprise-migration с явным `EnterpriseModule` и depends on core head. Analyst modules не трогают `assessments` schema.

---

## 11. CI

```yaml
- name: test migrations core-only
  run: alembic upgrade 0002_core_audit_timestamps && pytest tests/test_ingest_sql.py

- name: test migrations full
  run: alembic upgrade head && pytest tests/
```

---

## 12. Резюме

| Вопрос | Ответ |
|--------|--------|
| Кто создаёт таблицу `cases`? | Revision `0030_mod_cases`, не core |
| Когда применять? | Deploy/initContainer по edition, до `CasesModule.register()` |
| Ingest worker без cases? | `alembic upgrade` только до core head |
| Новый модуль с нуля? | models.py + migration + запись в `MODULE_MIGRATION_CHAIN` + registry |
| Autogenerate? | `alembic revision --autogenerate` после import модели в registry |

Расширение БД = **отдельная Alembic-revision на модуль**, связанная с `AAH2_MODULES` / edition manifest, а не новая миграция в монолитном `0001_initial`.
