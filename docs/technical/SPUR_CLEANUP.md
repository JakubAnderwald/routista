# Spur cleanup — routes that branch off a road and come straight back

Reported as: routes "create branches into roads that then turn back in and go back through the
same branch to main road. it just adds kilometers without any purpose." Screenshot: a heart over
Warsaw, walking, 4500 m radius, **66.62 km**, with comb teeth and rectangular stubs all over the
polyline — and 95% shape accuracy next to it.

This is not issue #47. That was the Thames ferries, and it is fixed. This is the residue that fix
left behind, and it was present in **every** scenario in the matrix, including the ones #47 called
healthy: the `london-heart-north` control was spending 31% of its length on it.

## Root cause

Two independent things, one of which is fixed here.

### a. Waypoints are ~40 m apart and every one is a forced via-point

`SIMPLIFICATION_TOLERANCES["foot-walking"]` (0.00005°) is divided by
`GEO.simplification.closedLoopDivisor` (20) inside `simplifyPoints`, giving an effective
Douglas-Peucker tolerance of about 0.3 m — so a 150-point shape is not simplified at all. Measured
from the recorded request URLs, the median waypoint gap is 40 m for walking and 80 m for driving,
with a minimum of 10 m.

At that density it takes very little for a waypoint's nearest way to be a driveway, a service road,
a cul-de-sac or the far carriageway of a divided road. Radar has to visit it, so it drives in and
comes back out. Enter plus exit is the spur.

This is the older half of the cause and it is **not fixed here** — see "Still open" below.

### b. Nothing removed them afterwards

Until this change the only post-processing on the returned geometry was dropping one repeated point
per chunk boundary. And Radar cannot be asked to behave better: `/v1/route/directions` accepts only
`locations`, `mode`, `units`, `avoid` and `geometry`. There is no snap radius, no bearings, no
`continue_straight`, no U-turn suppression — and `avoid` is documented as silently ignored
(`ISSUE_47_BASELINE.md`). The geometry Radar returns is the only place to fix this.

## Why the existing metrics did not catch it

- **`selfOverlapFraction` is nearly blind to it.** `ROUTE_QUALITY.selfOverlapMinGapMeters` is 150 m,
  so the two halves of an out-and-back have to be 150 m apart *along the route* before they count.
  A 30 m detour into a driveway and back is 60 m of route: invisible. It was built to catch
  "walks along the embankment to a bridge and back", which is a different scale of problem.
- **The accuracy score is blind to it by construction.** It normalises by `radius * 0.5`, so on the
  reported 4500 m route the whole error budget is 2250 m. A 60 m spur sitting right next to the
  shape moves the score by a fraction of a point. That is how a 66 km route scores 95%.

## The fix

`src/lib/routeCleanup.ts` — `removeSpurs(points, options)`. One streaming pass over the returned
polyline. Whenever the next point lands back on a point the route already passed through, the
geometry in between is an excursion: it left and came back without getting anywhere. It is spliced
out when it is short enough to be a snapping artifact rather than a feature of the shape.

Two independent bounds decide that, both in `SPUR_CLEANUP` (`src/config/routing.ts`):

| bound | walking / cycling | driving | what it is for |
|---|---|---|---|
| `snapMeters` | 8 | 8 | how close two points must be to be the same place |
| `maxSpurMeters` | 250 | 400 | longest excursion that may go |
| `maxDeviationMeters` | 35 | 45 | farthest it may stray from where it rejoins |

**`maxDeviationMeters` is the control that matters**; the length cap is a safety belt. With the
deviation guard off, the Paris control loses a genuine part of the heart — the worst distance from
a shape point to the route jumps from 33 m to 274 m. At 35 m it stays at 65 m and 10-31% of the
length still goes. Sweeping the length cap between 150 m and 400 m barely changes anything, because
real features are rejected on deviation long before length.

Driving is looser at 45 m because its waypoints are ~80 m apart and the two carriageways of a
divided road are ~30 m apart, so 35 m would refuse to remove the wrong-side-of-the-road detour that
is the commonest car spur. 45 m is the largest value that keeps every scenario's accuracy within 2
points of its pre-cleanup baseline; 60 m removes another 3.3 km from `london-heart-car` but costs
it a third point.

