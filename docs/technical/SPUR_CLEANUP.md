# Spur cleanup — routes that branch off a road and come straight back

Reported as: routes "create branches into roads that then turn back in and go back through the
same branch to main road. it just adds kilometers without any purpose." Screenshot: a heart over
Warsaw, walking, 4500 m radius, **66.62 km**, with comb teeth and rectangular stubs all over the
polyline — and 95% shape accuracy printed next to it.

This is not issue #47. That was the Thames ferries, and it is fixed. This is the residue that fix
left behind, and it was present in **every** scenario in the matrix, including the ones #47 called
healthy: the `london-heart-north` control was spending over half its length on it.

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

- **`selfOverlapFraction` under-reports it.** `ROUTE_QUALITY.selfOverlapMinGapMeters` is 150 m, so
  the two halves of an out-and-back have to be 150 m apart *along the route* before they count. A
  30 m detour into a driveway is 60 m of route: invisible. It was built to catch "walks along the
  embankment to a bridge and back", which is a different scale of problem. It is still a useful
  after-the-fact check, and it moves a long way here: 31% → 1% on the reported case.
- **The accuracy score is blind to it by construction.** It normalises by `radius * 0.5`, so on the
  reported 4500 m route the whole error budget is 2250 m. A 60 m spur sitting right next to the
  shape moves the score by a fraction of a point. That is how a 66 km route scores 95%.

## The fix

`src/lib/routeCleanup.ts` — `removeSpurs(points, waypoints, options)`. Two decisions define it, and
**both were got wrong in a first attempt**, which is worth recording because each mistake looks
reasonable until it is measured.

### 1. Find excursions by projecting onto the line, not by matching its points

The first version looked for the route arriving back at a *point* it had already visited. That only
sees a spur that returns through the very same OSM nodes. A spur that walks up one pavement and
back down the other — or up one carriageway and back the other, or simply returns over a slightly
different node set — never revisits a coordinate, and was completely invisible.

Measured with every other guard switched off, that detector found **zero** excursions in the
Madrid, Paris, Amsterdam, Budapest, dino and star routes. Those are precisely the routes whose
remaining spurs were reported. Projecting each arriving point onto the *segments* of the retained
line instead, with `snapMeters = 20`, finds hundreds.

### 2. Keep an excursion only when the shape needs it

The first version asked "how far did this excursion stray from where it rejoined?", and kept
anything over 35 m. That question cannot distinguish a pointless 300 m detour into a side street
from a 300 m headland the outline genuinely traces — they stray identically. It let through exactly
the legs that were reported.

The question that does distinguish them is: **if this were cut, would any requested waypoint be
left stranded?** A spur into a cul-de-sac goes, because the waypoint that caused it sits on the
main road metres away. A traced headland stays, because its waypoints are out there and nothing
else reaches them.

| bound | walking / cycling | driving | what it is for |
|---|---|---|---|
| `snapMeters` | 20 | 20 | how close the line must come back to count as rejoining |
| `maxShapeLossMeters` | 60 | 100 | how far a cut may leave a waypoint from the route |
| `maxSpurMeters` | 1500 | 2500 | bounds the search, not the judgement |
| `maxPasses` | 8 | 8 | cutting one excursion can expose another |

Driving is looser because its waypoints are twice as far apart to begin with.

### Properties worth knowing

- **Stays on the road.** A cut keeps everything up to the point on the retained segment where the
  line came back — a projection onto real geometry — then carries on from the point that rejoined.
  The one edge a cut creates is no longer than `snapMeters`.
- **Settles.** Cutting exposes new adjacencies, so it runs up to `maxPasses` times; the matrix
  settles well inside that, and every scenario ends at exactly zero remaining excursions. That is
  what lets the invariant assert `spurCount === 0` rather than pick a threshold.
- **Closed loops, figure-of-eights and traced dead ends survive**, each because cutting them would
  strand the waypoints they exist to serve.
- **The river repair's own out-and-backs survive** for the same reason: `riverCrossing.ts`
  deliberately emits `[entry, past-the-far-abutment, entry]` for a shape that dips into a river and
  returns to the same bank, and those waypoints are in the water with nothing else near them.
