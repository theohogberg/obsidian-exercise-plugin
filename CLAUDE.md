# Obsidian Gym Plugin

An Obsidian plugin for logging gym workouts, modelled on the iPhone app RepCount. Plugin id `gym-plugin` (see `manifest.json`). `AGENTS.md` is a general Obsidian plugin guide; this file describes the actual project.

## Domain terms (use these in code and UI)

- **Exercise**: one movement in the library (name, muscle group, equipment, permanent cues). Stores no weights.
- **Programme**: a named, **ordered** list of exercises, each with Sets and Reps. Stores no weights.
- **Session**: one performed workout, usually started from a programme. Logged per set (weight, reps, done).
- **History**: per exercise, the sets performed in past sessions, newest first. This is the only place weights live.

## Core behaviour

- **Prefill**: starting a programme builds a session where each exercise's sets copy the most recent history entry (`GymStore.getLastLog`). With no history, it uses the programme's Sets × Reps at weight 0. The `prefillFrom` setting picks "last time anywhere" (`'exercise'`, default) or "last time in this programme" (`'programme'`, falls back to anywhere).
- **Programme Sets/Reps track the last values performed**: when an exercise is added to a programme they come from its latest history (set count, reps of the first set; 3 × 8 if none), and `finishSession` updates them from the sets just done. They can still be edited by hand.
- **Active session** is saved to `.gym/active-session.json` on every change and reopened on startup, so closing Obsidian mid-workout loses nothing. Only one session can be active.
- **Finish** (`finishSession`): saves **every set row as entered** (there is no Done/tick column; to skip a planned set, remove its row). Writes the note, prepends an `ExerciseLog` to each exercise's history (capped at 20), updates the programme's Sets/Reps, saves, and clears the active session.
- **Default exercises** (`defaultExercises.ts`, 39 exercises, 5–6 per muscle group, ids `default-*`): added automatically once per vault by `GymStore.load()` (new and existing vaults; skips matching ids or names; the `defaultsAdded` flag in data.json stops deleted ones coming back). The "Add default exercises" command or library button re-adds missing ones (`GymStore.addDefaultExercises`). **Source of truth is `assets/exercises/<slug>/README.md`** (front matter `id`, `name`, `muscleGroup`, `equipment`; sections `## Cues`, `## Setup`, `## Steps` as a numbered list) plus the images in that folder. `scripts/build-exercises.mjs` generates `src/defaultExercises.ts` (`npm run exercises`; never hand-edit it; `npm run build` runs it with `--check`). Photos are from free-exercise-db (public domain) and served from this repo's raw GitHub URLs, so new or changed photos only load for users once pushed to `main`. Stored defaults still pointing at the old free-exercise-db URLs are switched by `moveLegacyImages()` in `load()`. Names, cues and how-tos are our own: a one-sentence `setup` (shown as "Setup:") followed by 2–3 short numbered movement `instructions`. Setup and instructions can't be edited in the app, so `syncDefaultHowTo()` in `load()` updates stored copies whenever the built-in text changes; other fields of default exercises may have been edited by the user and are never overwritten.
- **Exercise info popup** (`ExerciseInfoModal`, ⓘ button in the workout tab, library and programme editor): media, cues, then "How to do it": **Setup:** line and numbered steps. `Exercise.media` is a tagged union (`{ type: 'image', src }`, `src` = URL, vault path or `[[link]]`); `renderExerciseMedia` cycles through several images like a GIF. Web images are cached in `.gym/media/<host>/<path>` by `MediaCache` (`store.media`): downloaded after `load()` for `store.exercisesNeedingImages` (defaults it just added, or ones `moveLegacyImages()` switched to new URLs), by the "Download exercise images for offline use" command, and in the background the first time an uncached image is shown; `resolveMediaSrc` prefers the local copy. A 3D model renderer is planned: add a `{ type: 'model' }` variant and handle it in `renderExerciseMedia`.
- **Rest timer**: a sticky bar at the top of the workout. Idle it's one **Rest** button (length from `restSeconds`); running it shows the countdown with -15s/+15s/Skip, and only the countdown text updates each tick so the buttons aren't replaced mid-tap. `restTimerEnabled` hides the bar. When time is up, `restOverAlert` (`restAlert.ts`) shows a notice, beeps, vibrates where supported (Android) and, on desktop when Obsidian isn't focused, posts a system notification. The beep only works if `primeRestAlert()` ran in the Rest tap (browsers, iOS especially, need a user gesture to unlock audio). An Obsidian plugin can't post real phone notifications and mobile pauses it in the background, so on a phone the alert needs Obsidian open with the screen on.

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
  sessionView.ts     # SessionView, the "Workouts" tab: home when idle (three buttons: Start session → programme list, Start empty session, Design programme; `homeMode`); set logging, history, notes, rest bar, finish/discard during a workout
  restAlert.ts       # what happens when a rest ends: notice, beep, vibration, desktop notification
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
npm test         # type-check tests (tsc -p tests) + vitest
npm run exercises # regenerate src/defaultExercises.ts from assets/exercises/*/README.md
```

Node 24 and npm are installed locally (Homebrew), so use the npm scripts above. Bun (`/opt/homebrew/bin/bun`) is also installed and can run the same tools if npm is ever unavailable: `bun node_modules/typescript/bin/tsc`, `bun node_modules/eslint/bin/eslint.js .`, `bun esbuild.config.mjs production`.

CI (`.github/workflows/lint.yml`) runs build, lint and tests on Node 22, 24 and 26; all must pass. `.nvmrc` pins local development to Node 24 (the current LTS). Keep the CI matrix to supported release lines: drop a version when it reaches end of life and add the new even-numbered release once it is out (schedule: https://github.com/nodejs/release#release-schedule).

### Tests

Vitest, in `tests/`. Run `npm test` after any change to `src/`, and add or update tests with behaviour changes.

- **Pre-push hook**: `.githooks/pre-push` runs `npm test` before every `git push` and blocks the push if a test fails. `npm install` enables it (the `prepare` script sets `core.hooksPath` to `.githooks`). Don't bypass it with `--no-verify`; fix the failure instead, unless the user asks.

- `tests/stubs/obsidian.ts` stands in for the `obsidian` module (aliased in `vitest.config.ts`): real `moment`, `normalizePath`, a recording `Notice`, a programmable `requestUrl` (`setRequestUrlHandler`), Obsidian's DOM helpers (`createEl`, `createDiv`, `empty`, `toggleClass`…), and `ItemView`/`Modal`/`Setting`/… that produce Obsidian's markup. Import its test-only exports (`notices`, `openModals`, `setRequestUrlHandler`) from `./stubs/obsidian`, not `obsidian`, so they type-check.
- `tests/helpers.ts`: `fakeApp()` (in-memory vault behind the adapter API), `testSettings()`, `legacyData` (pre-v2 file), `flush()`.
- Logic tests (`store`, `session`, `sessionNote`, `mediaCache`, `defaultExercises`) run in Node.
- Keep the suite small: one test per user-visible behaviour, merged where tests share a setup. Extend an existing test before adding a new one, and don't re-test what `npm run build` or the generator script already checks. `rendering.test.ts` uses happy-dom (`// @vitest-environment happy-dom`) to render the real views and check the structure the CSS relies on, e.g. every table row has as many cells as its header.
- `tests/tsconfig.json` type-checks tests with the source (Node types allowed there). ESLint relaxes the plugin-runtime rules (Node modules, window timers, createEl, direct moment import) for `tests/**` only.
- Visual checks aren't automated: they need Obsidian's own `app.css` (inside the app's `.asar`), so render the views with the stub, wrap them in Obsidian's markup and screenshot locally (Quick Look) when changing layout.

## Versioning

The plugin follows [semantic versioning](https://semver.org). The version describes **what Obsidian installs**: `main.js`, `manifest.json` and `styles.css`. Bump it only when a push changes one of those, and choose the bump by what the change does for users.

**No bump** when the shipped plugin is unchanged: tests, CI, dev dependencies and tooling config (TypeScript, ESLint, Vitest), docs (`CLAUDE.md`, `AGENTS.md`, `README.md`), and anything else that doesn't reach those three files. Push these without a version change or tag.

How to tell: if `src/`, `styles.css`, `manifest.json` or `esbuild.config.mjs` changed since the last tag (`git diff --stat $(git describe --tags --abbrev=0) -- src styles.css manifest.json esbuild.config.mjs`), it's a plugin change. Changing `assets/exercises/` counts too, because it regenerates `src/defaultExercises.ts`. After upgrading build tools (esbuild, the `obsidian` types), also build and compare `main.js` with the last release (the copy in the user's vault); a byte-identical build means no bump.

| Bump | When | Examples |
|---|---|---|
| **Patch** (0.2.2 → 0.2.3) | Bug fixes, UI polish, wording changes in the plugin; no new behaviour | Column alignment fix, shorter exercise instructions |
| **Minor** (0.2.2 → 0.3.0) | New features, and anything breaking: data format changes that need a migration, changed session-note format, removed or renamed commands or settings | Rest timer, default exercises, moving image URLs |
| **Major** | Stays `0` until the user decides the plugin is 1.0. Don't bump it on your own. | |

While the major version is 0, breaking changes bump the minor version. If a push contains several plugin changes, use the largest bump that applies, once. (0.2.3–0.2.5 were bumped under an earlier, broader rule for docs, CI and type-only changes; they stay in the history.)

How to bump, after the work itself is committed:

- `npm version patch` (or `minor`). This updates `package.json` and `package-lock.json`, runs `version-bump.mjs` (sets `manifest.json`'s version and adds a `versions.json` entry only when `minAppVersion` changed), then commits and tags. `.npmrc` sets an empty tag prefix, so the tag is `0.2.3`, not `v0.2.3`, as Obsidian releases require. The working tree must be clean first. npm's commit message is just the version (e.g. `0.2.5`); that's expected.
- Without npm, make the same edits by hand: `version` in `manifest.json`, `package.json`, and both places in `package-lock.json`; a `versions.json` entry only if `minAppVersion` changed. Then commit as "Bump version to x.y.z" and tag it with an **annotated** tag: `git tag -a x.y.z -m x.y.z`.
- Push with `git push origin main --follow-tags` so the tag goes too. `--follow-tags` skips lightweight tags (plain `git tag x.y.z`), so check with `git ls-remote --tags origin`.
- Copy the new `manifest.json` into the user's vault along with `main.js` and `styles.css`.
- Mention the new version number when reporting a push.

## Lint gotchas (eslint-plugin-obsidianmd)

- `obsidianmd/no-unsupported-api` checks every Obsidian API against `minAppVersion` in `manifest.json` (currently 1.7.2, set by `Workspace.revealLeaf`). Using a newer API means raising `minAppVersion`, which needs a `versions.json` entry and is a minor version bump. The remaining warnings (`setWarning` → `setDestructive`, declarative settings via `getSettingDefinitions()`) need Obsidian 1.13 and are left until `minAppVersion` reaches it.
- Disabling `obsidianmd/ui/sentence-case` with an `eslint-disable` comment is itself an error; reword the text, or pass a non-literal (e.g. `DEFAULT_SETTINGS.sessionsFolder`).
- UI text must be sentence case. Labels starting with `+`, "e.g.", and the word "Rest" (read as the acronym REST) are flagged.
- Obsidian components (`Setting`, `DropdownComponent`, …) have a `then()` method, so an arrow function that *returns* one, like `forEach(g => d.addOption(g, g))`, is flagged as a misused promise. Use a block body: `forEach(g => { d.addOption(g, g); })`.
- Async click handlers: wrap as `() => { void this.doThing(); }`.
- No HTML headings in the settings tab.

## Tooling limits

- **TypeScript 6.0.x is the newest usable version**: typescript-eslint supports TypeScript below 6.1, so TypeScript 7 would break linting.
- `tsconfig.json` sets `esModuleInterop: false` with `ignoreDeprecations: "6.0"` because `obsidian.d.ts` types `moment` via `import * as Moment`, which is only callable under the old interop rules. Remove both once Obsidian's typings change.
- `tsconfig.json` is type-check only (`noEmit`; esbuild bundles) with `strict` on and `types: []`, so Node globals can't creep into plugin code that also runs on mobile.
- ESLint is on 10. `eslint-plugin-obsidianmd` pins `@eslint/js` to 9 and some of its bundled rule plugins only support ESLint 9, so npm installs a nested ESLint 9 for them; that's expected.
- `npm audit` reports `moment` (inside the `obsidian` type package). Obsidian supplies `moment` at runtime, so it doesn't apply; npm's suggested fix (downgrading `obsidian` to 0.14) is wrong.

## Conventions

- Indentation follows `.editorconfig`: 2 spaces for TypeScript, CSS, Markdown and scripts; tabs for JSON files and the esbuild/ESLint configs.
- `main.js` and `data.json` are gitignored build/runtime outputs.

## Data storage

- Exercises, programmes, history: `<vault>/.gym/data.json`
- Workout in progress: `<vault>/.gym/active-session.json`
- Offline copies of exercise images: `<vault>/.gym/media/`
- Legacy (pre-v2, kept as backup): `<vault>/.gym/exercises.json`
- Session notes: settings folder, default `Gym/Sessions/`
- Plugin settings: `plugin.saveData()`, stored in `<vault>/.obsidian/plugins/gym-plugin/data.json`
