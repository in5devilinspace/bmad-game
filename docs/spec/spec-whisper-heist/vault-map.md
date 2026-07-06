# Vault Map

Fixed, spec-authored 24x16 grid (x: 0–23 west→east, y: 0–15 north→south). **The tables below are canonical**; the sketch is illustrative. Sim core builds the world from these tables; all workstreams use these region names (they are the cell→corridor→wing hierarchy gossip mutation climbs and the place names Chronicle templates quote).

## Regions

| Region id | Display name | Wing | Cells (x-range, y-range) | Depth tier |
|---|---|---|---|---|
| entry | the entrance | south | (9–14, 13–15) | 0 |
| hall-b | hall B | central | (11–12, 4–12) | 0 |
| hall-a | hall A | central | (4–19, 8–9) | 0 |
| west-store | the west storeroom | west wing | (1–6, 10–14) | 0 |
| east-store | the east storeroom | east wing | (17–22, 10–14) | 0 |
| west-gallery | the west gallery | west wing | (1–6, 3–7) | 1 |
| east-gallery | the east gallery | east wing | (17–22, 3–7) | 1 |
| antechamber | the antechamber | inner | (9–14, 2–3) | 2 |
| sanctum | the sanctum | inner | (10–13, 0–1) | 3 |

Every cell not inside a region is wall. Region hierarchy for mutation area-growth: cell → its region → its wing → "the whole vault".

## Connections

| Door | Between | Cell | Locked |
|---|---|---|---|
| open | entry ↔ hall-b | (11–12, 12/13 boundary) | no |
| open | hall-b ↔ hall-a | crossing at (11–12, 8–9) | no |
| open | hall-a ↔ west-store | (4, 9)→(4,10) gap at x=4–5 | no |
| open | hall-a ↔ east-store | (19, 9)→(19,10) gap at x=18–19 | no |
| D1 | west-store ↔ west-gallery | (3, 7/8 boundary) | yes |
| D2 | east-store ↔ east-gallery | (20, 7/8 boundary) | yes |
| D3 | hall-b ↔ antechamber | (11–12, 3/4 boundary) | yes |
| D4 | antechamber ↔ sanctum | (11–12, 1/2 boundary) | yes |

Unlocking: any thief with the `lockpick` ability (see `thief-archetypes.md`) spends 10 in-raid seconds at the door. Locked doors are the depth-gating mechanic: with a 60s raid, night 1 reaches tier 0 only; galleries fall nights 2–3, antechamber 3–4, sanctum 4–5 — producing the bell-curve arc (tension ramps to a peak; night 1 is the guaranteed low-stakes win).

## Placements

| What | Cells | Notes |
|---|---|---|
| Gem | (11, 0) | renders across (11–12, 0–1) |
| Loot | (2, 12), (21, 12) | outer, night-1 reachable |
| Loot | (2, 4), (21, 5) | galleries, tier 1 |
| Loot | (10, 2), (13, 3) | antechamber, tier 2 |
| Trap | (3, 5), (20, 4), (11, 6) | galleries + upper hall-b |
| Pressure plate | (11, 9), (12, 9) | hall-a/hall-b crossing |
| Alarm trigger | (10, 3), (13, 2) | antechamber thresholds |

Night-1 seeding (guarantees the outer-loot win): all thieves start with firsthand-grade SAFE_PATH(entry→hall-b→hall-a) and LOOT_AT(west-store/east-store) tokens at confidence 0.9 — "they cased the joint."

## Hazard consequences (canonical)

| Hazard | On trigger | Raid effect | Roster effect |
|---|---|---|---|
| Trap | Triggering thief out for the rest of the night (limps to exit); witnesses in perception range gain firsthand TRAP_AT at 1.0 | none beyond the loss | none — thief returns at debrief; never permadeath |
| Pressure plate | Loud noise event (witnessed ≤6 cells through walls); alarm level +1; slow-mo + shake juice | second plate trip arms the alarm | none |
| Alarm (armed + tripped) | Shockwave rings; countdown ~8s then raid aborts, all thieves auto-exfiltrate | early raid end | none |

The roster is always six at every debrief.

## Illustrative sketch

```
y0  ##########GG############        G gem   $ loot   T trap
y1  ##########..############        P plate A alarm-trigger
y2  #########$...$##########        D locked door  . floor  # wall
y3  #########A..A###########
y4  #$...T####..####$....T##        west-gallery | hall-b | east-gallery
y5  #....#####..#####$.....#
y6  #....#####T.############
y7  #....#####..############
y8  ####......D...........##        hall-a crossing
y9  ####......PP..........##
y10 #....#####..#####......#
y11 #....#####..#####......#
y12 #$...#####..#####....$.#        west-store | hall-b | east-store
y13 #....#####..#####......#
y14 #.........EE...........#        entry
y15 ########################
```
