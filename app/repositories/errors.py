"""Доменные ошибки слоя хранилища.

Используются для сигнализации нарушений инвариантов (например, уникальность имён),
которые маршруты транслируют в HTTP-ответы (409 Conflict и т. п.).
"""


class StoreError(Exception):
    """Базовая ошибка слоя хранилища."""


class DuplicateNameError(StoreError):
    """Имя сущности уже используется в пределах своей области видимости."""

    def __init__(self, entity: str, name: str, scope: str | None = None) -> None:
        scope_msg = f" within {scope}" if scope else ""
        super().__init__(f"{entity} with name {name!r} already exists{scope_msg}")
        self.entity = entity
        self.name = name
        self.scope = scope
