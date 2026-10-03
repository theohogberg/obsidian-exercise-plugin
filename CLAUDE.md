# Obsidian Gym Plugin

An Obsidian plugin for tracking gym workouts, managing exercise libraries, and planning training sessions.

## Project Overview

This plugin lets users build an exercise library, compose workout sessions from those exercises, and log completed sessions as Obsidian notes.

## Core Features

### Exercise Library
- CRUD operations for exercises stored as a JSON file in the vault (`.gym/exercises.json`)
- Each exercise has: `id`, `name`, `muscleGroup`, `equipment`, `defaultSets`, `defaultReps`, `defaultWeight`, `notes`
- Muscle groups: chest, back, shoulders, biceps, legs, core, triceps
- Equipment: barbell, dumbbell, machine, cable, bodyweight, other

### Session Builder
- Modal UI for composing a workout session
- Multi-select exercises from the library (searchable, filterable by muscle group)
- Reorder exercises via drag-and-drop
- Capability to create exercise templates that can be selected for a sessions
- Override sets/reps/weight per exercise for that session
- Save exercise data after each session
- Save session as a new Obsidian note

### Session Note Format
Sessions are saved as markdown notes in a configurable folder (default: `Gym/Sessions/`). Filename: `YYYY-MM-DD workout.md`.

```markdown
---
date: 2024-01-15
type: workout
muscles: [chest, triceps]
---

# Workout — 2024-01-15

## Bench Press
- Sets: 4 × 8 @ 80kg

## Tricep Pushdown
- Sets: 3 × 12 @ 30kg
```

### Settings
- Session notes folder path
- Default weight unit (kg / lbs)
- Whether to open the new note after saving

## Architecture

```
src/
  main.ts            # Plugin entry point, registers commands and settings
  exercises.ts       # ExerciseStore — load/save/CRUD for exercise library
  sessionModal.ts    # SessionBuilderModal — multi-step modal UI
  exerciseTemplateModal.ts   # ExerciseEditorModal — create exercise template
  exerciseModal.ts   # ExerciseEditorModal — add/edit a single exercise
  settingsTab.ts     # PluginSettingsTab
  types.ts           # Shared TypeScript interfaces
```

## Commands

| Command | Description |
|---|---|
| `gym: New session` | Opens SessionBuilderModal to build and save a workout |
| `gym: Manage exercises` | Opens exercise library manager |

## Tech Stack

- TypeScript, Obsidian API
- No external runtime dependencies
- Data stored as JSON in the vault (no external DB)

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
```

Copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/gym-plugin/` in your vault.

## Data Storage

- Exercise library: `<vault>/.gym/exercises.json`
- Session notes: configurable folder, default `Gym/Sessions/`
- Plugin settings: stored via `plugin.saveData()` (Obsidian's built-in mechanism)
