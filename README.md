# Gym

Log gym workouts in Obsidian. Build **programmes** from your **exercises**, start one, and every set is already filled in with what you lifted last time. Adjust the numbers as you train, and the finished **session** is saved as a note in your vault.

Works on desktop and mobile; requires Obsidian 1.7.2 or newer.

## Features

- **39 default exercises**, 5–6 per muscle group, each with start/end photos, cues and step-by-step instructions. Add your own, with your own images or GIFs.
- **Programmes**: ordered lists of exercises with sets and reps, which follow what you actually did last time.
- **Sessions prefilled from history**: weights and reps come from the last time you did each exercise.
- **Rest timer** with a sound, a banner and vibration when the rest is over.
- **Session notes** with front matter (date, start and end time, programme, muscles) and one line per set, easy to search or query.
- **Nothing lost mid-workout**: progress is saved continuously and the workout reopens after Obsidian restarts.

## Using it

### The Workouts tab

Click the dumbbell icon in the ribbon, or run **Open workouts** from the command palette. When no workout is running, the tab shows four buttons:

- **Start session**: choose a programme (each shows its exercises and when you last did it) and press **Start**.
- **Start empty session**: start without a programme and add exercises as you go.
- **Design programme**: create a programme: pick exercises, put them in order, and set sets and reps.
- **Edit programme**: pick a programme and change its exercises, order, sets or reps.

### During a workout

Each exercise is a card with its cues, a row per set (weight and reps), an **Add set** button and a box for notes. Use ⓘ to see how to do the exercise, the arrows to reorder, and × to remove a set or an exercise. **Add exercise** at the bottom adds one from your library.

The **Rest** button stays at the top while you scroll. Tap it after a set to start the countdown (adjust with −15 s / +15 s, or **Skip**). When time is up you get a beep and a banner, plus a vibration on Android and a system notification on desktop.

> On a phone the rest alert only works while Obsidian is open with the screen on: Obsidian plugins can't send real phone notifications, and the phone pauses Obsidian in the background. The beep is muted when the phone is on silent.

### Finishing

**Finish workout** saves **every set row as entered**, so remove the rows for sets you didn't do. The session is written to a note (by default `Gym/Sessions/2026-10-04 Push day.md`), each exercise's sets become "last time" for your next session, and the programme's sets and reps update to what you did. **Discard** throws the workout away.

### Exercises and programmes

**Manage programmes and exercises** (command palette) opens the library: programmes with a **Start** button, and exercises grouped by muscle group. Edit or delete anything there, or add exercises with a name, muscle group, equipment, cues and images (links, vault paths or `[[links]]`, one per line; several images play in turn like a GIF).

Deleting an exercise removes it from every programme and deletes its history; your session notes are kept. Default exercises you delete stay deleted; **Add default exercises** brings back any you removed.

## Session note

```markdown
---
date: 2026-10-04
start: 2026-10-04T09:30
end: 2026-10-04T10:45
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

## Notes
Good session
```

`start` and `end` show as date-and-time properties in Obsidian.

## Commands

| Command | What it does |
|---|---|
| Open workouts | Opens the Workouts tab (also the dumbbell ribbon icon) |
| Start empty session | Starts a workout without a programme |
| Manage programmes and exercises | Opens the library |
| Add default exercises | Adds back default exercises you deleted |
| Download exercise images for offline use | Saves all exercise images into the vault |

## Settings

| Setting | Default | |
|---|---|---|
| Sessions folder | `Gym/Sessions` | Where session notes are saved |
| Weight unit | kg | kg or lbs |
| Open note after saving | On | Opens the session note when you finish |
| Prefill from | Last time the exercise was done | Or: last time it was done in this programme |
| Timer between sets | On | Shows the Rest button |
| Time between sets | 90 seconds | Length of the rest timer |

## Your data and network use

Everything stays in your vault:

- Exercises, programmes and history: `.gym/data.json`
- A workout in progress: `.gym/active-session.json`
- Exercise images saved for offline use: `.gym/media/`
- Session notes: the sessions folder above

The default exercises' photos are hosted in this repository and downloaded from GitHub (`raw.githubusercontent.com`) into `.gym/media/` (about 5 MB) when the default exercises are added, so they work offline afterwards. Web images you add to your own exercises are saved there the first time they're shown, or all at once with **Download exercise images for offline use**. Nothing else is sent or fetched, and there is no telemetry.

## Development

Requires Node 22 or newer (24 recommended, see `.nvmrc`).

```bash
npm install
npm run dev         # rebuild main.js on every change
npm run build       # type-check + production build
npm run lint
npm test            # type-check and run the tests; also runs before every git push
npm run exercises   # regenerate src/defaultExercises.ts from assets/exercises
```

To try a build, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/gym/` (or symlink the repository there), then enable **Gym** in **Settings → Community plugins**. After a rebuild, switch the plugin off and on again.

Each default exercise is a folder in [`assets/exercises/`](assets/exercises/) with its photos and a `README.md` (cues, setup and numbered steps). Edit or add a folder and run `npm run exercises`; `src/defaultExercises.ts` is generated, and `npm run build` fails if it's out of date.

## Credits and license

Exercise photos are from the public-domain [free-exercise-db](https://github.com/yuhonas/free-exercise-db); exercise names, cues and instructions are our own. Licensed under [0BSD](LICENSE).