### Properties worth knowing

- **Contiguous by construction.** The join point is kept and the route carries on from there, so the
  only new edge is at most `snapMeters` longer than the one it replaces. `maxEdgeMeters` moved on
  exactly one scenario in the whole matrix: Paris, 135 → 139 m.
- **Idempotent.** The pass re-tests each newly formed adjacency as it goes, so a second run finds
  nothing. That is what lets the invariant assert `spurCount === 0` exactly rather than pick a
  threshold.
- **Closed loops, figure-of-eights and traced dead ends survive**, each rejected by both bounds
  independently: a whole lobe is kilometres long *and* hundreds of metres from the join.
- **The river repair's own out-and-backs survive.** `riverCrossing.ts` deliberately emits
  `[entry, past-the-far-abutment, entry]` for a shape that dips into a river and returns to the same
  bank. Those crossings are 130-380 m wide, far past the deviation bound. The water metrics in the
  baseline confirm none were touched.
- **Amortised O(n).** 1-3 ms for a 4000-point route; the 10 000-point guard test runs in well under
  a second.

### Where it runs

`getRadarRoute`, after the river-crossing repair and before the response is assembled. Last on
purpose: the repair's ferry detector needs to see the geometry Radar actually returned.

- `properties.summary.distance` and `.duration` now describe the **returned geometry**. The UI
  already computed the displayed km from the geometry, so leaving Radar's total there would have
  been a silent 8-31% overstatement for anything else reading the response. Radar's own numbers are
  kept beside them as `routedDistance` / `routedDuration`.
- `properties.legs` still describe the route **as Radar drove it, before cleanup**, so their total
  is larger than the geometry and a leg can describe geometry that is no longer there. That is
  deliberate: the commonest spur goes out on one leg and back on the next, so a per-leg cleanup
  could not see it, and both the river repair and the detour ratios want what the router really did.
  `routePipeline.test.ts` pins the divergence as an inequality so it stays known rather than
  surprising.
- `properties.spurCleanup` = `{ spurs, removedMeters, longestMeters }`, attached only when something
  was removed.
- `CACHE.routeKeyPrefix` is `route:v3:`. Without the bump, 24 hours of uncleaned routes would have
  survived the deploy.

## Results

Same scenarios, same measurement, before and after. From `tests/fixtures/baseline.json`.

| scenario | length ratio | shorter by | removed | longest spur | self-overlap | accuracy |
|---|---|---|---|---|---|---|
| `london-heart-foot` | 2.68 → **1.98** | 26% | 5092 m | 69 m | 31 → 21% | 94 → 93% |
| `london-heart-foot-sparse` | 1.83 → **1.59** | 13% | 2176 m | 67 m | 14 → 10% | 89 → 88% |
| `london-heart-bike` | 4.6 → **3.95** | 14% | 4707 m | 96 m | 64 → 62% | 90 → 89% |
| `london-star-on-river` | 2.97 → **2.56** | 14% | 2901 m | 167 m | 58 → 58% | 85 → 83% |
| `london-heart-car` | 8.85 → **8.13** | 8% | 5768 m | 83 m | 76 → 76% | 82 → 80% |
| `london-heart-north` | 2.59 → **1.78** | 31% | 3746 m | 105 m | 35 → 28% | 93 → 93% |
| `paris-heart-foot` | 1.63 → **1.47** | 10% | 1795 m | 59 m | 15 → 14% | 94 → 93% |
| `budapest-heart-foot` | 1.83 → **1.66** | 9% | 1637 m | 68 m | 9 → 6% | 92 → 91% |
| `madrid-heart-foot` | 2.46 → **2.18** | 11% | 2050 m | 204 m | 29 → 28% | 94 → 94% |
| `madrid-square-foot` | 1.27 → **1.24** | 2% | 431 m | 28 m | 1 → 0% | 80 → 79% |
| `london-heart-image` | 2.24 → **1.79** | 20% | 3601 m | 71 m | 25 → 19% | 95 → 94% |
| `london-dino-image` | 2.58 → **2.08** | 19% | 4708 m | 65 m | 33 → 30% | 95 → 93% |
| `amsterdam-heart-foot` | 2.25 → **1.96** | 13% | 2060 m | 69 m | 22 → 20% | 94 → 94% |
| `warsaw-heart-foot` *(new)* | **2.26** | 8% | 8182 m | 69 m | 17% | 97% |

