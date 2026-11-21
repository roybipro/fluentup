"""The production image installs requirements.txt only; keep it lean but complete."""
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _names(path: Path) -> set:
    names = set()
    for line in path.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line and not line.startswith("-"):
            names.add(re.split(r"[\[<>=~!; ]", line, maxsplit=1)[0].lower())
    return names


def test_runtime_requirements_have_postgres_driver_and_no_test_tools():
    runtime = _names(BACKEND / "requirements.txt")
    assert "psycopg" in runtime, "DATABASE_URL uses postgresql+psycopg; the driver must ship in the image"
    assert not {"pytest", "pytest-asyncio"} & runtime
    assert "pydantic-settings" not in runtime  # unused; config.py reads os.environ directly


def test_dev_requirements_include_runtime_and_pytest():
    dev = (BACKEND / "requirements-dev.txt").read_text()
    assert "-r requirements.txt" in dev
    assert "pytest" in _names(BACKEND / "requirements-dev.txt")
