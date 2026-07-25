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

- **Paris is fine.** The Seine gets crossed cleanly at 1.89x with no water travel, so this is
  not "rivers are hard" — it is specific to what is in Radar's graph for the Thames.
- **Driving is fine.** Same shape, same city: 0 long edges, longest water run 238 m, which is
  the width of the river. The fix only needs to touch `foot` and `bike`.
- **Budapest is the honest edge case.** A 323 m edge and a 382 m water run are a real bridge
  over the Danube, not a defect. Any detector has to leave this alone.

Note also that user-facing **accuracy is not a useful signal here**: `london-heart-foot`
scores 88% while spending 23 km in the river, because the metric averages distance to the
shape and a dense spur near the shape barely moves it.

## Secondary finding, not part of this work

`SIMPLIFICATION_TOLERANCES["foot-walking"]` (0.00005) divided by
`GEO.simplification.closedLoopDivisor` (20) gives an effective Douglas-Peucker tolerance of
about 0.3 m, so 150-point shapes are not simplified at all. That means ~40 m waypoint spacing,
~16 Radar requests per route, and a 2.4x length ratio even in a river-free city. Worth
revisiting separately.

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

## How the fix will be measured

`tests/integration/riverScenarios.test.ts` holds a `KNOWN_BROKEN` set with the four London
walking and cycling scenarios. It asserts that those scenarios still travel along the water
and that every other scenario does not. When the fix lands, each repaired scenario is removed
from `KNOWN_BROKEN` and immediately has to satisfy the same invariants as the controls:

- longest unbroken run through water below `ROUTE_QUALITY.maxWaterCrossingMeters` (500 m)
- no edge over 400 m for `foot` and `bike`
- length ratio under 3.5x and self-overlap under 60% for walking

Leaving a repaired scenario in `KNOWN_BROKEN` fails the suite on purpose.
