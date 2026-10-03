# Obsidian Gym Plugin

An Obsidian plugin for logging gym workouts, modelled on the iPhone app RepCount. Plugin id `gym-plugin` (see `manifest.json`). `AGENTS.md` is the generic Obsidian sample-plugin guide; this file describes the actual project. The design rationale is in `docs/redesign-plan.md`.

## Domain terms (use these in code and UI)

- **Exercise**: one movement in the library (name, muscle group, equipment, permanent cues). Stores no weights.
- **Programme**: a named, **ordered** list of exercises, each with Sets and Reps. Stores no weights.
- **Session**: one performed workout, usually started from a programme. Logged per set (weight, reps, done).
- **History**: per exercise, the sets performed in past sessions, newest first. This is the only place weights live.

## Core behaviour

- **Prefill**: starting a programme builds a session where each exercise's sets copy the most recent history entry (`GymStore.getLastLog`). With no history, it uses the programme's Sets × Reps at weight 0. The `prefillFrom` setting picks "last time anywhere" (`'exercise'`, default) or "last time in this programme" (`'programme'`, falls back to anywhere).
- **Programme Sets/Reps track the last values performed**: when an exercise is added to a programme they come from its latest history (set count, reps of the first set; 3 × 8 if none), and `finishSession` updates them from the sets just done. They can still be edited by hand.
- **Active session** is saved to `.gym/active-session.json` on every change and reopened on startup, so closing Obsidian mid-workout loses nothing. Only one session can be active.
- **Finish** (`finishSession`): writes the note (ticked-off sets only), prepends an `ExerciseLog` to each exercise's history (capped at 20), updates the programme's Sets/Reps, saves, and clears the active session.
- **Default exercises** (`defaultExercises.ts`, 39 exercises, 5–6 per muscle group, ids `default-*`): added automatically once per vault by `GymStore.load()` (new and existing vaults; skips matching ids or names; the `defaultsAdded` flag in data.json stops deleted ones coming back). The "Add default exercises" command or library button re-adds missing ones (`GymStore.addDefaultExercises`). **Source of truth is `assets/exercises/<slug>/README.md`** (front matter `id`, `name`, `muscleGroup`, `equipment`; sections `## Cues`, `## Setup`, `## Steps` as a numbered list) plus the images in that folder. `scripts/build-exercises.mjs` generates `src/defaultExercises.ts` (`npm run exercises`; never hand-edit it; `npm run build` runs it with `--check`). Photos are from free-exercise-db (public domain) and served from this repo's raw GitHub URLs, so new or changed photos only load for users once pushed to `main`. Stored defaults still pointing at the old free-exercise-db URLs are switched by `moveLegacyImages()` in `load()`. Names, cues and how-tos are our own: a one-sentence `setup` (shown as "Setup:") followed by 2–3 short numbered movement `instructions`. Setup and instructions can't be edited in the app, so `syncDefaultHowTo()` in `load()` updates stored copies whenever the built-in text changes; other fields of default exercises may have been edited by the user and are never overwritten.
- **Exercise info popup** (`ExerciseInfoModal`, ⓘ button in the workout tab, library and programme editor): media, cues, then "How to do it": **Setup:** line and numbered steps. `Exercise.media` is a tagged union (`{ type: 'image', src }`, `src` = URL, vault path or `[[link]]`); `renderExerciseMedia` cycles through several images like a GIF. Web images are cached in `.gym/media/<host>/<path>` by `MediaCache` (`store.media`): downloaded when defaults are added (first run included, via `store.seededExercises`), by the "Download exercise images for offline use" command, and in the background the first time an uncached image is shown; `resolveMediaSrc` prefers the local copy. A 3D model renderer is planned: add a `{ type: 'model' }` variant and handle it in `renderExerciseMedia`.
- **Rest timer**: ticking a set done starts a countdown in a sticky bar (settings `restTimerEnabled`, `restSeconds`).

## Session note format

Folder from settings (default `Gym/Sessions`), filename `YYYY-MM-DD <programme name>.md` (`workout` for empty sessions; characters Obsidian forbids are stripped; ` 1`, ` 2`… on collisions). Set lines use a fixed `<weight><unit> × <reps>` format so they can be parsed back later.

```markdown
---
date: 2026-10-04
type: workout
programme: "Push day"
muscles: [chest, triceps]
---

# Push day — 2026-10-04

## Bench Press
- 85kg × 6
- 82.5kg × 7

> Felt heavy

## Notes
Good session
```

## Architecture

