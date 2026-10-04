import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXERCISES } from '../src/defaultExercises';
import { EQUIPMENT_TYPES, MUSCLE_GROUPS } from '../src/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const words = (s: string) => s.split(/\s+/).length;

describe('default exercises', () => {
  it('src/defaultExercises.ts is up to date with assets/exercises', () => {
    expect(() => execFileSync(process.execPath, ['scripts/build-exercises.mjs', '--check'], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });

  it('cover every muscle group with 5–6 exercises', () => {
    for (const group of MUSCLE_GROUPS) {
      const count = DEFAULT_EXERCISES.filter(e => e.muscleGroup === group).length;
      expect(count, group).toBeGreaterThanOrEqual(5);
      expect(count, group).toBeLessThanOrEqual(6);
    }
  });

  it('have unique ids and names and valid equipment', () => {
    expect(new Set(DEFAULT_EXERCISES.map(e => e.id)).size).toBe(DEFAULT_EXERCISES.length);
    expect(new Set(DEFAULT_EXERCISES.map(e => e.name.toLowerCase())).size).toBe(DEFAULT_EXERCISES.length);
    for (const e of DEFAULT_EXERCISES) expect(EQUIPMENT_TYPES, e.id).toContain(e.equipment);
  });

  it('have two photos each, served from this repo, that exist in assets/exercises', () => {
    for (const e of DEFAULT_EXERCISES) {
      expect(e.media, e.id).toHaveLength(2);
      for (const m of e.media!) {
        const match = m.src.match(/^https:\/\/raw\.githubusercontent\.com\/theohogberg\/obsidian-exercise-plugin\/main\/(assets\/exercises\/[a-z0-9-]+\/\d\.jpg)$/);
        expect(match, m.src).not.toBeNull();
        expect(existsSync(`${ROOT}/${match![1]}`), m.src).toBe(true);
      }
    }
  });

  it('have a short setup line and 2–3 short steps', () => {
    for (const e of DEFAULT_EXERCISES) {
      expect(e.setup, e.id).toBeTruthy();
      expect(words(e.setup!), e.id).toBeLessThanOrEqual(30);
      expect(e.instructions!.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.instructions!.length, e.id).toBeLessThanOrEqual(3);
      for (const step of e.instructions!) expect(words(step), `${e.id}: ${step}`).toBeLessThanOrEqual(20);
    }
  });
});
