# Gym

An Obsidian plugin for logging gym workouts. Build **programmes** from your **exercises**, start one, and every exercise is already filled in with what you lifted last time. Tick off sets as you go, and the finished **session** is saved as a note in your vault.

Inspired by [RepCount](https://apps.apple.com/us/app/repcount-gym-workout-tracker/id594982044).

## How it works

1. **Manage programmes and exercises** (command palette): add exercises (name, muscle group, equipment, cues), then group them into programmes such as "Push day", in the order you train them.
2. **Start programme** (ribbon dumbbell or command palette): pick a programme. A workout tab opens with each exercise's sets prefilled with the weight and reps from last time.
3. During the workout: edit weight and reps per set, tick sets off (this starts the timer between sets), add or remove sets and exercises, and write notes. Progress is saved continuously, so closing Obsidian doesn't lose the workout.
4. **Finish workout**: ticked-off sets are written to a note like `Gym/Sessions/2026-10-04 Push day.md`, and become "last time" for next time. The programme's Sets and Reps update to what you did.

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

Exercises, programmes and per-exercise history are stored in `<vault>/.gym/data.json`, and a workout in progress in `<vault>/.gym/active-session.json`. Data from earlier versions (`.gym/exercises.json`) is migrated automatically and the old file is left in place.

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # type-check + production build
npm run lint
```

Copy (or symlink the repo) `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/gym-plugin/`, then reload Obsidian. See `HOW-TO-RUN.md`.
