from typing import TypeVar

T = TypeVar("T")


def paginate(items: list[T], limit: int = 100, offset: int = 0) -> list[T]:
    if limit < 1:
        limit = 1
    if limit > 1000:
        limit = 1000
    if offset < 0:
        offset = 0
    return items[offset: offset + limit]
