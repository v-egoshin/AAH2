import os

from app.db.init_db import init_db
from app.repositories.sql_store import SqlStore
from app.services.store import store as memory_store


def get_store():
    backend = os.getenv("STORE_BACKEND", "memory")
    if backend == "sql":
        init_db()
        return SqlStore()
    return memory_store
