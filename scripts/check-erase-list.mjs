#!/usr/bin/env node
/**
 * Fails (exit 1) when the console's athlete-data list differs from the engine's.
 *
 *   node scripts/check-erase-list.mjs [path/to/engine/src/domain/athleteData.ts]
 *
 * Console side: lib/athleteData.js. Engine side: engine/src/domain/athleteData.ts
 * in fitness-coach-bot, found at ~/fitness-coach-bot unless a path is given or
 * PACT_ENGINE_DIR points at the engine folder. Table order matters (it is the
 * erase order); the redacted columns are compared as a set.
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = process.env.PACT_ENGINE_DIR || join(homedir(), 'fitness-coach-bot', 'engine');
const enginePath = process.argv[2] || join(engineDir, 'src', 'domain', 'athleteData.ts');
const enginePhotosPath = join(dirname(enginePath), 'photos.ts');
const consolePath = join(root, 'lib', 'athleteData.js');

for (const p of [enginePath, consolePath]) {
  if (!existsSync(p)) { console.error(`Cannot find ${p}`); process.exit(2); }
}

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

// The quoted strings in `export const NAME = [ ... ]` (or new Set([...])).
function list(src, name) {
  const m = strip(src).match(new RegExp(`const\\s+${name}\\s*=\\s*(?:new Set\\()?\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`No array called ${name}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const constant = (src, name) => {
  const m = strip(src).match(new RegExp(`const\\s+${name}\\s*=\\s*'([^']+)'`));
  return m ? m[1] : null;
};

const eng = readFileSync(enginePath, 'utf8');
const con = readFileSync(consolePath, 'utf8');
let bad = 0;

function compare(label, a, b, ordered) {
  const A = ordered ? a : [...a].sort();
  const B = ordered ? b : [...b].sort();
  const onlyEngine = a.filter((x) => !b.includes(x));
  const onlyConsole = b.filter((x) => !a.includes(x));
  const dupes = (l) => l.filter((x, i) => l.indexOf(x) !== i);
  if (onlyEngine.length) console.error(`${label}: in the engine but NOT in the console: ${onlyEngine.join(', ')}`);
  if (onlyConsole.length) console.error(`${label}: in the console but NOT in the engine: ${onlyConsole.join(', ')}`);
  if (dupes(b).length) console.error(`${label}: listed twice in the console: ${dupes(b).join(', ')}`);
  if (!onlyEngine.length && !onlyConsole.length && ordered && A.join() !== B.join()) {
    console.error(`${label}: same tables, different erase order.\n  engine:  ${a.join(', ')}\n  console: ${b.join(', ')}`);
  }
  const same = !onlyEngine.length && !onlyConsole.length && !dupes(b).length && A.join() === B.join();
  if (same) console.log(`ok  ${label} (${a.length})`);
  else bad++;
}

compare('CLIENT_TABLES', list(eng, 'CLIENT_TABLES'), list(con, 'CLIENT_TABLES'), true);
compare('INTERVENTION_TABLES', list(eng, 'INTERVENTION_TABLES'), list(con, 'INTERVENTION_TABLES'), true);
compare('REDACT', list(eng, 'REDACT'), list(con, 'REDACT'), false);

if (existsSync(enginePhotosPath)) {
  const a = constant(readFileSync(enginePhotosPath, 'utf8'), 'PHOTO_BUCKET');
  const b = constant(con, 'PHOTO_BUCKET');
  if (a !== b) { console.error(`PHOTO_BUCKET: engine '${a}', console '${b}'`); bad++; }
  else console.log(`ok  PHOTO_BUCKET (${a})`);
}

if (bad) {
  console.error('\nThe console list is out of step with the engine. Edit lib/athleteData.js to match, then run this again.');
  process.exit(1);
}
console.log('Console and engine athlete-data lists are in sync.');
