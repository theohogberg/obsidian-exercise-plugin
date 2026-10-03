import { IconName, ItemView, moment, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import type GymPlugin from './main';
import { ExercisePickerModal, confirmAction } from './pickers';
import { ExerciseInfoModal } from './exerciseInfoModal';
import { ProgrammeEditorModal } from './programmeModal';
import { buildSessionExercise, finishSession, summariseSets } from './session';
import { Session, SessionExercise } from './types';

export const VIEW_TYPE_SESSION = 'gym-session';

const HISTORY_SHOWN = 5;
const NEW_EXERCISE_DEFAULT = { sets: 3, reps: 8 };

export class SessionView extends ItemView {
  private plugin: GymPlugin;
  private session: Session | null = null;
  private expandedHistory = new Set<string>();
  // Home screen (no session running): the three-button menu, or the programme list
  private homeMode: 'menu' | 'choose' = 'menu';
  // Rest timer: lives on the view, so it survives re-renders
  private restEndsAt: number | null = null;
  private restIntervalId: number | null = null;
  private restEl: HTMLElement | null = null;
  private restTextEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: GymPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_SESSION; }
  getDisplayText(): string { return 'Workouts'; }
  getIcon(): IconName { return 'dumbbell'; }

  async onOpen(): Promise<void> {
    if (!this.session) this.session = await this.plugin.store.loadActiveSession();
    this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /** Redraw, e.g. after programmes changed elsewhere. */
  refresh(): void {
    this.render();
  }

  setSession(session: Session | null): void {
    this.session = session;
    this.homeMode = 'menu';
    this.expandedHistory.clear();
    this.stopRest();
    this.render();
  }

  private startRest(): void {
    if (!this.plugin.settings.restTimerEnabled) return;
    this.restEndsAt = Date.now() + this.plugin.settings.restSeconds * 1000;
    if (this.restIntervalId === null) {
      this.restIntervalId = this.registerInterval(window.setInterval(() => this.tickRest(), 250));
    }
    this.updateRest();
  }

  private adjustRest(seconds: number): void {
    if (this.restEndsAt === null) return;
    this.restEndsAt += seconds * 1000;
    this.tickRest();
  }

  private stopRest(): void {
    this.restEndsAt = null;
    if (this.restIntervalId !== null) {
      window.clearInterval(this.restIntervalId);
      this.restIntervalId = null;
    }
    this.updateRest();
  }

  private tickRest(): void {
    if (this.restEndsAt !== null && Date.now() >= this.restEndsAt) {
      this.stopRest();
      new Notice('Time for your next set');
      navigator.vibrate?.(300);
      return;
    }
    this.updateRest();
  }

  private updateRest(): void {
    if (!this.restEl || !this.restTextEl) return;
    this.restEl.toggleClass('is-hidden', this.restEndsAt === null);
    if (this.restEndsAt === null) return;
    const left = Math.max(0, Math.ceil((this.restEndsAt - Date.now()) / 1000));
    this.restTextEl.setText(`Rest ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
  }

  private renderRest(el: HTMLElement): void {
    this.restEl = el.createDiv('gym-rest-timer');
    this.restTextEl = this.restEl.createSpan('gym-rest-time');
    const btns = this.restEl.createDiv('gym-card-btns');
    this.iconButton(btns, 'minus', '15 seconds less', false, () => this.adjustRest(-15));
    this.iconButton(btns, 'plus', '15 seconds more', false, () => this.adjustRest(15));
    const skip = btns.createEl('button', { text: 'Skip' });
    skip.addEventListener('click', () => this.stopRest());
    this.updateRest();
  }

  private persist(): void {
    if (!this.session) return;
    void this.plugin.store.saveActiveSession(this.session)
    .catch(e => new Notice(`Could not save workout progress: ${(e as Error).message}`));
  }

  /** For structural changes (add/remove/reorder): save and redraw. */
  private changed(): void {
    this.persist();
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    const scrollTop = el.scrollTop;
    el.empty();
    el.addClass('gym-session-view');
    this.restEl = null;
    this.restTextEl = null;

    if (!this.session) {
      this.renderHome(el);
      return;
    }
    const session = this.session;

    el.createEl('h2', { text: session.programmeName || 'Workout' });
    el.createDiv({ cls: 'gym-session-meta', text: `Started ${moment(session.startedAt).format('ddd D MMM, HH:mm')}` });
    this.renderRest(el);

    if (session.exercises.length === 0) {
      el.createEl('p', { text: 'No exercises yet.', cls: 'gym-empty' });
    }
    session.exercises.forEach((ex, idx) => this.renderExercise(el, session, ex, idx));

    const addRow = el.createDiv('gym-action-row');
    const addBtn = addRow.createEl('button', { text: 'Add exercise' });
    addBtn.addEventListener('click', () => this.addExercise(session));

    el.createEl('h3', { text: 'Notes' });
    const notes = el.createEl('textarea', { cls: 'gym-notes', attr: { placeholder: 'How did the workout go?' } });
    notes.value = session.notes;
    notes.addEventListener('change', () => { session.notes = notes.value; this.persist(); });

    const actions = el.createDiv('gym-action-row');
    const finishBtn = actions.createEl('button', { text: 'Finish workout', cls: 'mod-cta' });
    finishBtn.addEventListener('click', () => { void this.finish(session); });
    const discardBtn = actions.createEl('button', { text: 'Discard', cls: 'mod-warning' });
    discardBtn.addEventListener('click', () => { void this.discard(); });

    el.scrollTop = scrollTop;
  }

  /** No session running: start one, or design a programme. */
  private renderHome(el: HTMLElement): void {
    el.createEl('h2', { text: 'Workouts' });
    if (this.homeMode === 'choose') {
      this.renderProgrammeChoice(el);
      return;
    }

    const menu = el.createDiv('gym-home-menu');
    this.menuButton(menu, 'play', 'Start session', 'Pick a programme. Weights and reps from last time are filled in.', true, () => {
      this.homeMode = 'choose';
      this.render();
    });
    this.menuButton(menu, 'plus', 'Start empty session', 'Add exercises as you go.', false, () => {
      void this.plugin.startSession(null);
    });
    this.menuButton(menu, 'list-ordered', 'Design programme', 'Create a template for a session: exercises in order, with sets and reps.', false, () => {
      new ProgrammeEditorModal(this.app, this.plugin.store, null, () => this.render()).open();
    });
  }

  private menuButton(parent: HTMLElement, icon: IconName, title: string, desc: string, cta: boolean, onClick: () => void): void {
    const btn = parent.createEl('button', { cls: 'gym-menu-btn' });
    if (cta) btn.addClass('mod-cta');
    setIcon(btn.createSpan('gym-menu-icon'), icon);
    const text = btn.createSpan('gym-menu-text');
    text.createSpan({ text: title, cls: 'gym-menu-title' });
    text.createSpan({ text: desc, cls: 'gym-menu-desc' });
    btn.addEventListener('click', onClick);
  }

  private renderProgrammeChoice(el: HTMLElement): void {
    const store = this.plugin.store;
    const back = el.createEl('button', { text: 'Back', cls: 'gym-link-btn gym-back-btn' });
    back.addEventListener('click', () => {
      this.homeMode = 'menu';
      this.render();
    });
    el.createEl('h3', { text: 'Choose a programme' });

    const programmes = store.getProgrammes();
    if (programmes.length === 0) {
      el.createEl('p', { text: 'No programmes yet. Design one first.', cls: 'gym-empty' });
      const design = el.createDiv('gym-action-row').createEl('button', { text: 'Design programme', cls: 'mod-cta' });
      design.addEventListener('click', () => {
        new ProgrammeEditorModal(this.app, store, null, () => this.render()).open();
      });
      return;
    }

    programmes.forEach(p => {
      const card = el.createDiv('gym-card gym-programme-card');
      const info = card.createDiv('gym-library-info');
      info.createSpan({ text: p.name, cls: 'gym-exercise-name' });
      const names = p.exercises
      .map(e => store.getExercise(e.exerciseId)?.name)
      .filter((n): n is string => !!n);
      info.createSpan({ text: names.length > 0 ? names.join(', ') : 'No exercises', cls: 'gym-exercise-meta' });
      const last = store.getLastProgrammeDate(p.id);
      info.createSpan({ text: last ? `Last done ${moment(last).format('ddd D MMM')}` : 'Not done yet', cls: 'gym-exercise-meta' });

      const btns = card.createDiv('gym-card-btns');
      this.iconButton(btns, 'pencil', 'Edit programme', false, () => {
        new ProgrammeEditorModal(this.app, store, p, () => this.render()).open();
      });
      const start = btns.createEl('button', { text: 'Start', cls: 'mod-cta' });
      start.addEventListener('click', () => { void this.plugin.startSession(p); });
    });
  }


  private renderExercise(parent: HTMLElement, session: Session, ex: SessionExercise, idx: number): void {
    const exercise = this.plugin.store.getExercise(ex.exerciseId);
    const card = parent.createDiv('gym-card');

    const header = card.createDiv('gym-card-header');
    const title = header.createDiv('gym-library-info');
    title.createSpan({ text: ex.name, cls: 'gym-exercise-name' });
    if (exercise) title.createSpan({ text: `${exercise.muscleGroup} · ${exercise.equipment}`, cls: 'gym-exercise-meta' });

    const btns = header.createDiv('gym-card-btns');
    if (exercise) this.iconButton(btns, 'info', 'How to do it', false, () => new ExerciseInfoModal(this.app, this.plugin.store, exercise).open());
    this.iconButton(btns, 'arrow-up', 'Move up', idx === 0, () => this.move(session, idx, -1));
    this.iconButton(btns, 'arrow-down', 'Move down', idx === session.exercises.length - 1, () => this.move(session, idx, 1));
    this.iconButton(btns, 'x', 'Remove exercise', false, () => {
      session.exercises.splice(idx, 1);
      this.changed();
    });

    if (exercise?.notes) card.createDiv({ text: exercise.notes, cls: 'gym-cues' });
    this.renderHistory(card, session, ex);
    this.renderSets(card, ex);

    const notes = card.createEl('textarea', { cls: 'gym-notes', attr: { placeholder: 'Notes for this exercise', rows: '1' } });
    notes.value = ex.notes;
    notes.addEventListener('change', () => { ex.notes = notes.value; this.persist(); });
  }

  private renderHistory(card: HTMLElement, session: Session, ex: SessionExercise): void {
    const store = this.plugin.store;
    const history = store.getHistory(ex.exerciseId);
    const last = store.getLastLog(ex.exerciseId, session.programmeId, this.plugin.settings.prefillFrom);
    if (!last) {
      card.createDiv({ text: 'No history yet', cls: 'gym-last' });
      return;
    }

    const lastEl = card.createDiv('gym-last');
    lastEl.createSpan({ text: `Last time (${moment(last.date).format('D MMM')}): ${summariseSets(last.sets)}` });
    if (last.notes) lastEl.createDiv({ text: `“${last.notes}”`, cls: 'gym-last-notes' });

    if (history.length < 2) return;
    const expanded = this.expandedHistory.has(ex.exerciseId);
    const toggle = lastEl.createEl('button', { text: expanded ? 'Hide history' : 'Show history', cls: 'gym-link-btn' });
    toggle.addEventListener('click', () => {
      if (expanded) this.expandedHistory.delete(ex.exerciseId);
      else this.expandedHistory.add(ex.exerciseId);
      this.render();
    });
    if (!expanded) return;

    const list = card.createEl('ul', 'gym-history');
    history.slice(0, HISTORY_SHOWN).forEach(log => {
      const item = list.createEl('li');
      const date = moment(log.date).format('D MMM YYYY');
      if (log.notePath) {
        const link = item.createEl('a', { text: date, cls: 'internal-link' });
        link.addEventListener('click', () => { void this.app.workspace.openLinkText(log.notePath, '', 'tab'); });
      } else {
        item.createSpan({ text: date });
      }
      item.appendText(`: ${summariseSets(log.sets)}`);
      if (log.notes) item.createSpan({ text: ` — ${log.notes}`, cls: 'gym-exercise-meta' });
    });
  }

  private renderSets(card: HTMLElement, ex: SessionExercise): void {
    const table = card.createDiv('gym-sets');
    const header = table.createDiv('gym-set-row gym-set-header');
    ['Set', `Weight (${this.plugin.settings.weightUnit})`, 'Reps', 'Done', ''].forEach(h => header.createSpan({ text: h }));

    ex.sets.forEach((set, i) => {
      const row = table.createDiv({ cls: `gym-set-row${set.done ? ' is-done' : ''}` });
      row.createSpan({ text: String(i + 1), cls: 'gym-set-index' });
      this.numberInput(row, set.weight, '0.5', v => { set.weight = v; });
      this.numberInput(row, set.reps, '1', v => { set.reps = Math.round(v); });

      const done = row.createEl('input', { type: 'checkbox' });
      done.checked = set.done;
      done.addEventListener('change', () => {
        set.done = done.checked;
        row.toggleClass('is-done', set.done);
        this.persist();
        if (set.done) this.startRest();
      });

      this.iconButton(row, 'x', 'Remove set', false, () => {
        ex.sets.splice(i, 1);
        this.changed();
      });
    });

    const addSet = card.createEl('button', { text: 'Add set', cls: 'gym-link-btn' });
    addSet.addEventListener('click', () => {
      const prev = ex.sets[ex.sets.length - 1];
      ex.sets.push({ weight: prev?.weight ?? 0, reps: prev?.reps ?? NEW_EXERCISE_DEFAULT.reps, done: false });
      this.changed();
    });
  }

  private numberInput(parent: HTMLElement, value: number, step: string, set: (v: number) => void): void {
    const input = parent.createEl('input', { type: 'number', attr: { min: '0', step, inputmode: 'decimal' } });
    input.value = String(value);
    input.addEventListener('change', () => {
      set(Math.max(0, parseFloat(input.value) || 0));
      this.persist();
    });
  }

  private iconButton(parent: HTMLElement, icon: IconName, label: string, disabled: boolean, onClick: () => void): void {
    const btn = parent.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
    setIcon(btn, icon);
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
  }

  private move(session: Session, idx: number, delta: number): void {
    const target = idx + delta;
    const a = session.exercises[idx];
    const b = session.exercises[target];
    if (!a || !b) return;
    session.exercises[idx] = b;
    session.exercises[target] = a;
    this.changed();
  }

  private addExercise(session: Session): void {
    const present = new Set(session.exercises.map(e => e.exerciseId));
    const available = this.plugin.store.getExercises().filter(e => !present.has(e.id));
    if (available.length === 0) {
      new Notice('Every exercise in the library is already in this workout');
      return;
    }
    new ExercisePickerModal(this.app, available, exercise => {
      session.exercises.push(buildSessionExercise(
        this.plugin.store, exercise, session.programmeId, this.plugin.settings.prefillFrom, NEW_EXERCISE_DEFAULT,
      ));
      this.changed();
    }).open();
  }

  private async finish(session: Session): Promise<void> {
    const sets = session.exercises.flatMap(ex => ex.sets);
    if (!sets.some(s => s.done)) {
      new Notice('Tick off at least one set before finishing');
      return;
    }
    if (sets.some(s => !s.done)) {
      const ok = await confirmAction(this.app, 'Some sets aren\'t ticked off and won\'t be saved. Finish anyway?', 'Finish');
      if (!ok) return;
    }

    try {
      const file = await finishSession(this.app, this.plugin.store, this.plugin.settings, session);
      new Notice('Workout saved');
      this.setSession(null);
      if (this.plugin.settings.openAfterSave) await this.leaf.openFile(file);
    } catch (e) {
      new Notice(`Could not save workout: ${(e as Error).message}`);
    }
  }

  private async discard(): Promise<void> {
    const ok = await confirmAction(this.app, 'Discard this workout? Nothing will be saved.', 'Discard');
    if (!ok) return;
    await this.plugin.store.clearActiveSession();
    this.setSession(null);
  }
}
