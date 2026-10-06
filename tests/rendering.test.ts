// @vitest-environment happy-dom
// Renders the plugin's real views into a simulated DOM (happy-dom) and checks the
// structure the CSS relies on, plus the main interactions.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { notices, openModals, setRequestUrlHandler } from './stubs/obsidian';
import type GymPlugin from '../src/main';
import { GymStore } from '../src/store';
import { SessionView } from '../src/sessionView';
import { ProgrammeEditorModal } from '../src/programmeModal';
import { LibraryModal } from '../src/libraryModal';
import { ExerciseInfoModal } from '../src/exerciseInfoModal';
import { createSession } from '../src/session';
import { GymPluginSettings } from '../src/settings';
import { MUSCLE_GROUPS, Programme } from '../src/types';
import { fakeApp, flush, testSettings } from './helpers';

const PUSH_DAY: Programme = {
  id: 'push', name: 'Push day', exercises: [
    { exerciseId: 'default-bench-press', sets: 3, reps: 8 },
    { exerciseId: 'default-tricep-pushdown', sets: 2, reps: 12 },
  ],
};

async function setup(settings: Partial<GymPluginSettings> = {}) {
  const { app, files } = fakeApp();
  const store = new GymStore(app);
  await store.load();
  store.upsertProgramme(structuredClone(PUSH_DAY));
  store.addLog('default-bench-press', { date: '2026-10-01', programmeId: 'push', sets: [{ weight: 80, reps: 8 }, { weight: 77.5, reps: 7 }], notes: 'Felt heavy', notePath: '' });
  const startSession = vi.fn(async () => {});
  const plugin = {
    app, store, settings: testSettings(settings), startSession,
    openSessionView: vi.fn(async () => null),
    refreshSessionViews: vi.fn(),
  } as unknown as GymPlugin;
  const leaf = { app, openFile: vi.fn(async () => {}) };
  const view = new SessionView(leaf as never, plugin);
  return { app, files, store, plugin, startSession, leaf, view, el: view.contentEl };
}

/** A view with Push day in progress. */
async function inSession(settings: Partial<GymPluginSettings> = {}) {
  const ctx = await setup(settings);
  await ctx.store.saveActiveSession(createSession(ctx.store, ctx.store.getProgramme('push')!, 'exercise'));
  await ctx.view.onOpen();
  return ctx;
}

const texts = (els: Iterable<Element>) => [...els].map(e => e.textContent?.trim() ?? '');
const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;

