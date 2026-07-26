# Issue #47 — "rivers break paths": diagnosis and baseline

GitHub issue [#47](https://github.com/JakubAnderwald/routista/issues/47): shapes drawn over
cities with rivers take "a long track following the river and then back to the other bank",
and draw a line down the middle of the river. Reported for a heart over London.

This document records what actually causes it and what the route quality numbers are before
any fix, so the fix can be measured rather than eyeballed.

## Root cause

**Radar's `foot` and `bike` profiles route along the ferry / river-bus ways in the Thames.**

Waypoints that land in the water snap onto that ferry way, and the router then travels
pier-to-pier down the middle of the river. That is literally the line in the screenshot.

The clearest evidence is a single waypoint pair 79 m apart, both sitting in the Thames at
longitude `-0.090`:

| mode | distance | steps | geometry points | longest single edge |
|---|---|---|---|---|
| `foot` | 3305 m | 2, one of them "Walk west." | 12 | 563 m |
| `bike` | 3305 m | 2 | 12 | 563 m |
| `car` | 1592 m | 11, with street names, over London Bridge | dense | small |

The 12 foot-mode geometry points hop between Blackfriars Pier, London Bridge City Pier and
Tower Pier in 350–850 m straight lines. Car mode has no waterways in its graph, so it snaps
the same two waypoints onto Winchester Walk and Swan Lane and produces a real route.

Radar ignores an `avoid=ferries` parameter — verified, the response is byte-identical.

## What the signals do and do not tell us

Three candidate detectors were measured against the scenario matrix:

**Longest single edge — useful, but not sufficient on its own.** Healthy walking routes top
out at 171 m (a long straight street with no intermediate nodes). Thames ferry ways produce
563–849 m edges. But the longest *legitimate* bridge span in the matrix is 323 m over the
Danube, so edge length alone cannot separate a long bridge from a short ferry hop.

**Detour ratio per leg — too noisy.** At the ~40 m waypoint spacing the app uses, ordinary
street-grid legs routinely hit ratios of 3–10 with nothing wrong.

**Snap distance — not usable.** On-land waypoints in the City of London have car-mode snap
distances of 66 m against 92–140 m for in-water ones. There is no threshold between them.
(Note for future work: `legs[].startLocation` echoes the *requested* point; the snapped point
is `legs[].steps[0].start_location`.)

**Longest unbroken run through water — the one that works.** A bridge is a short perpendicular
crossing bounded by the river's width; a ferry runs along the river for kilometres. Measured:
legitimate crossings reach 382 m (Danube), 238 m (Thames by car), 126 m (Seine), while the
broken London walking routes stay in the water for 1276–7398 m at a stretch. This needs real
water geometry, which is why the harness carries OSM water polygons.

## Baseline

Captured 2026-07-25 from live Radar and committed under `tests/fixtures/`. Reproduced offline
by `tests/integration/riverScenarios.test.ts`.

- **ratio** — routed length / requested shape length
- **longEdges** — count and total length of edges over the mode threshold
- **overlap** — share of the route that retraces itself, i.e. out-and-back spurs
- **water m / crossings / maxRun** — metres inside water, number of separate runs, and the
  longest unbroken run
- **accuracy** — the score shown to users, from `calculateRouteAccuracy`

| scenario | ratio | maxEdge | longEdges | overlap | water m | crossings | maxRun | accuracy |
|---|---|---|---|---|---|---|---|---|
| `london-heart-foot` | 6.88x | 563 m | 47 / 16862 m | 70% | 23212 | 12 | **7398** | 88% |
| `london-heart-foot-sparse` | 2.79x | 354 m | 5 / 1570 m | 44% | 3887 | 12 | **1276** | 90% |
| `london-heart-bike` | 14.1x | 755 m | 70 / 27325 m | 88% | 34232 | 16 | **7034** | 26% |
| `london-star-on-river` | 7.35x | 563 m | 45 / 17852 m | 80% | 24300 | 27 | **5538** | 80% |
| `london-heart-car` | 9.55x | 225 m | 0 / 0 m | 80% | 3124 | 28 | 238 | 82% |
| `london-heart-north` | 3.02x | 149 m | 0 / 0 m | 54% | 45 | 2 | 35 | 94% |
| `paris-heart-foot` | 1.89x | 155 m | 0 / 0 m | 34% | 314 | 4 | 126 | 94% |
| `budapest-heart-foot` | 2.26x | 323 m | 2 / 588 m | 34% | 802 | 5 | 382 | 92% |
| `madrid-heart-foot` | 2.41x | 143 m | 0 / 0 m | 27% | — | — | — | 95% |
| `madrid-square-foot` | 1.27x | 171 m | 0 / 0 m | 1% | — | — | — | 80% |

The four bold rows are the bug. `london-heart-foot` spends **23 km inside the Thames** on a
6 km shape, in runs of up to 7.4 km.

Note what the controls prove:

- **Paris is fine.** The Seine is crossed at 1.89x, and the 314 m of water is four crossings
  of ~130 m each — the width of the river, i.e. bridges. Nothing travels *along* the water. So
  this is not "rivers are hard"; it is specific to what is in Radar's graph for the Thames.
- **Driving is fine.** Same shape, same city: 0 long edges, longest water run 238 m, which is
  the width of the river. The fix only needs to touch `foot` and `bike`.
- **Budapest is the honest edge case.** A 323 m edge and a 382 m water run are a real bridge
  over the Danube, not a defect. Any detector has to leave this alone.

Note also that user-facing **accuracy is not a useful signal here**: `london-heart-foot`
scores 88% while spending 23 km in the river, because the metric averages distance to the
shape and a dense spur near the shape barely moves it.

## Secondary finding, followed up separately

`SIMPLIFICATION_TOLERANCES["foot-walking"]` (0.00005) divided by
`GEO.simplification.closedLoopDivisor` (20) gives an effective Douglas-Peucker tolerance of
about 0.3 m, so 150-point shapes are not simplified at all. That means ~40 m waypoint spacing,
~16 Radar requests per route, and a 2.4x length ratio even in a river-free city.

This turned out to be the cause of a second defect: at that density waypoints keep snapping to
driveways and cul-de-sacs, and the router has to go in and come back out, so routes were
spending 5-62% of their length on out-and-back spurs. Those are now removed from the returned
geometry — see `docs/technical/SPUR_CLEANUP.md`, which also carries the post-cleanup baseline.
The spacing itself is still unfixed.

**The numbers in the tables above are pre-cleanup.** `tests/fixtures/baseline.json` now holds
the post-cleanup values; both are shown side by side in `SPUR_CLEANUP.md`.

## Reproducing

```bash
# Offline, from committed fixtures — this is what CI runs
npm test

# Re-record fixtures from live Radar and OSM (needs .env.local)
npm run fixtures:routes

# Refresh tests/fixtures/baseline.json after a deliberate behaviour change
npm run test:baseline

# Run the same scenarios against live Radar, to catch upstream drift
npm run test:live
```

## The fix

Two changes, both in the routing pipeline.

### 1. Waypoints are moved out of the water before routing

`src/lib/riverCrossing.ts` finds every unbroken run of waypoints that falls inside a water
polygon and replaces it with a crossing over the nearest suitable bridge, so the router is
never offered a waypoint it can only satisfy from a ferry.

- A bridge qualifies only if both its ends are on land, it spans at least 25 m of water, and
  the shape can reach its near end without traversing a river. That last test is measured on
  the longest unbroken stretch of water the approach touches, not the total, because waypoints
  sit on embankments and graze the polygon constantly.
- OSM splits a bridge into several ways, so ways sharing a name are chained end to end first.
  The filter also removes the short structures OSM tags `bridge=yes` — an 8 m footway over the
  corner of a dock is not a way across the Thames, and choosing one strands the router
  mid-river.
- Where the shape dips into the river and returns to the same bank it goes over and back,
  turning round past the far abutment so the two legs read as two crossings rather than one
  long run through the water.
- Closed shapes are rotated to start on land, so a run straddling the seam — exactly where the
  reported heart over London breaks — is handled as one run.

Water and bridge geometry come from OSM via `src/lib/overpassService.ts`, cached in Redis for
a month. It is only fetched when a first routing pass produced an edge longer than any real
street, so routes in cities without this problem never pay for it, and Overpass being
unavailable leaves the route exactly as it was before.

### 2. Legs that still travel on water get a crossing pinned into them

Moving waypoints is not always enough: Radar diverts to a pier and back even between two dry
waypoints. After routing, any leg that spends more than 500 m in water, or contains a single
over-water edge longer than a street, gets a point pinned into it — a bridge if the straight
line genuinely crosses water, otherwise a single point on land, which is all it takes to stop
the router wandering. This repeats up to three times, since pinning one crossing can push the
router onto a ferry elsewhere.

### Also fixed: chunk stitching

Radar takes at most 25 waypoints per request, so routes are chunked. Consecutive chunks
overlapped by **two** waypoints while stitching dropped only **one**, so every chunk boundary
travelled its boundary leg twice and left a jump between the duplicates. At 14 chunks per
route that is 13 spurious out-and-backs. Chunks now share exactly one waypoint.

This was found while chasing a 503 m stretch of water that survived the bridge repair: the
route was crossing Blackfriars Bridge, coming back, and crossing again.

## Results

Same scenarios, same measurement, before and after:

| scenario | ratio | maxEdge | water m | maxRun | overlap | accuracy |
|---|---|---|---|---|---|---|
| `london-heart-foot` | 6.88x → **2.68x** | 563 → **124** m | 23212 → **879** | 7398 → **251** | 70% → **31%** | 88% → **94%** |
| `london-heart-foot-sparse` | 2.79x → **1.83x** | 354 → **124** m | 3887 → **879** | 1276 → **251** | 44% → **14%** | 90% → **89%** |
| `london-heart-bike` | 14.1x → **4.6x** | 755 → **194** m | 34232 → **1806** | 7034 → **238** | 88% → **64%** | 26% → **90%** |
| `london-star-on-river` | 7.35x → **2.97x** | 563 → **372** m | 24300 → **4035** | 5538 → **2239** | 80% → **58%** | 80% → **85%** |
| `london-heart-car` | 9.55x → 8.85x | 225 → 225 m | 3124 → 3062 | 238 → 238 | 80% → 76% | 82% → 82% |
| `london-heart-north` | 3.02x → 2.59x | 149 → 87 m | 45 → 35 | 35 → 35 | 54% → 35% | 94% → 93% |
| `paris-heart-foot` | 1.89x → 1.63x | 155 → 135 m | 314 → 314 | 126 → 126 | 34% → 15% | 94% → 94% |
| `budapest-heart-foot` | 2.26x → 1.83x | 323 → 387 m | 802 → 642 | 382 → 354 | 34% → 9% | 92% → 92% |
| `madrid-heart-foot` | 2.41x → 2.46x | 143 → 470 m | 0 | 0 | 27% → 29% | 95% → 94% |

That 470 m edge is the road tunnel described under "Known limitations" below. The spur
cleanup has since removed it and the edge is back to 143 m — see `SPUR_CLEANUP.md`; the
table above is the state at the end of issue #47, before that change.

| `madrid-square-foot` | 1.27x → 1.27x | 171 → 171 m | 0 | 0 | 1% → 1% | 80% → 80% |

Added after the fix, so measured once (all satisfy every invariant):

| scenario | ratio | maxEdge | water m | maxRun | overlap | accuracy |
|---|---|---|---|---|---|---|
| `london-heart-image` | 2.24x | 96 m | 492 | 251 | 25% | 95% |
| `london-dino-image` | 2.58x | 153 m | 895 | 177 | 33% | 95% |
| `amsterdam-heart-foot` | 2.25x | 160 m | 939 | 398 | 22% | 94% |

The reported case, `london-heart-foot`, goes from **23 km inside the Thames to 879 m** — three
bridge crossings — with the longest unbroken run down from 7.4 km to 251 m, which is the width
of the river. Cycling improves most: it was 34 km in the water at 26% accuracy, and is now 1.8
km at 90%.

The controls all improve slightly or hold steady, which is the chunk stitching fix showing up
as less self-overlap everywhere. Driving is untouched, as intended.

**`london-heart-image` is the one that matters most for confidence**: it is the same
`heart-v2.png` a user picks, through the real extraction pipeline rather than a parametric
outline, and it comes out at 2.24x with a 96 m longest edge and 95% accuracy.

### Known limitations

- **`london-star-on-river` still travels along the river.** A star centred in the middle of
  the Thames with a 500 m radius puts a fifth of its waypoints in the water, and some runs have
  no bridge close enough to reach without a diversion longer than the shape. It improved
  six-fold and is listed under `knownIssues.waterTravel` so it cannot silently get worse.
- **`madrid-heart-foot` contained a 470 m edge, and it was a real defect — a different one.
  It is now fixed** by the spur cleanup, which removes the tunnel detour as an excursion the shape
  does not need; the scenario's longest edge is 143 m and it no longer carries a known issue. The
  description below is kept because the defect is still in Radar's graph.

- **How it presented:**
  Radar's foot profile routes pedestrians through the **Calle de Bailén road tunnel** under
  Plaza de Oriente (`tunnel=yes`, `layer=-1`), turning a 40 m gap into a 1659 m detour with a
  470 m straight edge. Same class as the Thames ferries — Radar using ways pedestrians cannot
  — but a different way type, and not water, so the river crossing repair correctly leaves it
  alone. Reproducible against live Radar, listed under `knownIssues.longEdge`, and worth its
  own issue.

  One consequence worth knowing: because the free detector only sees "an edge too long to be a
  street", Madrid triggers an OSM fetch that then finds nothing to repair. That costs one
  Overpass request per ~1.1 km grid cell per 30 days, and nothing else.
- **Length ratios stay above 2x** even for healthy routes, because of the simplification
  finding above: waypoints end up ~40 m apart and the street grid cannot follow that closely.

## How regressions are caught

Three invariants, in `tests/utils/routeInvariants.ts`, checked **both ways** for every
scenario. A scenario that does not list an invariant under `knownIssues` must satisfy it; one
that does must still *fail* it — so a case cannot be quietly fixed and left listed, nor
regress into the list unnoticed.

| invariant | rule |
|---|---|
| `waterTravel` | longest unbroken run through water below 500 m — water is crossed, never travelled along |
| `longEdge` | no edge over 400 m for walking or cycling; bridge spans in the matrix reach 387 m, so this only catches ferries and tunnels. `WIDE_SPAN_METERS` raises it per scenario where a wider span has been verified against OSM |
| `followsShape` | walking routes stay under 3.5x the shape length and 60% self-overlap |
| `spurs` | no out-and-back excursions left in the geometry, in any mode. Added with the spur cleanup; see `SPUR_CLEANUP.md` |

Backed by:

- **`tests/fixtures/baseline.json`** — every metric pinned, so drift in either direction fails
  the build, including improvements nobody intended.
- **`tests/integration/routePipeline.test.ts`** — the route still generates when OSM data is
  unavailable, request count stays bounded, no extra request is made when there is nothing to
  repair, and the response still exports to GPX and scores for accuracy.
- **`tests/live/riverScenarios.live.test.ts`** — the same invariants against live Radar, so
  upstream changes surface as a failure rather than a stale fixture.
- **`tests/live/repairEffect.live.test.ts`** — routes the same waypoints with the repair on and
  off and asserts the difference. Without it, a scenario passing its invariants would prove
  nothing: it might simply never have been broken.
