import { App, Modal, Setting } from 'obsidian';
import { ExerciseStore } from './exercises';
import { ExerciseEditorModal } from './exerciseModal';
import { ExerciseTemplateModal } from './exerciseTemplateModal';

export class LibraryModal extends Modal {
  private store: ExerciseStore;

  constructor(app: App, store: ExerciseStore) {
    super(app);
    this.store = store;
  }

  onOpen() { this.render(); }

  private render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Exercise Library' });
    this.renderExercises(contentEl);
    this.renderTemplates(contentEl);
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

  private renderTemplates(el: HTMLElement) {
    const header = el.createDiv('gym-section-header');
    header.createEl('h3', { text: 'Templates' });
    const addBtn = header.createEl('button', { text: '+ New Template' });
    addBtn.addEventListener('click', () => {
      new ExerciseTemplateModal(this.app, this.store, null, () => this.render()).open();
    });

    const templates = this.store.getTemplates();
    if (templates.length === 0) {
      el.createEl('p', { text: 'No templates yet.', cls: 'gym-empty' });
      return;
    }

    const exercises = this.store.getExercises();
    templates.forEach(t => {
      const names = t.entries
      .map(e => exercises.find(ex => ex.id === e.exerciseId)?.name)
      .filter((n): n is string => !!n)
      .join(', ');

      new Setting(el)
      .setName(t.name)
      .setDesc(names || 'No exercises')
      .addButton(b => b.setIcon('pencil').setTooltip('Edit').onClick(() => {
        new ExerciseTemplateModal(this.app, this.store, t, () => this.render()).open();
      }))
      .addButton(b => b.setIcon('trash').setTooltip('Delete').setWarning().onClick(async () => {
        this.store.deleteTemplate(t.id);
        await this.store.save();
        this.render();
      }));
    });
  }

  onClose() { this.contentEl.empty(); }
}
