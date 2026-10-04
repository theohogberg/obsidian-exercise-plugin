// @vitest-environment happy-dom
// Renders the plugin's real views into a simulated DOM (happy-dom) and checks the
// structure the CSS relies on, plus the main interactions.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openModals, setRequestUrlHandler } from './stubs/obsidian';
import type GymPlugin from '../src/main';
import { GymStore } from '../src/store';
import { SessionView } from '../src/sessionView';
import { ProgrammeEditorModal } from '../src/programmeModal';
import { LibraryModal } from '../src/libraryModal';
import { ExerciseInfoModal } from '../src/exerciseInfoModal';
import { createSession } from '../src/session';
import { MUSCLE_GROUPS, Programme } from '../src/types';
import { fakeApp, flush, testSettings } from './helpers';

const PUSH_DAY: Programme = {
  id: 'push', name: 'Push day', exercises: [
    { exerciseId: 'default-bench-press', sets: 3, reps: 8 },
    { exerciseId: 'default-tricep-pushdown', sets: 2, reps: 12 },
  ],
};

async function setup() {
  const { app, files } = fakeApp();
  const store = new GymStore(app);
  await store.load();
  store.upsertProgramme(structuredClone(PUSH_DAY));
  store.addLog('default-bench-press', { date: '2026-10-01', programmeId: 'push', sets: [{ weight: 80, reps: 8 }, { weight: 77.5, reps: 7 }], notes: 'Felt heavy', notePath: '' });
  const startSession = vi.fn(async () => {});
  const plugin = {
    app, store, settings: testSettings(), startSession,
    openSessionView: vi.fn(async () => null),
    refreshSessionViews: vi.fn(),
  } as unknown as GymPlugin;
  const leaf = { app, openFile: vi.fn(async () => {}) };
  const view = new SessionView(leaf as never, plugin);
  return { app, files, store, plugin, startSession, leaf, view, el: view.contentEl };
}

const texts = (els: Iterable<Element>) => [...els].map(e => e.textContent?.trim() ?? '');
const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;

beforeEach(() => {
  openModals.length = 0;
  setRequestUrlHandler(async () => ({ status: 200, arrayBuffer: new ArrayBuffer(1) }));
});
afterEach(() => { vi.useRealTimers(); });

describe('Workouts tab: home', () => {
  it('shows the three buttons, Start session first and highlighted', async () => {
    const { view, el } = await setup();
    await view.onOpen();
    const buttons = el.querySelectorAll('.gym-home-menu > button.gym-menu-btn');
    expect(texts(el.querySelectorAll('.gym-menu-title'))).toEqual(['Start session', 'Start empty session', 'Design programme']);
    expect(buttons[0]!.classList.contains('mod-cta')).toBe(true);
    expect(buttons[0]!.querySelector('[data-icon="play"]')).not.toBeNull();
  });

  it('Start session lists programmes; Start starts the chosen one; Back returns', async () => {
    const { view, el, startSession } = await setup();
    await view.onOpen();
    button(el, 'Start session').click();

    const card = el.querySelector('.gym-programme-card')!;
    expect(texts(card.querySelectorAll('.gym-library-info > span'))).toEqual(['Push day', 'Bench Press, Tricep Pushdown', 'Last done Thu 1 Oct']);
    button(card, 'Start').click();
    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'push' }));

    button(el, 'Back').click();
    expect(el.querySelectorAll('.gym-menu-btn')).toHaveLength(3);
  });

  it('Start empty session starts a session without a programme', async () => {
    const { view, el, startSession } = await setup();
    await view.onOpen();
    button(el, 'Start empty session').click();
    expect(startSession).toHaveBeenCalledWith(null);
  });
});

