import { App, PluginSettingTab, Setting } from 'obsidian';
import type GymPlugin from './main';
import { PrefillFrom } from './types';

export interface GymPluginSettings {
  sessionsFolder: string;
  weightUnit: 'kg' | 'lbs';
  openAfterSave: boolean;
  prefillFrom: PrefillFrom;
}

export const DEFAULT_SETTINGS: GymPluginSettings = {
  sessionsFolder: 'Gym/Sessions',
  weightUnit: 'kg',
  openAfterSave: true,
  prefillFrom: 'exercise',
};

export class GymSettingsTab extends PluginSettingTab {
  plugin: GymPlugin;

  constructor(app: App, plugin: GymPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
    .setName('Sessions folder')
    .setDesc('Folder where workout notes are saved')
    .addText(t => t
             // eslint-disable-next-line obsidianmd/ui/sentence-case -- a folder path, not prose
             .setPlaceholder('Gym/Sessions')
             .setValue(this.plugin.settings.sessionsFolder)
             .onChange(async v => {
               this.plugin.settings.sessionsFolder = v.trim() || 'Gym/Sessions';
               await this.plugin.saveSettings();
             }));

             new Setting(containerEl)
             .setName('Weight unit')
             .addDropdown(d => d
                          .addOption('kg', 'Kilograms (kg)')
                          .addOption('lbs', 'Pounds (lbs)')
                          .setValue(this.plugin.settings.weightUnit)
                          .onChange(async v => {
                            this.plugin.settings.weightUnit = v as 'kg' | 'lbs';
                            await this.plugin.saveSettings();
                          }));

                          new Setting(containerEl)
                          .setName('Open note after saving')
                          .setDesc('Automatically open the workout note after saving a session')
                          .addToggle(t => t
                                     .setValue(this.plugin.settings.openAfterSave)
                                     .onChange(async v => {
                                       this.plugin.settings.openAfterSave = v;
                                       await this.plugin.saveSettings();
                                     }));

    new Setting(containerEl)
    .setName('Prefill from')
    .setDesc('Which previous workout fills in the weights and reps when you start a programme')
    .addDropdown(d => d
                 .addOption('exercise', 'Last time the exercise was done')
                 .addOption('programme', 'Last time it was done in this programme')
                 .setValue(this.plugin.settings.prefillFrom)
                 .onChange(async v => {
                   this.plugin.settings.prefillFrom = v as PrefillFrom;
                   await this.plugin.saveSettings();
                 }));
  }
}
