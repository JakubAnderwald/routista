/**
 * Screenshots the route quality scenario matrix from a deployed Routista.
 *
 * Drives the real wizard for each case — shape, place, radius, mode — and
 * writes a screenshot plus the reported length and accuracy. Run it against
 * production and against a preview to compare the same cases side by side.
 *
 * Covers the river crossing cases from issue #47 and the out-and-back spur
 * cases from `docs/technical/SPUR_CLEANUP.md`, including the reported Warsaw
 * heart at a 4500 m radius.
 *
 * Usage:
 *   node tests/e2e/river-crossing-matrix.mjs <baseUrl> <label> [outDir]
 *
 * Set MATRIX_ONLY to a substring of a case id to run just that case — the
 * whole matrix hits the 10 req/min rate limit on `/api/radar/*` if a case has
 * to be retried, and a retry of one case does not.
 *
 * Requires Playwright — deliberately not a devDependency, install on demand:
 *   npm i -D playwright && npx playwright install chromium
 *
 * Preview deployments sit behind Vercel's SSO wall, so this reads
 * VERCEL_AUTOMATION_BYPASS_SECRET from .env.local (or the environment).
 *
 * Each case generates a real route, so this consumes Radar quota.
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

const baseUrl = process.argv[2];
const label = process.argv[3];
const outDir = process.argv[4] || join(HERE, 'matrix');

if (!baseUrl || !label) {
    console.error('usage: node tests/e2e/river-crossing-matrix.mjs <baseUrl> <label> [outDir]');
    process.exit(1);
}

/**
 * The cases worth looking at. `search` is left out for London so the wizard's
 * own default centre is used — 51.505,-0.09 is the reported case exactly.
 */
const CASES = [
    {
        id: '1-heart-london-walk',
        title: 'Heart over the Thames, walking — the reported case',
        shape: 'heart',
        radius: 1000,
        mode: 'Walk',
    },
    {
        id: '2-heart-london-cycle',
        title: 'Heart over the Thames, cycling — the worst case measured',
        shape: 'heart',
        radius: 1000,
        mode: 'Cycle',
    },
    {
        id: '3-star-london-walk',
        title: 'Star centred on the Thames, walking — the hardest case',
        shape: 'star',
        radius: 500,
        mode: 'Walk',
    },
    {
        id: '4-heart-paris-walk',
        title: 'Heart over the Seine, walking — control, already worked',
        shape: 'heart',
        search: 'Paris, France',
        radius: 1000,
        mode: 'Walk',
    },
    {
        id: '5-heart-madrid-walk',
        title: 'Heart over Madrid, walking — control, no river',
        shape: 'heart',
        search: 'Madrid, Spain',
        radius: 1000,
        mode: 'Walk',
    },
    {
        id: '6-heart-amsterdam-walk',
        title: 'Heart over Amsterdam, walking — control, canals everywhere',
        shape: 'heart',
        search: 'Amsterdam, Netherlands',
        radius: 1000,
        mode: 'Walk',
    },
    {
        id: '7-heart-warsaw-walk-4500',
        title: 'Heart over Warsaw at 4500 m, walking — the reported spur case',
        shape: 'heart',
        search: 'Warsaw, Poland',
        radius: 4500,
        mode: 'Walk',
    },
    {
        id: '8-heart-warsaw-walk-1500',
        title: 'Heart over Warsaw at 1500 m, walking — where the cleanup helps most',
        shape: 'heart',
        search: 'Warsaw, Poland',
        radius: 1500,
        mode: 'Walk',
    },
    {
        id: '9-heart-london-drive',
        title: 'Heart over the Thames, driving — the worst self-overlap measured',
        shape: 'heart',
        radius: 1000,
        mode: 'Drive',
    },
    {
        id: '10-star-madrid-walk',
        title: 'Star over Madrid, walking — street grid, the easiest case',
        shape: 'star',
        search: 'Madrid, Spain',
        radius: 800,
        mode: 'Walk',
    },
];

function bypassSecret() {
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
        return process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    }
    const envFile = join(REPO_ROOT, '.env.local');
    if (!existsSync(envFile)) return null;
    const match = readFileSync(envFile, 'utf-8').match(/^VERCEL_AUTOMATION_BYPASS_SECRET=(.*)$/m);
    return match ? match[1].trim() : null;
}

/** Sets a React-controlled input, which ignores a plain value assignment. */
async function setReactInput(page, selector, value) {
    await page.evaluate(
        ({ selector, value }) => {
            const el = document.querySelector(selector);
            if (!el) return;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            ).set;
            setter.call(el, String(value));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        { selector, value }
    );
}

