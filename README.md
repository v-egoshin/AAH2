# AppSec Assessment Workbench — Current Status

## Реализовано дополнительно
- Добавлен Alembic baseline:
  - `alembic.ini`
  - `alembic/env.py`
  - стартовая миграция `alembic/versions/0001_initial.py`
- Добавлен `requirements.txt` для воспроизводимой установки зависимостей.
- Обновлён backend Docker image для установки зависимостей из `requirements.txt` и включения Alembic артефактов.

## Что уже закрыто
- API surface по основным доменным сущностям.
- Store provider с поддержкой memory/sql backend.
- Web/VS Code scaffolds.
- Audit + domain error baseline.
- Smoke tests baseline.

## Что остаётся
- Расширить миграции Alembic до полного покрытия всех таблиц и эволюции схемы.
- Углубить SQL parity поведения (некоторые продвинутые workflow ветки всё ещё проще, чем in-memory).
- Расширить автоматические тесты (integration/e2e полноценно).

## Запуск
```bash
docker compose up --build
```

## Миграции
```bash
alembic upgrade head
```
