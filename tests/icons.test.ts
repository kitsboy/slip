/**
 * The launcher's contract.
 *
 * slip shipped a manifest whose only icon was a 300x220 wordmark marked "any maskable", and index.html
 * had no apple-touch-icon at all. Android wants a square 192 and a square 512; iOS ignores manifest
 * icons and reads <link rel="apple-touch-icon">. Both fell back to the browser's default, and the app
 * could not be installed — which is exactly what a merchant reported. These assertions are cheap and the
 * failure they prevent is invisible until someone tries to put slip on a home screen.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8')) as {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  icons?: { src: string; sizes: string; type?: string; purpose?: string }[];
};

/** PNG width/height live in the IHDR chunk: 8-byte signature, then 4 length, 4 type, 4+4 size. */
function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const icons = manifest.icons ?? [];
const find = (size: string, purpose: string) =>
  icons.find((i) => i.sizes === size && (i.purpose ?? 'any').split(' ').includes(purpose));

describe('what a launcher needs to install slip', () => {
  it('names the app and where it starts', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');
  });

  it('offers a square 192 and a square 512, the pair every launcher checks', () => {
    for (const size of ['192x192', '512x512']) {
      const icon = find(size, 'any');
      expect(icon, `no ${size} "any" icon`).toBeTruthy();
      const path = join(root, 'public', icon!.src.replace('./', ''));
      expect(existsSync(path), `${path} missing`).toBe(true);
      const { w, h } = pngSize(path);
      expect([w, h]).toEqual([Number(size.split('x')[0]), Number(size.split('x')[1])]);
    }
  });

  it('offers maskable art that survives a circular crop', () => {
    const icon = find('512x512', 'maskable');
    expect(icon, 'no maskable icon').toBeTruthy();
    expect(existsSync(join(root, 'public', icon!.src.replace('./', '')))).toBe(true);
    // "any maskable" on artwork that is not square is the mistake that caused this; never again.
    expect(icons.filter((i) => (i.purpose ?? '').includes('maskable'))).toHaveLength(1);
  });

  it('gives iOS its own icon, because iOS ignores the manifest', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*apple-touch-icon\.png/);
    const { w, h } = pngSize(join(root, 'public/apple-touch-icon.png'));
    expect([w, h]).toEqual([180, 180]);
    // iOS composites transparency onto black; an opaque tile is the only safe choice.
    const b = readFileSync(join(root, 'public/apple-touch-icon.png'));
    expect(b.toString('ascii').slice(0, 40)).not.toContain('tRNS');
  });

  it('gives the browser tab a favicon that is not the wordmark', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toMatch(/rel="icon"[^>]*favicon-32\.png/);
    expect(pngSize(join(root, 'public/favicon-32.png'))).toEqual({ w: 32, h: 32 });
  });
});
