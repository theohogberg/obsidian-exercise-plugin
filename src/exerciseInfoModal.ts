import { App, Modal } from 'obsidian';
import { Exercise } from './types';
import { GymStore } from './store';
import { renderExerciseMedia } from './exerciseMedia';

/** How to perform an exercise: media (images now, a 3D model later), cues and instructions. */
export class ExerciseInfoModal extends Modal {
  private store: GymStore;
  private exercise: Exercise;
  private stopMedia: () => void = () => {};

  constructor(app: App, store: GymStore, exercise: Exercise) {
    super(app);
    this.store = store;
    this.exercise = exercise;
  }

  onOpen() {
    const { contentEl } = this;
    const ex = this.exercise;
    contentEl.empty();
    contentEl.addClass('gym-info-modal');

    contentEl.createEl('h2', { text: ex.name });
    contentEl.createDiv({ text: `${ex.muscleGroup} · ${ex.equipment}`, cls: 'gym-exercise-meta' });

    const mediaEl = contentEl.createDiv('gym-media-container');
    this.stopMedia = renderExerciseMedia(this.app, this.store.media, mediaEl, ex.media ?? [], ex.name);

    if (ex.notes.trim()) {
      contentEl.createEl('h3', { text: 'Cues' });
      contentEl.createEl('p', { text: ex.notes, cls: 'gym-cues' });
    }

    const steps = ex.instructions ?? [];
    if (ex.setup || steps.length > 0) {
      contentEl.createEl('h3', { text: 'How to do it' });
      if (ex.setup) {
        const setup = contentEl.createEl('p', { cls: 'gym-setup' });
        setup.createEl('strong', { text: 'Setup:' });
        setup.appendText(` ${ex.setup}`);
      }
      const list = contentEl.createEl('ol', 'gym-instructions');
      steps.forEach(step => list.createEl('li', { text: step }));
    }
  }

  onClose() {
    this.stopMedia();
    this.contentEl.empty();
  }
}
