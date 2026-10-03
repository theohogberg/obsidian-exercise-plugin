import { App, moment, normalizePath, Notice } from 'obsidian';
import { DEFAULT_EXERCISES } from './defaultExercises';
import { MediaCache } from './mediaCache';
import { Exercise, ExerciseLog, GymData, PrefillFrom, Programme, ProgrammeExercise, Session } from './types';

const DATA_DIR = '.gym';
const DATA_PATH = '.gym/data.json';
const LEGACY_PATH = '.gym/exercises.json';
const ACTIVE_SESSION_PATH = '.gym/active-session.json';
const HISTORY_LIMIT = 20;

// Shape of .gym/exercises.json before the v2 redesign
interface LegacyExercise extends Exercise {
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
}

interface LegacyProgramme {
  id: string;
  name: string;
  entries?: { exerciseId: string; sets: number; reps: number }[];
}

interface LegacyData {
  exercises?: LegacyExercise[];
  programmes?: LegacyProgramme[];
  templates?: LegacyProgramme[]; // pre-rename key for programmes
}

function emptyData(): GymData {
  return { version: 2, exercises: [], programmes: [], history: {} };
}

export class GymStore {
  private app: App;
  private data: GymData = emptyData();
  // Set when the data file exists but can't be read, so save() never overwrites it
  private loadFailed = false;
  /** Local copies of exercise images in .gym/media/ */
  readonly media: MediaCache;
  /** Exercises added automatically by load(), so the plugin can fetch their images. */
  seededExercises: Exercise[] = [];

  constructor(app: App) {
    this.app = app;
    this.media = new MediaCache(app);
  }

  async load(): Promise<void> {
    const adapter = this.app.vault.adapter;
    const path = normalizePath(DATA_PATH);
    const legacyPath = normalizePath(LEGACY_PATH);
    try {
      if (await adapter.exists(path)) {
        const parsed = JSON.parse(await adapter.read(path)) as Partial<GymData>;
        this.data = {
          version: 2,
          exercises: parsed.exercises ?? [],
          programmes: parsed.programmes ?? [],
          history: parsed.history ?? {},
          defaultsAdded: parsed.defaultsAdded ?? false,
        };
      } else if (await adapter.exists(legacyPath)) {
        this.data = migrateLegacy(JSON.parse(await adapter.read(legacyPath)) as LegacyData);
      }
      // Every vault gets the default exercises once (skipping names it already has),
      // whether it's new or predates them
      let changed = false;
      if (!this.data.defaultsAdded) {
        this.seededExercises = this.addDefaultExercises();
        this.data.defaultsAdded = true;
        changed = true;
      }
      if (this.syncDefaultHowTo()) changed = true;
      if (changed) await this.save();
    } catch (e) {
      this.loadFailed = true;
      new Notice(`Gym: could not read ${DATA_DIR} data, changes won't be saved. ${(e as Error).message}`);
    }
  }

  async save(): Promise<void> {
    if (this.loadFailed) throw new Error('Gym data failed to load; not saving to avoid overwriting it');
    await this.ensureDir();
    await this.app.vault.adapter.write(normalizePath(DATA_PATH), JSON.stringify(this.data, null, 2));
  }

