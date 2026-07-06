// Shared test helper — the single source of truth for what the tests exercise.
//
// interfaces.md (Determinism & tests): the sim core and gossip+mutation logic
// live in a dedicated `<script id="sim">` block in src/index.html containing no
// DOM references; the repo-side test harness "extracts that block from
// src/index.html, evaluates it in Node, and runs deterministic assertions."
//
// This module IS that extractor. src/index.html is the ONE source of truth;
// build/*.js are historical scaffolding and are NOT under test (see build/README.md).
// Both sim.test.mjs and gossip.test.mjs load WH through here so a change that
// ships in the browser is the change the suite grades — no drift possible.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the shipped single-file game. */
export const SRC_HTML = join(here, '..', 'src', 'index.html');

/**
 * Pull the raw JS body of the `<script id="sim">…</script>` block out of the
 * shipped HTML. Throws (loudly) rather than silently returning a stale copy.
 */
export function extractSimSource(htmlPath = SRC_HTML) {
  const html = readFileSync(htmlPath, 'utf8');
  const openTag = '<script id="sim">';
  const open = html.indexOf(openTag);
  if (open === -1) {
    throw new Error('extract-sim: `<script id="sim">` not found in ' + htmlPath);
  }
  const bodyStart = open + openTag.length;
  const close = html.indexOf('</script>', bodyStart);
  if (close === -1) {
    throw new Error('extract-sim: unterminated `<script id="sim">` block in ' + htmlPath);
  }
  return html.slice(bodyStart, close);
}

/**
 * Evaluate the extracted block in a browserless VM context and hand back the
 * `WH` namespace it publishes. The block's two IIFEs bind to
 * `(typeof window !== 'undefined' ? window : globalThis)`; with no `window` in
 * the sandbox they attach `WH.sim` and `WH.gossip` to the context global.
 */
export function loadWH(htmlPath = SRC_HTML) {
  const src = extractSimSource(htmlPath);
  const sandbox = { globalThis: null, Math, console, Date, JSON };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'src/index.html#sim' });
  const WH = sandbox.WH;
  if (!WH || !WH.sim || !WH.gossip) {
    throw new Error('extract-sim: shipped block did not expose WH.sim and WH.gossip');
  }
  return WH;
}

export default loadWH;
