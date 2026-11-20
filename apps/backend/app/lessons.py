"""Server-side lesson catalog. XP and pass marks come from here, never from the client.

`app/data/lessons.json` must match `apps/mobile/src/data/curriculum.ts`; a mobile Jest test enforces it.
"""
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional


@dataclass(frozen=True)
class LessonRules:
    xp_reward: int
    passing_score: int


def _load() -> Dict[str, LessonRules]:
    raw = json.loads((Path(__file__).parent / "data" / "lessons.json").read_text(encoding="utf-8"))
    return {lesson_id: LessonRules(**rules) for lesson_id, rules in raw.items()}


LESSONS: Dict[str, LessonRules] = _load()


def get_lesson_rules(lesson_id: str) -> Optional[LessonRules]:
    return LESSONS.get(lesson_id)
