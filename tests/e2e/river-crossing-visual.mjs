/**
 * Visual check for the river crossing repair (GitHub issue #47).
 *
 * Drives a deployed Routista in a real browser: loads the heart example, puts
 * it over the Thames, generates a walking route, and screenshots the result.
 * The offline suite proves the numbers; this proves the thing a user actually
 * sees renders, and gives a picture to compare against the original report.
 *
 * Usage:
 *   node tests/e2e/river-crossing-visual.mjs <baseUrl> [label]
 *
 * Requires Playwright — deliberately not a devDependency, install on demand:
 *   npm i -D playwright && npx playwright install chromium
 *
 * Preview deployments sit behind Vercel's SSO wall, so this reads
 * VERCEL_AUTOMATION_BYPASS_SECRET from .env.local (or the environment).
 *
 * Exits 0 when every check passes, 1 otherwise.
 */

import { chromium, errors } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

const baseUrl = process.argv[2];
const label = process.argv[3] || 'run';
if (!baseUrl) {
    console.error('usage: node tests/e2e/river-crossing-visual.mjs <baseUrl> [label]');
    process.exit(1);
}

/**
 * The wizard's defaults are the reported case exactly: the heart example,
 * centred at 51.505,-0.09 on the Thames at Southwark, 1000 m radius, walking.
 * So this drives the shortest path a user can take to reproduce issue #47.
 */
function bypassSecret() {
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
        return process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    }
    const envFile = join(REPO_ROOT, '.env.local');
    if (!existsSync(envFile)) return null;

    const match = readFileSync(envFile, 'utf-8').match(
        /^VERCEL_AUTOMATION_BYPASS_SECRET=(.*)$/m
    );
    return match ? match[1].trim() : null;
}

const failures = [];
function check(name, condition, detail = '') {
    if (condition) {
        console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
    } else {
        console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
        failures.push(name);
    }
}

const browser = await chromium.launch();
const secret = bypassSecret();
const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: secret ? { 'x-vercel-protection-bypass': secret } : {},
});
const page = await context.newPage();

try {
    console.log(`\nRiver crossing visual check — ${baseUrl}`);

    await page.goto(`${baseUrl}/en/create`, { waitUntil: 'networkidle' });

    // Load the heart through the hidden test control, since the OS file
    // picker cannot be driven. The controls live in a display:none block, so
    // the click has to be dispatched rather than performed.
    await page.locator('[data-testid="test-load-heart"]').evaluate(el => el.click());
    await page.waitForSelector('[data-testid="has-shape-points"][data-value="true"]', {
        state: 'attached',
        timeout: 30_000,
    });
    check('heart example extracted to shape points', true);

    await page.click('[data-testid="upload-next-button"]');
    await page.waitForSelector('[data-testid="current-step"][data-value="area"]', {
        state: 'attached',
        timeout: 30_000,
    });

    const mode = await page.getAttribute('[data-testid="selected-mode"]', 'data-value');
    check('walking selected by default', mode === 'foot-walking', mode ?? 'none');

    // Variant B generates straight from the area step; variant A goes via a
    // separate mode step first.
    const generateFromArea = await page.$('[data-testid="area-generate-button"]');
    if (generateFromArea) {
        await generateFromArea.click();
    } else {
        await page.click('[data-testid="area-next-button"]');
        await page.waitForSelector('[data-testid="current-step"][data-value="mode"]', {
            state: 'attached',
        });
        await page.click('[data-testid="mode-generate-button"]');
    }

    await page.waitForSelector('[data-testid="has-route"][data-value="true"]', {
        state: 'attached',
        timeout: 180_000,
    });
    check('route generated and rendered', true);

    // The route has to be drawn, not merely computed. React-Leaflet may use
    // either the SVG or the canvas renderer, so accept both.
    //
    // Poll rather than sample once. `has-route` flips as soon as the route is in
    // state, but ResultMap keys itself on the centre and so re-mounts while
    // MapUpdater refits the bounds, leaving the overlay pane briefly empty. A
    // single evaluate() lands in that gap and reports a route that is plainly on
    // screen as missing.
    const countDrawn = () =>
        page.evaluate(() => {
            const map = document.querySelector('.leaflet-container');
            if (!map) return { paths: 0, canvases: 0 };
            return {
                paths: map.querySelectorAll('svg path').length,
                canvases: map.querySelectorAll('canvas').length,
            };
        });

    try {
        await page.waitForFunction(
            () => {
                const map = document.querySelector('.leaflet-container');
                if (!map) return false;
                return (
                    map.querySelectorAll('svg path').length > 0 ||
                    map.querySelectorAll('canvas').length > 0
                );
            },
            { timeout: 30_000 }
        );
    } catch (error) {
        // A timeout means the overlay genuinely never appeared: fall through so
        // the counts below report what was actually there and the remaining
        // checks still run. Anything else — a detached frame, an evaluation
        // fault — is a real error, and reporting it as "0 svg paths" would hide
        // the cause behind the same misleading result this check used to give.
        if (!(error instanceof errors.TimeoutError)) throw error;
    }
    const drawn = await countDrawn();
    check(
        'route drawn on the map',
        drawn.paths > 0 || drawn.canvases > 0,
        `${drawn.paths} svg path(s), ${drawn.canvases} canvas(es)`
    );

    // The numbers the user is shown should agree with what we measured.
    const summary = await page.evaluate(() => document.body.innerText);
    const accuracy = Number(summary.match(/(\d+)\s*%/)?.[1] ?? 0);
    const lengthKm = Number(summary.match(/([\d.]+)\s*km/)?.[1] ?? 0);
    check('shape accuracy is high', accuracy >= 85, `${accuracy}%`);
    check('route length is plausible for a 6 km shape', lengthKm > 6 && lengthKm < 21, `${lengthKm} km`);

    // Give the map tiles a moment so the screenshot is worth looking at.
    await page.waitForTimeout(4000);
    const screenshot = join(HERE, `river-crossing-${label}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    console.log(`  screenshot: ${screenshot}`);

    const downloadable = await page.$('[data-testid="result-download-button"]');
    check('GPX download offered', Boolean(downloadable));
} catch (error) {
    check('visual check completed', false, error.message);
    await page
        .screenshot({ path: join(HERE, `river-crossing-${label}-failure.png`) })
        .catch(() => {});
} finally {
    await browser.close();
}

console.log(failures.length === 0 ? '\nAll checks passed.\n' : `\n${failures.length} failed.\n`);
process.exit(failures.length === 0 ? 0 : 1);