describe('Workouts tab: during a session', () => {
  async function inSession() {
    const ctx = await setup();
    const session = createSession(ctx.store, ctx.store.getProgramme('push')!, 'exercise');
    await ctx.store.saveActiveSession(session);
    await ctx.view.onOpen();
    return { ...ctx, session };
  }

  it('renders one card per exercise, prefilled from last time', async () => {
    const { el } = await inSession();
    const cards = el.querySelectorAll('.gym-card');
    expect(texts(el.querySelectorAll('.gym-card .gym-exercise-name'))).toEqual(['Bench Press', 'Tricep Pushdown']);
    expect(cards[0]!.querySelector('.gym-last')!.textContent).toContain('80×8, 77.5×7');
    expect(cards[0]!.querySelector('.gym-last-notes')!.textContent).toContain('Felt heavy');
    expect(cards[1]!.querySelector('.gym-last')!.textContent).toBe('No history yet');
    const weights = [...cards[0]!.querySelectorAll<HTMLInputElement>('.gym-set-row:not(.gym-set-header) input[type="number"]')].map(i => i.value);
    expect(weights).toEqual(['80', '8', '77.5', '7']);
  });

  it('every set row has the same 5 cells as the header, so the grid columns line up', async () => {
    const { el } = await inSession();
    for (const table of el.querySelectorAll('.gym-sets')) {
      const rows = table.querySelectorAll(':scope > .gym-set-row');
      expect(texts(rows[0]!.children)).toEqual(['Set', 'Weight (kg)', 'Reps', 'Done', '']);
      for (const row of rows) expect(row.children).toHaveLength(5);
      // Rows are display: contents; the font size must sit on the header cells, not the row
      expect(rows[0]!.classList.contains('gym-set-header')).toBe(true);
    }
  });

  it('ticking a set marks the row done, saves progress and starts the rest timer', async () => {
    const { el, store } = await inSession();
    const row = el.querySelector('.gym-set-row:not(.gym-set-header)')!;
    const box = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await flush();

    expect(row.classList.contains('is-done')).toBe(true);
    expect((await store.loadActiveSession())!.exercises[0]!.sets[0]!.done).toBe(true);
    const timer = el.querySelector('.gym-rest-timer')!;
    expect(timer.classList.contains('is-hidden')).toBe(false);
    expect(timer.querySelector('.gym-rest-time')!.textContent).toBe('Rest 1:30');
  });

  it('Add set copies the previous set', async () => {
    const { el, store } = await inSession();
    button(el.querySelector('.gym-card')!, 'Add set').click();
    await flush();
    const sets = (await store.loadActiveSession())!.exercises[0]!.sets;
    expect(sets).toHaveLength(3);
    expect(sets[2]).toEqual({ weight: 77.5, reps: 7, done: false });
    expect(el.querySelector('.gym-card')!.querySelectorAll('.gym-set-row:not(.gym-set-header)')).toHaveLength(3);
  });

  it('finishing writes the note, opens it, and returns to the home menu', async () => {
    const { el, files, leaf } = await inSession();
    for (const box of el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }
    button(el, 'Finish workout').click();
    await vi.waitFor(() => expect(el.querySelectorAll('.gym-menu-btn')).toHaveLength(3));
    const note = [...files.keys()].find(p => p.startsWith('Gym/Sessions/'))!;
    expect(files.get(note)).toContain('## Bench Press\n- 80kg × 8\n- 77.5kg × 7');
    expect(leaf.openFile).toHaveBeenCalledWith({ path: note });
  });

  it('the info button opens the exercise how-to', async () => {
    const { el } = await inSession();
    el.querySelector<HTMLElement>('.gym-card [aria-label="How to do it"]')!.click();
    expect(openModals.at(-1)).toBeInstanceOf(ExerciseInfoModal);
  });
});

describe('exercise info popup', () => {
  it('shows media, cues, a Setup line and numbered steps; images play in turn', async () => {
    vi.useFakeTimers();
    const { app, store } = await setup();
    const bench = store.getExercise('default-bench-press')!;
    const modal = new ExerciseInfoModal(app, store, bench);
    modal.open();
    const el = modal.contentEl;

    expect(el.querySelector('h2')!.textContent).toBe('Bench Press');
    expect(el.querySelector('.gym-setup')!.textContent).toBe(`Setup: ${bench.setup}`);
    expect(texts(el.querySelectorAll('ol.gym-instructions > li'))).toEqual(bench.instructions);

    const frames = [...el.querySelectorAll('.gym-media > img')];
    expect(frames).toHaveLength(2);
    expect(frames.map(f => f.classList.contains('is-hidden'))).toEqual([false, true]);
    vi.advanceTimersByTime(900);
    expect(frames.map(f => f.classList.contains('is-hidden'))).toEqual([true, false]);
    modal.close();
  });

  it('explains how to add images when an exercise has none', async () => {
    const { app, store } = await setup();
    const modal = new ExerciseInfoModal(app, store, { id: 'x', name: 'Mine', muscleGroup: 'core', equipment: 'other', notes: '' });
    modal.open();
    expect(modal.contentEl.querySelector('.gym-media-empty')!.textContent).toContain('Add an image or GIF');
  });
});

describe('programme editor', () => {
  it('every row has the same 4 cells as the header (Exercise, Sets, Reps, buttons)', async () => {
    const { app, store } = await setup();
    const modal = new ProgrammeEditorModal(app, store, store.getProgramme('push')!, () => {});
    modal.open();
    const rows = modal.contentEl.querySelectorAll('.gym-programme-list > .gym-programme-row');
    expect(texts(rows[0]!.children)).toEqual(['Exercise', 'Sets', 'Reps', '']);
    for (const row of rows) expect(row.children).toHaveLength(4);
    const first = rows[1]!;
    expect(first.children[0]!.textContent).toBe('1. Bench Press');
    expect([...first.querySelectorAll<HTMLInputElement>('input')].map(i => i.value)).toEqual(['3', '8']);
  });

  it('↑/↓ reorder exercises and Save stores the new order', async () => {
    const { app, store } = await setup();
    const onSave = vi.fn();
    const modal = new ProgrammeEditorModal(app, store, store.getProgramme('push')!, onSave);
    modal.open();
    modal.contentEl.querySelectorAll<HTMLButtonElement>('[aria-label="Move down"]')[0]!.click();
    button(modal.contentEl, 'Save').click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(store.getProgramme('push')!.exercises.map(e => e.exerciseId)).toEqual(['default-tricep-pushdown', 'default-bench-press']);
  });
});

describe('library', () => {
  it('groups exercises by muscle group, in the standard order, alphabetically within', async () => {
    const { app, plugin } = await setup();
    const modal = new LibraryModal(app, plugin);
    modal.open();
    const headings = texts(modal.contentEl.querySelectorAll('h4.gym-group-heading')).map(h => h.toLowerCase());
    expect(headings).toEqual([...MUSCLE_GROUPS]);
    const chest: string[] = [];
    for (let n = modal.contentEl.querySelector('h4.gym-group-heading')!.nextElementSibling; n && n.tagName !== 'H4'; n = n.nextElementSibling) {
      chest.push(n.querySelector('.setting-item-name')!.textContent);
    }
    expect(chest).toEqual([...chest].sort((a, b) => a.localeCompare(b)));
    expect(chest).toContain('Bench Press');
  });
});
