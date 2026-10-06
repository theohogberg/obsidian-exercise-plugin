import { beforeEach, expect, it } from 'vitest';
import { notices } from './stubs/obsidian';
import { GymStore } from '../src/store';
import { MediaCache } from '../src/mediaCache';
import { DEFAULT_EXERCISES } from '../src/defaultExercises';
import type { GymData } from '../src/types';
import { fakeApp, legacyData } from './helpers';

const LEGACY_IMAGE = (id: string, n: number) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${id}/${n}.jpg`;

beforeEach(() => { notices.length = 0; });

it('new vault: gets every default exercise (as copies) once; deleted ones stay deleted', async () => {
  const { app, files } = fakeApp();
  const store = new GymStore(app);
  await store.load();
  expect(store.getExercises()).toHaveLength(DEFAULT_EXERCISES.length);
  expect(store.exercisesNeedingImages).toHaveLength(DEFAULT_EXERCISES.length);
  expect((JSON.parse(files.get('.gym/data.json')!) as GymData).defaultsAdded).toBe(true);
  store.getExercise('default-plank')!.notes = 'changed';
  expect(DEFAULT_EXERCISES.find(e => e.id === 'default-plank')!.notes).not.toBe('changed');

  store.deleteExercise('default-deadlift');
  await store.save();
  const again = new GymStore(app);
  await again.load();
  expect(again.getExercise('default-deadlift')).toBeUndefined();
  expect(again.exercisesNeedingImages).toEqual([]);
});

it('migration from .gym/exercises.json: converts data, keeps the old file, adds defaults skipping existing names', async () => {
  const { app, files } = fakeApp({ '.gym/exercises.json': JSON.stringify(legacyData) });
  const store = new GymStore(app);
  await store.load();

  expect(files.has('.gym/exercises.json')).toBe(true);
  expect(store.getExercise('bench')).toEqual({ id: 'bench', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', notes: 'Elbows tucked' });
  expect(store.getProgramme('pushday')!.exercises).toEqual([
    { exerciseId: 'push', sets: 3, reps: 12 }, { exerciseId: 'bench', sets: 4, reps: 8 }, { exerciseId: 'fly', sets: 2, reps: 15 },
  ]);
  // Old default weights become "last time"; exercises without defaults get no history
  expect(store.getHistory('bench')[0]!.sets).toEqual(Array(4).fill({ weight: 80, reps: 8 }));
  expect(store.getHistory('fly')).toEqual([]);
  // "Bench Press" and "Tricep Pushdown" already exist
  expect(store.exercisesNeedingImages).toHaveLength(DEFAULT_EXERCISES.length - 2);
  expect(store.getExercises().filter(e => e.name === 'Bench Press')).toHaveLength(1);
});

it("default exercises get the built-in setup and steps on load; the user's own edits are kept", async () => {
  const { app } = fakeApp();
  const first = new GymStore(app);
  await first.load();
  Object.assign(first.getExercise('default-back-squat')!, { setup: 'old setup', instructions: ['old step'], notes: 'my own cue' });
  await first.save();

  const store = new GymStore(app);
  await store.load();
  const def = DEFAULT_EXERCISES.find(e => e.id === 'default-back-squat')!;
  expect(store.getExercise('default-back-squat')).toMatchObject({ setup: def.setup, instructions: def.instructions, notes: 'my own cue' });
});

it('default exercise images move from free-exercise-db to this repo; custom images kept, old copies removed', async () => {
  const legacyV2 = {
    version: 2, defaultsAdded: true, programmes: [], history: {},
    exercises: DEFAULT_EXERCISES.map(e => ({
      ...e,
      media: e.id === 'default-plank'
        ? [{ type: 'image', src: 'https://example.com/my-plank.gif' }]
        : [0, 1].map(n => ({ type: 'image', src: LEGACY_IMAGE(e.id, n) })),
    })),
  };
  const probe = new MediaCache(fakeApp().app);
  const oldUrls = legacyV2.exercises.flatMap(e => e.media.map(m => m.src)).filter(u => u.includes('yuhonas'));
  const initial: Record<string, string> = { '.gym/data.json': JSON.stringify(legacyV2) };
  for (const url of oldUrls) initial[probe.pathFor(url)!] = 'old image';

  const { app, files } = fakeApp(initial);
  const store = new GymStore(app);
  await store.load();
  for (const def of DEFAULT_EXERCISES.filter(e => e.id !== 'default-plank')) {
    expect(store.getExercise(def.id)!.media).toEqual(def.media);
  }
  expect(store.getExercise('default-plank')!.media).toEqual([{ type: 'image', src: 'https://example.com/my-plank.gif' }]);
  expect(oldUrls.some(u => files.has(probe.pathFor(u)!))).toBe(false);

  const again = new GymStore(app);
  await again.load();
  expect(again.exercisesNeedingImages).toEqual([]);
});

it('never overwrites a data file it could not read', async () => {
  const { app, files } = fakeApp({ '.gym/data.json': '{ broken' });
  const store = new GymStore(app);
  await store.load();
  expect(notices.some(n => n.includes('could not read'))).toBe(true);
  await expect(store.save()).rejects.toThrow();
  expect(files.get('.gym/data.json')).toBe('{ broken');
});

it("history: 20 newest per exercise; a programme's last done date; deleting an exercise removes it everywhere", async () => {
  const store = new GymStore(fakeApp({ '.gym/exercises.json': JSON.stringify(legacyData) }).app);
  await store.load();
  for (let day = 1; day <= 25; day++) {
    store.addLog('fly', { date: `2026-09-${String(day).padStart(2, '0')}`, programmeId: day === 3 ? 'pushday' : null, sets: [], notes: '', notePath: '' });
  }
  expect(store.getHistory('fly')).toHaveLength(20);
  expect(store.getHistory('fly')[0]!.date).toBe('2026-09-25');
  expect(store.getLastProgrammeDate('pushday')).toBeUndefined(); // the 3rd fell out of the 20 kept
  store.addLog('push', { date: '2026-10-02', programmeId: 'pushday', sets: [], notes: '', notePath: '' });
  expect(store.getLastProgrammeDate('pushday')).toBe('2026-10-02');

  store.deleteExercise('bench');
  expect(store.getProgramme('pushday')!.exercises.map(e => e.exerciseId)).toEqual(['push', 'fly']);
  expect(store.getHistory('bench')).toEqual([]);
});

it('saves, loads and clears the workout in progress', async () => {
  const store = new GymStore(fakeApp().app);
  await store.load();
  expect(await store.loadActiveSession()).toBeNull();
  const session = { id: 's', startedAt: '2026-10-04T09:30:00+02:00', programmeId: null, programmeName: '', exercises: [], notes: 'hi' };
  await store.saveActiveSession(session);
  expect(await store.loadActiveSession()).toEqual(session);
  await store.clearActiveSession();
  expect(await store.loadActiveSession()).toBeNull();
});
