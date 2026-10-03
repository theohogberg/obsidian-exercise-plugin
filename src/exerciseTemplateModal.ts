import { App, Modal, Notice, Setting } from 'obsidian';
import { TemplateEntry, WorkoutTemplate } from './types';
import { ExerciseStore } from './exercises';

export class ExerciseTemplateModal extends Modal {
  private store: ExerciseStore;
  private template: WorkoutTemplate;
  private entryMap: Map<string, TemplateEntry>;
  private selectedIds: Set<string>;
  private onSave: () => void;

  constructor(app: App, store: ExerciseStore, template: WorkoutTemplate | null, onSave: () => void) {
    super(app);
    this.store = store;
    this.onSave = onSave;

    if (template) {
      this.template = { id: template.id, name: template.name, entries: [] };
      this.selectedIds = new Set(template.entries.map(e => e.exerciseId));
      this.entryMap = new Map(template.entries.map(e => [e.exerciseId, { ...e }]));
    } else {
      this.template = { id: crypto.randomUUID(), name: '', entries: [] };
      this.selectedIds = new Set();
      this.entryMap = new Map();
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.template.name ? 'Edit Template' : 'New Template' });

    new Setting(contentEl).setName('Template name')
    .addText(t => t.setValue(this.template.name)
           .onChange(v => { this.template.name = v; }));

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
             const name = this.template.name.trim();
             if (!name) { new Notice('Template name is required'); return; }
             if (this.selectedIds.size === 0) { new Notice('Select at least one exercise'); return; }
             this.template.name = name;
             this.template.entries = Array.from(this.selectedIds).map(id => this.entryMap.get(id)!);
             this.store.upsertTemplate(this.template);
             await this.store.save();
             this.onSave();
             this.close();
           }))
           .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
  }

  onClose() { this.contentEl.empty(); }
}
