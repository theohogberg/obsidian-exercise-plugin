# Obsidian Gym Plugin

An Obsidian plugin for tracking gym workouts, managing an exercise library and workout programmes, and logging sessions as Obsidian notes.

Domain terms (use these in code and UI):
- **Exercise** — a single movement in the library (e.g. Bench Press)
- **Programme** — a named, ordered set of exercises (e.g. "Push day")
- **Session** — one performed workout, usually started from a programme

A redesign toward this model is planned in `docs/redesign-plan.md`; the sections below describe the code as it is today.

Plugin id `gym-plugin` (see `manifest.json`). Bootstrapped from the official Obsidian sample plugin — `AGENTS.md` and `README.md` are mostly the generic sample-plugin docs; this file describes the actual project.

## Core Features

### Exercise Library
- Stored as JSON in the vault at `.gym/exercises.json` (holds both exercises **and** programmes — see `GymData` in `types.ts`)
- Each exercise has: `id`, `name`, `muscleGroup`, `equipment`, `defaultSets`, `defaultReps`, `defaultWeight`, `notes`
- Muscle groups: chest, back, shoulders, biceps, legs, core, triceps
- Equipment: barbell, dumbbell, machine, cable, bodyweight, other
- Managed via `LibraryModal` (lists exercises + programmes with edit/delete buttons)
- Deleting an exercise also removes it from every programme's entries

### Programmes
- A `Programme` is `{ id, name, entries: ProgrammeEntry[] }`, where each entry is `{ exerciseId, sets, reps, weight }`
- Created/edited in `ProgrammeEditorModal` (toggle exercises from the library and set sets/reps/weight per entry; entry order is the order exercises were toggled on, with no way to reorder)
- Can also be created from the session builder via "Save as programme"
- `.gym/exercises.json` files written before the rename store programmes under `templates`; `GymStore.load()` falls back to that key

### Session Builder (`SessionBuilderModal`)
- Optional "Load programme" dropdown (only shown if programmes exist) — appends the programme's exercises, skipping ones already selected
- Search box + muscle-group filter over the library
- Add exercises with "+ Add" (seeded from the exercise's defaults)
- Reorder with ↑/↓ buttons (no drag-and-drop yet), remove with ×
- Override sets/reps/weight per exercise for that session
- **Save Session**: writes the note, then writes each exercise's session sets/reps/weight back as its new defaults (progressive-overload memory) and saves the store
- **Save as programme**: prompts for a name (inline `NameModal` in `sessionModal.ts`) and saves the current selection as a programme

### Session Note Format
Saved in the configured folder (default `Gym/Sessions`). Filename `YYYY-MM-DD workout.md`; if it exists, `YYYY-MM-DD workout 1.md`, `… 2.md`, etc. The folder is created if missing.

```markdown
---
date: 2024-01-15
type: workout
muscles: [chest, triceps]
---

# Workout — 2024-01-15

## Bench Press
- Sets: 4 × 8 @ 80kg
- Notes: <exercise notes, only if non-empty>

## Tricep Pushdown
- Sets: 3 × 12 @ 30kg
```

### Settings (`GymPluginSettings` in `settings.ts`)
- `sessionsFolder` — default `Gym/Sessions` (blank input falls back to default)
- `weightUnit` — `kg` | `lbs`, appended to weights in session notes
- `openAfterSave` — default `true`

## Architecture

```
src/
  main.ts                    # GymPlugin: loads settings + GymStore, registers ribbon icon, commands, settings tab
  types.ts                   # Exercise, SessionExercise, ProgrammeEntry, Programme, GymData, MUSCLE_GROUPS, EQUIPMENT_TYPES
  store.ts                   # GymStore — load/save .gym/exercises.json, CRUD for exercises and programmes
  libraryModal.ts            # LibraryModal — exercise + programme manager ("Manage exercises" command)
  exerciseModal.ts           # ExerciseEditorModal — add/edit a single exercise
  programmeModal.ts          # ProgrammeEditorModal — add/edit a programme
  sessionModal.ts            # SessionBuilderModal — build a session, save note / save as programme
  settings.ts                # GymPluginSettings, DEFAULT_SETTINGS, GymSettingsTab
styles.css                   # gym-* classes used by the modals
```

### Patterns
- `GymStore` is a single in-memory instance owned by the plugin and passed into every modal. Mutations (`upsertExercise`, `deleteExercise`, `upsertProgramme`, `deleteProgramme`) are in-memory only — callers must `await store.save()` afterwards.
- `getExercises()` / `getProgrammes()` return the live arrays, not copies. Editor modals clone (`{ ...exercise }`) before editing; `SessionBuilderModal` holds live references and mutates them on save.
- The store uses `vault.adapter` (not the `Vault` API) because `.gym/` is a dot-folder that Obsidian doesn't index. Session notes use `vault.create`/`createFolder` so they appear in the vault normally.
- Modals re-render by calling `contentEl.empty()` and rebuilding; child modals take an `onSave` callback that triggers the parent's re-render.
- UI is built with Obsidian's `Setting` component plus `createEl`/`createDiv`. New CSS classes should use the `gym-` prefix.
- IDs come from `crypto.randomUUID()`.

## Commands

| Command | id | Description |
|---|---|---|
| `Gym: New session` | `gym-new-session` | Opens `SessionBuilderModal` (also on the `dumbbell` ribbon icon) |
| `Gym: Manage exercises` | `gym-manage-exercises` | Opens `LibraryModal` |

## Tech Stack

- TypeScript (strict-ish: `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`), Obsidian API
- esbuild bundles `src/main.ts` → `main.js` (CJS, es2018)
- ESLint with `eslint-plugin-obsidianmd` recommended rules
- No external runtime dependencies; data stored as JSON in the vault

## Development

```bash
npm install
npm run dev      # esbuild watch mode, writes main.js with inline sourcemaps
npm run build    # tsc type-check (no emit) + minified production build
npm run lint     # eslint .
```

CI (`.github/workflows/lint.yml`) runs `npm ci`, `npm run build`, and `npm run lint` on Node 20 and 22 — make sure both pass before pushing. There are no tests.

To try it in Obsidian, copy (or symlink the repo) `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/gym-plugin/`, then reload Obsidian. See `HOW-TO-RUN.md`.

## Conventions & Gotchas

- Source files use 2-space indentation (despite `.editorconfig` specifying tabs); match the existing code.
- `MUSCLE_GROUPS` and `EQUIPMENT_TYPES` in `types.ts` are the single source of truth; the `MuscleGroup`/`Equipment` types are derived from them. Import these arrays rather than re-listing values.
- `WeightUnit` in `types.ts` is unused; `settings.ts` declares its own `'kg' | 'lbs'`.
- Format dates with `moment` imported from `obsidian` (local time), not `toISOString()` (UTC — gives the wrong day near midnight).
- `main.js` and `data.json` are gitignored build/runtime outputs — don't edit or commit them.

## Data Storage

- Exercise library + programmes: `<vault>/.gym/exercises.json`
- Session notes: configurable folder, default `Gym/Sessions/`
- Plugin settings: `plugin.saveData()` → `<vault>/.obsidian/plugins/gym-plugin/data.json`
