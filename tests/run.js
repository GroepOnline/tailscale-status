/**
 * Tiny gjs test runner: `gjs -m tests/run.js`.
 * Test modules register themselves via `register()` at import time; add new
 * ones to the import list below. Prints PASS/FAIL lines, exits non-zero on
 * any failure.
 *
 * Top-level await is required: gjs only spins the GLib main loop (and thus
 * fires async socket I/O) while the module itself is awaiting.
 */
import System from 'system';

import './lib/localapi.test.js';
import './lib/nodes.test.js';
import './lib/service.test.js';

import {runAll} from './harness.js';

const failed = await runAll();
System.exit(failed === 0 ? 0 : 1);
