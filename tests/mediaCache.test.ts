import { beforeEach, describe, expect, it } from 'vitest';
import { setRequestUrlHandler } from './stubs/obsidian';
import { MediaCache, webMediaUrls } from '../src/mediaCache';
import { parseMediaLines, resolveMediaSrc } from '../src/exerciseMedia';
import { GymStore } from '../src/store';
import { fakeApp, flush } from './helpers';

const requests: string[] = [];
beforeEach(() => {
  requests.length = 0;
  setRequestUrlHandler(async url => {
    requests.push(url);
    if (url.includes('offline')) throw new Error('net::ERR_INTERNET_DISCONNECTED');
    if (url.includes('missing')) return { status: 404, arrayBuffer: new ArrayBuffer(0) };
    return { status: 200, arrayBuffer: new TextEncoder().encode(`IMG:${url}`).buffer };
  });
});

describe('MediaCache', () => {
  it('maps each URL to a stable path under .gym/media', () => {
    const cache = new MediaCache(fakeApp().app);
    expect(cache.pathFor('https://raw.githubusercontent.com/theohogberg/obsidian-exercise-plugin/main/assets/exercises/back-squat/0.jpg'))
      .toBe('.gym/media/raw.githubusercontent.com/theohogberg/obsidian-exercise-plugin/main/assets/exercises/back-squat/0.jpg');
    expect(cache.pathFor('https://x.com/a b/c%20d.gif')).toBe('.gym/media/x.com/a_b/c_d.gif');
    expect(cache.pathFor('https://x.com/i.gif?v=1')).not.toBe(cache.pathFor('https://x.com/i.gif?v=2'));
    expect(cache.pathFor('[[squat.gif]]')).toBeNull();
  });

  it('downloads every default image once, then serves local copies', async () => {
    const { app, files } = fakeApp();
    const store = new GymStore(app);
    await store.load();
    const urls = webMediaUrls(store.exercisesNeedingImages);
    expect(urls).toHaveLength(78);

    expect(await store.media.downloadAll(urls)).toEqual({ downloaded: 78, failed: 0 });
    expect(requests).toHaveLength(78);
    expect(files.get(store.media.pathFor(urls[0]!)!)).toBe(`IMG:${urls[0]}`);

    requests.length = 0;
    await store.media.downloadAll(urls);
    expect(requests).toHaveLength(0);
    expect(await resolveMediaSrc(app, store.media, urls[0]!)).toBe(`app://local/${store.media.pathFor(urls[0]!)}`);
  });

  it('counts offline and HTTP errors as failures without stopping the rest; concurrent downloads share a request', async () => {
    const cache = new MediaCache(fakeApp().app);
    expect(await cache.downloadAll(['https://x.com/offline.jpg', 'https://x.com/missing.jpg', 'https://x.com/ok.jpg']))
      .toEqual({ downloaded: 1, failed: 2 });
    requests.length = 0;
    await Promise.all([cache.download('https://x.com/a.jpg'), cache.download('https://x.com/a.jpg')]);
    expect(requests).toEqual(['https://x.com/a.jpg']);
  });
});

it('resolving media: uncached web images load from the web and are saved in the background; vault paths and [[links]]; editor lines', async () => {
  const { app, files } = fakeApp({ 'Media/squat.gif': 'gif' });
  const cache = new MediaCache(app);
  const url = 'https://x.com/new.gif';
  expect(await resolveMediaSrc(app, cache, url)).toBe(url);
  await flush();
  expect(files.has(cache.pathFor(url)!)).toBe(true);
  expect(await resolveMediaSrc(app, cache, url)).toBe(`app://local/${cache.pathFor(url)}`);

  expect(await resolveMediaSrc(app, cache, 'Media/squat.gif')).toBe('app://vault/Media/squat.gif');
  expect(await resolveMediaSrc(app, cache, '![[squat.gif|200]]')).toBe('app://vault/Media/squat.gif');
  expect(await resolveMediaSrc(app, cache, 'nope.gif')).toBeNull();

  expect(parseMediaLines(' https://x/a.gif \n\n[[squat.gif]]\n')).toEqual([
    { type: 'image', src: 'https://x/a.gif' }, { type: 'image', src: '[[squat.gif]]' },
  ]);
});
