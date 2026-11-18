import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export const GAMES_PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'games', 'public');

function gameFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) return [];
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? gameFiles(file) : entry.isFile() ? [file] : [];
    });
}

export function resolveGameScript(url: string): string | null {
  if (!url.startsWith('/games/') || !url.endsWith('.js') || /[\\?#%]/.test(url)) return null;
  const parts = url.slice('/games/'.length).split('/');
  if (parts.some(part => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(part) || part.includes('..'))) return null;
  const file = path.resolve(GAMES_PUBLIC_DIR, ...parts);
  try {
    if (!fs.realpathSync(file).startsWith(fs.realpathSync(GAMES_PUBLIC_DIR) + path.sep) || !fs.statSync(file).isFile()) return null;
    return file;
  } catch { return null; }
}

// Find entry modules anywhere in games/public without executing uploaded code.
// The registration call is part of the game itself, not a separate metadata file.
export function listGameFiles(): string[] {
  return gameFiles(GAMES_PUBLIC_DIR)
    .filter(file => file.endsWith('.js') && /\bTaskItArcade\s*\.\s*register\s*\(/.test(fs.readFileSync(file, 'utf8')))
    .map(file => '/games/' + path.relative(GAMES_PUBLIC_DIR, file).split(path.sep).join('/'))
    .filter(url => resolveGameScript(url) !== null);
}

export function withGameRevisions<T extends { scriptPath: string | null }>(rows: T[]): Array<T & { revision: string }> {
  const revisions = new Map<string, string>();
  return rows.map(row => {
    const file = row.scriptPath ? resolveGameScript(row.scriptPath) : null;
    const directory = file ? GAMES_PUBLIC_DIR : null;
    let revision = '';
    if (directory) {
      if (!revisions.has(directory)) {
        const hash = createHash('sha256');
        // Version the whole game tree, including shared dependencies outside an entry's folder.
        for (const asset of gameFiles(directory)) {
          hash.update(path.relative(directory, asset));
          hash.update(fs.readFileSync(asset));
        }
        revisions.set(directory, hash.digest('hex'));
      }
      revision = revisions.get(directory)!;
    }
    return { ...row, revision };
  });
}
