import { App } from 'obsidian';
import { MediaCache } from './mediaCache';
import { ExerciseMedia } from './types';

const FRAME_MS = 900;

/**
 * A displayable src for `src`. Web URLs use the local copy in `.gym/media/` when
 * there is one; otherwise the URL itself, and a copy is saved in the background
 * for next time. Anything else is a vault path or [[wikilink]].
 */
export async function resolveMediaSrc(app: App, cache: MediaCache, src: string): Promise<string | null> {
  const trimmed = src.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const local = await cache.localSrc(trimmed);
    if (local) return local;
    void cache.download(trimmed).catch(() => { /* offline; try again next time */ });
    return trimmed;
  }
  const link = trimmed.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0] ?? '';
  const file = app.metadataCache.getFirstLinkpathDest(link, '');
  return file ? app.vault.getResourcePath(file) : null;
}

export function parseMediaLines(text: string): ExerciseMedia[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(src => ({ type: 'image', src }));
}

/**
 * Render an exercise's media into `el`. Several images play in turn, like a GIF,
 * which suits the start/end photos of the default exercises. Returns a function
 * that stops the animation; call it when the container goes away.
 *
 * This is where a 3D model renderer will go: add a `{ type: 'model' }` variant to
 * ExerciseMedia and handle it here.
 */
export function renderExerciseMedia(app: App, cache: MediaCache, el: HTMLElement, media: ExerciseMedia[], alt: string): () => void {
  const images = media.filter(m => m.type === 'image');
  if (images.length === 0) {
    el.createDiv({
      text: 'No images yet. Add an image or GIF to this exercise in the exercise editor.',
      cls: 'gym-media-empty',
    });
    return () => {};
  }

  const frame = el.createDiv('gym-media');
  let failed = false;
  const showError = (text: string) => {
    if (failed) return;
    failed = true;
    frame.empty();
    frame.addClass('is-error');
    frame.createDiv({ text, cls: 'gym-media-empty' });
  };

  // Create the frames straight away so the animation can start; srcs resolve async
  const frames = images.map((m, i) => {
    const img = frame.createEl('img', { attr: { alt } });
    img.toggleClass('is-hidden', i !== 0);
    img.addEventListener('error', () => showError(
      'Couldn\'t load the image. Are you offline? Run "Download exercise images for offline use" while online.',
    ));
    void resolveMediaSrc(app, cache, m.src).then(src => {
      if (src) img.src = src;
      else showError(`Couldn't find "${m.src}" in the vault.`);
    });
    return img;
  });
  if (frames.length < 2) return () => {};

  let current = 0;
  const id = window.setInterval(() => {
    current = (current + 1) % frames.length;
    frames.forEach((img, i) => img.toggleClass('is-hidden', i !== current));
  }, FRAME_MS);
  return () => window.clearInterval(id);
}
