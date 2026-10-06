import { describe, expect, it } from 'vitest';
import { GymStore } from '../src/store';
import { createSession } from '../src/session';
import { buildSessionNote, writeSessionNote } from '../src/sessionNote';
import { fakeApp, testSettings } from './helpers';

async function storeWithDefaults() {
  const { app, files } = fakeApp();
  const store = new GymStore(app);
  await store.load();
  return { app, files, store };
}

describe('session note', () => {
  it('has the documented format: front matter, every set row, notes', async () => {
    const { store } = await storeWithDefaults();
    const programme = { id: 'p', name: 'Push day', exercises: [
      { exerciseId: 'default-bench-press', sets: 2, reps: 8 },
      { exerciseId: 'default-tricep-pushdown', sets: 1, reps: 12 },
      { exerciseId: 'default-lateral-raise', sets: 1, reps: 15 },
    ] };
    const session = createSession(store, programme, 'exercise');
    session.startedAt = '2026-10-04T09:30:00+02:00';
    session.exercises[0]!.sets = [{ weight: 85, reps: 6 }, { weight: 82.5, reps: 7 }];
    session.exercises[0]!.notes = 'Felt heavy\nSleep was bad';
    session.exercises[1]!.sets = [{ weight: 30, reps: 12 }];
    session.exercises[2]!.sets = []; // no rows: left out of the note
    session.notes = 'Good session';

    expect(buildSessionNote(store, testSettings(), session)).toBe([
      '---',
      'date: 2026-10-04',
      'type: workout',
      'programme: "Push day"',
      'muscles: [chest, triceps]',
      '---',
      '',
      '# Push day — 2026-10-04',
      '',
      '## Bench Press',
      '- 85kg × 6',
      '- 82.5kg × 7',
      '',
      '> Felt heavy',
      '> Sleep was bad',
      '',
      '## Tricep Pushdown',
      '- 30kg × 12',
      '',
      '## Notes',
      'Good session',
      '',
    ].join('\n'));
  });

  it('empty sessions are titled "Workout"; weights use the unit setting; dates are local, not UTC', async () => {
    const { store } = await storeWithDefaults();
    const session = createSession(store, null, 'exercise');
    // 23:30 local on the 4th, whatever the machine's time zone
    session.startedAt = new Date(2026, 9, 4, 23, 30).toISOString();
    session.exercises.push({ exerciseId: 'default-plank', name: 'Plank', sets: [{ weight: 0, reps: 60 }], notes: '' });
    const note = buildSessionNote(store, testSettings({ weightUnit: 'lbs' }), session);
    expect(note).toContain('date: 2026-10-04');
    expect(note).toContain('# Workout — 2026-10-04');
    expect(note).not.toContain('programme:');
    expect(note).toContain('- 0lbs × 60');
  });

  it('file names: unsafe characters stripped, a number added when the name is taken', async () => {
    const { app, store } = await storeWithDefaults();
    const write = async () => {
      const session = createSession(store, { id: 'p', name: 'Legs: A/B #1', exercises: [] }, 'exercise');
      session.startedAt = '2026-10-04T09:30:00+02:00';
      return (await writeSessionNote(app, store, testSettings(), session)).path;
    };
    expect(await write()).toBe('Gym/Sessions/2026-10-04 Legs AB 1.md');
    expect(await write()).toBe('Gym/Sessions/2026-10-04 Legs AB 1 1.md');
  });
});