No scenario loses more than 2 accuracy points. `maxEdgeMeters` is unchanged everywhere except Paris
(135 → 139 m). The water metrics for the London scenarios are unchanged in kind — the bridge
crossings from issue #47 are all still there.

**The reported case, `warsaw-heart-foot`**, is the same heart at the same 4500 m radius the
screenshot used. It reproduces the report to within 70 m of the reported length, and the cleanup
removes **796 separate out-and-backs**:

```
[RadarService] Route generated: 4817 route points, 66.55km
[RadarService] Spur cleanup: removed 796 out-and-back(s), 8182m, leaving 3152 route points, 60.97km
```

### The one wide edge

`warsaw-heart-foot` has a 489 m edge, over the matrix-wide `MAX_EDGE_METERS` of 400. It was checked
against OSM and it is real: **Most Śląsko-Dąbrowski** over the Wisła (OSM way 1028356267,
`bridge=yes`, with bridged footway sidewalks either side). The river is 235 m wide there and Radar
returns the whole structure and its approaches as one edge, against 387 m for the widest span in
the rest of the matrix — the Danube. The nearest ferry way, Prom Wilga, is 558 m away and this
route never touches it.

Edge length alone cannot separate a wide bridge from a tunnel or a ferry; that is what the water
invariant is for. So rather than raise the bound for everyone — which would let Madrid's 470 m road
tunnel through — `WIDE_SPAN_METERS` in `tests/utils/routeInvariants.ts` records the verified span
for this one scenario at 500 m. It is still a bound: anything longer than the real structure fails.

## How regressions are caught

A fourth invariant, `checkNoSpurs` in `tests/utils/routeInvariants.ts`, checked both ways like the
other three, over all 14 scenarios in `tests/integration/riverScenarios.test.ts`:

> `spurCount === 0`, and the route has non-zero length so the count cannot be satisfied by
> returning nothing.

The exact zero is earned by the idempotence above. Verified to fail without the fix: returning
Radar's geometry uncleaned fails all 14 scenarios, at 355 spurs for `london-heart-foot`, 439 for
`london-heart-car`, and 52 even for `madrid-square-foot`, the easiest case in the matrix.

The metric behind it is `spurStats` in `src/lib/routeQuality.ts`, which calls the same
`removeSpurs` the pipeline does, so the measurement and the fix cannot drift apart. `baseline.json`
carries `spurCount`, `removedSpurMeters` and `maxRemovedSpurMeters` per scenario, so any change in
how much is being removed shows up as a diff.

Also backed by `tests/unit/routeCleanup.test.ts` (17 cases: the guards, the edge cases, idempotence,
contiguity, the edge-growth bound, and a 10 000-point complexity guard) and four new contract tests
in `tests/integration/routePipeline.test.ts`.

## Still open

- **Waypoint density — cause (a) above.** Fixing it needs a minimum waypoint spacing in metres
  applied *after* `simplifyPoints`, not a change to the tolerance (touching `closedLoopDivisor`
  would change fidelity for open shapes and letters, which is what issue #5 was about). It would
  roughly halve the Radar calls per route as well. Held back from this change because Radar
  fixtures are keyed by request URL, so changing the waypoints invalidates all 14 and forces a live
  re-record — which would have mixed Radar's own drift into the baseline diff above.
- **The deviation bound does not scale with the shape.** 35 m is 3.5% of a 1000 m radius but 0.8%
  of the 4500 m one, so large routes get the least benefit — Warsaw is the smallest improvement in
  the matrix at 8%, while the 600 m `london-heart-north` gets 31%. Measured on Warsaw: 60 m would
  take it to 2.10 and 100 m to 1.98, each costing exactly one accuracy point. Making the bound a
  function of the shape's scale is the obvious next step, and it needs the radius plumbed into
  `getRadarRoute`, which does not currently receive it.
- **Lollipops are only half-removed.** Where the router runs down a street, around a block, and
  back up the same street, the stick is an excursion and goes; the loop around the block is not a
  retrace and stays.
