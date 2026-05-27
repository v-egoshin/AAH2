# Execution Status Ledger

## WORKFLOW NOTES
- After changes that require a restart or rebuild of runtime tooling, update/restart the OKD agent or `docker-compose` environment so the running system matches the code.
- For local docker development, rebuild and restart backend/web with `./scripts/rebuild_app_stack.sh` when backend or frontend changes need a fresh image.

## UI CONVENTIONS
- Modal dialogs should use one shared shell and a consistent compact layout.
- Modal spacing should stay tight; avoid oversized padding and empty space.
- Use an icon close control instead of a text `Close` button.
- `Escape` should request modal close. If the form is dirty, show an in-app discard warning before closing.
- Prefer small action buttons with icons/pictograms where they improve scanability.
- Keep modal colors aligned with the calm neutral palette already used by the workbench.

## DONE
- Sprint 8 expanded: SQLAlchemy ORM + SQL store now covers assessments/assets/imports/candidates.
- Provider-based store switching applied to key routes.

## PARTIAL DONE
- Candidate accept SQL flow sets status but does not yet create full graph entities.
- Most advanced domain routes still in-memory-first.

## NOT DONE
- Full SQL migration across entire domain model.
- Alembic and schema versioning (in progress: `alembic/` used in Docker; follow with new revisions for schema changes).
- Full tests/e2e.

## TESTING / REGRESSION
- Новый функционал сопровождается автотестами на адекватном уровне (API, web unit/component; для extension — модульные там, где возможно).
- Изменение или удаление существующего поведения выполняется вместе с обновлением или добавлением тестов на прежние контракты, чтобы не ломать сценарии без сигнала в CI.
- Ручные чеклисты допустимы там, где автоматизация дорога (полный UI extension), но не заменяют тестируемые слои полностью.

## CROSS-SURFACE CHECKS
Любая фича/правка, затрагивающая API или поведение пользователя, должна быть проверена и
доведена до готовности **во всех клиентских поверхностях**, а не только там, где правился код:

- **API/backend** — pytest, ручная проверка эндпоинтов.
- **web** (`web/`) — соответствующие страницы/формы, ошибки сервера (4xx/5xx) выводятся через
  состояние `error` и видны пользователю; vitest unit/component.
- **vscode-extension** (`vscode-extension/`) — команды, codelens, webview-панели (Checks, Linked
  Entities, Context). Ошибки API НЕ должны теряться: оборачивать вызовы в try/catch и показывать
  `vscode.window.showErrorMessage(...)` (для webview-обработчиков — дополнительно к сообщению в
  webview).
- Когда меняются HTTP-коды/контракты (например, добавлены 409 на уникальность), убедиться, что
  и web, и расширение их распознают и показывают понятный текст пользователю.

Пример: уникальность имён assessments/assets/cases — на backend возвращается 409, и обе
поверхности (web страницы, команды/панели расширения) обязаны показать ошибку, а не молча
проглатывать её.