beforeEach(() => {
  openModals.length = 0;
  notices.length = 0;
  setRequestUrlHandler(async () => ({ status: 200, arrayBuffer: new ArrayBuffer(1) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('home: Start session lists programmes; Back; Start empty session; Edit programme opens the editor', async () => {
  const { view, el, startSession } = await setup();
  await view.onOpen();
  expect(texts(el.querySelectorAll('.gym-menu-title'))).toEqual(['Start session', 'Start empty session', 'Design programme', 'Edit programme']);
  expect(el.querySelector('.gym-menu-btn')!.classList.contains('mod-cta')).toBe(true);

  button(el, 'Start session').click();
  const card = el.querySelector('.gym-programme-card')!;
  expect(texts(card.querySelectorAll('.gym-library-info > span'))).toEqual(['Push day', 'Bench Press, Tricep Pushdown', 'Last done Thu 1 Oct']);
  button(card, 'Start').click();
  expect(startSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'push' }));

  button(el, 'Back').click();
  button(el, 'Start empty session').click();
  expect(startSession).toHaveBeenLastCalledWith(null);

  button(el, 'Edit programme').click();
  button(el.querySelector('.gym-programme-card')!, 'Edit').click();
  expect(openModals.at(-1)).toBeInstanceOf(ProgrammeEditorModal);
});

it('session: cards prefilled from last time, Add set then the titled notes box; set rows line up with their header; info button', async () => {
  const { el } = await inSession();
  const cards = el.querySelectorAll('.gym-card');
  expect(texts(el.querySelectorAll('.gym-card .gym-exercise-name'))).toEqual(['Bench Press', 'Tricep Pushdown']);
  expect([...cards[0]!.children].map(c => c.className.split(' ')[0]).slice(-4)).toEqual(['gym-sets', 'gym-add-set', 'gym-notes-label', 'gym-notes']);
  expect([...cards[0]!.querySelectorAll<HTMLInputElement>('input[type="number"]')].map(i => i.value)).toEqual(['80', '8', '77.5', '7']);

  // The table is one grid with rows as display: contents, so every row needs the
  // header's 4 cells, and the font size must sit on the header cells, not the row
  for (const table of el.querySelectorAll('.gym-sets')) {
    const rows = table.querySelectorAll(':scope > .gym-set-row');
    expect(texts(rows[0]!.children)).toEqual(['Set', 'Weight (kg)', 'Reps', '']);
    expect(rows[0]!.classList.contains('gym-set-header')).toBe(true);
    for (const row of rows) expect(row.children).toHaveLength(4);
  }

  el.querySelector<HTMLElement>('.gym-card [aria-label="How to do it"]')!.click();
  expect(openModals.at(-1)).toBeInstanceOf(ExerciseInfoModal);
});

it('session: edits and Add set are saved as you go', async () => {
  const { el, store } = await inSession();
  const weight = el.querySelector<HTMLInputElement>('.gym-set-row:not(.gym-set-header) input[type="number"]')!;
  weight.value = '82.5';
  weight.dispatchEvent(new Event('change'));
  button(el.querySelector('.gym-card')!, 'Add set').click();
  await flush();
  expect((await store.loadActiveSession())!.exercises[0]!.sets).toEqual([
    { weight: 82.5, reps: 8 }, { weight: 77.5, reps: 7 }, { weight: 77.5, reps: 7 },
  ]);
});

it('session: Finish workout writes and opens the note, then returns to the home menu', async () => {
  const { el, files, leaf } = await inSession();
  button(el, 'Finish workout').click();
  await vi.waitFor(() => expect(el.querySelectorAll('.gym-menu-btn')).toHaveLength(4));
  const note = [...files.keys()].find(p => p.startsWith('Gym/Sessions/'))!;
  expect(leaf.openFile).toHaveBeenCalledWith({ path: note });
});

it('rest bar: Rest button, countdown with ±15 s and Skip, alert when time is up', async () => {
  vi.useFakeTimers();
  const vibrate = vi.fn();
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  // Counts tones; audio only runs after resume(), which tapping Rest must call
  let tones = 0;
  vi.stubGlobal('AudioContext', class {
    state = 'suspended'; currentTime = 0; destination = {};
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d }; }
    createOscillator() { tones++; return { frequency: {}, connect: (g: unknown) => g, start() {}, stop() {} }; }
  });
  const { el } = await inSession({ restSeconds: 75 });
  const bar = el.querySelector<HTMLElement>('.gym-rest-timer')!;
  const start = () => bar.querySelector<HTMLButtonElement>('button.gym-rest-start')!.click();
  const time = () => bar.querySelector('.gym-rest-time')!.textContent;
  expect(bar.querySelector('button.gym-rest-start')!.textContent).toBe('Rest 1:15');

  start();
  expect(bar.classList.contains('is-running')).toBe(true);
  const plus = bar.querySelector<HTMLButtonElement>('[aria-label="15 seconds more"]')!;
  vi.advanceTimersByTime(10_000);
  expect(time()).toBe('Rest 1:05');
  // Ticks update only the text, so a button being tapped isn't replaced
  expect(bar.querySelector('[aria-label="15 seconds more"]')).toBe(plus);
  plus.click();
  expect(time()).toBe('Rest 1:20');
  button(bar, 'Skip').click();
  expect(bar.classList.contains('is-running')).toBe(false);

  start();
  vi.advanceTimersByTime(75_500);
  expect(notices).toContain('Time for your next set');
  expect(vibrate).toHaveBeenCalled();
  expect(tones).toBe(2); // the double beep
  expect(bar.querySelector('button.gym-rest-start')).not.toBeNull();
});

it('rest bar: hidden when the timer is turned off in settings', async () => {
  const { el } = await inSession({ restTimerEnabled: false });
  expect(el.querySelector('.gym-rest-timer')).toBeNull();
});

it('info popup: images play in turn; Setup line and steps; hint when there are no images', async () => {
  vi.useFakeTimers();
  const { app, store } = await setup();
  const bench = store.getExercise('default-bench-press')!;
  const modal = new ExerciseInfoModal(app, store, bench);
  modal.open();
  const el = modal.contentEl;
  expect(el.querySelector('.gym-setup')!.textContent).toBe(`Setup: ${bench.setup}`);
  expect(texts(el.querySelectorAll('ol.gym-instructions > li'))).toEqual(bench.instructions);
  const frames = [...el.querySelectorAll('.gym-media > img')];
  expect(frames.map(f => f.classList.contains('is-hidden'))).toEqual([false, true]);
  vi.advanceTimersByTime(900);
  expect(frames.map(f => f.classList.contains('is-hidden'))).toEqual([true, false]);
  modal.close();

  const mine = new ExerciseInfoModal(app, store, { id: 'x', name: 'Mine', muscleGroup: 'core', equipment: 'other', notes: '' });
  mine.open();
  expect(mine.contentEl.querySelector('.gym-media-empty')!.textContent).toContain('Add an image or GIF');
});

it('programme editor: rows line up with the header; ↓ reorders and Save stores the order', async () => {
  const { app, store } = await setup();
  const onSave = vi.fn();
  const modal = new ProgrammeEditorModal(app, store, store.getProgramme('push')!, onSave);
  modal.open();
  const rows = modal.contentEl.querySelectorAll('.gym-programme-list > .gym-programme-row');
  expect(texts(rows[0]!.children)).toEqual(['Exercise', 'Sets', 'Reps', '']);
  for (const row of rows) expect(row.children).toHaveLength(4);
  expect([...rows[1]!.querySelectorAll<HTMLInputElement>('input')].map(i => i.value)).toEqual(['3', '8']);

  modal.contentEl.querySelectorAll<HTMLButtonElement>('[aria-label="Move down"]')[0]!.click();
  button(modal.contentEl, 'Save').click();
  await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(store.getProgramme('push')!.exercises.map(e => e.exerciseId)).toEqual(['default-tricep-pushdown', 'default-bench-press']);
});

it('library: exercises grouped by muscle group in the standard order, alphabetical within', async () => {
  const { app, plugin } = await setup();
  const modal = new LibraryModal(app, plugin);
  modal.open();
  expect(texts(modal.contentEl.querySelectorAll('h4.gym-group-heading')).map(h => h.toLowerCase())).toEqual([...MUSCLE_GROUPS]);
  const chest: string[] = [];
  for (let n = modal.contentEl.querySelector('h4.gym-group-heading')!.nextElementSibling; n && n.tagName !== 'H4'; n = n.nextElementSibling) {
    chest.push(n.querySelector('.setting-item-name')!.textContent);
  }
  expect(chest).toEqual([...chest].sort((a, b) => a.localeCompare(b)));
});
