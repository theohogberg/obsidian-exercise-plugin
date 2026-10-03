import { App, PluginSettingTab, Setting } from 'obsidian';
import type GymPlugin from './main';

export interface GymPluginSettings {
  sessionsFolder: string;
  weightUnit: 'kg' | 'lbs';
  openAfterSave: boolean;
}

export const DEFAULT_SETTINGS: GymPluginSettings = {
  sessionsFolder: 'Gym/Sessions',
  weightUnit: 'kg',
  openAfterSave: true,
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
    containerEl.createEl('h2', { text: 'Gym Plugin Settings' });

    new Setting(containerEl)
    .setName('Sessions folder')
    .setDesc('Folder where workout notes are saved')
    .addText(t => t
             .setPlaceholder('Gym/Sessions')
             .setValue(this.plugin.settings.sessionsFolder)
             .onChange(async v => {
               this.plugin.settings.sessionsFolder = v.trim() || 'Gym/Sessions';
               await this.plugin.saveSettings();
             }));

             new Setting(containerEl)
             .setName('Weight unit')
             .addDropdown(d => d
                          .addOption('kg', 'kg')
                          .addOption('lbs', 'lbs')
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
  }
}
