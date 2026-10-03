import { App, Modal, Notice, Setting } from 'obsidian';
import { Equipment, EQUIPMENT_TYPES, Exercise, MUSCLE_GROUPS, MuscleGroup } from './types';
import { ExerciseStore } from './exercises';

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export class ExerciseEditorModal extends Modal {
  private store: ExerciseStore;
  private exercise: Exercise;
  private onSave: () => void;

  constructor(app: App, store: ExerciseStore, exercise: Exercise | null, onSave: () => void) {
    super(app);
    this.store = store;
    this.onSave = onSave;
    this.exercise = exercise ? { ...exercise } : {
      id: crypto.randomUUID(),
      name: '',
      muscleGroup: 'chest',
      equipment: 'barbell',
      defaultSets: 3,
      defaultReps: 8,
      defaultWeight: 0,
      notes: '',
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: this.exercise.name ? 'Edit Exercise' : 'New Exercise' });

    new Setting(contentEl).setName('Name')
    .addText(t => t.setValue(this.exercise.name)
             .onChange(v => { this.exercise.name = v; }));

             new Setting(contentEl).setName('Muscle group')
             .addDropdown(d => {
               MUSCLE_GROUPS.forEach(g => d.addOption(g, cap(g)));
               d.setValue(this.exercise.muscleGroup);
               d.onChange(v => { this.exercise.muscleGroup = v as MuscleGroup; });
             });

             new Setting(contentEl).setName('Equipment')
             .addDropdown(d => {
               EQUIPMENT_TYPES.forEach(e => d.addOption(e, cap(e)));
               d.setValue(this.exercise.equipment);
               d.onChange(v => { this.exercise.equipment = v as Equipment; });
             });

             new Setting(contentEl).setName('Default sets')
             .addText(t => t.setValue(String(this.exercise.defaultSets))
                      .onChange(v => { this.exercise.defaultSets = Math.max(1, parseInt(v) || 1); }));

                      new Setting(contentEl).setName('Default reps')
                      .addText(t => t.setValue(String(this.exercise.defaultReps))
                               .onChange(v => { this.exercise.defaultReps = Math.max(1, parseInt(v) || 1); }));

                               new Setting(contentEl).setName('Default weight')
                               .addText(t => t.setValue(String(this.exercise.defaultWeight))
                                        .onChange(v => { this.exercise.defaultWeight = parseFloat(v) || 0; }));

                                        new Setting(contentEl).setName('Notes')
                                        .addTextArea(t => t.setValue(this.exercise.notes)
                                                     .onChange(v => { this.exercise.notes = v; }));

                                                     new Setting(contentEl)
                                                     .addButton(b => b.setButtonText('Save').setCta().onClick(async () => {
                                                       const name = this.exercise.name.trim();
                                                       if (!name) { new Notice('Name is required'); return; }
                                                       this.exercise.name = name;
                                                       this.store.upsertExercise(this.exercise);
                                                       await this.store.save();
                                                       this.onSave();
                                                       this.close();
                                                     }))
                                                     .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()));
  }

  onClose() { this.contentEl.empty(); }
}
