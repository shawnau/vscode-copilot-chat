/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { defineConfig } from '@vscode/test-cli';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { loadEnvFile } from 'process';
import { fileURLToPath } from 'url';

const isSanity = process.argv.includes('--sanity');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (isSanity) {
	loadEnvFile(resolve(__dirname, '.env'));
}

const packageJsonPath = resolve(__dirname, 'package.json');
const raw = readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(raw);

// Allow overriding the VS Code build used for simulations/tests.
// Priority (highest first):
//  1. CLI flag: --vscode-commit <commit>
//  2. ENV: VSCODE_TEST_COMMIT
//  3. CLI flag: --vscode-version <version>
//  4. ENV: VSCODE_TEST_VERSION
//  5. Derive from engines.vscode date (e.g. ^1.104.0-20250815 => 1.104.0-insider)
//  6. Fallback to previous heuristic (insiders-unreleased / stable)

function getArgValue(flag) {
	const idx = process.argv.indexOf(flag);
	return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

const forcedCommit = getArgValue('--vscode-commit') || process.env.VSCODE_TEST_COMMIT;
const forcedVersion = getArgValue('--vscode-version') || process.env.VSCODE_TEST_VERSION;

let derivedInsiderFromEngine;
// engines.vscode typically like ^1.104.0-20250815 when using dated insiders build
if (pkg.engines?.vscode) {
	const engine = pkg.engines.vscode.replace(/^\^/, '');
	const m = engine.match(/^(\d+\.\d+\.\d+)-(\d{8})$/);
	if (m) {
		// Map the dated insider to explicit insider version (commit-less) so we stay on that monthly track
		derivedInsiderFromEngine = `${m[1]}-insider`;
	}
}

// We no longer mutate engines.vscode (the earlier code stripped the date), because
// we want to keep the date so that publishing still encodes the minimum dated insiders build.
// (Leaving previous rewrite logic removed intentionally.)

const isRecoveryBuild = !pkg.version.endsWith('.0'); // keep legacy meaning in case we fall back

// Resolve the version we will pass to the test harness
let resolvedVersion;
if (forcedCommit) {
	// If commit provided, @vscode/test-cli accepts it instead of version.
	resolvedVersion = forcedCommit; // treat as "version" field; the harness will recognize a commit SHA.
} else if (forcedVersion) {
	resolvedVersion = forcedVersion;
} else if (derivedInsiderFromEngine) {
	resolvedVersion = derivedInsiderFromEngine;
} else {
	// Fallback: previously insiders-unreleased; now we intentionally use stable to reduce churn.
	resolvedVersion = 'stable';
}

// Provide a one-line trace for debugging (best-effort, no dependency on logger here)
// eslint-disable-next-line no-console
console.log(`[.vscode-test] Using VS Code build: ${resolvedVersion}${forcedCommit ? ' (commit override)' : forcedVersion ? ' (version override)' : derivedInsiderFromEngine ? ' (derived from engines.vscode)' : ''}`);

export default defineConfig({
	files: __dirname + (isSanity ? '/dist/sanity-test-extension.js' : '/dist/test-extension.js'),
	version: resolvedVersion,
	launchArgs: [
		'--disable-extensions',
		'--profile-temp'
	],
	mocha: {
		ui: 'tdd',
		color: true,
		forbidOnly: !!process.env.CI,
		timeout: 5000
	}
});
