import re
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

_KIND_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")

BUILTIN_KIND_KEYS: frozenset[str] = frozenset({"SOURCE", "SINK", "GUARD", "TRANSFORM", "NOTE"})


def default_builtin_entries() -> list[dict]:
    """Seed rows for a new assessment (matches prior hardcoded UX/colors)."""
    return [
        {"kind_key": "NOTE", "display_label": "Mark", "enabled": True, "sort_order": 0, "color": "#475569", "is_builtin": True},
        {"kind_key": "SOURCE", "display_label": "Source", "enabled": True, "sort_order": 10, "color": "#15803d", "is_builtin": True},
        {"kind_key": "SINK", "display_label": "Sink", "enabled": True, "sort_order": 20, "color": "#b91c1c", "is_builtin": True},
        {"kind_key": "GUARD", "display_label": "Guard", "enabled": True, "sort_order": 30, "color": "#1d4ed8", "is_builtin": True},
        {"kind_key": "TRANSFORM", "display_label": "Transform", "enabled": True, "sort_order": 40, "color": "#a16207", "is_builtin": True},
    ]


class MarkKindCatalogEntryRead(BaseModel):
    id: UUID
    kind_key: str
    display_label: str
    enabled: bool
    sort_order: int = 0
    color: str
    is_builtin: bool = False


class MarkKindCatalogRead(BaseModel):
    entries: list[MarkKindCatalogEntryRead]


class MarkKindCatalogEntryWrite(BaseModel):
    kind_key: str
    display_label: str = ""
    enabled: bool = True
    sort_order: int = 0
    color: str = "#64748b"
    is_builtin: bool = False

    @model_validator(mode="after")
    def default_display_label(self) -> "MarkKindCatalogEntryWrite":
        if not self.display_label.strip():
            return self.model_copy(update={"display_label": self.kind_key})
        return self

    @field_validator("kind_key")
    @classmethod
    def validate_kind_key(cls, value: str) -> str:
        key = value.strip().upper()
        if len(key) > 64:
            raise ValueError("kind_key too long")
        if not _KIND_RE.match(key):
            raise ValueError("kind_key must match [A-Z][A-Z0-9_]*")
        return key

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        c = value.strip()
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", c):
            raise ValueError("color must be #RRGGBB")
        return c.lower()


class MarkKindCatalogReplace(BaseModel):
    entries: list[MarkKindCatalogEntryWrite] = Field(min_length=1)

    @field_validator("entries")
    @classmethod
    def validate_entries(cls, entries: list[MarkKindCatalogEntryWrite]) -> list[MarkKindCatalogEntryWrite]:
        keys = [e.kind_key for e in entries]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate kind_key in catalog")

        provided_builtins = {e.kind_key for e in entries if e.is_builtin}
        if provided_builtins != BUILTIN_KIND_KEYS:
            raise ValueError("Builtin kinds must appear exactly once each with is_builtin=true")

        for e in entries:
            if e.kind_key in BUILTIN_KIND_KEYS and not e.is_builtin:
                raise ValueError(f"Known builtin {e.kind_key} must have is_builtin=true")
            if e.kind_key not in BUILTIN_KIND_KEYS and e.is_builtin:
                raise ValueError(f"Custom kind {e.kind_key} cannot be marked builtin")

        return entries
