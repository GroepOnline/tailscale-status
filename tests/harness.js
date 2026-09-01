import GLib from 'gi://GLib';

const tests = [];

/** Register a test; call at module top level. */
export function register(name, fn) {
    tests.push({name, fn});
}

/** Run all registered tests sequentially; returns the failure count. */
export async function runAll() {
    let failed = 0;
    const started = Date.now();
    for (const {name, fn} of tests) {
        try {
            await fn();
            print(`PASS ${name}`);
        } catch (e) {
            failed++;
            print(`FAIL ${name}`);
            if (e?.message) {
                print(`  ${e.message}`);
            }
            print(`  ${e?.stack ?? String(e)}`);
        }
    }
    print(`\n${tests.length - failed}/${tests.length} passed in ${Date.now() - started}ms`);
    return failed;
}

/** Assertion helpers (no external deps; gjs runs these standalone). */
export function assert(condition, message = 'assertion failed') {
    if (!condition) {
        throw new Error(message);
    }
}

export function assertEqual(actual, expected, message = '') {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
        throw new Error(`${message} expected ${b}, got ${a}`);
    }
}

export function assertThrows(fn, errorClass, message = '') {
    try {
        fn();
    } catch (e) {
        if (errorClass && !(e instanceof errorClass)) {
            throw new Error(`${message} expected ${errorClass.name}, got ${e?.name ?? typeof e}`);
        }
        return;
    }
    throw new Error(`${message} expected a throw, none happened`);
}

/** Await a promise with a hard timeout so a hung call fails instead of stalling the suite. */
export function withTimeout(promise, ms = 8000, what = 'test step') {
    return new Promise((resolve, reject) => {
        let settled = false;
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            if (!settled) {
                settled = true;
                reject(new Error(`${what} timed out after ${ms}ms`));
            }
            return GLib.SOURCE_REMOVE;
        });
        promise.then(
            (value) => {
                if (!settled) {
                    settled = true;
                    GLib.source_remove(id);
                    resolve(value);
                }
            },
            (e) => {
                if (!settled) {
                    settled = true;
                    GLib.source_remove(id);
                    reject(e);
                }
            }
        );
    });
}

/** Resolve after `ms` milliseconds via the outer event loop. */
export function sleep(ms) {
    return new Promise((resolve) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}
