import { App, normalizePath, requestUrl } from 'obsidian';
import { Exercise } from './types';

const MEDIA_DIR = '.gym/media';
const CONCURRENCY = 4;

function isWebUrl(src: string): boolean {
  return /^https?:\/\//i.test(src.trim());
}

/** All web image URLs used by these exercises. */
export function webMediaUrls(exercises: Exercise[]): string[] {
  const urls = exercises.flatMap(e => (e.media ?? []).map(m => m.src.trim())).filter(isWebUrl);
  return [...new Set(urls)];
}

/**
 * Keeps local copies of web images in `.gym/media/`, so exercise images work
 * offline. The local path mirrors the URL: host, then path segments.
 */
export class MediaCache {
  private app: App;
  private inFlight = new Map<string, Promise<void>>();

  constructor(app: App) {
    this.app = app;
  }

  /** Where `url` is (or would be) stored, or null if it isn't a web URL. */
  pathFor(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const segments = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)]
    .map(s => decodeURIComponent(s).replace(/[^\w.-]/g, '_'));
    // URLs that differ only by query string get distinct files
    if (parsed.search) segments.push(`q${hash(parsed.search)}_${segments.pop() ?? ''}`);
    return normalizePath(`${MEDIA_DIR}/${segments.join('/')}`);
  }

  /** A displayable src for the local copy, or null if it hasn't been downloaded. */
  async localSrc(url: string): Promise<string | null> {
    const path = this.pathFor(url);
    if (!path || !(await this.app.vault.adapter.exists(path))) return null;
    return this.app.vault.adapter.getResourcePath(path);
  }

  /** Download `url` unless it's already stored. Concurrent calls for one URL share a request. */
  download(url: string): Promise<void> {
    const existing = this.inFlight.get(url);
    if (existing) return existing;
    const job = this.doDownload(url).finally(() => this.inFlight.delete(url));
    this.inFlight.set(url, job);
    return job;
  }

  /** Download every URL not stored yet; resolves with how many succeeded and failed. */
  async downloadAll(urls: string[]): Promise<{ downloaded: number; failed: number }> {
    const queue = [...urls];
    let downloaded = 0;
    let failed = 0;
    const worker = async () => {
      for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
        try {
          await this.download(url);
          downloaded++;
        } catch {
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return { downloaded, failed };
  }

  private async doDownload(url: string): Promise<void> {
    const path = this.pathFor(url);
    if (!path) throw new Error(`Not a web URL: ${url}`);
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(path)) return;

    const response = await requestUrl({ url, throw: false });
    if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);

    // Create each missing parent folder
    const parts = path.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    }
    await adapter.writeBinary(path, response.arrayBuffer);
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