- **Amortised O(n)** in the length of the route, with a segment grid behind the shape-loss test. A
  12 000-point synthetic route completes in well under a second.

### Where it runs

`getRadarRoute`, after the river-crossing repair and before the response is assembled. Last on
purpose: the repair's ferry detector needs to see the geometry Radar actually returned. The shape
is judged against the *simplified coordinates* rather than the repaired waypoints, since those
carry bridge crossings the router had to be told about, which are not part of what the user drew.

- `properties.summary.distance` and `.duration` now describe the **returned geometry**. The UI
  already computed the displayed km from the geometry, so leaving Radar's total there would have
  been a silent overstatement for anything else reading the response. Radar's own numbers are kept
  beside them as `routedDistance` / `routedDuration`.
- `properties.legs` still describe the route **as Radar drove it, before cleanup**, so their total
  is larger than the geometry and a leg can describe geometry that is no longer there. That is
  deliberate: the commonest spur goes out on one leg and back on the next, so a per-leg cleanup
  could not see it, and both the river repair and the detour ratios want what the router really did.
  `routePipeline.test.ts` pins the divergence as an inequality so it stays known rather than
  surprising.
- `properties.spurCleanup` = `{ spurs, removedMeters, longestMeters }`, attached only when something
  was removed.
- `CACHE.routeKeyPrefix` is `route:v5:`. Without a bump, a deploy keeps serving the previous
  geometry for 24 hours — which is exactly how the v3 routes were caught coming back
  byte-identical from a preview that had already shipped the new code.

## Results

Same scenarios, same measurement, before and after. From `tests/fixtures/baseline.json`.

| scenario | length ratio | shorter by | self-overlap | removed | accuracy |
|---|---|---|---|---|---|
| `london-heart-foot` | 2.68 → **1.38** | 49% | 31 → **1**% | 7780 m | 94 → 93% |
| `london-heart-foot-sparse` | 1.83 → **1.42** | 22% | 14 → **6**% | 2467 m | 89 → 88% |
| `london-heart-bike` | 4.6 → **1.79** | 61% | 64 → **19**% | 16877 m | 90 → 90% |
| `london-star-on-river` | 2.97 → **1.96** | 34% | 58 → **51**% | 5160 m | 85 → 81% |
| `london-heart-car` | 8.85 → **4.58** | 48% | 76 → **55**% | 25654 m | 82 → 82% |
| `london-heart-north` | 2.59 → **1.25** | 52% | 35 → **5**% | 4849 m | 93 → 94% |
| `paris-heart-foot` | 1.63 → **1.33** | 18% | 15 → **10**% | 1781 m | 94 → 93% |
| `budapest-heart-foot` | 1.83 → **1.64** | 10% | 9 → **7**% | 1701 m | 92 → 91% |
| `madrid-heart-foot` | 2.46 → **1.49** | 39% | 29 → **2**% | 5873 m | 94 → 94% |
| `madrid-square-foot` | 1.27 → **1.22** | 4% | 1 → **0**% | 374 m | 80 → 79% |
| `london-heart-image` | 2.24 → **1.43** | 36% | 25 → **9**% | 4845 m | 95 → 94% |
| `london-dino-image` | 2.58 → **1.42** | 45% | 33 → **11**% | 8680 m | 95 → 93% |
| `warsaw-heart-foot` *(new)* | **1.99** | — | **12**% | 12852 m | 97% |
| `amsterdam-heart-foot` | 2.25 → **1.66** | 26% | 22 → **15**% | 3556 m | 94 → 93% |

**Removed** is measured as the difference the cleanup made to the route's length, not summed
from per-excursion estimates — those drift across passes, and this is the number the response
reports.

**A walking length ratio of 1.22–1.99 is close to the floor.** 1.0 would mean the street grid ran
exactly along the drawn outline; before this change the matrix sat at 1.27–4.6.

Accuracy is flat within a point almost everywhere, and `london-heart-north` *gains* one — which is
what removing geometry that served no purpose looks like. `london-star-on-river` loses 4, the worst
in the matrix; it is a star centred in the middle of the Thames and is already listed under
`knownIssues.waterTravel`.

### Two things this also fixed

