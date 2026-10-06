import { App, PluginSettingTab, Setting } from 'obsidian';
import type GymPlugin from './main';
import { PrefillFrom, WeightUnit } from './types';

export interface GymPluginSettings {
  sessionsFolder: string;
  weightUnit: WeightUnit;
  openAfterSave: boolean;
  prefillFrom: PrefillFrom;
  restTimerEnabled: boolean;
  restSeconds: number;
}

export const DEFAULT_SETTINGS: GymPluginSettings = {
  sessionsFolder: 'Gym/Sessions',
  weightUnit: 'kg',
  openAfterSave: true,
  prefillFrom: 'exercise',
  restTimerEnabled: true,
  restSeconds: 90,
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
    const settings = this.plugin.settings;

    new Setting(containerEl)
    .setName('Sessions folder')
    .setDesc('Folder where workout notes are saved')
    .addText(t => t
             .setPlaceholder(DEFAULT_SETTINGS.sessionsFolder)
             .setValue(settings.sessionsFolder)
             .onChange(async v => {
               settings.sessionsFolder = v.trim() || DEFAULT_SETTINGS.sessionsFolder;
               await this.plugin.saveSettings();
             }));

    new Setting(containerEl)
    .setName('Weight unit')
    .addDropdown(d => d
                 .addOption('kg', 'Kilograms (kg)')
                 .addOption('lbs', 'Pounds (lbs)')
                 .setValue(settings.weightUnit)
                 .onChange(async v => {
                   settings.weightUnit = v as WeightUnit;
                   await this.plugin.saveSettings();
                 }));

    new Setting(containerEl)
    .setName('Open note after saving')
    .setDesc('Open the workout note when you finish a workout')
    .addToggle(t => t
               .setValue(settings.openAfterSave)
               .onChange(async v => {
                 settings.openAfterSave = v;
                 await this.plugin.saveSettings();
               }));

    new Setting(containerEl)
    .setName('Prefill from')
    .setDesc('Which previous workout fills in the weights and reps when you start a programme')
    .addDropdown(d => d
                 .addOption('exercise', 'Last time the exercise was done')
                 .addOption('programme', 'Last time it was done in this programme')
                 .setValue(settings.prefillFrom)
                 .onChange(async v => {
                   settings.prefillFrom = v as PrefillFrom;
                   await this.plugin.saveSettings();
                 }));

    new Setting(containerEl)
    .setName('Timer between sets')
    .setDesc('Show a rest button at the top of the workout; it beeps when the time is up')
    .addToggle(t => t
               .setValue(settings.restTimerEnabled)
               .onChange(async v => {
                 settings.restTimerEnabled = v;
                 await this.plugin.saveSettings();
               }));

    new Setting(containerEl)
    .setName('Time between sets')
    .setDesc('How long the timer runs, in seconds')
    .addText(t => {
      t.inputEl.type = 'number';
      t.inputEl.min = '5';
      t.setValue(String(settings.restSeconds))
      .onChange(async v => {
        settings.restSeconds = Math.max(5, parseInt(v) || DEFAULT_SETTINGS.restSeconds);
        await this.plugin.saveSettings();
      });
    });
  }
}
