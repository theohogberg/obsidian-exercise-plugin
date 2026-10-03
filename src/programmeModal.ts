import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import { Programme, ProgrammeExercise } from './types';
import { GymStore } from './store';
import { ExercisePickerModal } from './pickers';
import { defaultProgrammeValues } from './session';

export class ProgrammeEditorModal extends Modal {
  private store: GymStore;
  private programme: Programme;
  private onSave: () => void;
  private listEl!: HTMLElement;

  constructor(app: App, store: GymStore, programme: Programme | null, onSave: () => void) {
    super(app);
    this.store = store;
    this.onSave = onSave;
    // Edit a copy so Cancel leaves the stored programme untouched
    this.programme = programme
      ? { id: programme.id, name: programme.name, exercises: programme.exercises.map(e => ({ ...e })) }
      : { id: crypto.randomUUID(), name: '', exercises: [] };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('gym-programme-modal', 'gym-form');
    contentEl.createEl('h2', { text: this.programme.name ? 'Edit programme' : 'New programme' });

    new Setting(contentEl).setName('Programme name')
    .addText(t => t.setValue(this.programme.name)
             .onChange(v => { this.programme.name = v; }));

    contentEl.createEl('p', {
      text: 'Sets and reps update to what you did each time you finish this programme.',
      cls: 'gym-exercise-meta',
    });

    this.listEl = contentEl.createDiv('gym-programme-list');
    this.renderList();

    const addRow = contentEl.createDiv('gym-action-row');
    const addBtn = addRow.createEl('button', { text: 'Add exercise' });
    addBtn.addEventListener('click', () => this.addExercise());

    new Setting(contentEl)
    .addButton(b => b.setButtonText('Save').setCta().onClick(() => { void this.save(); }))
    .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
  }

  private renderList() {
    const el = this.listEl;
    el.empty();
    const items = this.programme.exercises;
    if (items.length === 0) {
      el.createEl('p', { text: 'No exercises yet.', cls: 'gym-empty' });
      return;
    }

    const header = el.createDiv('gym-programme-row gym-set-header');
    ['Exercise', 'Sets', 'Reps', ''].forEach(h => header.createSpan({ text: h }));

    items.forEach((pe, idx) => {
      const row = el.createDiv('gym-programme-row');
      const name = this.store.getExercise(pe.exerciseId)?.name ?? 'Unknown exercise';
      row.createSpan({ text: `${idx + 1}. ${name}`, cls: 'gym-exercise-name', attr: { title: name } });
      this.numberInput(row, pe.sets, v => { pe.sets = v; });
      this.numberInput(row, pe.reps, v => { pe.reps = v; });

      const btns = row.createDiv('gym-card-btns');
      this.iconButton(btns, 'arrow-up', 'Move up', idx === 0, () => this.move(idx, -1));
      this.iconButton(btns, 'arrow-down', 'Move down', idx === items.length - 1, () => this.move(idx, 1));
      this.iconButton(btns, 'x', 'Remove', false, () => {
        items.splice(idx, 1);
        this.renderList();
      });
    });
  }

  private numberInput(parent: HTMLElement, value: number, set: (v: number) => void) {
    const input = parent.createEl('input', { type: 'number', attr: { min: '1', step: '1', inputmode: 'numeric' } });
    input.value = String(value);
    input.addEventListener('change', () => { set(Math.max(1, parseInt(input.value) || 1)); });
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, disabled: boolean, onClick: () => void) {
    const btn = parent.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
    setIcon(btn, icon);
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
  }

  private move(idx: number, delta: number) {
    const items = this.programme.exercises;
    const a = items[idx];
    const b = items[idx + delta];
    if (!a || !b) return;
    items[idx] = b;
    items[idx + delta] = a;
    this.renderList();
  }

  private addExercise() {
    const present = new Set(this.programme.exercises.map(e => e.exerciseId));
    const available = this.store.getExercises().filter(e => !present.has(e.id));
    if (available.length === 0) {
      new Notice(this.store.getExercises().length === 0
        ? 'Add exercises to the library first'
        : 'Every exercise is already in this programme');
      return;
    }
    new ExercisePickerModal(this.app, available, exercise => {
      const entry: ProgrammeExercise = { exerciseId: exercise.id, ...defaultProgrammeValues(this.store, exercise.id) };
      this.programme.exercises.push(entry);
      this.renderList();
    }).open();
  }

  private async save() {
    const name = this.programme.name.trim();
    if (!name) { new Notice('Programme name is required'); return; }
    if (this.programme.exercises.length === 0) { new Notice('Add at least one exercise'); return; }
    this.programme.name = name;
    this.store.upsertProgramme(this.programme);
    await this.store.save();
    this.onSave();
    this.close();
  }

  onClose() { this.contentEl.empty(); }
}
