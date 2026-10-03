# Redesign plan: exercises → programmes → sessions

## Goal

Pick a **programme**, start it, and get a **session** that already contains its **exercises** in order, each prefilled with what you did last time: per-set weights and reps, plus notes. Adjust while training, tick sets off, finish, and the session is saved as a note.

## Reference app

Modelled on [RepCount](https://apps.apple.com/us/app/repcount-gym-workout-tracker/id594982044):
- a whole workout is logged on one page, not exercise by exercise
- today's workout is prefilled with the weights from last time, with a setting for "last time in general" vs "last time in this programme"
- history is visible from inside the active workout, to make progressive overload easy
- a rest timer can start automatically when a set is completed
- supersets, timed and carry exercises, and charts (estimated 1RM, volume, PRs) are extras

## Concepts

| Concept | What it is | Stores weights? |
|---|---|---|
| Exercise | One movement in the library, with permanent cues ("elbows tucked") | No |
| Programme | Named, ordered list of exercises, each with sets and reps | **No** |
| Session | One performed workout: date, programme, per-set log, notes | Yes, it's the record |

The key change: weights live in **session history**, not in exercises or programmes. "Latest" means "what the last session did", so it can never go stale the way the current template weights do.

## Data model (`types.ts`)

```ts
interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  notes: string;                 // permanent cues
}

interface ProgrammeExercise {
  exerciseId: string;
  sets: number;                  // kept equal to the last values performed (see "Programme sets and reps")
  reps: number;
}

interface Programme {
  id: string;
  name: string;
  exercises: ProgrammeExercise[];   // order matters
}

interface SetLog {
  weight: number;
  reps: number;
  done: boolean;
}

interface SessionExercise {
  exerciseId: string;
  sets: SetLog[];
  notes: string;                 // notes for this exercise in this session
}

interface Session {
  id: string;
  startedAt: string;             // ISO, local time
  programmeId: string | null;    // null = empty session
  programmeName: string;         // copied so the note stays correct if the programme is renamed
  exercises: SessionExercise[];
  notes: string;
}

interface ExerciseLog {
  date: string;
  programmeId: string | null;    // lets prefill filter by programme
  sets: { weight: number; reps: number }[];
  notes: string;
  notePath: string;              // link back to the session note
}

interface GymData {
  version: 2;
  exercises: Exercise[];
  programmes: Programme[];
  history: Record<string, ExerciseLog[]>;   // keyed by exerciseId, newest first, capped (e.g. 20)
}
```

`.gym/exercises.json` becomes `.gym/data.json`. The active, unfinished session is kept in `.gym/active-session.json` and written on every change.

## Prefill rule

When a session starts from a programme, each exercise gets:

1. the sets from the most recent matching `history[exerciseId]` entry (same number of sets, same weight and reps, all `done: false`), and last time's notes shown as a hint, **or**
2. if there's no history: the programme's `sets` × `reps` at weight 0.

Where "last time" comes from is a setting, as in RepCount:
- `prefillFrom: 'exercise'` (default): the last time the exercise was done in any session, i.e. `history[exerciseId][0]`
- `prefillFrom: 'programme'`: the first `history[exerciseId]` entry with this `programmeId`, falling back to the `'exercise'` rule if there is none.

## Programme sets and reps

In the programme editor, each exercise row has separate **Sets** and **Reps** columns. They always reflect the last values performed:
- When an exercise is added to a programme, Sets and Reps are filled from its most recent `history` entry: the number of sets, and the reps of the first set. With no history they start at 3 × 8 and can be edited.
- When a session from that programme is finished, each of its exercises' `sets` and `reps` in the programme are updated the same way from what was just done.
- They can still be edited by hand, e.g. to plan a change before the next session.

## User flow

- **Command / ribbon: "Start programme"** opens a fuzzy picker (`SuggestModal<Programme>`), which opens the session view prefilled.
- **Command: "Start empty session"** opens the session view with no exercises.
- **Session view** (an Obsidian tab, `ItemView`, not a modal) shows one card per exercise:
  - name, permanent cues, and "Last time: 80×8, 80×8, 77.5×7"; tapping it expands the last few sessions for that exercise (from `history`)
  - a row per set with weight and reps inputs and a done checkbox; add/remove set
  - per-exercise notes
  - reorder (↑/↓), remove, "+ Add exercise" mid-session
  - session notes, **Finish** and **Discard** buttons
  - everything on one scrolling page, so you never navigate between exercises
- **Finish** writes the session note, prepends an `ExerciseLog` to `history` for each exercise that has at least one done set, and clears the active session.
- **Reopen after a crash**: on plugin load, if `active-session.json` exists, the session view reopens it.
- **Command: "Manage exercises and programmes"** opens the library. The programme editor gets real ordering (↑/↓) instead of toggle order, and separate Sets and Reps columns.

## Session note format

Same folder setting as now; filename `YYYY-MM-DD <programme>.md` (fallback `workout`), with the existing ` 1`, ` 2` suffix on collisions.

```markdown
---
date: 2026-10-04
type: workout
programme: Push day
muscles: [chest, triceps]
---

# Push day — 2026-10-04

## Bench Press
- 80kg × 8
- 80kg × 8
- 77.5kg × 7

> Felt heavy, sleep was bad

## Tricep Pushdown
- 30kg × 12
- 30kg × 12

## Notes
Good session overall.
```

Only done sets are written. Set lines keep a fixed `<weight><unit> × <reps>` format so they can be parsed back later.

## Migration (on load, `version` missing → 2)

- `templates` → `programmes` (already handled for the key).
- Programme entries `{ exerciseId, sets, reps, weight }` → `{ exerciseId, sets, reps }`. The template weight is dropped.
- Each exercise's `defaultSets/defaultReps/defaultWeight` seeds one `history` entry (that many sets at that weight × reps, dated today, no programme, no note path), then those fields are removed. Nobody loses their current numbers.
- Save to `data.json`; leave the old `exercises.json` in place as a backup.

## Files

```
src/
  main.ts              # commands, ribbon, view registration, resume active session
  types.ts             # model above
  store.ts             # GymStore: exercises, programmes, history, migration, active-session file
  session.ts           # build a session from a programme (prefill rule), sets → summary helpers
  sessionView.ts       # SessionView (ItemView), replaces sessionModal.ts
  sessionNote.ts       # Session → markdown, file naming
  programmePicker.ts   # SuggestModal for "Start programme"
  libraryModal.ts      # exercises + programmes list
  exerciseModal.ts     # exercise editor (default sets/reps/weight fields removed)
  programmeModal.ts    # programme editor with ordering and Sets/Reps columns
  settings.ts
```

## Phases

Each phase builds, lints, and leaves the plugin usable.

1. **Model + store + migration.** New types, `GymStore` with `history`, migration, checked by hand against a copy of an old `exercises.json`. The old session modal reads prefill from `history` so nothing breaks.
2. **Programme editor.** Ordered list with ↑/↓, add/remove exercises, Sets and Reps columns filled from history, no weight.
3. **Session view + active session.** `SessionView`, per-set rows, active-session persistence and resume, "Start programme" / "Start empty session" commands.
4. **Finish.** Note writing (`sessionNote.ts`), `history` update, programme Sets/Reps update, delete `sessionModal.ts`.
5. **Rest timer.** Starts when a set is ticked done (setting: on/off and default duration), shown at the top of the session view, with a notice when it ends.
6. **Cleanup.** Fix the remaining lint errors so CI goes green; update `CLAUDE.md`, `README.md`, `manifest.json` description.

Later, not in this redesign: supersets, timed and carry exercise types, rebuilding history from session notes, charts (estimated 1RM, volume, PRs), per-programme progression rules.

## Decisions

- Weight and reps are logged **per set**.
- The session is a **tab** (`ItemView`), not a popup.
- Programmes have **separate Sets and Reps columns**, kept equal to the last values performed (see "Programme sets and reps").
- "Last time" defaults to the last time the exercise was done anywhere; the `prefillFrom` setting switches to "in this programme".
