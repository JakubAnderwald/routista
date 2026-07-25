# Automated Testing Against Deployments

How to run browser-driven checks against a **deployed** Routista environment — a Vercel
preview or production — as opposed to the unit and component tests that run in CI.

For the overall test pyramid, coverage targets and unit/integration guidance, see
[TESTING_STRATEGY.md](./TESTING_STRATEGY.md). This document covers Layer 4 only.

## Why this exists

CI (`.github/workflows/security.yml`) runs audit, lint, and the vitest suite against the
source. None of that exercises a real browser, so a class of failure slips through:

- an icon package drops an export and the glyph silently vanishes
- a React or Leaflet upgrade breaks hydration only in a real browser
- a route builds fine but throws at runtime

That class is exactly what dependency bumps produce. These scripts catch it by driving a
real Chromium against a deployment.

## Prerequisites

### Playwright (installed on demand, not a dependency)

Playwright is deliberately **not** in `package.json`. It is a large dependency and these
scripts are run manually, so adding it would slow every `npm ci` in CI for something CI
does not run. Install it when you need it:

```bash
npm i -D playwright
npx playwright install chromium
```

Remember to drop it from `package.json` afterwards (`npm un -D playwright`) — the browser
download stays cached in `~/Library/Caches/ms-playwright`, so reinstalling later is quick.

If you would rather not touch `package.json` at all, install into a scratch directory and
symlink it in. Note that `NODE_PATH` does **not** work here: these are ES modules, and ESM
resolves bare specifiers by walking up from the importing file, ignoring `NODE_PATH`
entirely.

```bash
mkdir -p /tmp/pw && (cd /tmp/pw && npm i playwright && npx playwright install chromium)
ln -sfn /tmp/pw/node_modules/playwright      node_modules/playwright
ln -sfn /tmp/pw/node_modules/playwright-core node_modules/playwright-core
```

> If these checks ever move into CI, Playwright should become a real devDependency and
> the install should be cached — see *Wiring into CI* below.

### The preview bypass secret

Preview deployments sit behind Vercel's SSO wall (`ssoProtection` is
`all_except_custom_domains`), so every preview URL redirects to `vercel.com/sso-api` and
is unreachable to any script. Only the custom domain (`www.routista.eu`) is public.

Set `VERCEL_AUTOMATION_BYPASS_SECRET` in `.env.local` — see `.env.example` for where to
create it. Both scripts read it from there, or from the environment if set. **Production
needs no secret**, so you can run against `https://www.routista.eu` with no setup.

## The scripts

### `tests/e2e/preview-smoke.mjs`

Fast, no external quota. Run it on any change.

```bash
node tests/e2e/preview-smoke.mjs https://www.routista.eu baseline
node tests/e2e/preview-smoke.mjs https://routista-git-<branch>-jakubanderwalds-projects.vercel.app my-pr
```

26 checks. For `/en`, `/en/about` and `/en/create`: HTTP 200, no visible error boundary,
non-trivial rendered content, no page exceptions, no console errors, and at least one
`<svg>`. Then it drives the create wizard — loads a test image, waits for shape
extraction, advances to step 2, and confirms Leaflet mounts — and makes one
`POST /api/radar/directions` call. Screenshots land beside the script.

Exit code 0 or 1, so it works as a merge gate.

### `tests/e2e/preview-share-flow.mjs`

Slower, and it **consumes Radar quota** by generating a real route. Run it on changes to
the route pipeline, the share flow, or icons.

```bash
node tests/e2e/preview-share-flow.mjs https://www.routista.eu
```

Drives the full journey to a generated route, opens the share modal, and asserts the four
brand icons render with correct geometry and child-shape counts.

Those assertions are load-bearing: lucide-react v1 removed its brand marks, so Facebook,
Github, Instagram and Twitter now ship from `src/components/icons/BrandIcons.tsx`. A
missing icon fails *silently* — the element renders at zero size rather than throwing — so
presence alone proves nothing and geometry is asserted too.

## How the scripts drive the app

`CreateClient.tsx` renders a hidden `display:none` test-controls block that these scripts
depend on. Keep it in sync when the wizard changes.

| Hook | Purpose |
|------|---------|
| `test-load-star`, `test-load-heart`, `test-load-circle`, … | Load a bundled image without the OS file picker |
| `current-step` | Current wizard step |
| `has-image`, `has-shape-points`, `has-route` | Pipeline state probes |
| `selected-mode`, `ui-variant` | Selected transport mode, A/B variant |

Because the block is `display:none`, Playwright's `click()` refuses to act on it. Dispatch
the click directly instead:

```js
await page.locator('[data-testid="test-load-star"]').evaluate((el) => el.click());
```

## Two traps worth knowing

Both of these produced false failures during development, and both were caught only by
running the suite against **production** first to establish a known-good baseline. Do that
before trusting any new assertion.

1. **Next.js embeds its 404 template in the RSC flight payload of every healthy page.**
   Searching raw `page.content()` for "This page could not be found" therefore fails on
   every route. Match against visible `innerText` instead.

2. **Leaflet only mounts from wizard step 2 onward.** Asserting `.leaflet-container` on a
   freshly loaded `/en/create` always fails — the map genuinely is not there yet.

## Wiring into CI

Not wired in today, and the honest trade-off is: these need a deployed URL, so they can
only run *after* Vercel finishes, which means a `workflow_run` or `deployment_status`
trigger rather than the normal PR job. Doing it properly means making Playwright a real
devDependency, caching the browser download, and putting
`VERCEL_AUTOMATION_BYPASS_SECRET` into repository secrets.

Until then, run them manually before merging anything that touches rendering, the route
pipeline, or dependencies.

## Relationship to `christmas-shapes.test.ts`

`tests/e2e/christmas-shapes.test.ts` is an older template whose assertions are all
commented out — it documents an intended flow but asserts nothing, and vitest collects it
as an empty pass. The `.mjs` scripts here are the working implementation of that idea. The
template is left in place as a description of the Christmas-shape journeys, which the
scripts do not yet cover.