- **Madrid's road tunnel.** `ISSUE_47_BASELINE.md` recorded a separate defect: Radar's foot profile
  routed pedestrians through the **Calle de Bailén road tunnel** under Plaza de Oriente
  (`tunnel=yes`, `layer=-1`), turning a 40 m gap into a 1659 m detour with a 470 m straight edge.
  That detour is an excursion the shape does not need, so the cleanup removes it: the scenario's
  longest edge is now 143 m and `knownIssues.longEdge` has been dropped.
- **Budapest crosses at Erzsébet híd now**, 451 m end to end, rather than taking a detour to a
  narrower crossing. Verified against OSM (ways 485689912 / 581325727 / 1346291144, `bridge=yes`,
  with bridged footways either side) and recorded in `WIDE_SPAN_METERS`.

### The one wide edge, and how it is handled

Edge length alone cannot separate a wide bridge from a tunnel or a ferry; that is what the water
invariant is for. So rather than raise `MAX_EDGE_METERS` for everyone, `WIDE_SPAN_METERS` in
`tests/utils/routeInvariants.ts` records the verified span per scenario — Warsaw's Most
Śląsko-Dąbrowski at 489 m and Budapest's Erzsébet híd at 451 m. Both were checked against OSM. It
stays a bound: anything longer than the real structure still fails.

## How regressions are caught

A fourth invariant, `checkNoSpurs` in `tests/utils/routeInvariants.ts`, checked both ways like the
other three, over all 14 scenarios in `tests/integration/riverScenarios.test.ts`:

> `spurCount === 0`, and the route has non-zero length so the count cannot be satisfied by
> returning nothing.

The exact zero is earned by the settling above. Verified to fail without the fix: returning Radar's
geometry uncleaned fails all 14 scenarios.

The metric behind it is `spurStats` in `src/lib/routeQuality.ts`, which calls the same
`removeSpurs` the pipeline does, so the measurement and the fix cannot drift apart. `baseline.json`
carries `spurCount`, `removedSpurMeters` and `maxRemovedSpurMeters` per scenario, so any change in
how much is being removed shows up as a diff.

Also backed by `tests/unit/routeCleanup.test.ts` — including the two cases that pin the design
decisions above: a spur that returns on the other side of the street must be removed, and a 300 m
excursion must be removed when the shape does not follow it but kept when it does.

## Still open

- **Waypoint density — cause (a) above.** Fixing it needs a minimum waypoint spacing in metres
  applied *after* `simplifyPoints`, not a change to the tolerance (touching `closedLoopDivisor`
  would change fidelity for open shapes and letters, which is what issue #5 was about). It would
  roughly halve the Radar calls per route. Held back from this change because Radar fixtures are
  keyed by request URL, so changing the waypoints invalidates all 14 and forces a live re-record.
- **The cleanup is weaker off a street grid.** The shape test ignores a waypoint already further
  than `maxShapeLossMeters` from an excursion, on the grounds that it was not being served there
  anyway. In a city that is sound. In a sparse rural network almost every waypoint is that far from
  any road, so the guard protects little and the cleanup runs closer to unguarded — measured on a
  heart over farmland near Castillonnès, accuracy went 58% → 48% against production while every
  city case stayed within 4 points.

  Two calibrations were tried and both measured worse overall, so neither shipped:

  | | rural | rest of the matrix |
  |---|---|---|
  | shipped | 58 → 48% | best reduction, accuracy flat |
  | protect when the excursion gains > 60 m | fixed | −4 `london-star-on-river`, −2 `budapest`/`car`, and two scenarios stop settling |
  | protect when it gains > 20 m | fixed | accuracy restored but much weaker: `london-heart-bike` 1.79 → 3.49, `london-heart-foot` 1.38 → 1.74 |

  `castillonnes-heart-foot` is in the matrix so the trade is pinned rather than invisible. It
  satisfies every invariant; what it guards is `accuracyPercent` in the baseline. Note it is a
  milder spot than the reported one — it measures 78%, not 48% — so it holds the line rather than
  reproducing the worst case.

- **Lollipops are only half-removed.** Where the router runs down a street, around a block, and
  back up the same street, the stick is an excursion and goes; the loop around the block is not a
  retrace and stays. This is why `london-heart-car` still sits at 59% self-overlap.
