import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { DEFAULT_EXERCISES } from '../src/defaultExercises';
import { MUSCLE_GROUPS } from '../src/types';

// scripts/build-exercises.mjs already validates ids, muscle groups and equipment, and
// `npm run build` fails if src/defaultExercises.ts is out of date; this checks the
// content rules on top of that.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const words = (s: string) => s.split(/\s+/).length;

it('default exercises: 5–6 per muscle group, unique names, two photos in the repo, short setup and 2–3 short steps', () => {
  for (const group of MUSCLE_GROUPS) {
    const count = DEFAULT_EXERCISES.filter(e => e.muscleGroup === group).length;
    expect(count >= 5 && count <= 6, `${group}: ${count}`).toBe(true);
  }
  expect(new Set(DEFAULT_EXERCISES.map(e => e.name.toLowerCase())).size).toBe(DEFAULT_EXERCISES.length);

  for (const e of DEFAULT_EXERCISES) {
    expect(e.media, e.id).toHaveLength(2);
    for (const m of e.media!) {
      const path = m.src.match(/^https:\/\/raw\.githubusercontent\.com\/theohogberg\/obsidian-exercise-plugin\/main\/(assets\/exercises\/[a-z0-9-]+\/\d\.jpg)$/)?.[1];
      expect(path && existsSync(`${ROOT}/${path}`), m.src).toBeTruthy();
    }
    expect(words(e.setup ?? ''), e.id).toBeLessThanOrEqual(30);
    expect(e.setup, e.id).toBeTruthy();
    expect(e.instructions!.length >= 2 && e.instructions!.length <= 3, e.id).toBe(true);
    for (const step of e.instructions!) expect(words(step), `${e.id}: ${step}`).toBeLessThanOrEqual(20);
  }
});
