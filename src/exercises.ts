import { App, normalizePath } from 'obsidian';
import { Exercise, GymData, WorkoutTemplate } from './types';

const DATA_PATH = '.gym/exercises.json';

export class ExerciseStore {
  private app: App;
  private data: GymData = { exercises: [], templates: [] };

  constructor(app: App) {
    this.app = app;
  }

  async load(): Promise<void> {
    try {
      const path = normalizePath(DATA_PATH);
      if (await this.app.vault.adapter.exists(path)) {
        const raw = await this.app.vault.adapter.read(path);
        const parsed = JSON.parse(raw) as Partial<GymData>;
        this.data = {
          exercises: parsed.exercises ?? [],
          templates: parsed.templates ?? [],
        };
      }
    } catch {
      this.data = { exercises: [], templates: [] };
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
  getTemplates(): WorkoutTemplate[] { return this.data.templates; }

  upsertExercise(exercise: Exercise): void {
    const idx = this.data.exercises.findIndex(e => e.id === exercise.id);
    if (idx >= 0) this.data.exercises[idx] = exercise;
    else this.data.exercises.push(exercise);
  }

  deleteExercise(id: string): void {
    this.data.exercises = this.data.exercises.filter(e => e.id !== id);
    this.data.templates.forEach(t => {
      t.entries = t.entries.filter(e => e.exerciseId !== id);
    });
  }

  upsertTemplate(template: WorkoutTemplate): void {
    const idx = this.data.templates.findIndex(t => t.id === template.id);
    if (idx >= 0) this.data.templates[idx] = template;
    else this.data.templates.push(template);
  }

  deleteTemplate(id: string): void {
    this.data.templates = this.data.templates.filter(t => t.id !== id);
  }
}
