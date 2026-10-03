import { App, normalizePath } from 'obsidian';
import { Exercise, GymData, Programme } from './types';

const DATA_PATH = '.gym/exercises.json';

export class GymStore {
  private app: App;
  private data: GymData = { exercises: [], programmes: [] };

  constructor(app: App) {
    this.app = app;
  }

  async load(): Promise<void> {
    try {
      const path = normalizePath(DATA_PATH);
      if (await this.app.vault.adapter.exists(path)) {
        const raw = await this.app.vault.adapter.read(path);
        // `templates` is the pre-rename key for programmes
        const parsed = JSON.parse(raw) as Partial<GymData> & { templates?: Programme[] };
        this.data = {
          exercises: parsed.exercises ?? [],
          programmes: parsed.programmes ?? parsed.templates ?? [],
        };
      }
    } catch {
      this.data = { exercises: [], programmes: [] };
    }
  }

  async save(): Promise<void> {
    const dir = normalizePath('.gym');
    const path = normalizePath(DATA_PATH);
    if (!(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
    await this.app.vault.adapter.write(path, JSON.stringify(this.data, null, 2));
  }

  getExercises(): Exercise[] { return this.data.exercises; }
  getProgrammes(): Programme[] { return this.data.programmes; }

  upsertExercise(exercise: Exercise): void {
    const idx = this.data.exercises.findIndex(e => e.id === exercise.id);
    if (idx >= 0) this.data.exercises[idx] = exercise;
    else this.data.exercises.push(exercise);
  }

  deleteExercise(id: string): void {
    this.data.exercises = this.data.exercises.filter(e => e.id !== id);
    this.data.programmes.forEach(t => {
      t.entries = t.entries.filter(e => e.exerciseId !== id);
    });
  }

  upsertProgramme(programme: Programme): void {
    const idx = this.data.programmes.findIndex(t => t.id === programme.id);
    if (idx >= 0) this.data.programmes[idx] = programme;
    else this.data.programmes.push(programme);
  }

  deleteProgramme(id: string): void {
    this.data.programmes = this.data.programmes.filter(t => t.id !== id);
  }
}
