import { App, Modal, Setting } from 'obsidian';
import type GymPlugin from './main';
import { GymStore } from './store';
import { ExerciseEditorModal } from './exerciseModal';
import { ProgrammeEditorModal } from './programmeModal';
import { confirmAction } from './pickers';

export class LibraryModal extends Modal {
  private plugin: GymPlugin;
  private store: GymStore;

  constructor(app: App, plugin: GymPlugin) {
    super(app);
    this.plugin = plugin;
    this.store = plugin.store;
  }

  onOpen() { this.render(); }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    this.renderProgrammes(contentEl);
    this.renderExercises(contentEl);
  }

  private renderProgrammes(el: HTMLElement) {
    const header = el.createDiv('gym-section-header');
    header.createEl('h3', { text: 'Programmes' });
    const addBtn = header.createEl('button', { text: 'New programme' });
    addBtn.addEventListener('click', () => {
      new ProgrammeEditorModal(this.app, this.store, null, () => this.render()).open();
    });

    const programmes = this.store.getProgrammes();
    if (programmes.length === 0) {
      el.createEl('p', { text: 'No programmes yet.', cls: 'gym-empty' });
      return;
    }

    programmes.forEach(p => {
      const names = p.exercises
      .map(e => this.store.getExercise(e.exerciseId)?.name)
      .filter((n): n is string => !!n)
      .join(', ');

      new Setting(el)
      .setName(p.name)
      .setDesc(names || 'No exercises')
      .addButton(b => b.setButtonText('Start').setCta().onClick(() => {
        this.close();
        void this.plugin.startSession(p);
      }))
      .addButton(b => b.setIcon('pencil').setTooltip('Edit').onClick(() => {
        new ProgrammeEditorModal(this.app, this.store, p, () => this.render()).open();
      }))
      .addButton(b => b.setIcon('trash').setTooltip('Delete').setWarning().onClick(() => {
        void this.deleteProgramme(p.id, p.name);
      }));
    });
  }

  private renderExercises(el: HTMLElement) {
    const header = el.createDiv('gym-section-header');
    header.createEl('h3', { text: 'Exercises' });
    const addBtn = header.createEl('button', { text: 'New exercise' });
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
      .addButton(b => b.setIcon('trash').setTooltip('Delete').setWarning().onClick(() => {
        void this.deleteExercise(ex.id, ex.name);
      }));
    });
  }

  private async deleteProgramme(id: string, name: string) {
    if (!(await confirmAction(this.app, `Delete the programme "${name}"?`, 'Delete'))) return;
    this.store.deleteProgramme(id);
    await this.store.save();
    this.render();
  }

  private async deleteExercise(id: string, name: string) {
    const message = `Delete "${name}"? It will be removed from every programme and its history will be lost. Session notes are kept.`;
    if (!(await confirmAction(this.app, message, 'Delete'))) return;
    this.store.deleteExercise(id);
    await this.store.save();
    this.render();
  }

  onClose() { this.contentEl.empty(); }
}