  private async ensureDir(): Promise<void> {
    const dir = normalizePath(DATA_DIR);
    if (!(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
  }

  getExercises(): Exercise[] { return this.data.exercises; }
  getExercise(id: string): Exercise | undefined { return this.data.exercises.find(e => e.id === id); }
  getProgrammes(): Programme[] { return this.data.programmes; }
  getProgramme(id: string): Programme | undefined { return this.data.programmes.find(p => p.id === id); }

  upsertExercise(exercise: Exercise): void {
    const idx = this.data.exercises.findIndex(e => e.id === exercise.id);
    if (idx >= 0) this.data.exercises[idx] = exercise;
    else this.data.exercises.push(exercise);
  }

  deleteExercise(id: string): void {
    this.data.exercises = this.data.exercises.filter(e => e.id !== id);
    this.data.programmes.forEach(p => {
      p.exercises = p.exercises.filter(e => e.exerciseId !== id);
    });
    delete this.data.history[id];
  }

  /** Default exercises not already in the library (matched by id or name). */
  getMissingDefaultExercises(): Exercise[] {
    const ids = new Set(this.data.exercises.map(e => e.id));
    const names = new Set(this.data.exercises.map(e => e.name.trim().toLowerCase()));
    return DEFAULT_EXERCISES.filter(e => !ids.has(e.id) && !names.has(e.name.toLowerCase()));
  }

  /**
   * A default exercise's setup and instructions can't be edited in the app, so keep
   * the stored copies in step with the built-in text when it changes. Returns true
   * if anything was updated. Other fields may have been edited and are left alone.
   */
  private syncDefaultHowTo(): boolean {
    const builtIn = new Map(DEFAULT_EXERCISES.map(e => [e.id, e]));
    let changed = false;
    for (const ex of this.data.exercises) {
      const def = builtIn.get(ex.id);
      if (!def) continue;
      if (ex.setup !== def.setup) {
        ex.setup = def.setup;
        changed = true;
      }
      if (JSON.stringify(ex.instructions ?? []) !== JSON.stringify(def.instructions ?? [])) {
        ex.instructions = [...(def.instructions ?? [])];
        changed = true;
      }
    }
    return changed;
  }

  /** Adds the missing default exercises and returns the ones added. */
  addDefaultExercises(): Exercise[] {
    // Copies, so edits never touch the DEFAULT_EXERCISES constants
    const added = this.getMissingDefaultExercises().map(e => JSON.parse(JSON.stringify(e)) as Exercise);
    this.data.exercises.push(...added);
    return added;
  }

  upsertProgramme(programme: Programme): void {
    const idx = this.data.programmes.findIndex(p => p.id === programme.id);
    if (idx >= 0) this.data.programmes[idx] = programme;
    else this.data.programmes.push(programme);
  }

  deleteProgramme(id: string): void {
    this.data.programmes = this.data.programmes.filter(p => p.id !== id);
  }

  /** Newest first. */
  getHistory(exerciseId: string): ExerciseLog[] {
    return this.data.history[exerciseId] ?? [];
  }

  /** The log a new session should be prefilled from, per the `prefillFrom` setting. */
  getLastLog(exerciseId: string, programmeId: string | null, prefillFrom: PrefillFrom): ExerciseLog | undefined {
    const history = this.getHistory(exerciseId);
    if (prefillFrom === 'programme' && programmeId) {
      const inProgramme = history.find(l => l.programmeId === programmeId);
      if (inProgramme) return inProgramme;
    }
    return history[0];
  }

  /** Date (YYYY-MM-DD) of the most recent finished session of a programme, if any. */
  getLastProgrammeDate(programmeId: string): string | undefined {
    let last: string | undefined;
    for (const logs of Object.values(this.data.history)) {
      for (const log of logs) {
        if (log.programmeId === programmeId && (!last || log.date > last)) last = log.date;
      }
    }
    return last;
  }

  addLog(exerciseId: string, log: ExerciseLog): void {
    this.data.history[exerciseId] = [log, ...this.getHistory(exerciseId)].slice(0, HISTORY_LIMIT);
  }

  async loadActiveSession(): Promise<Session | null> {
    const path = normalizePath(ACTIVE_SESSION_PATH);
    try {
      if (!(await this.app.vault.adapter.exists(path))) return null;
      return JSON.parse(await this.app.vault.adapter.read(path)) as Session;
    } catch {
      return null;
    }
  }

  async saveActiveSession(session: Session): Promise<void> {
    await this.ensureDir();
    await this.app.vault.adapter.write(normalizePath(ACTIVE_SESSION_PATH), JSON.stringify(session, null, 2));
  }

  async clearActiveSession(): Promise<void> {
    const path = normalizePath(ACTIVE_SESSION_PATH);
    if (await this.app.vault.adapter.exists(path)) {
      await this.app.vault.adapter.remove(path);
    }
  }
}

function migrateLegacy(legacy: LegacyData): GymData {
  const data = emptyData();
  const today = moment().format('YYYY-MM-DD');

  for (const ex of legacy.exercises ?? []) {
    data.exercises.push({
      id: ex.id,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      equipment: ex.equipment,
      notes: ex.notes ?? '',
    });
    // Old per-exercise defaults become the "last time" values, so nothing is lost
    const sets = ex.defaultSets ?? 0;
    if (sets > 0) {
      data.history[ex.id] = [{
        date: today,
        programmeId: null,
        sets: Array.from({ length: sets }, () => ({ weight: ex.defaultWeight ?? 0, reps: ex.defaultReps ?? 0 })),
        notes: '',
        notePath: '',
      }];
    }
  }

  for (const p of legacy.programmes ?? legacy.templates ?? []) {
    const exercises: ProgrammeExercise[] = (p.entries ?? []).map(e => ({
      exerciseId: e.exerciseId,
      sets: e.sets,
      reps: e.reps,
    }));
    data.programmes.push({ id: p.id, name: p.name, exercises });
  }

  return data;
}
