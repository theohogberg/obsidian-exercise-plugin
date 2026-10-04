import type { App } from 'obsidian';
import { DEFAULT_SETTINGS, GymPluginSettings } from '../src/settings';

/**
 * An in-memory vault behind the parts of Obsidian's API the plugin uses.
 * `files` maps vault paths to text; binary writes are stored as decoded text.
 * mkdir/writeBinary require the parent folder, like the real adapter.
 */
export function fakeApp(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const folders = new Set<string>();
  const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
  for (const path of files.keys()) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'));
  }

  const adapter = {
    exists: async (p: string) => files.has(p) || folders.has(p),
    read: async (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    write: async (p: string, data: string) => { files.set(p, data); },
    writeBinary: async (p: string, data: ArrayBuffer) => {
      if (!folders.has(parentOf(p))) throw new Error(`parent folder missing: ${parentOf(p)}`);
      files.set(p, new TextDecoder().decode(data));
    },
    mkdir: async (p: string) => {
      const parent = parentOf(p);
      if (parent && !folders.has(parent)) throw new Error(`parent folder missing: ${parent}`);
      folders.add(p);
    },
    remove: async (p: string) => { files.delete(p); },
    getResourcePath: (p: string) => `app://local/${p}`,
  };

  const app = {
    vault: {
      adapter,
      createFolder: async (p: string) => { folders.add(p); },
      create: async (p: string, data: string) => {
        if (files.has(p)) throw new Error(`File already exists: ${p}`);
        files.set(p, data);
        return { path: p };
      },
      getResourcePath: (file: { path: string }) => `app://vault/${file.path}`,
    },
    metadataCache: {
      // Resolves a link to a vault file by exact path or file name
      getFirstLinkpathDest: (link: string) => {
        const hit = [...files.keys()].find(p => p === link || p.endsWith(`/${link}`));
        return hit ? { path: hit } : null;
      },
    },
    workspace: { openLinkText: async () => {} },
  };

  return { app: app as unknown as App, files, folders };
}

export function testSettings(overrides: Partial<GymPluginSettings> = {}): GymPluginSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

/** The `.gym/exercises.json` format from before v2. */
export const legacyData = {
  exercises: [
    { id: 'bench', name: 'Bench Press', muscleGroup: 'chest', equipment: 'barbell', defaultSets: 4, defaultReps: 8, defaultWeight: 80, notes: 'Elbows tucked' },
    { id: 'push', name: 'Tricep Pushdown', muscleGroup: 'triceps', equipment: 'cable', defaultSets: 3, defaultReps: 12, defaultWeight: 30, notes: '' },
    { id: 'fly', name: 'Cable Fly', muscleGroup: 'chest', equipment: 'cable', defaultSets: 0, defaultReps: 0, defaultWeight: 0, notes: '' },
  ],
  templates: [
    {
      id: 'pushday', name: 'Push day', entries: [
        { exerciseId: 'push', sets: 3, reps: 12, weight: 25 },
        { exerciseId: 'bench', sets: 4, reps: 8, weight: 70 },
        { exerciseId: 'fly', sets: 2, reps: 15, weight: 10 },
      ],
    },
  ],
};

/** Let pending background promises (e.g. fire-and-forget saves) settle. */
export const flush = () => new Promise(resolve => setTimeout(resolve, 0));
