import { App, Modal, Setting } from 'obsidian';
import { GymStore } from './store';
import { ExerciseEditorModal } from './exerciseModal';
import { ProgrammeEditorModal } from './programmeModal';

export class LibraryModal extends Modal {
  private store: GymStore;

  constructor(app: App, store: GymStore) {
    super(app);
    this.store = store;
  }

  onOpen() { this.render(); }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Exercise Library' });
    this.renderExercises(contentEl);
    this.renderProgrammes(contentEl);
  }

  private renderExercises(el: HTMLElement) {
    const header = el.createDiv('gym-section-header');
    header.createEl('h3', { text: 'Exercises' });
    const addBtn = header.createEl('button', { text: '+ Add Exercise' });
    addBtn.addEventListener('click', () => {
      new ExerciseEditorModal(this.app, this.store, null, () => this.render()).open();
    });

    const exercises = this.store.getExercises();
    if (exercises.length === 0) {
      el.createEl('p', { text: 'No exercises yet.', cls: 'gym-empty' });
      return;
    }

    exercises.forEach(ex => {
      new Setting(el)
      .setName(ex.name)
      .setDesc(`${ex.muscleGroup} · ${ex.equipment}`)
      .addButton(b => b.setIcon('pencil').setTooltip('Edit').onClick(() => {
        new ExerciseEditorModal(this.app, this.store, ex, () => this.render()).open();
      }))
      .addButton(b => b.setIcon('trash').setTooltip('Delete').setWarning().onClick(async () => {
        this.store.deleteExercise(ex.id);
        await this.store.save();
        this.render();
      }));
    });
  }

  private renderProgrammes(el: HTMLElement) {
    const header = el.createDiv('gym-section-header');
    header.createEl('h3', { text: 'Programmes' });
    const addBtn = header.createEl('button', { text: '+ New programme' });
    addBtn.addEventListener('click', () => {
      new ProgrammeEditorModal(this.app, this.store, null, () => this.render()).open();
    });

    const programmes = this.store.getProgrammes();
    if (programmes.length === 0) {
      el.createEl('p', { text: 'No programmes yet.', cls: 'gym-empty' });
      return;
    }

    const exercises = this.store.getExercises();
    programmes.forEach(t => {
      const names = t.entries
      .map(e => exercises.find(ex => ex.id === e.exerciseId)?.name)
      .filter((n): n is string => !!n)
      .join(', ');

      new Setting(el)
      .setName(t.name)
      .setDesc(names || 'No exercises')
      .addButton(b => b.setIcon('pencil').setTooltip('Edit').onClick(() => {
        new ProgrammeEditorModal(this.app, this.store, t, () => this.render()).open();
      }))
      .addButton(b => b.setIcon('trash').setTooltip('Delete').setWarning().onClick(async () => {
        this.store.deleteProgramme(t.id);
        await this.store.save();
        this.render();
      }));
    });
  }

  onClose() { this.contentEl.empty(); }
}
