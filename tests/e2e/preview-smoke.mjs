/**
 * Smoke suite for a deployed Routista environment (Vercel preview or production).
 *
 * Usage:
 *   node tests/e2e/preview-smoke.mjs <baseUrl> [label]
 *
 * See docs/technical/AUTOMATED_TESTING.md for setup and the reasoning behind the
 * assertions. Requires Playwright — deliberately NOT a devDependency, install on
 * demand: npm i -D playwright && npx playwright install chromium
 *
 * Preview deployments are behind Vercel's SSO wall, so this reads
 * VERCEL_AUTOMATION_BYPASS_SECRET from .env.local (or the environment) and sends it
 * as x-vercel-protection-bypass. Production needs no secret.
 *
 * Exits 0 when every check passes, 1 otherwise — usable as a merge gate.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

const baseUrl = process.argv[2];
const label = process.argv[3] || 'run';
if (!baseUrl) {
    console.error('usage: node tests/e2e/preview-smoke.mjs <baseUrl> [label]');
    process.exit(1);
}

/** Env wins over .env.local so CI can inject the secret without a file. */
function bypassSecret() {
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) return process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    try {
        const line = readFileSync(join(REPO_ROOT, '.env.local'), 'utf8')
            .split('\n')
            .find((l) => l.startsWith('VERCEL_AUTOMATION_BYPASS_SECRET='));
        if (line) return line.slice('VERCEL_AUTOMATION_BYPASS_SECRET='.length).trim();
    } catch {
        /* production needs no bypass */
    }
    return '';
}

const secret = bypassSecret();
const headers = secret
    ? { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' }
    : {};

const failures = [];
let passCount = 0;
function check(ok, name, detail = '') {
    if (ok) {
        passCount++;
        console.log(`  PASS  ${name}`);
    } else {
        failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
        console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

/**
 * Matched against *visible* text only. Next.js embeds its 404 template inside the
 * serialized RSC flight payload of every healthy page, so matching raw HTML reports
 * a false failure on every route — confirmed against production.
 */
const ERROR_MARKERS = [
    'application error',
    'this page could not be found',
    'internal server error',
    'something went wrong',
];

/** Analytics beacons are blocked or noisy on previews; not app regressions. */
const IGNORED_ERRORS = /posthog|sentry|speed-insights|vitals|_vercel\/insights|favicon|net::ERR_BLOCKED/i;

function watch(page, sink) {
    page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORED_ERRORS.test(m.text())) sink.console.push(m.text());
    });
    page.on('pageerror', (e) => {
        if (!IGNORED_ERRORS.test(e.message)) sink.page.push(e.message);
    });
}

const probe = (page, id) =>
    page.locator(`[data-testid="${id}"]`).evaluate((el) => el.textContent?.trim());

const browser = await chromium.launch();
const context = await browser.newContext({ extraHTTPHeaders: headers, viewport: { width: 1280, height: 900 } });

console.log(`\n=== routista preview smoke: ${label} ===`);
console.log(`base: ${baseUrl}\n`);

for (const route of [
    { path: '/en', name: 'home' },
    { path: '/en/about', name: 'about' },
    { path: '/en/create', name: 'create' },
]) {
    console.log(`- ${route.path}`);
    const page = await context.newPage();
    const errs = { console: [], page: [] };
    watch(page, errs);

    let resp;
    try {
        resp = await page.goto(baseUrl + route.path, { waitUntil: 'networkidle', timeout: 60000 });
    } catch (err) {
        check(false, `${route.name}: navigation`, err.message);
        await page.close();
        continue;
    }

    check(resp?.status() === 200, `${route.name}: HTTP 200`, `got ${resp?.status()}`);

    const text = (await page.locator('body').innerText()).toLowerCase();
    const marker = ERROR_MARKERS.find((m) => text.includes(m));
    check(!marker, `${route.name}: no error boundary`, marker ? `visible "${marker}"` : '');
    check(text.length > 100, `${route.name}: renders content`, `${text.length} chars visible`);
    check(errs.page.length === 0, `${route.name}: no page exceptions`, errs.page.slice(0, 3).join(' | '));
    check(errs.console.length === 0, `${route.name}: no console errors`, errs.console.slice(0, 3).join(' | '));

    // Guards the failure mode where an icon package drops an export: the glyph
    // silently disappears rather than throwing.
    const svgCount = await page.locator('svg').count();
    check(svgCount > 0, `${route.name}: icons render as svg`, `found ${svgCount}`);

    await page.close();
}

console.log('\n- create wizard: upload -> shape -> area (map)');
{
    const page = await context.newPage();
    const errs = { console: [], page: [] };
    watch(page, errs);

    try {
        await page.goto(baseUrl + '/en/create', { waitUntil: 'networkidle', timeout: 60000 });
        check((await probe(page, 'current-step')) === 'upload', 'wizard: starts at upload step');

        // Test controls live in a display:none div, so a real click is impossible —
        // dispatch directly, which is how CreateClient.tsx intends them to be driven.
        await page.locator('[data-testid="test-load-star"]').evaluate((el) => el.click());

        await page.waitForFunction(
            () => document.querySelector('[data-testid="has-image"]')?.textContent?.trim() === 'true',
            { timeout: 30000 },
        );
        check(true, 'wizard: test image loads');

        await page.waitForFunction(
            () => document.querySelector('[data-testid="has-shape-points"]')?.textContent?.trim() === 'true',
            { timeout: 30000 },
        );
        check(true, 'wizard: shape extraction produces points');

        await page.locator('[data-testid="upload-next-button"]').click({ timeout: 15000 });
        await page.waitForFunction(
            () => document.querySelector('[data-testid="current-step"]')?.textContent?.trim() !== 'upload',
            { timeout: 15000 },
        );
        check(true, `wizard: advances past upload (now "${await probe(page, 'current-step')}")`);

        // Leaflet only mounts from step 2 onward — legitimately absent on step 1.
        await page.waitForSelector('.leaflet-container', { timeout: 30000 });
        check(true, 'wizard: leaflet map initialises');

        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(HERE, `preview-${label}-wizard.png`) });
    } catch (err) {
        check(false, 'wizard: full flow', err.message.split('\n')[0]);
        await page.screenshot({ path: join(HERE, `preview-${label}-wizard-FAILED.png`) }).catch(() => {});
    }

    check(errs.page.length === 0, 'wizard: no page exceptions', errs.page.slice(0, 3).join(' | '));
    check(errs.console.length === 0, 'wizard: no console errors', errs.console.slice(0, 3).join(' | '));
    await page.close();
}

// One call only — vitest.config.ts already notes Radar rate limiting.
console.log('\n- POST /api/radar/directions');
try {
    const r = await context.request.post(`${baseUrl}/api/radar/directions`, {
        data: { coordinates: [[13.405, 52.52], [13.41, 52.525]], mode: 'foot' },
        timeout: 45000,
    });
    check(r.status() < 500, 'api: directions not 5xx', `status ${r.status()}`);
} catch (err) {
    check(false, 'api: directions reachable', err.message.split('\n')[0]);
}

await browser.close();

console.log(`\n=== ${passCount} passed, ${failures.length} failed ===`);
if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
}
console.log('All checks passed.\n');
