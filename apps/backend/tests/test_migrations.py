"""Alembic migrations are the only schema source; they must build exactly what the models describe."""
import os
import subprocess
import sys
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.database import Base
import app.models  # noqa: F401

BACKEND = Path(__file__).resolve().parents[1]


def _run(args, db_url):
    env = {**os.environ, "DATABASE_URL": db_url, "ENVIRONMENT": "test", "PYTHONPATH": str(BACKEND)}
    return subprocess.run(args, cwd=BACKEND, env=env, capture_output=True, text=True, check=True)


def test_upgrade_head_on_empty_db_matches_models(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'fresh.db'}"
    _run([sys.executable, "-m", "alembic", "upgrade", "head"], db_url)

    engine = create_engine(db_url)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == [], f"Migrations and models disagree: {diff}"

    _run([sys.executable, "-m", "alembic", "downgrade", "base"], db_url)
    assert set(inspect(create_engine(db_url)).get_table_names()) <= {"alembic_version"}


def test_importing_app_does_not_create_tables(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'import.db'}"
    _run([sys.executable, "-c", "import app.main"], db_url)
    assert inspect(create_engine(db_url)).get_table_names() == []