/** Runs one case to a generated route and screenshots it. */
async function runCase(page, testCase) {
    const result = { id: testCase.id, title: testCase.title, ok: false };

    await page.goto(`${baseUrl}/en/create`, { waitUntil: 'networkidle' });

    // The test-controls block is display:none, so the click has to be
    // dispatched and the status spans waited for as "attached".
    await page
        .locator(`[data-testid="test-load-${testCase.shape}"]`)
        .evaluate(el => el.click());
    await page.waitForSelector('[data-testid="has-shape-points"][data-value="true"]', {
        state: 'attached',
        timeout: 60_000,
    });

    await page.click('[data-testid="upload-next-button"]');
    await page.waitForSelector('[data-testid="current-step"][data-value="area"]', {
        state: 'attached',
        timeout: 60_000,
    });

    if (testCase.search) {
        const search = 'input[placeholder^="Search location"]';
        await page.click(search);
        await page.fill(search, testCase.search);
        // Autocomplete is debounced and goes through the Radar proxy.
        await page.waitForSelector('.absolute.top-full button', { timeout: 30_000 });
        await page.locator('.absolute.top-full button').first().click();
        await page.waitForTimeout(2500);
    }

    await setReactInput(page, 'input[type="range"]', testCase.radius);
    await page.waitForTimeout(800);

    // Variant B selects the mode alongside the area and generates from there;
    // variant A has a separate mode step.
    const generateFromArea = await page.$('[data-testid="area-generate-button"]');
    if (generateFromArea) {
        await page.getByRole('button', { name: testCase.mode, exact: true }).first().click();
        await page.screenshot({ path: join(outDir, `${testCase.id}-${label}-area.png`) });
        await generateFromArea.click();
    } else {
        await page.screenshot({ path: join(outDir, `${testCase.id}-${label}-area.png`) });
        await page.click('[data-testid="area-next-button"]');
        await page.waitForSelector('[data-testid="current-step"][data-value="mode"]', {
            state: 'attached',
            timeout: 60_000,
        });
        await page.getByRole('button', { name: testCase.mode, exact: true }).first().click();
        await page.click('[data-testid="mode-generate-button"]');
    }
    // Generous: a 4500 m walking shape is ~15 Radar chunks, and a first pass
    // that trips the river repair detector re-routes all of them up to four
    // more times. Measured at over four minutes against production.
    await page.waitForSelector('[data-testid="has-route"][data-value="true"]', {
        state: 'attached',
        timeout: 600_000,
    });

    // Let the tiles settle so the screenshot is worth looking at.
    await page.waitForTimeout(5000);
    await page.screenshot({ path: join(outDir, `${testCase.id}-${label}.png`) });

    const text = await page.evaluate(() => document.body.innerText);
    result.lengthKm = Number(text.match(/([\d.]+)\s*km/)?.[1] ?? 0);
    result.accuracyPercent = Number(text.match(/(\d+)\s*%/)?.[1] ?? 0);
    result.ok = true;
    return result;
}

// outDir comes from argv: this is a developer script, not a served path.
// eslint-disable-next-line security/detect-non-literal-fs-filename
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const secret = bypassSecret();
const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: secret ? { 'x-vercel-protection-bypass': secret } : {},
});
const page = await context.newPage();

const only = process.env.MATRIX_ONLY;
const selected = only ? CASES.filter(c => c.id.includes(only)) : CASES;

// A filter that matches nothing would otherwise run no cases, keep the previous
// results file, and report success without touching the scenario asked for.
if (selected.length === 0) {
    console.error(`MATRIX_ONLY="${only}" matched no case. Available:`);
    for (const testCase of CASES) console.error(`  ${testCase.id}`);
    process.exit(1);
}

console.log(`\n${label} — ${baseUrl}${only ? ` (only: ${only})` : ''}\n`);
const results = [];

for (const testCase of selected) {
    try {
        const result = await runCase(page, testCase);
        results.push(result);
        console.log(
            `  OK    ${testCase.id.padEnd(26)} ${String(result.lengthKm).padStart(6)} km  ` +
                `${String(result.accuracyPercent).padStart(3)}%  ${testCase.title}`
        );
    } catch (error) {
        results.push({ id: testCase.id, title: testCase.title, ok: false, error: error.message });
        console.log(`  FAIL  ${testCase.id.padEnd(26)} ${error.message.split('\n')[0]}`);
        await page
            .screenshot({ path: join(outDir, `${testCase.id}-${label}-failure.png`) })
            .catch(() => {});
    }
}

await browser.close();

// A filtered run is a retry of part of a matrix, so merge into whatever is
// already there rather than replacing it with one case.
const resultsPath = join(outDir, `results-${label}.json`);
/* eslint-disable security/detect-non-literal-fs-filename */
const previous = existsSync(resultsPath)
    ? JSON.parse(readFileSync(resultsPath, 'utf-8')).results ?? []
    : [];
/* eslint-enable security/detect-non-literal-fs-filename */
const merged = CASES.map(c => results.find(r => r.id === c.id) ?? previous.find(r => r.id === c.id))
    .filter(Boolean);

// eslint-disable-next-line security/detect-non-literal-fs-filename
writeFileSync(resultsPath, `${JSON.stringify({ label, baseUrl, results: merged }, null, 2)}\n`);
console.log(`\n  results: ${resultsPath}\n`);
