import { Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, GymPluginSettings, GymSettingsTab } from './settings';
import { GymStore } from './store';
import { LibraryModal } from './libraryModal';
import { ProgrammePickerModal, confirmAction } from './pickers';
import { createSession } from './session';
import { SessionView, VIEW_TYPE_SESSION } from './sessionView';
import { Exercise, Programme } from './types';
import { webMediaUrls } from './mediaCache';

export default class GymPlugin extends Plugin {
  settings!: GymPluginSettings;
  store!: GymStore;

  async onload() {
    await this.loadSettings();
    this.store = new GymStore(this.app);
    await this.store.load();

    this.registerView(VIEW_TYPE_SESSION, leaf => new SessionView(leaf, this));

    this.addRibbonIcon('dumbbell', 'Start programme', () => this.pickProgramme());

    // Keeps the old "New session" id so existing hotkeys still work
    this.addCommand({
      id: 'gym-new-session',
      name: 'Start programme',
      callback: () => this.pickProgramme(),
    });

    this.addCommand({
      id: 'gym-start-empty-session',
      name: 'Start empty session',
      callback: () => { void this.startSession(null); },
    });

    this.addCommand({
      id: 'gym-open-session',
      name: 'Open current workout',
      callback: () => { void this.openSessionView(); },
    });

    this.addCommand({
      id: 'gym-manage-exercises',
      name: 'Manage programmes and exercises',
      callback: () => new LibraryModal(this.app, this).open(),
    });

    this.addCommand({
      id: 'gym-add-default-exercises',
      name: 'Add default exercises',
      callback: () => { void this.addDefaultExercises(); },
    });

    this.addCommand({
      id: 'gym-download-images',
      name: 'Download exercise images for offline use',
      callback: () => { void this.downloadExerciseImages(this.store.getExercises()); },
    });

    this.addSettingTab(new GymSettingsTab(this.app, this));

    // Reopen an unfinished workout, e.g. after Obsidian was closed mid-session
    this.app.workspace.onLayoutReady(() => {
      if (this.store.seededExercises.length > 0) void this.downloadExerciseImages(this.store.seededExercises);
      void this.store.loadActiveSession().then(session => {
        if (session && this.app.workspace.getLeavesOfType(VIEW_TYPE_SESSION).length === 0) {
          void this.openSessionView();
        }
      });
    });
  }

  onunload() {}

  pickProgramme(): void {
    const programmes = this.store.getProgrammes();
    if (programmes.length === 0) {
      new Notice('No programmes yet. Create one in the programme manager first.');
      return;
    }
    new ProgrammePickerModal(this.app, programmes, p => { void this.startSession(p); }).open();
  }

  async addDefaultExercises(): Promise<void> {
    const added = this.store.addDefaultExercises();
    await this.store.save();
    new Notice(added.length > 0 ? `Added ${added.length} exercises` : 'All default exercises are already in your library');
    if (added.length > 0) await this.downloadExerciseImages(added);
  }

  /** Save local copies of these exercises' web images, so they work offline. */
  async downloadExerciseImages(exercises: Exercise[]): Promise<void> {
    const urls = webMediaUrls(exercises);
    if (urls.length === 0) {
      new Notice('No exercise images to download');
      return;
    }
    new Notice(`Downloading ${urls.length} exercise images…`);
    const { downloaded, failed } = await this.store.media.downloadAll(urls);
    new Notice(failed > 0
      ? `${downloaded} exercise images are available offline; ${failed} couldn't be downloaded`
      : `${downloaded} exercise images are available offline`);
  }

  async startSession(programme: Programme | null): Promise<void> {
    if (await this.store.loadActiveSession()) {
      const replace = await confirmAction(this.app, 'A workout is already in progress. Discard it and start a new one?', 'Discard and start');
      if (!replace) {
        await this.openSessionView();
        return;
      }
    }
    const session = createSession(this.store, programme, this.settings.prefillFrom);
    await this.store.saveActiveSession(session);
    const view = await this.openSessionView();
    view?.setSession(session);
  }

  async openSessionView(): Promise<SessionView | null> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_SESSION)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_SESSION, active: true });
    }
    await workspace.revealLeaf(leaf);
    return leaf.view instanceof SessionView ? leaf.view : null;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<GymPluginSettings>);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
