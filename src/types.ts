export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'legs', 'core', 'triceps'] as const;
export const EQUIPMENT_TYPES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];
export type Equipment = typeof EQUIPMENT_TYPES[number];
export type WeightUnit = 'kg' | 'lbs';
export type PrefillFrom = 'exercise' | 'programme';

/**
 * Something that shows how an exercise is performed. `src` is an http(s) URL or a
 * vault path. Only images (including GIFs) for now; a `{ type: 'model' }` variant
 * for 3D models is planned, which is why this is a tagged union.
 */
export type ExerciseMedia = { type: 'image'; src: string };

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  notes: string;                  // permanent cues
  media?: ExerciseMedia[];        // shown in order; several images play as an animation
  setup?: string;                 // how to get into position, shown before the steps
  instructions?: string[];        // the movement, step by step
}

export interface ProgrammeExercise {
  exerciseId: string;
  sets: number;                   // kept equal to the last values performed
  reps: number;
}

export interface Programme {
  id: string;
  name: string;
  exercises: ProgrammeExercise[]; // in training order
}

export interface LoggedSet {
  weight: number;
  reps: number;
}

export interface SessionExercise {
  exerciseId: string;
  name: string;                   // copied so a session survives the exercise being deleted
  sets: LoggedSet[];           // every row is saved when the session finishes
  notes: string;
}

export interface Session {
  id: string;
  startedAt: string;              // ISO timestamp
  finishedAt?: string;            // ISO timestamp, set when the session is finished
  programmeId: string | null;     // null = empty session
  programmeName: string;
  exercises: SessionExercise[];
  notes: string;
}

export interface ExerciseLog {
  date: string;                   // YYYY-MM-DD, local
  programmeId: string | null;
  sets: LoggedSet[];
  notes: string;
  notePath: string;               // session note, '' when migrated from old defaults
}

export interface GymData {
  version: 2;
  exercises: Exercise[];
  programmes: Programme[];
  history: Record<string, ExerciseLog[]>; // keyed by exerciseId, newest first
  defaultsAdded?: boolean;                // default exercises were added once; deleted ones stay deleted
}
