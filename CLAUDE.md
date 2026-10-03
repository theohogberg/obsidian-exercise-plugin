# Obsidian Gym Plugin

An Obsidian plugin for tracking gym workouts, managing an exercise library and reusable workout templates, and logging sessions as Obsidian notes.

Plugin id `gym-plugin` (see `manifest.json`). Bootstrapped from the official Obsidian sample plugin — `AGENTS.md` and `README.md` are mostly the generic sample-plugin docs; this file describes the actual project.

## Core Features

### Exercise Library
- Stored as JSON in the vault at `.gym/exercises.json` (holds both exercises **and** templates — see `GymData` in `types.ts`)
- Each exercise has: `id`, `name`, `muscleGroup`, `equipment`, `defaultSets`, `defaultReps`, `defaultWeight`, `notes`
- Muscle groups: chest, back, shoulders, biceps, legs, core, triceps
- Equipment: barbell, dumbbell, machine, cable, bodyweight, other
- Managed via `LibraryModal` (lists exercises + templates with edit/delete buttons)
- Deleting an exercise also removes it from every template's entries

### Workout Templates
- A `WorkoutTemplate` is `{ id, name, entries: TemplateEntry[] }`, where each entry is `{ exerciseId, sets, reps, weight }`
- Created/edited in `ExerciseTemplateModal` (toggle exercises from the library and set sets/reps/weight per entry)
- Can also be created from the session builder via "Save as Template"

### Session Builder (`SessionBuilderModal`)
- Optional "Load template" dropdown (only shown if templates exist) — appends the template's exercises, skipping ones already selected
- Search box + muscle-group filter over the library
- Add exercises with "+ Add" (seeded from the exercise's defaults)
- Reorder with ↑/↓ buttons (no drag-and-drop yet), remove with ×
- Override sets/reps/weight per exercise for that session
- **Save Session**: writes the note, then writes each exercise's session sets/reps/weight back as its new defaults (progressive-overload memory) and saves the store
- **Save as Template**: prompts for a name (inline `NameModal` in `sessionModal.ts`) and saves the current selection as a template

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
  main.ts                    # GymPlugin: loads settings + ExerciseStore, registers ribbon icon, commands, settings tab
  types.ts                   # Exercise, SessionExercise, TemplateEntry, WorkoutTemplate, GymData, MuscleGroup, Equipment
  exercises.ts               # ExerciseStore — load/save .gym/exercises.json, CRUD for exercises and templates
  libraryModal.ts            # LibraryModal — exercise + template manager ("Manage exercises" command)
  exerciseModal.ts           # ExerciseEditorModal — add/edit a single exercise
  exerciseTemplateModal.ts   # ExerciseTemplateModal — add/edit a workout template
  sessionModal.ts            # SessionBuilderModal — build a session, save note / save as template
  settings.ts                # GymPluginSettings, DEFAULT_SETTINGS, GymSettingsTab
styles.css                   # gym-* classes used by the modals
```

### Patterns
- `ExerciseStore` is a single in-memory instance owned by the plugin and passed into every modal. Mutations (`upsertExercise`, `deleteExercise`, `upsertTemplate`, `deleteTemplate`) are in-memory only — callers must `await store.save()` afterwards.
- `getExercises()` / `getTemplates()` return the live arrays, not copies. Editor modals clone (`{ ...exercise }`) before editing; `SessionBuilderModal` holds live references and mutates them on save.
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
- The muscle-group list is duplicated in `types.ts`, `exerciseModal.ts` (`MUSCLE_GROUPS`), and `sessionModal.ts` (filter dropdown) — update all three when changing it. Same for equipment (`types.ts` + `exerciseModal.ts`).
- `WeightUnit` in `types.ts` is unused; `settings.ts` declares its own `'kg' | 'lbs'`.
- Format dates with `moment` imported from `obsidian` (local time), not `toISOString()` (UTC — gives the wrong day near midnight).
- `main.js` and `data.json` are gitignored build/runtime outputs — don't edit or commit them.

## Data Storage

- Exercise library + templates: `<vault>/.gym/exercises.json`
- Session notes: configurable folder, default `Gym/Sessions/`
- Plugin settings: `plugin.saveData()` → `<vault>/.obsidian/plugins/gym-plugin/data.json`
