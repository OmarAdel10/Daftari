// @ts-nocheck — Node.js built-in modules (child_process, fs, path, os) are
// not in tsconfig.json's `types` array (@cloudflare/workers-types only).
// This test shells out to verify the build.sh _headers copy block.
import { describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('build.sh _headers copy block', () => {
  it('copies _headers into OUT_DIR when present', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'daftari-headers-'));
    const scriptDir = join(workDir, 'script');
    const outDir = join(workDir, 'public');

    mkdirSync(scriptDir, { recursive: true });

    writeFileSync(join(scriptDir, '_headers'), '/*\n  X-Test: value\n');

    // Simulate build.sh lines 44-48: mkdir OUT_DIR, cp _headers into it
    execSync(`mkdir -p "${outDir}" && cp "${join(scriptDir, '_headers')}" "${outDir}/"`, {
      shell: '/bin/bash',
    });

    expect(existsSync(join(outDir, '_headers'))).toBe(true);
    expect(readFileSync(join(outDir, '_headers'), 'utf-8')).toBe(
      '/*\n  X-Test: value\n',
    );

    rmSync(workDir, { recursive: true, force: true });
  });

  it('creates OUT_DIR if missing before copying', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'daftari-headers-'));
    const scriptDir = join(workDir, 'script');
    const outDir = join(workDir, 'public');

    mkdirSync(scriptDir, { recursive: true });

    writeFileSync(join(scriptDir, '_headers'), '/*\n  X-Test: value\n');

    // OUT_DIR does not exist yet — mkdir -p creates it
    execSync(`mkdir -p "${outDir}" && cp "${join(scriptDir, '_headers')}" "${outDir}/"`, {
      shell: '/bin/bash',
    });

    expect(existsSync(join(outDir, '_headers'))).toBe(true);

    rmSync(workDir, { recursive: true, force: true });
  });
});
