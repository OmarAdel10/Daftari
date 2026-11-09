// @ts-nocheck — Node.js built-in modules (child_process, fs, path, os) are
// not in tsconfig.json's `types` array (@cloudflare/workers-types only).
// This integration test executes the real build.sh in an isolated temp dir.
import { describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('build.sh integration (_headers copy)', () => {
  it('copies _headers into public/ when running the real build.sh', () => {
    const root = mkdtempSync(join(tmpdir(), 'daftari-build-'));
    const scriptDir = join(root, 'backend', 'admin_host');
    mkdirSync(scriptDir, { recursive: true });

    // Copy the real build.sh into the temp script dir
    const realBuildSh = join(__dirname, '..', 'build.sh');
    const tempBuildSh = join(scriptDir, 'build.sh');
    writeFileSync(tempBuildSh, readFileSync(realBuildSh, 'utf-8'));

    // _headers is mandatory — place it in script dir
    writeFileSync(join(scriptDir, '_headers'), '/*\n  X-Test: value\n');

    // Dummy Flutter build output that build.sh will find as SRC
    const dummyWeb = join(root, 'build', 'web');
    mkdirSync(dummyWeb, { recursive: true });
    writeFileSync(join(dummyWeb, 'main.dart.js'), 'dummy');

    // Run build.sh from its directory (ROOT_DIR resolution depends on it)
    execSync('bash build.sh', { cwd: scriptDir, shell: '/bin/bash' });

    // Assert _headers was copied into public/
    expect(existsSync(join(scriptDir, 'public', '_headers'))).toBe(true);
    expect(readFileSync(join(scriptDir, 'public', '_headers'), 'utf-8')).toBe(
      '/*\n  X-Test: value\n',
    );

    rmSync(root, { recursive: true, force: true });
  });

  it('fails build when _headers is missing (mandatory copy)', () => {
    const root = mkdtempSync(join(tmpdir(), 'daftari-build-'));
    const scriptDir = join(root, 'backend', 'admin_host');
    mkdirSync(scriptDir, { recursive: true });

    const realBuildSh = join(__dirname, '..', 'build.sh');
    writeFileSync(join(scriptDir, 'build.sh'), readFileSync(realBuildSh, 'utf-8'));

    // No _headers file — build should fail
    const dummyWeb = join(root, 'build', 'web');
    mkdirSync(dummyWeb, { recursive: true });
    writeFileSync(join(dummyWeb, 'main.dart.js'), 'dummy');

    let threw = false;
    try {
      execSync('bash build.sh', { cwd: scriptDir, shell: '/bin/bash' });
    } catch (_) {
      threw = true;
    }
    expect(threw).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });
});
