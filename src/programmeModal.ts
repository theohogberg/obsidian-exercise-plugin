import { App, Modal, Notice, Setting } from 'obsidian';
import { Programme, ProgrammeEntry } from './types';
import { GymStore } from './store';

export class ProgrammeEditorModal extends Modal {
  private store: GymStore;
  private programme: Programme;
  private entryMap: Map<string, ProgrammeEntry>;
  private selectedIds: Set<string>;
  private onSave: () => void;

  constructor(app: App, store: GymStore, programme: Programme | null, onSave: () => void) {
    super(app);
    this.store = store;
    this.onSave = onSave;

    if (programme) {
      this.programme = { id: programme.id, name: programme.name, entries: [] };
      this.selectedIds = new Set(programme.entries.map(e => e.exerciseId));
      this.entryMap = new Map(programme.entries.map(e => [e.exerciseId, { ...e }]));
    } else {
      this.programme = { id: crypto.randomUUID(), name: '', entries: [] };
      this.selectedIds = new Set();
      this.entryMap = new Map();
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.programme.name ? 'Edit programme' : 'New programme' });

    new Setting(contentEl).setName('Programme name')
    .addText(t => t.setValue(this.programme.name)
           .onChange(v => { this.programme.name = v; }));

           contentEl.createEl('h3', { text: 'Select exercises' });

           const exercises = this.store.getExercises();
           if (exercises.length === 0) {
             contentEl.createEl('p', { text: 'No exercises in library. Add exercises first.', cls: 'gym-empty' });
           }

           exercises.forEach(ex => {
             if (!this.entryMap.has(ex.id)) {
               this.entryMap.set(ex.id, {
                 exerciseId: ex.id,
                 sets: ex.defaultSets,
                 reps: ex.defaultReps,
                 weight: ex.defaultWeight,
               });
             }
             const entry = this.entryMap.get(ex.id)!;

             new Setting(contentEl)
             .setName(ex.name)
             .setDesc(ex.muscleGroup)
             .addToggle(t => t.setValue(this.selectedIds.has(ex.id)).onChange(v => {
               if (v) this.selectedIds.add(ex.id);
               else this.selectedIds.delete(ex.id);
             }))
             .addText(t => t.setPlaceholder('Sets').setValue(String(entry.sets))
                      .onChange(v => { entry.sets = Math.max(1, parseInt(v) || 1); }))
                      .addText(t => t.setPlaceholder('Reps').setValue(String(entry.reps))
                               .onChange(v => { entry.reps = Math.max(1, parseInt(v) || 1); }))
                               .addText(t => t.setPlaceholder('Weight').setValue(String(entry.weight))
                                        .onChange(v => { entry.weight = parseFloat(v) || 0; }));
           });

           new Setting(contentEl)
           .addButton(b => b.setButtonText('Save').setCta().onClick(async () => {
             const name = this.programme.name.trim();
             if (!name) { new Notice('Programme name is required'); return; }
             if (this.selectedIds.size === 0) { new Notice('Select at least one exercise'); return; }
             this.programme.name = name;
             this.programme.entries = Array.from(this.selectedIds).map(id => this.entryMap.get(id)!);
             this.store.upsertProgramme(this.programme);
             await this.store.save();
             this.onSave();
             this.close();
           }))
           .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
  }

  onClose() { this.contentEl.empty(); }
}
