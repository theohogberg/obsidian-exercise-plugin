import { describe, expect, it } from 'vitest';
import { GymStore } from '../src/store';
import { buildSessionExercise, createSession, defaultProgrammeValues, finishSession, programmeValuesFrom, summariseSets } from '../src/session';
import { fakeApp, legacyData, testSettings } from './helpers';

async function loadedStore(initial: Record<string, string> = { '.gym/exercises.json': JSON.stringify(legacyData) }) {
  const { app, files } = fakeApp(initial);
  const store = new GymStore(app);
  await store.load();
  return { app, files, store };
}

describe('starting a session', () => {
  it('keeps programme order, prefills from history, and falls back to programme sets × reps', async () => {
    const { store } = await loadedStore();
    const session = createSession(store, store.getProgramme('pushday')!, 'exercise');

    expect(session.exercises.map(e => e.exerciseId)).toEqual(['push', 'bench', 'fly']);
    // Last time's weights (80 kg), not the old template's 70 kg
    expect(session.exercises[1]!.sets).toEqual(Array(4).fill({ weight: 80, reps: 8, done: false }));
    // No history: the programme's 2 × 15 at weight 0
    expect(session.exercises[2]!.sets).toEqual(Array(2).fill({ weight: 0, reps: 15, done: false }));
  });

  it("prefills from this programme's last time when prefillFrom is 'programme', else from any", async () => {
    const { store } = await loadedStore();
    store.addLog('bench', { date: '2026-10-01', programmeId: 'pushday', sets: [{ weight: 90, reps: 5 }], notes: '', notePath: 'a.md' });
    store.addLog('bench', { date: '2026-10-03', programmeId: 'other', sets: [{ weight: 60, reps: 12 }], notes: '', notePath: 'b.md' });
    const bench = store.getExercise('bench')!;
    const fallback = { sets: 1, reps: 1 };

    expect(buildSessionExercise(store, bench, 'pushday', 'exercise', fallback).sets[0]!.weight).toBe(60);
    expect(buildSessionExercise(store, bench, 'pushday', 'programme', fallback).sets[0]!.weight).toBe(90);
    expect(buildSessionExercise(store, bench, 'never-done', 'programme', fallback).sets[0]!.weight).toBe(60);
  });

  it('an empty session has no exercises and no programme', async () => {
    const { store } = await loadedStore();
    const session = createSession(store, null, 'exercise');
    expect(session).toMatchObject({ programmeId: null, programmeName: '', exercises: [] });
  });
});

describe('helpers', () => {
  it('summarises sets and derives programme values from them', () => {
    expect(summariseSets([{ weight: 80, reps: 8 }, { weight: 77.5, reps: 7 }])).toBe('80×8, 77.5×7');
    expect(programmeValuesFrom([{ weight: 80, reps: 8 }, { weight: 77.5, reps: 7 }])).toEqual({ sets: 2, reps: 8 });
    expect(programmeValuesFrom([])).toBeNull();
  });

  it('new programme entries use the last values performed, or 3 × 8', async () => {
    const { store } = await loadedStore();
    expect(defaultProgrammeValues(store, 'bench')).toEqual({ sets: 4, reps: 8 });
    expect(defaultProgrammeValues(store, 'fly')).toEqual({ sets: 3, reps: 8 });
  });
});

describe('finishing a session', () => {
  it('writes the note, records history, updates the programme and clears the active session', async () => {
    const { app, files, store } = await loadedStore();
    const settings = testSettings();
    const session = createSession(store, store.getProgramme('pushday')!, 'exercise');
    session.startedAt = '2026-10-04T21:30:00+02:00';
    await store.saveActiveSession(session);

    const bench = session.exercises[1]!;
    bench.sets = [
      { weight: 85, reps: 6, done: true },
      { weight: 85, reps: 6, done: true },
      { weight: 82.5, reps: 7, done: true },
      { weight: 85, reps: 6, done: false }, // not ticked off: left out
    ];
    bench.notes = 'Felt heavy';
    session.notes = 'Good session';

    const file = await finishSession(app, store, settings, session);
    const note = files.get(file.path)!;

    expect(file.path).toBe('Gym/Sessions/2026-10-04 Push day.md');
    expect(note).toContain('## Bench Press\n- 85kg × 6\n- 85kg × 6\n- 82.5kg × 7\n\n> Felt heavy');
    expect(note).not.toContain('Tricep Pushdown');

    expect(store.getHistory('bench')[0]).toMatchObject({ date: '2026-10-04', programmeId: 'pushday', notes: 'Felt heavy', notePath: file.path });
    expect(store.getHistory('bench')[0]!.sets).toHaveLength(3);
    expect(store.getHistory('push')).toHaveLength(1); // nothing done: no new entry

    const programme = store.getProgramme('pushday')!;
    expect(programme.exercises[1]).toEqual({ exerciseId: 'bench', sets: 3, reps: 6 });
    expect(programme.exercises[0]).toEqual({ exerciseId: 'push', sets: 3, reps: 12 });
    expect(await store.loadActiveSession()).toBeNull();

    // The next session starts from what was just done
    const next = createSession(store, programme, 'exercise');
    expect(next.exercises[1]!.sets.map(s => s.weight)).toEqual([85, 85, 82.5]);
  });

  it('adds a number when a note with that name already exists', async () => {
    const { app, store } = await loadedStore();
    const make = async () => {
      const s = createSession(store, store.getProgramme('pushday')!, 'exercise');
      s.startedAt = '2026-10-04T09:00:00+02:00';
      s.exercises[0]!.sets[0]!.done = true;
      return (await finishSession(app, store, testSettings(), s)).path;
    };
    expect(await make()).toBe('Gym/Sessions/2026-10-04 Push day.md');
    expect(await make()).toBe('Gym/Sessions/2026-10-04 Push day 1.md');
    expect(await make()).toBe('Gym/Sessions/2026-10-04 Push day 2.md');
  });
});
