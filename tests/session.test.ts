import { expect, it } from 'vitest';
import { GymStore } from '../src/store';
import { buildSessionExercise, createSession, defaultProgrammeValues, finishSession } from '../src/session';
import { fakeApp, legacyData, testSettings } from './helpers';

async function loadedStore() {
  const { app, files } = fakeApp({ '.gym/exercises.json': JSON.stringify(legacyData) });
  const store = new GymStore(app);
  await store.load();
  return { app, files, store };
}

it('starting: programme order, prefill from last time (anywhere or this programme), fallback to sets × reps', async () => {
  const { store } = await loadedStore();
  const session = createSession(store, store.getProgramme('pushday')!, 'exercise');
  expect(session.exercises.map(e => e.exerciseId)).toEqual(['push', 'bench', 'fly']);
  // Last time's weights (80 kg), not the old template's 70 kg
  expect(session.exercises[1]!.sets).toEqual(Array(4).fill({ weight: 80, reps: 8 }));
  // No history: the programme's 2 × 15 at weight 0
  expect(session.exercises[2]!.sets).toEqual(Array(2).fill({ weight: 0, reps: 15 }));

  store.addLog('bench', { date: '2026-10-01', programmeId: 'pushday', sets: [{ weight: 90, reps: 5 }], notes: '', notePath: 'a.md' });
  store.addLog('bench', { date: '2026-10-03', programmeId: 'other', sets: [{ weight: 60, reps: 12 }], notes: '', notePath: 'b.md' });
  const bench = store.getExercise('bench')!;
  const weightFor = (programmeId: string, from: 'exercise' | 'programme') =>
    buildSessionExercise(store, bench, programmeId, from, { sets: 1, reps: 1 }).sets[0]!.weight;
  expect(weightFor('pushday', 'exercise')).toBe(60);
  expect(weightFor('pushday', 'programme')).toBe(90);
  expect(weightFor('never-done', 'programme')).toBe(60);

  // New programme entries use the last values performed, or 3 × 8
  expect(defaultProgrammeValues(store, 'bench')).toEqual({ sets: 1, reps: 12 });
  expect(defaultProgrammeValues(store, 'fly')).toEqual({ sets: 3, reps: 8 });
});

it('finishing saves every set row to the note, history and programme, then clears the active session', async () => {
  const { app, files, store } = await loadedStore();
  const session = createSession(store, store.getProgramme('pushday')!, 'exercise');
  session.startedAt = '2026-10-04T21:30:00+02:00';
  await store.saveActiveSession(session);

  const bench = session.exercises[1]!;
  // The middle set carries `done` like sessions saved before the Done column was removed
  bench.sets = [{ weight: 85, reps: 6 }, { weight: 85, reps: 6, done: false } as never, { weight: 82.5, reps: 7 }];
  bench.notes = 'Felt heavy';
  session.exercises[0]!.sets = []; // pushdown: all rows removed, so it isn't recorded

  const file = await finishSession(app, store, testSettings(), session);
  const note = files.get(file.path)!;
  expect(file.path).toBe('Gym/Sessions/2026-10-04 Push day.md');
  expect(note).toContain('## Bench Press\n- 85kg × 6\n- 85kg × 6\n- 82.5kg × 7\n\n> Felt heavy');
  expect(note).toContain('## Cable Fly\n- 0kg × 15\n- 0kg × 15'); // untouched rows are saved as entered
  expect(note).not.toContain('Tricep Pushdown');

  expect(store.getHistory('bench')[0]).toEqual({
    date: '2026-10-04', programmeId: 'pushday', notes: 'Felt heavy', notePath: file.path,
    sets: [{ weight: 85, reps: 6 }, { weight: 85, reps: 6 }, { weight: 82.5, reps: 7 }],
  });
  expect(store.getHistory('push')).toHaveLength(1); // no rows: no new entry

  const programme = store.getProgramme('pushday')!;
  expect(programme.exercises.map(e => [e.sets, e.reps])).toEqual([[3, 12], [3, 6], [2, 15]]);
  expect(await store.loadActiveSession()).toBeNull();
  // The next session starts from what was just done
  expect(createSession(store, programme, 'exercise').exercises[1]!.sets.map(s => s.weight)).toEqual([85, 85, 82.5]);
});
