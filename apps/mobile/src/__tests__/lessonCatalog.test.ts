import { readFileSync } from 'fs';
import { join } from 'path';
import { SEED_LEARNING_PATHS } from '../data/curriculum';

describe('backend lesson catalog', () => {
  it('matches the lessons and XP rewards in the app curriculum', () => {
    const catalogPath = join(__dirname, '../../../backend/app/lesson_catalog.json');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const curriculum = Object.fromEntries(
      SEED_LEARNING_PATHS.flatMap((path) => path.lessons).map((lesson) => [lesson.id, lesson.xpReward])
    );
    expect(catalog).toEqual(curriculum);
  });
});
