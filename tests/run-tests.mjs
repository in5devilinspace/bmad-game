// WHISPER HEIST — deterministic test runner (repo-side, not shipped).
//
// interfaces.md (Determinism & tests) names this entrypoint: it extracts the
// `<script id="sim">` block from src/index.html, evaluates it in Node, and runs
// the deterministic assertions. Extraction lives in tests/extract-sim.mjs; the
// individual suites live in sim.test.mjs and gossip.test.mjs. This runner just
// executes both in child processes and aggregates their exit codes, so one
// command grades the SHIPPED code end to end.
//
// Run: node "tests/run-tests.mjs"
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const suites = ['sim.test.mjs', 'gossip.test.mjs', 'chronicle.test.mjs'];

let failed = 0;
for (const suite of suites) {
  console.log('\n============================================================');
  console.log('  running ' + suite + '  (against shipped src/index.html)');
  console.log('============================================================');
  const res = spawnSync(process.execPath, [join(here, suite)], { stdio: 'inherit' });
  if (res.status !== 0) failed += 1;
}

console.log('\n============================================================');
console.log(failed === 0
  ? '  ALL SUITES PASSED — shipped <script id="sim"> verified'
  : '  ' + failed + ' SUITE(S) FAILED');
console.log('============================================================');
process.exit(failed === 0 ? 0 : 1);
