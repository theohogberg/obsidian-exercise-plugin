import { beforeEach, describe, expect, it } from 'vitest';
import { notices } from './stubs/obsidian';
import { GymStore } from '../src/store';
import { MediaCache } from '../src/mediaCache';
import { DEFAULT_EXERCISES } from '../src/defaultExercises';
import type { GymData } from '../src/types';
import { fakeApp, legacyData } from './helpers';

const LEGACY_IMAGE = (id: string, n: number) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${id}/${n}.jpg`;

beforeEach(() => { notices.length = 0; });

describe('first run', () => {
  it('starts a new vault with every default exercise', async () => {
    const { app, files } = fakeApp();
    const store = new GymStore(app);
    await store.load();
    expect(store.getExercises()).toHaveLength(DEFAULT_EXERCISES.length);
    expect(store.exercisesNeedingImages).toHaveLength(DEFAULT_EXERCISES.length);
    const saved = JSON.parse(files.get('.gym/data.json')!) as GymData;
    expect(saved.version).toBe(2);
    expect(saved.defaultsAdded).toBe(true);
  });

  it('stores copies, so edits never change the built-in defaults', async () => {
    const store = new GymStore(fakeApp().app);
    await store.load();
    store.getExercise('default-deadlift')!.notes = 'changed';
    expect(DEFAULT_EXERCISES.find(e => e.id === 'default-deadlift')!.notes).not.toBe('changed');
  });
});

describe('migration from .gym/exercises.json (pre-v2)', () => {
  it('converts exercises, templates and old defaults, and keeps the old file', async () => {
    const { app, files } = fakeApp({ '.gym/exercises.json': JSON.stringify(legacyData) });
    const store = new GymStore(app);
    await store.load();

    expect(files.has('.gym/exercises.json')).toBe(true);
    expect(store.getExercise('bench')).toEqual({ id: 'bench', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', notes: 'Elbows tucked' });
    expect(store.getProgramme('pushday')).toEqual({
      id: 'pushday', name: 'Push day', exercises: [
        { exerciseId: 'push', sets: 3, reps: 12 },
        { exerciseId: 'bench', sets: 4, reps: 8 },
        { exerciseId: 'fly', sets: 2, reps: 15 },
      ],
    });
    // Old default weights become "last time"; exercises without defaults get no history
    expect(store.getHistory('bench')[0]!.sets).toEqual(Array(4).fill({ weight: 80, reps: 8 }));
    expect(store.getHistory('fly')).toEqual([]);
  });

  it('adds default exercises once, skipping names the vault already has', async () => {
    const { app } = fakeApp({ '.gym/exercises.json': JSON.stringify(legacyData) });
    const store = new GymStore(app);
    await store.load();
    // "Bench Press" and "Tricep Pushdown" already exist
    expect(store.exercisesNeedingImages).toHaveLength(DEFAULT_EXERCISES.length - 2);
    expect(store.getExercises().filter(e => e.name === 'Bench Press')).toHaveLength(1);
    expect(store.addDefaultExercises()).toEqual([]);
  });
});

describe('default exercises', () => {
  it('stay deleted on the next load', async () => {
    const { app } = fakeApp();
    const store = new GymStore(app);
    await store.load();
    store.deleteExercise('default-deadlift');
    await store.save();

    const again = new GymStore(app);
    await again.load();
    expect(again.getExercise('default-deadlift')).toBeUndefined();
    expect(again.exercisesNeedingImages).toEqual([]);
    expect(again.getMissingDefaultExercises().map(e => e.id)).toEqual(['default-deadlift']);
  });

  it("get the built-in setup and steps, while the user's own edits are kept", async () => {
    const { app } = fakeApp();
    const first = new GymStore(app);
    await first.load();
    const squat = first.getExercise('default-back-squat')!;
    squat.setup = 'old setup';
    squat.instructions = ['old step'];
    squat.notes = 'my own cue';
    await first.save();

    const store = new GymStore(app);
    await store.load();
    const def = DEFAULT_EXERCISES.find(e => e.id === 'default-back-squat')!;
    const after = store.getExercise('default-back-squat')!;
    expect(after.setup).toBe(def.setup);
    expect(after.instructions).toEqual(def.instructions);
    expect(after.notes).toBe('my own cue');
  });

  it('move from free-exercise-db image URLs to this repo, keeping custom images and removing old copies', async () => {
    const legacyV2 = {
      version: 2,
      defaultsAdded: true,
      programmes: [],
      history: {},
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
    expect(store.exercisesNeedingImages).toHaveLength(DEFAULT_EXERCISES.length - 1);
    expect(oldUrls.some(u => files.has(probe.pathFor(u)!))).toBe(false);

    const again = new GymStore(app);
    await again.load();
    expect(again.exercisesNeedingImages).toEqual([]);
  });
});

describe('data safety', () => {
  it('never overwrites a data file it could not read', async () => {
    const { app, files } = fakeApp({ '.gym/data.json': '{ broken' });
    const store = new GymStore(app);
    await store.load();
    expect(notices.some(n => n.includes('could not read'))).toBe(true);
    await expect(store.save()).rejects.toThrow();
    expect(files.get('.gym/data.json')).toBe('{ broken');
  });

  it('deleting an exercise removes it from programmes and deletes its history', async () => {
    const store = new GymStore(fakeApp({ '.gym/exercises.json': JSON.stringify(legacyData) }).app);
    await store.load();
    store.deleteExercise('bench');
    expect(store.getProgramme('pushday')!.exercises.map(e => e.exerciseId)).toEqual(['push', 'fly']);
    expect(store.getHistory('bench')).toEqual([]);
  });
});

describe('history', () => {
  it('keeps the 20 newest logs per exercise, newest first', async () => {
    const store = new GymStore(fakeApp().app);
    await store.load();
    for (let day = 1; day <= 25; day++) {
      store.addLog('default-plank', { date: `2026-09-${String(day).padStart(2, '0')}`, programmeId: null, sets: [], notes: '', notePath: '' });
    }
    const history = store.getHistory('default-plank');
    expect(history).toHaveLength(20);
    expect(history[0]!.date).toBe('2026-09-25');
  });

  it("reports a programme's last done date", async () => {
    const store = new GymStore(fakeApp().app);
    await store.load();
    expect(store.getLastProgrammeDate('p1')).toBeUndefined();
    store.addLog('default-deadlift', { date: '2026-09-30', programmeId: 'p1', sets: [], notes: '', notePath: '' });
    store.addLog('default-plank', { date: '2026-10-02', programmeId: 'p1', sets: [], notes: '', notePath: '' });
    store.addLog('default-plank', { date: '2026-10-03', programmeId: 'p2', sets: [], notes: '', notePath: '' });
    expect(store.getLastProgrammeDate('p1')).toBe('2026-10-02');
  });
});

describe('active session file', () => {
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
});
