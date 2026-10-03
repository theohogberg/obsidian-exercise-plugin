import { App, FuzzySuggestModal, Modal, Setting } from 'obsidian';
import { Exercise } from './types';

export class ExercisePickerModal extends FuzzySuggestModal<Exercise> {
  constructor(app: App, private exercises: Exercise[], private onChoose: (e: Exercise) => void) {
    super(app);
    this.setPlaceholder('Add an exercise…');
  }

  getItems(): Exercise[] { return this.exercises; }
  // Including the muscle group lets you search e.g. "chest"
  getItemText(e: Exercise): string { return `${e.name} (${e.muscleGroup})`; }
  onChooseItem(e: Exercise): void { this.onChoose(e); }
}

/** Resolves true on confirm, false on cancel or close. */
export function confirmAction(app: App, message: string, confirmText: string): Promise<boolean> {
  return new Promise(resolve => {
    let resolved = false;
    const finish = (modal: Modal, value: boolean) => {
      resolved = true;
      resolve(value);
      modal.close();
    };

    class ConfirmModal extends Modal {
      onOpen() {
        this.contentEl.createEl('p', { text: message });
        new Setting(this.contentEl)
        .addButton(b => b.setButtonText(confirmText).setWarning().onClick(() => finish(this, true)))
        .addButton(b => b.setButtonText('Cancel').onClick(() => finish(this, false)));
      }
      onClose() {
        this.contentEl.empty();
        if (!resolved) resolve(false);
      }
    }

    new ConfirmModal(app).open();
  });
}
