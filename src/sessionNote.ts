import { App, moment, normalizePath, TFile } from 'obsidian';
import { GymStore } from './store';
import { GymPluginSettings } from './settings';
import { Session } from './types';

/** Characters Obsidian doesn't allow (or treats specially) in file names. */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

export function buildSessionNote(store: GymStore, settings: GymPluginSettings, session: Session): string {
  const date = moment(session.startedAt).format('YYYY-MM-DD');
  const unit = settings.weightUnit;
  const title = session.programmeName || 'Workout';
  const performed = session.exercises.filter(ex => ex.sets.some(s => s.done));
  const muscles = [...new Set(performed
    .map(ex => store.getExercise(ex.exerciseId)?.muscleGroup)
    .filter((m): m is NonNullable<typeof m> => !!m))];

  const lines = [
    '---',
    `date: ${date}`,
    'type: workout',
  ];
  if (session.programmeName) lines.push(`programme: ${JSON.stringify(session.programmeName)}`);
  lines.push(`muscles: [${muscles.join(', ')}]`, '---', '', `# ${title} — ${date}`, '');

  for (const ex of performed) {
    lines.push(`## ${ex.name}`);
    // Fixed "<weight><unit> × <reps>" format so set lines can be parsed back later
    ex.sets.filter(s => s.done).forEach(s => lines.push(`- ${s.weight}${unit} × ${s.reps}`));
    if (ex.notes.trim()) lines.push('', `> ${ex.notes.trim().replace(/\n/g, '\n> ')}`);
    lines.push('');
  }

  if (session.notes.trim()) lines.push('## Notes', session.notes.trim(), '');
  return lines.join('\n');
}

export async function writeSessionNote(app: App, store: GymStore, settings: GymPluginSettings, session: Session): Promise<TFile> {
  const folder = normalizePath(settings.sessionsFolder);
  const date = moment(session.startedAt).format('YYYY-MM-DD');
  const label = session.programmeName.replace(UNSAFE_FILENAME_CHARS, '').trim() || 'workout';

  if (!(await app.vault.adapter.exists(folder))) {
    await app.vault.createFolder(folder);
  }
  let path = normalizePath(`${folder}/${date} ${label}.md`);
  let counter = 1;
  while (await app.vault.adapter.exists(path)) {
    path = normalizePath(`${folder}/${date} ${label} ${counter++}.md`);
  }
  return app.vault.create(path, buildSessionNote(store, settings, session));
}
