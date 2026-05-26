"""Pytest: shared SQLite file URL + store cache reset."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

_TEST_DB = Path(os.environ.get("APPSEC_TEST_SQLITE_PATH", "/tmp/appsec_wb_pytest.sqlite"))
_TEST_DB.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{_TEST_DB.as_posix()}"


@pytest.fixture(autouse=True)
def clear_store_cache():
    from app.repositories.store_provider import get_store

    get_store.cache_clear()
    yield
    get_store.cache_clear()
