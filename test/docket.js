#!/usr/bin/env node
'use strict';
// The witness: one linear scenario, `ok(name, cond)`, exit 1 on any failure.
// Phase 0 ships the harness with no assertions; the core arrives with its tests.
let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`FAIL  ${name}${detail === undefined ? '' : '\n      ' + String(detail)}`);
}
console.log(`witness: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
