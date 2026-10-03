export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'legs', 'core', 'triceps'] as const;
export const EQUIPMENT_TYPES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];
export type Equipment = typeof EQUIPMENT_TYPES[number];
export type WeightUnit = 'kg' | 'lbs';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  defaultSets: number;
  defaultReps: number;
  defaultWeight: number;
  notes: string;
}

export interface SessionExercise {
  exercise: Exercise;
  sets: number;
  reps: number;
  weight: number;
}

export interface TemplateEntry {
  exerciseId: string;
  sets: number;
  reps: number;
  weight: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  entries: TemplateEntry[];
}

export interface GymData {
  exercises: Exercise[];
  templates: WorkoutTemplate[];
}
