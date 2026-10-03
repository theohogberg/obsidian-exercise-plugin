import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, GymPluginSettings, GymSettingsTab } from './settings';
import { ExerciseStore } from './exercises';
import { SessionBuilderModal } from './sessionModal';
import { LibraryModal } from './libraryModal';

export default class GymPlugin extends Plugin {
  settings!: GymPluginSettings;
  store!: ExerciseStore;

  async onload() {
    await this.loadSettings();
    this.store = new ExerciseStore(this.app);
    await this.store.load();

    this.addRibbonIcon('dumbbell', 'New gym session', () => {
      new SessionBuilderModal(this.app, this.settings, this.store).open();
    });

    this.addCommand({
      id: 'gym-new-session',
      name: 'New session',
      callback: () => new SessionBuilderModal(this.app, this.settings, this.store).open(),
    });

      this.addCommand({
        id: 'gym-manage-exercises',
        name: 'Manage exercises',
        callback: () => new LibraryModal(this.app, this.store).open(),
      });

        this.addSettingTab(new GymSettingsTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<GymPluginSettings>);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
