// Extended extractor — loads BOTH shipped presentation-free blocks that the
// tests need, into ONE browserless VM context, and returns the WH namespace.
//
// tests/extract-sim.mjs loads only `<script id="sim">` (WH.sim + WH.gossip).
// The Chronicle (CAP-8) lives in the SECOND, id-less `<script>` block (the
// render/juice presentation module → WH.render + WH.juice). That block contains
// no DOM references at module-init (verified: its only browser-global use is
// inside init()'s body, never called here), so it evaluates cleanly in Node's
// vm with `window` undefined — its two IIFEs bind WH.render + WH.juice onto the
// context global, exactly as WH.sim/WH.gossip do. This is the extractor the
// Chronicle test uses to grade the SHIPPED chronicle builder, no drift possible.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
export const SRC_HTML = join(here, '..', 'src', 'index.html');

// Slice the body of the Nth `<script>` element (0-based). Handles `<script id="...">`.
function nthScriptBody(html, n) {
  let idx = 0, from = 0;
  while (true) {
    const open = html.indexOf('<script', from);
    if (open === -1) throw new Error('extract-full: fewer than ' + (n + 1) + ' <script> blocks');
    const bodyStart = html.indexOf('>', open) + 1;
    const close = html.indexOf('</script>', bodyStart);
    if (close === -1) throw new Error('extract-full: unterminated <script> block #' + idx);
    if (idx === n) return html.slice(bodyStart, close);
    idx++; from = close + 9;
  }
}

/**
 * Evaluate the sim block (#0) then the render/juice presentation block (#1) in a
 * single sandbox and hand back the fully-populated WH namespace. drawChronicle
 * (which needs a real canvas) is never invoked here; the pure chronicle(game)
 * builder and its exported placeName/word helpers are what the test grades.
 */
export function loadFullWH(htmlPath = SRC_HTML) {
  const html = readFileSync(htmlPath, 'utf8');
  const sim = nthScriptBody(html, 0);
  const pres = nthScriptBody(html, 1);
  const sandbox = { globalThis: null, Math, console, Date, JSON };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(sim, sandbox, { filename: 'src/index.html#sim' });
  vm.runInContext(pres, sandbox, { filename: 'src/index.html#presentation' });
  const WH = sandbox.WH;
  if (!WH || !WH.sim || !WH.gossip || !WH.juice) {
    throw new Error('extract-full: shipped blocks did not expose WH.sim, WH.gossip and WH.juice');
  }
  if (typeof WH.juice.chronicle !== 'function') {
    throw new Error('extract-full: WH.juice.chronicle not exported');
  }
  return WH;
}

export default loadFullWH;
