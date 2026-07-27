#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'xss-sink-baseline.json');

const SCAN_PATHS = [
  'public/index.html',
  'public/user-guide.html',
  'public/privacy-policy.html',
  'public/arcade-game-guide.html',
  'public/js',
];

const SINKS = [
  {
    kind: 'html-render-sink',
    pattern: /\b(?:innerHTML|outerHTML)\s*=|\binsertAdjacentHTML\s*\(|\bdocument\.write\s*\(/,
  },
  {
    kind: 'inline-event-handler',
    pattern: /\son[a-z]+\s*=/i,
  },
  {
    kind: 'dynamic-script-element',
    pattern: /createElement\s*\(\s*['"]script['"]\s*\)|\bscript\.src\s*=/,
  },
];

function walk(target) {
  const abs = path.join(ROOT, target);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [abs];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(abs, entry.name);
    const rel = path.relative(ROOT, child);
    if (entry.isDirectory()) return walk(rel);
    return child;
  });
}

function scan() {
  const files = SCAN_PATHS.flatMap(walk)
    .filter(file => /\.(html|js)$/i.test(file))
    .sort();
  const counts = new Map();

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const sink of SINKS) {
        if (!sink.pattern.test(line)) continue;
        const key = `${rel}\u0000${sink.kind}\u0000${line.trim()}`;
        const current = counts.get(key) || { file: rel, kind: sink.kind, line: line.trim(), count: 0, examples: [] };
        current.count += 1;
        if (current.examples.length < 3) current.examples.push(index + 1);
        counts.set(key, current);
      }
    });
  }

  return Array.from(counts.values()).sort((a, b) =>
    a.file.localeCompare(b.file) || a.kind.localeCompare(b.kind) || a.line.localeCompare(b.line)
  );
}

function keyOf(entry) {
  return `${entry.file}\u0000${entry.kind}\u0000${entry.line}`;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function writeBaseline(entries) {
  const body = JSON.stringify({
    description: 'Reviewed XSS-sensitive frontend sink signatures. Run `npm run security:xss-sinks:update` only after reviewing intentional changes.',
    updatedAt: new Date().toISOString(),
    entries,
  }, null, 2) + '\n';
  fs.writeFileSync(BASELINE_PATH, body);
}

function formatEntry(entry) {
  const locations = entry.examples && entry.examples.length ? ` examples: ${entry.examples.join(', ')}` : '';
  return `${entry.file} [${entry.kind}] x${entry.count}${locations}\n  ${entry.line}`;
}

const current = scan();
if (process.argv.includes('--update')) {
  writeBaseline(current);
  console.log(`Updated ${path.relative(ROOT, BASELINE_PATH)} with ${current.length} sink signatures.`);
  process.exit(0);
}

const baselineDoc = loadBaseline();
const baseline = Array.isArray(baselineDoc) ? baselineDoc : baselineDoc.entries || [];
const baselineByKey = new Map(baseline.map(entry => [keyOf(entry), entry]));
const additions = current.filter(entry => {
  const known = baselineByKey.get(keyOf(entry));
  return !known || entry.count > known.count;
});

if (additions.length > 0) {
  console.error('New XSS-sensitive frontend sink signatures detected. Review the call site, prefer textContent/DOM construction, then update the baseline only if intentional.\n');
  additions.slice(0, 25).forEach(entry => console.error(formatEntry(entry)));
  if (additions.length > 25) console.error(`...and ${additions.length - 25} more.`);
  process.exit(1);
}

console.log(`XSS sink scan passed: ${current.length} reviewed sink signatures, no new additions.`);
