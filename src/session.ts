import { App, moment, TFile } from 'obsidian';
import { GymStore } from './store';
import { GymPluginSettings } from './settings';
import { Exercise, LoggedSet, PrefillFrom, Programme, Session, SessionExercise } from './types';
import { writeSessionNote } from './sessionNote';

const FALLBACK_SETS = 3;
const FALLBACK_REPS = 8;

/** A programme's Sets/Reps as implied by a performed set list: number of sets, reps of the first set. */
export function programmeValuesFrom(sets: LoggedSet[]): { sets: number; reps: number } | null {
  const first = sets[0];
  return first ? { sets: sets.length, reps: first.reps } : null;
}

export function defaultProgrammeValues(store: GymStore, exerciseId: string): { sets: number; reps: number } {
  const last = store.getHistory(exerciseId)[0];
  return (last && programmeValuesFrom(last.sets)) ?? { sets: FALLBACK_SETS, reps: FALLBACK_REPS };
}

/** Prefill an exercise from history, falling back to `fallback` sets × reps at weight 0. */
export function buildSessionExercise(
  store: GymStore,
  exercise: Exercise,
  programmeId: string | null,
  prefillFrom: PrefillFrom,
  fallback: { sets: number; reps: number },
): SessionExercise {
  const last = store.getLastLog(exercise.id, programmeId, prefillFrom);
  const sets = last && last.sets.length > 0
    ? last.sets.map(s => ({ weight: s.weight, reps: s.reps }))
    : Array.from({ length: fallback.sets }, () => ({ weight: 0, reps: fallback.reps }));
  return { exerciseId: exercise.id, name: exercise.name, sets, notes: '' };
}

export function createSession(store: GymStore, programme: Programme | null, prefillFrom: PrefillFrom): Session {
  const exercises: SessionExercise[] = [];
  for (const pe of programme?.exercises ?? []) {
    const exercise = store.getExercise(pe.exerciseId);
    if (!exercise) continue;
    exercises.push(buildSessionExercise(store, exercise, programme?.id ?? null, prefillFrom, pe));
  }
  return {
    id: crypto.randomUUID(),
    startedAt: moment().format(),
    programmeId: programme?.id ?? null,
    programmeName: programme?.name ?? '',
    exercises,
    notes: '',
  };
}

/** The sets to record: every row, as entered (copied, so extra fields from older saved sessions are dropped). */
export function performedSets(ex: SessionExercise): LoggedSet[] {
  return ex.sets.map(s => ({ weight: s.weight, reps: s.reps }));
}

/**
 * Write the session note, record each performed exercise in history, update the
 * programme's Sets/Reps to what was just done, and clear the active session.
 */
export async function finishSession(app: App, store: GymStore, settings: GymPluginSettings, session: Session): Promise<TFile> {
  const file = await writeSessionNote(app, store, settings, session);
  const date = moment(session.startedAt).format('YYYY-MM-DD');

  for (const ex of session.exercises) {
    const sets = performedSets(ex);
    if (sets.length === 0 || !store.getExercise(ex.exerciseId)) continue;
    store.addLog(ex.exerciseId, {
      date,
      programmeId: session.programmeId,
      sets,
      notes: ex.notes.trim(),
      notePath: file.path,
    });
  }

  const programme = session.programmeId ? store.getProgramme(session.programmeId) : undefined;
  if (programme) {
    for (const pe of programme.exercises) {
      const performed = session.exercises.find(e => e.exerciseId === pe.exerciseId);
      const values = performed && programmeValuesFrom(performedSets(performed));
      if (values) {
        pe.sets = values.sets;
        pe.reps = values.reps;
      }
    }
  }

  await store.save();
  await store.clearActiveSession();
  return file;
}
