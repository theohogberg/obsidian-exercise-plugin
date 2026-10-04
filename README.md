# Gym

An Obsidian plugin for logging gym workouts. Build **programmes** from your **exercises**, start one, and every exercise is already filled in with what you lifted last time. Tick off sets as you go, and the finished **session** is saved as a note in your vault.

Inspired by [RepCount](https://apps.apple.com/us/app/repcount-gym-workout-tracker/id594982044).

## How it works

1. **Manage programmes and exercises** (command palette): the library starts with 39 common exercises, 5–6 per muscle group, each with photos, cues and instructions. Add your own (name, muscle group, equipment, cues, images), then group exercises into programmes such as "Push day", in the order you train them.
2. **Workouts** (the dumbbell ribbon icon, or "Open workouts" in the command palette) opens the workout tab with three buttons:
   - **Start session**: choose a programme (with when you last did it) and press Start. Each exercise's sets are prefilled with the weight and reps from last time.
   - **Start empty session**: add exercises as you go.
   - **Design programme**: create a template for a session: exercises in order, with sets and reps.
3. During the workout: edit weight and reps per set, tick sets off (this starts the timer between sets), add or remove sets and exercises, and write notes. Progress is saved continuously, so closing Obsidian doesn't lose the workout.
4. **Finish workout**: ticked-off sets are written to a note like `Gym/Sessions/2026-10-04 Push day.md`, and become "last time" for next time. The programme's Sets and Reps update to what you did.

### Exercise info

The ⓘ button on an exercise (in the workout tab, the library and the programme editor) opens a popup showing how to do it: images, your cues and step-by-step instructions. Several images play in turn like a GIF. To add images or GIFs to your own exercises, put links or vault paths (one per line) in the exercise editor's Images field. Showing a 3D model of the movement is planned.

Vaults created before default exercises existed get them added once, automatically; exercises you already have with the same name are skipped. Default exercises you delete stay deleted. **Add default exercises** (command palette or library) adds back any you removed.

## Session note

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
- 85kg × 6
- 82.5kg × 7

> Felt heavy
```

## Settings

- Sessions folder (default `Gym/Sessions`)
- Weight unit (kg / lbs)
- Open the note after finishing
- Prefill from: the last time the exercise was done anywhere, or the last time it was done in this programme
- Timer between sets: on/off and length

## Data

Exercises, programmes and per-exercise history are stored in `<vault>/.gym/data.json`, a workout in progress in `<vault>/.gym/active-session.json`, and downloaded exercise images in `<vault>/.gym/media/`. Data from earlier versions (`.gym/exercises.json`) is migrated automatically and the old file is left in place.

## Network use

The default exercises' photos are hosted in this repository (`assets/exercises/`) and loaded from GitHub (`raw.githubusercontent.com`). They are downloaded into `<vault>/.gym/media/` (about 5 MB) when the default exercises are added, so they work offline afterwards. Web images you add to your own exercises are saved there too the first time they're shown, or all at once with **Download exercise images for offline use**. Nothing else is sent or fetched.

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # type-check + production build
npm run lint
npm test            # type-check and run the tests (Vitest)
npm run exercises   # regenerate src/defaultExercises.ts from assets/exercises
```

### Default exercises

Each default exercise is a folder in [`assets/exercises/`](assets/exercises/) with a `README.md` (front matter, then Cues, Setup and numbered Steps) and its photos. To change one, or add a new one, edit or add a folder and run `npm run exercises`; don't edit `src/defaultExercises.ts` by hand. `npm run build` fails if the generated file is out of date. Photos are from the public-domain [free-exercise-db](https://github.com/yuhonas/free-exercise-db); names, cues and instructions are our own.

Copy (or symlink the repo) `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/gym-plugin/`, then reload Obsidian. See `HOW-TO-RUN.md`.
