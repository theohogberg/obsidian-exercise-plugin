import { App, Modal, moment, Notice, Setting } from 'obsidian';
import { GymPluginSettings } from './settings';
import { MUSCLE_GROUPS, SessionExercise } from './types';
import { ExerciseStore } from './exercises';

export class SessionBuilderModal extends Modal {
  private settings: GymPluginSettings;
  private store: ExerciseStore;
  private selected: SessionExercise[] = [];
  private filterMuscle = 'all';
  private searchQuery = '';
  private libraryEl!: HTMLElement;
  private selectedEl!: HTMLElement;

  constructor(app: App, settings: GymPluginSettings, store: ExerciseStore) {
    super(app);
    this.settings = settings;
    this.store = store;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('gym-session-modal');
    contentEl.createEl('h2', { text: 'New Session' });

    this.renderTemplateRow(contentEl);
    this.renderFilters(contentEl);

    contentEl.createEl('h3', { text: 'Exercise Library' });
    this.libraryEl = contentEl.createDiv('gym-library');
    this.renderLibrary();

    contentEl.createEl('h3', { text: 'Session' });
    this.selectedEl = contentEl.createDiv('gym-selected');
    this.renderSelected();

    this.renderActions(contentEl);
  }

  private renderTemplateRow(el: HTMLElement) {
    const templates = this.store.getTemplates();
    if (templates.length === 0) return;

    const row = el.createDiv('gym-template-row');
    let selectedTemplateId = '';

    const select = row.createEl('select');
    select.createEl('option', { value: '', text: '— Load template —' });
    templates.forEach(t => select.createEl('option', { value: t.id, text: t.name }));
    select.addEventListener('change', () => { selectedTemplateId = select.value; });

    const btn = row.createEl('button', { text: 'Load' });
    btn.addEventListener('click', () => {
      if (!selectedTemplateId) return;
      const template = templates.find(t => t.id === selectedTemplateId);
      if (!template) return;
      const exercises = this.store.getExercises();
      template.entries.forEach(entry => {
        const ex = exercises.find(e => e.id === entry.exerciseId);
        if (!ex || this.selected.some(s => s.exercise.id === ex.id)) return;
        this.selected.push({ exercise: ex, sets: entry.sets, reps: entry.reps, weight: entry.weight });
      });
      this.renderLibrary();
      this.renderSelected();
    });
  }

