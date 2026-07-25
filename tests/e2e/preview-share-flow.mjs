/**
 * Full journey: image -> shape -> area -> generated route -> share modal.
 *
 * Usage:
 *   node tests/e2e/preview-share-flow.mjs <baseUrl>
 *
 * Goes deeper than preview-smoke.mjs: it actually generates a route (hitting the
 * Radar API) and opens the share modal, which is the only way to reach the brand
 * icons. Slower and it consumes Radar quota, so run it on changes that touch the
 * route pipeline, icons, or the share flow — not on every push.
 *
 * The brand-icon assertions exist because lucide-react v1 removed its brand marks
 * (Facebook, Github, Instagram, Twitter). We now ship those glyphs ourselves in
 * src/components/icons/BrandIcons.tsx, and a missing icon fails silently — the
 * element renders with zero size rather than throwing — so geometry is asserted,
 * not just presence.
 *
 * See docs/technical/AUTOMATED_TESTING.md. Exits 0 on success, 1 on failure.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

const baseUrl = process.argv[2];
if (!baseUrl) {
    console.error('usage: node tests/e2e/preview-share-flow.mjs <baseUrl>');
    process.exit(1);
}

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
const browser = await chromium.launch();
const context = await browser.newContext({
    extraHTTPHeaders: secret
        ? { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' }
        : {},
    viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
let bad = 0;

// --- Github, rendered on the about page ---------------------------------------
await page.goto(baseUrl + '/en/about', { waitUntil: 'networkidle' });
const gh = page.locator('svg.lucide-github');
const ghCount = await gh.count();
console.log(`about: svg.lucide-github count = ${ghCount}`);
if (ghCount < 1) {
    console.log('  FAIL github icon missing');
    bad++;
} else {
    const box = await gh.first().boundingBox();
    const paths = await gh.first().locator('path').count();
    console.log(`  box=${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none'} paths=${paths}`);
    if (!box || box.width < 4 || box.height < 4) {
        console.log('  FAIL github icon has no size');
        bad++;
    }
    if (paths !== 2) {
        console.log(`  FAIL github expected 2 paths, got ${paths}`);
        bad++;
    }
}

// --- Drive the wizard all the way to a generated route -------------------------
await page.goto(baseUrl + '/en/create', { waitUntil: 'networkidle' });
await page.locator('[data-testid="test-load-star"]').evaluate((el) => el.click());
await page.waitForFunction(
    () => document.querySelector('[data-testid="has-shape-points"]')?.textContent?.trim() === 'true',
    { timeout: 30000 },
);
await page.locator('[data-testid="upload-next-button"]').click();
await page.waitForSelector('.leaflet-container', { timeout: 30000 });

await page.getByRole('button', { name: /generate route/i }).click();
await page.waitForFunction(
    () => document.querySelector('[data-testid="has-route"]')?.textContent?.trim() === 'true',
    { timeout: 120000 },
);
console.log('create: route generated');

// --- Instagram / Facebook / Twitter, inside the share modal --------------------
await page.locator('[data-testid="result-share-button"]').click();
await page.waitForSelector('[data-testid="share-platform-instagram"]', { timeout: 20000 });

// Expected child-shape counts come from the original lucide paths preserved in
// BrandIcons.tsx: instagram is rect + path + line, the other two a single path.
for (const [slug, expectedShapes] of [['instagram', 3], ['facebook', 1], ['twitter', 1]]) {
    const icon = page.locator(`[data-testid="share-platform-${slug}"] svg.lucide-${slug}`);
    const n = await icon.count();
    const box = n ? await icon.first().boundingBox() : null;
    const shapes = n ? await icon.first().locator('path, rect, line').count() : 0;
    const ok = n >= 1 && box && box.width > 4 && shapes === expectedShapes;
    console.log(
        `share ${slug}: count=${n} box=${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none'} shapes=${shapes} -> ${ok ? 'OK' : 'FAIL'}`,
    );
    if (!ok) bad++;
}
await page.screenshot({ path: join(HERE, 'share-flow.png') });

await browser.close();
console.log(bad === 0 ? '\nFull share flow OK, all brand icons render.' : `\n${bad} problems.`);
process.exit(bad === 0 ? 0 : 1);
