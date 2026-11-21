import { SEED_LEARNING_PATHS } from '../data/curriculum';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverCatalog: Record<string, { xp_reward: number; passing_score: number }> = require('../../../backend/app/data/lessons.json');

test('backend lesson catalog matches mobile curriculum XP and pass marks', () => {
  const mobileCatalog: Record<string, { xp_reward: number; passing_score: number }> = {};
  for (const path of SEED_LEARNING_PATHS) {
    for (const lesson of path.lessons) {
      mobileCatalog[lesson.id] = { xp_reward: lesson.xpReward, passing_score: lesson.passingScore };
    }
  }
  expect(serverCatalog).toEqual(mobileCatalog);
});
