import { IconName, ItemView, moment, Notice, setIcon, WorkspaceLeaf } from 'obsidian';
import type GymPlugin from './main';
import { ExercisePickerModal, confirmAction } from './pickers';
import { ExerciseInfoModal } from './exerciseInfoModal';
import { ProgrammeEditorModal } from './programmeModal';
import { buildSessionExercise, finishSession } from './session';
import { primeRestAlert, restOverAlert } from './restAlert';
import { Session, SessionExercise } from './types';

export const VIEW_TYPE_SESSION = 'gym-session';

const NEW_EXERCISE_DEFAULT = { sets: 3, reps: 8 };

export class SessionView extends ItemView {
  private plugin: GymPlugin;
  private session: Session | null = null;
  // Home screen (no session running): the menu, or the programme list to start or edit one
  private homeMode: 'menu' | 'start' | 'edit' = 'menu';
  // Rest timer: lives on the view, so it survives re-renders
  private restEndsAt: number | null = null;
  private restIntervalId: number | null = null;
  private restEl: HTMLElement | null = null;
  private restTimeEl: HTMLElement | null = null;

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
    this.stopRest();
    this.render();
  }

  private startRest(): void {
    primeRestAlert();
    this.restEndsAt = Date.now() + this.plugin.settings.restSeconds * 1000;
    if (this.restIntervalId === null) {
      this.restIntervalId = this.registerInterval(window.setInterval(() => this.tickRest(), 250));
    }
    this.renderRestBar();
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
    this.renderRestBar();
  }

  private tickRest(): void {
    if (this.restEndsAt !== null && Date.now() >= this.restEndsAt) {
      this.stopRest();
      restOverAlert('Time for your next set');
      return;
    }
    this.updateRestTime();
  }

  /** Countdown text only, so the bar's buttons aren't replaced while being tapped. */
  private updateRestTime(): void {
    if (!this.restTimeEl || this.restEndsAt === null) return;
    const left = Math.max(0, Math.ceil((this.restEndsAt - Date.now()) / 1000));
    this.restTimeEl.setText(`Rest ${formatSeconds(left)}`);
  }

  /**
   * The rest bar stays at the top of the workout. Idle, it's one button that starts a
   * rest of the configured length; running, it shows the countdown with -15s/+15s/Skip.
   * Rebuilt only when it switches between the two.
   */
  private renderRestBar(): void {
    const bar = this.restEl;
    if (!bar) return;
    bar.empty();
    this.restTimeEl = null;
    const running = this.restEndsAt !== null;
    bar.toggleClass('is-running', running);

    if (this.restEndsAt === null) {
      const start = bar.createEl('button', { cls: 'gym-rest-start', attr: { 'aria-label': 'Start the timer between sets' } });
      setIcon(start.createSpan(), 'timer');
      start.createSpan().setText(`Rest ${formatSeconds(this.plugin.settings.restSeconds)}`);
      start.addEventListener('click', () => this.startRest());
      return;
    }

    this.restTimeEl = bar.createSpan('gym-rest-time');
    this.updateRestTime();
    const btns = bar.createDiv('gym-card-btns');
    this.iconButton(btns, 'minus', '15 seconds less', false, () => this.adjustRest(-15));
    this.iconButton(btns, 'plus', '15 seconds more', false, () => this.adjustRest(15));
    const skip = btns.createEl('button', { text: 'Skip' });
    skip.addEventListener('click', () => this.stopRest());
  }

  private renderRest(el: HTMLElement): void {
    if (!this.plugin.settings.restTimerEnabled) return;
    this.restEl = el.createDiv('gym-rest-timer');
    this.renderRestBar();
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
    this.restTimeEl = null;

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
    const discardBtn = actions.createEl('button', { text: 'Discard', cls: 'gym-discard' });
    discardBtn.addEventListener('click', () => { void this.discard(); });

    el.scrollTop = scrollTop;
  }

  /** No session running: start one, or design a programme. */
  private renderHome(el: HTMLElement): void {
    el.createEl('h2', { text: 'Workouts' });
    if (this.homeMode !== 'menu') {
      this.renderProgrammeChoice(el, this.homeMode);
      return;
    }

    const menu = el.createDiv('gym-home-menu');
    this.menuButton(menu, 'play', 'Start session', 'Pick a programme. Weights and reps from last time are filled in.', true, () => {
      this.homeMode = 'start';
      this.render();
    });
    this.menuButton(menu, 'plus', 'Start empty session', 'Add exercises as you go.', false, () => {
      void this.plugin.startSession(null);
    });
    this.menuButton(menu, 'list-ordered', 'Design programme', 'Create a template for a session: exercises in order, with sets and reps.', false, () => {
      new ProgrammeEditorModal(this.app, this.plugin.store, null, () => this.render()).open();
    });
    this.menuButton(menu, 'pencil', 'Edit programme', 'Change a programme\'s exercises, order, sets and reps.', false, () => {
      this.homeMode = 'edit';
      this.render();
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

  private renderProgrammeChoice(el: HTMLElement, mode: 'start' | 'edit'): void {
    const store = this.plugin.store;
    const back = el.createEl('button', { text: 'Back', cls: 'gym-link-btn gym-back-btn' });
    back.addEventListener('click', () => {
      this.homeMode = 'menu';
      this.render();
    });
    el.createEl('h3', { text: mode === 'start' ? 'Choose a programme' : 'Choose a programme to edit' });

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
      const edit = () => new ProgrammeEditorModal(this.app, store, p, () => this.render()).open();
      if (mode === 'edit') {
        btns.createEl('button', { text: 'Edit', cls: 'mod-cta' }).addEventListener('click', edit);
        return;
      }
      this.iconButton(btns, 'pencil', 'Edit programme', false, edit);
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
    this.renderSets(card, ex);
    const addSet = card.createEl('button', { text: 'Add set', cls: 'gym-add-set' });
    addSet.addEventListener('click', () => {
      const prev = ex.sets[ex.sets.length - 1];
      ex.sets.push({ weight: prev?.weight ?? 0, reps: prev?.reps ?? NEW_EXERCISE_DEFAULT.reps });
      this.changed();
    });

    card.createDiv({ text: 'Notes', cls: 'gym-notes-label' });
    const notes = card.createEl('textarea', { cls: 'gym-notes', attr: { placeholder: 'Notes for this exercise', rows: '1' } });
    notes.value = ex.notes;
    notes.addEventListener('change', () => { ex.notes = notes.value; this.persist(); });
  }

  private renderSets(card: HTMLElement, ex: SessionExercise): void {
    const table = card.createDiv('gym-sets');
    const header = table.createDiv('gym-set-row gym-set-header');
    ['Set', `Weight (${this.plugin.settings.weightUnit})`, 'Reps', ''].forEach(h => header.createSpan({ text: h }));

    ex.sets.forEach((set, i) => {
      const row = table.createDiv('gym-set-row');
      row.createSpan({ text: String(i + 1), cls: 'gym-set-index' });
      this.numberInput(row, set.weight, '0.5', v => { set.weight = v; });
      this.numberInput(row, set.reps, '1', v => { set.reps = Math.round(v); });
      this.iconButton(row, 'x', 'Remove set', false, () => {
        ex.sets.splice(i, 1);
        this.changed();
      });
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
    // Every set row is saved, as entered
    if (!session.exercises.some(ex => ex.sets.length > 0)) {
      new Notice('Add at least one set before finishing');
      return;
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

/** 90 → "1:30" */
function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
