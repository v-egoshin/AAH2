from functools import lru_cache

from app.db.init_db import init_db
from app.repositories.sql_store import SqlStore


@lru_cache(maxsize=1)
def get_store():
    init_db()
    return SqlStore()
