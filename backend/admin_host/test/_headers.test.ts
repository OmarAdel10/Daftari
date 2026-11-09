// @ts-nocheck — reads static _headers file; no TS types needed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const HEADERS_PATH = join(__dirname, '..', '_headers');
const headers = readFileSync(HEADERS_PATH, 'utf-8');

function sectionOf(headersText: string, pathPattern: string): string {
  const lines = headersText.split('\n');
  let inSection = false;
  const sectionLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('/') && !line.startsWith('//')) {
      if (inSection) break;
      if (line === pathPattern) {
        inSection = true;
        continue;
      }
      continue;
    }
    if (inSection) sectionLines.push(line);
  }
  return sectionLines.join('\n');
}

describe('_headers security policy', () => {
  it('SPA shell /index.html has must-revalidate cache', () => {
    const section = sectionOf(headers, '/index.html');
    expect(section).toContain('Cache-Control: max-age=0, must-revalidate');
  });

  it('entry assets have must-revalidate (no immutable 1y cache)', () => {
    for (const asset of [
      '/main.dart.js',
      '/main.dart.wasm',
      '/main.dart.mjs',
      '/flutter.js',
      '/flutter_service_worker.js',
      '/flutter_bootstrap.js',
      '/canvaskit/*',
      '/fonts/*',
    ]) {
      const section = sectionOf(headers, asset);
      expect(section).toContain('Cache-Control: public, max-age=0, must-revalidate');
    }
  });

  it('other static assets have 1-hour cache', () => {
    for (const asset of ['/assets/*', '/icons/*', '/favicon.png', '/manifest.json', '/version.json']) {
      const section = sectionOf(headers, asset);
      expect(section).toContain('Cache-Control: public, max-age=3600');
    }
  });

  it('all-responses security headers are present', () => {
    const section = sectionOf(headers, '/*');
    expect(section).toContain('Cross-Origin-Embedder-Policy: require-corp');
    expect(section).toContain('Cross-Origin-Opener-Policy: same-origin-allow-popups');
    expect(section).toContain('X-Frame-Options: DENY');
    expect(section).toContain('X-Content-Type-Options: nosniff');
    expect(section).toContain("Referrer-Policy: strict-origin-when-cross-origin");
    expect(section).toContain('Strict-Transport-Security: max-age=63072000; includeSubDomains');
    expect(section).not.toContain('preload');
    expect(section).toContain('Cross-Origin-Resource-Policy: same-origin');
    expect(section).toContain("frame-ancestors 'none'");
    expect(section).toContain("form-action 'self'");
    expect(section).toContain('report-uri /csp-report');
    expect(section).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()');
  });

  it('CSP has no wildcard first-party origin and no unsafe-inline', () => {
    const section = sectionOf(headers, '/*');
    const cspLine = section.split('\n').map((l: string) => l.trim()).find((l: string) => l.startsWith('Content-Security-Policy:'));
    expect(cspLine).toBeDefined();
    const csp = cspLine!;
    expect(csp).not.toContain('*.daftariapp.workers.dev');
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' https://apis.google.com");
    expect(csp).not.toContain('require-trusted-types-for');
  });
});