```
src/
  main.ts            # GymPlugin: commands, ribbon (opens the Workouts tab), view registration, startSession/openSessionView, resume on startup
  types.ts           # Exercise, Programme, Session, SetLog, ExerciseLog, GymData; MUSCLE_GROUPS, EQUIPMENT_TYPES
  store.ts           # GymStore: .gym/data.json (exercises, programmes, history), legacy migration, active-session file
  session.ts         # createSession / buildSessionExercise (prefill rule), finishSession, programme-values helpers
  sessionNote.ts     # Session → markdown, note file naming
  sessionView.ts     # SessionView, the "Workouts" tab: home when idle (three buttons: Start session → programme list, Start empty session, Design programme; `homeMode`); set logging, history, notes, rest timer, finish/discard during a workout
  defaultExercises.ts # GENERATED from assets/exercises by scripts/build-exercises.mjs
  exerciseMedia.ts   # resolve and render exercise media (images now, 3D later)
  mediaCache.ts      # MediaCache: offline copies of web images in .gym/media/
  exerciseInfoModal.ts # ExerciseInfoModal: how to do an exercise
  pickers.ts         # ExercisePickerModal (fuzzy search), confirmAction()
  libraryModal.ts    # LibraryModal: programmes (with Start) and exercises grouped by muscle group
  programmeModal.ts  # ProgrammeEditorModal: ordered exercises with Sets/Reps columns
  exerciseModal.ts   # ExerciseEditorModal
  settings.ts        # GymPluginSettings, DEFAULT_SETTINGS, GymSettingsTab
styles.css           # gym-* classes
assets/exercises/    # one folder per default exercise: README.md + photos (source for defaultExercises.ts)
scripts/build-exercises.mjs # generates src/defaultExercises.ts
```

### Patterns

- `GymStore` is a single in-memory instance owned by the plugin. Mutations (`upsertExercise`, `deleteExercise`, `upsertProgramme`, `deleteProgramme`, `addLog`) are in-memory only; callers must `await store.save()`. Getters return live objects, so editors copy before editing (the programme editor deep-copies so Cancel works).
- If `data.json` exists but can't be parsed, `loadFailed` is set and `save()` throws rather than overwrite the user's data.
- Migration: when `data.json` is missing and the legacy `.gym/exercises.json` exists, it is converted (old `defaultSets/Reps/Weight` seed one history entry, `templates`/`entries` become `programmes`/`exercises`) and `exercises.json` is left as a backup.
- `.gym/` files use `vault.adapter` (it's a dot-folder Obsidian doesn't index); session notes use `vault.create`/`createFolder`.
- Sessions copy `name` and `programmeName` so they survive deletions. Deleting an exercise removes it from programmes **and deletes its history** (the UI confirms first).
- `SessionView` redraws everything on structural changes (`changed()`), but input edits only update the session object and `persist()`, so focus isn't lost while typing.
- UI is built with `Setting` plus `createEl`/`createDiv`; icon buttons via `setIcon`. New CSS classes use the `gym-` prefix.
- Tables (`.gym-sets`, `.gym-programme-list`) are a single CSS grid with rows as `display: contents`, so header and rows share columns. Don't give a row its own grid, and don't set `font-size` on a row: the column widths are in `em`. Modal forms get the `gym-form` class for equal control widths.
- Dates: use `moment` imported from `obsidian` (local time), never `toISOString()` (UTC, wrong day near midnight). IDs come from `crypto.randomUUID()`.
- Command ids are stable for users' hotkeys: `gym-new-session` is now "Open workouts". Programmes are started from the Workouts tab or the library, not a picker.

## Commands

| Command | id |
|---|---|
| Open workouts (also the dumbbell ribbon icon, labelled "Workouts") | `gym-new-session` |
| Start empty session | `gym-start-empty-session` |
| Manage programmes and exercises | `gym-manage-exercises` |
| Add default exercises | `gym-add-default-exercises` |
| Download exercise images for offline use | `gym-download-images` |

## Development

```bash
npm install
npm run dev      # esbuild watch mode
npm run build    # tsc type-check + production build
npm run lint     # eslint with eslint-plugin-obsidianmd
npm run exercises # regenerate src/defaultExercises.ts from assets/exercises/*/README.md
```

If `node`/`npm` aren't on PATH in your shell, Bun is installed at `/opt/homebrew/bin/bun` and runs the same tools: `bun node_modules/typescript/bin/tsc -noEmit -skipLibCheck`, `bun node_modules/eslint/bin/eslint.js .`, `bun esbuild.config.mjs production`.

CI (`.github/workflows/lint.yml`) runs build and lint on Node 20 and 22; both must pass. There is no test suite in the repo; logic in `store.ts`, `session.ts` and `sessionNote.ts` doesn't touch the DOM and can be tested with `bun test` by mocking the `obsidian` module (`moment`, `normalizePath`, `Notice`).

## Lint gotchas (eslint-plugin-obsidianmd)

- UI text must be sentence case. Labels starting with `+`, "e.g.", and the word "Rest" (read as the acronym REST) are flagged.
- Obsidian components (`Setting`, `DropdownComponent`, …) have a `then()` method, so an arrow function that *returns* one, like `forEach(g => d.addOption(g, g))`, is flagged as a misused promise. Use a block body: `forEach(g => { d.addOption(g, g); })`.
- Async click handlers: wrap as `() => { void this.doThing(); }`.
- No HTML headings in the settings tab.

## Conventions

- Source uses 2-space indentation (despite `.editorconfig` saying tabs); match the existing code.
- `main.js` and `data.json` are gitignored build/runtime outputs.

## Data storage

- Exercises, programmes, history: `<vault>/.gym/data.json`
- Workout in progress: `<vault>/.gym/active-session.json`
- Offline copies of exercise images: `<vault>/.gym/media/`
- Legacy (pre-v2, kept as backup): `<vault>/.gym/exercises.json`
- Session notes: settings folder, default `Gym/Sessions/`
- Plugin settings: `plugin.saveData()`, stored in `<vault>/.obsidian/plugins/gym-plugin/data.json`