  private renderFilters(el: HTMLElement) {
    const row = el.createDiv('gym-filter-row');

    const searchInput = row.createEl('input', { type: 'text', placeholder: 'Search...' });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.toLowerCase();
      this.renderLibrary();
    });

    const muscleSelect = row.createEl('select');
    muscleSelect.createEl('option', { value: 'all', text: 'All muscles' });
    MUSCLE_GROUPS.forEach(g => {
      muscleSelect.createEl('option', { value: g, text: g.charAt(0).toUpperCase() + g.slice(1) });
    });
    muscleSelect.addEventListener('change', () => {
      this.filterMuscle = muscleSelect.value;
      this.renderLibrary();
    });
  }

  private renderLibrary() {
    this.libraryEl.empty();
    const exercises = this.store.getExercises().filter(ex => {
      const matchesMuscle = this.filterMuscle === 'all' || ex.muscleGroup === this.filterMuscle;
      const matchesSearch = !this.searchQuery || ex.name.toLowerCase().includes(this.searchQuery);
      return matchesMuscle && matchesSearch;
    });

    if (exercises.length === 0) {
      this.libraryEl.createEl('p', { text: 'No exercises match.', cls: 'gym-empty' });
      return;
    }

    exercises.forEach(ex => {
      const isSelected = this.selected.some(s => s.exercise.id === ex.id);
      const item = this.libraryEl.createDiv({ cls: `gym-library-item${isSelected ? ' is-selected' : ''}` });
      const info = item.createDiv('gym-library-info');
      info.createEl('span', { text: ex.name, cls: 'gym-exercise-name' });
      info.createEl('span', { text: `${ex.muscleGroup} · ${ex.equipment}`, cls: 'gym-exercise-meta' });
      const btn = item.createEl('button', { text: isSelected ? '✓' : '+ Add' });
      if (isSelected) btn.disabled = true;
      btn.addEventListener('click', () => {
        this.selected.push({ exercise: ex, sets: ex.defaultSets, reps: ex.defaultReps, weight: ex.defaultWeight });
        this.renderLibrary();
        this.renderSelected();
      });
    });
  }

  private renderSelected() {
    this.selectedEl.empty();
    if (this.selected.length === 0) {
      this.selectedEl.createEl('p', { text: 'No exercises selected.', cls: 'gym-empty' });
      return;
    }

    this.selected.forEach((item, idx) => {
      const row = this.selectedEl.createDiv('gym-session-item');
      row.createEl('span', { text: `${idx + 1}. ${item.exercise.name}`, cls: 'gym-exercise-name' });

      const controls = row.createDiv('gym-session-controls');
      const addNumField = (label: string, val: number, set: (n: number) => void) => {
        const wrap = controls.createDiv('gym-num-field');
        wrap.createEl('label', { text: label });
        const inp = wrap.createEl('input', { type: 'number' });
        inp.value = String(val);
        inp.min = '0';
        inp.addEventListener('change', () => set(parseFloat(inp.value) || 0));
      };
      addNumField('Sets', item.sets, v => { item.sets = v; });
      addNumField('Reps', item.reps, v => { item.reps = v; });
      addNumField('Weight', item.weight, v => { item.weight = v; });

      const btns = row.createDiv('gym-session-btns');
      if (idx > 0) {
        const up = btns.createEl('button', { text: '↑' });
        up.addEventListener('click', () => {
          const prev = this.selected[idx - 1];
          const curr = this.selected[idx];
          if (prev && curr) {
            this.selected[idx - 1] = curr;
            this.selected[idx] = prev;
            this.renderSelected();
          }
        });
      }
      if (idx < this.selected.length - 1) {
        const down = btns.createEl('button', { text: '↓' });
        down.addEventListener('click', () => {
          const curr = this.selected[idx];
          const next = this.selected[idx + 1];
          if (curr && next) {
            this.selected[idx] = next;
            this.selected[idx + 1] = curr;
            this.renderSelected();
          }
        });
      }
      const rm = btns.createEl('button', { text: '×', cls: 'gym-remove-btn' });
      rm.addEventListener('click', () => {
        this.selected.splice(idx, 1);
        this.renderLibrary();
        this.renderSelected();
      });
    });
  }

  private renderActions(el: HTMLElement) {
    const row = el.createDiv('gym-action-row');
    const saveBtn = row.createEl('button', { text: 'Save Session', cls: 'mod-cta' });
    saveBtn.addEventListener('click', () => this.saveSession());
    const tplBtn = row.createEl('button', { text: 'Save as Template' });
    tplBtn.addEventListener('click', () => this.saveAsTemplate());
  }

  private async saveSession() {
    if (this.selected.length === 0) { new Notice('Add at least one exercise'); return; }

    const dateStr = moment().format('YYYY-MM-DD');
    const unit = this.settings.weightUnit;
    const muscles = [...new Set(this.selected.map(s => s.exercise.muscleGroup))];

    const exerciseLines: string[] = [];
    this.selected.forEach(item => {
      exerciseLines.push(`## ${item.exercise.name}`);
      exerciseLines.push(`- Sets: ${item.sets} × ${item.reps} @ ${item.weight}${unit}`);
      if (item.exercise.notes) exerciseLines.push(`- Notes: ${item.exercise.notes}`);
      exerciseLines.push('');
    });

    const lines = [
      '---',
      `date: ${dateStr}`,
      'type: workout',
      `muscles: [${muscles.join(', ')}]`,
      '---',
      '',
      `# Workout — ${dateStr}`,
      '',
      ...exerciseLines,
    ];

    const folder = this.settings.sessionsFolder;
    let path = `${folder}/${dateStr} workout.md`;
    let counter = 1;

    try {
      if (!(await this.app.vault.adapter.exists(folder))) {
        await this.app.vault.createFolder(folder);
      }
      while (await this.app.vault.adapter.exists(path)) {
        path = `${folder}/${dateStr} workout ${counter++}.md`;
      }

      const file = await this.app.vault.create(path, lines.join('\n'));

      this.selected.forEach(item => {
        item.exercise.defaultWeight = item.weight;
        item.exercise.defaultSets = item.sets;
        item.exercise.defaultReps = item.reps;
        this.store.upsertExercise(item.exercise);
      });
      await this.store.save();

      new Notice('Session saved');
      if (this.settings.openAfterSave) {
        await this.app.workspace.getLeaf(false).openFile(file);
      }
      this.close();
    } catch (e) {
      new Notice(`Error: ${(e as Error).message}`);
    }
  }

  private async saveAsTemplate() {
    if (this.selected.length === 0) { new Notice('Add at least one exercise'); return; }
    const name = await promptTemplateName(this.app);
    if (!name) return;
    this.store.upsertTemplate({
      id: crypto.randomUUID(),
      name,
      entries: this.selected.map(s => ({
        exerciseId: s.exercise.id,
        sets: s.sets,
        reps: s.reps,
        weight: s.weight,
      })),
    });
    await this.store.save();
    new Notice(`Template "${name}" saved`);
  }

  onClose() { this.contentEl.empty(); }
}

function promptTemplateName(app: App): Promise<string | null> {
  return new Promise(resolve => {
    let resolved = false;

    class NameModal extends Modal {
      onOpen() {
        this.contentEl.createEl('h3', { text: 'Template Name' });
        let name = '';
        new Setting(this.contentEl).setName('Name')
        .addText(t => t.onChange(v => { name = v; }));
        new Setting(this.contentEl)
        .addButton(b => b.setButtonText('Save').setCta().onClick(() => {
          resolved = true;
          resolve(name.trim() || null);
          this.close();
        }))
        .addButton(b => b.setButtonText('Cancel').onClick(() => {
          resolved = true;
          resolve(null);
          this.close();
        }));
      }
      onClose() {
        this.contentEl.empty();
        if (!resolved) resolve(null);
      }
    }

    new NameModal(app).open();
  });
}
