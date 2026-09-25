// Synthetic fixtures ONLY — these numbers exist to prove the engine's edge cases
// and must never reach data/ or the UI.
import { buildMedalTable, rankPuzzle, dedupe, coefficientOf, filterByFieldSize } from '../src/lib/ranking.js'
import { puzzleToDate, withinPeriod } from '../src/lib/dates.js'

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) { console.log(`        got  ${JSON.stringify(got)}`); console.log(`        want ${JSON.stringify(want)}`); fail++ } else pass++
}
const r = (player, game, puzzle, score, postedAt = 0) => ({ player, game, puzzle, score, postedAt })

// 1. Ties share a place and skip the next: 42,42,55 -> 1,1,3 (no silver).
check('tie at top -> 1,1,3',
  rankPuzzle([r('Ana','Queens',10,42), r('Ben','Queens',10,42), r('Caz','Queens',10,55)], 'Queens').map(e => e.place),
  [1, 1, 3])

// 2. Only two players -> gold + silver, no bronze awarded.
{
  const { rows } = buildMedalTable([r('Ana','Tango',5,30), r('Ben','Tango',5,40)])
  check('two players -> 1 gold, 1 silver, 0 bronze',
    [rows[0].total.gold, rows[0].total.silver, rows[1].total.silver, rows[0].total.bronze + rows[1].total.bronze],
    [1, 0, 1, 0])
}

// 3. Re-posting a better score for the same puzzle must not overwrite the first.
check('dedupe keeps first post, not best score',
  dedupe([r('Ana','Zip',7,60,100), r('Ana','Zip',7,20,200)]).map(e => e.score),
  [60])

// 4. Olympic ordering: 1 gold beats 3 silvers.
{
  const results = [
    r('Ana','Queens',1,10), r('Ben','Queens',1,20), r('Caz','Queens',1,30),
    r('Ben','Tango',1,10),  r('Ana','Tango',1,20),
    r('Ben','Zip',1,10),    r('Ana','Zip',1,20),
    r('Ben','Patches',1,10),r('Ana','Patches',1,20),
  ]
  const { rows } = buildMedalTable(results)
  check('olympic order: golds before silvers',
    rows.map(x => `${x.player}:${x.total.gold}g${x.total.silver}s`),
    ['Ben:3g1s', 'Ana:1g3s', 'Caz:0g0s'])
}

// 5. Games outside the four are ignored entirely.
{
  const { rows, resultCount } = buildMedalTable([r('Ana','Pinpoint',1,3), r('Ben','Crossclimb',1,50), r('Caz','Zip',1,50)])
  check('Pinpoint + Crossclimb filtered out', [resultCount, rows.length, rows[0].player], [1, 1, 'Caz'])
}

// 6. A player who skipped a puzzle is simply absent from it — no zero, no penalty.
{
  const { rows } = buildMedalTable([
    r('Ana','Queens',1,10), r('Ben','Queens',1,20),
    r('Ana','Queens',2,10),
  ])
  const ana = rows.find(x => x.player === 'Ana'), ben = rows.find(x => x.player === 'Ben')
  check('skipped puzzle -> played count differs, no penalty',
    [ana.games.Queens.played, ana.games.Queens.gold, ben.games.Queens.played, ben.games.Queens.silver],
    [2, 2, 1, 1])
}

// 7. Unparseable scores are dropped rather than ranked as 0.
check('non-numeric score excluded from ranking',
  rankPuzzle([r('Ana','Zip',1,NaN), r('Ben','Zip',1,50)], 'Zip').map(e => e.player),
  ['Ben'])

// --- date derivation -------------------------------------------------------
// The anchor claims 2026-09-23 for Queens #876 / Tango #716 / Zip #555 /
// Patches #190, so all four must agree on the earlier days too.
check('anchor maps to its own date', puzzleToDate('Queens', 876), '2026-09-23')
check('four games agree on 2026-09-21',
  [puzzleToDate('Queens', 874), puzzleToDate('Tango', 714), puzzleToDate('Zip', 553), puzzleToDate('Patches', 188)],
  ['2026-09-21', '2026-09-21', '2026-09-21', '2026-09-21'])
check('dates run backwards correctly across a month boundary',
  puzzleToDate('Queens', 846), '2026-08-24')
check('untracked game has no derived date', puzzleToDate('Pinpoint', 100), null)

const TODAY = new Date('2026-09-23T12:00:00Z')
check('today is inside every window',
  [withinPeriod('2026-09-23', 7, TODAY), withinPeriod('2026-09-23', 30, TODAY), withinPeriod('2026-09-23', null, TODAY)],
  [true, true, true])
// A 30-day window covers today plus the 29 days before it, so 30 days back is out.
check('30-day window far edge is exclusive',
  [withinPeriod('2026-08-25', 30, TODAY), withinPeriod('2026-08-24', 30, TODAY)],
  [true, false])
check('a future date is outside the window', withinPeriod('2026-09-24', 30, TODAY), false)
check('a missing date is never filtered out', withinPeriod(null, 30, TODAY), true)

// 8. Medals must be RECOMPUTED inside a window, not sliced off the all-time
// table. Ana and Ben have one gold each all-time; only Ben's is recent.
{
  const rows0 = [
    r('Ana', 'Queens', 846, 10), r('Ben', 'Queens', 846, 20),
    r('Ben', 'Queens', 876, 10), r('Ana', 'Queens', 876, 20),
  ].map(x => ({ ...x, date: puzzleToDate(x.game, x.puzzle) }))

  const allTime = buildMedalTable(rows0).rows
  const week = buildMedalTable(rows0.filter(x => withinPeriod(x.date, 7, TODAY))).rows
  check('7-day window re-ranks rather than slicing',
    [allTime.length, allTime[0].total.gold, week.length, week[0].player, week[0].total.gold],
    [2, 1, 2, 'Ben', 1])
}

// --- coefficients ----------------------------------------------------------
check('difficulty coefficients: Queens 4, Tango 3, Zip 1, Patches 1',
  [coefficientOf('Queens'), coefficientOf('Tango'), coefficientOf('Zip'), coefficientOf('Patches')],
  [4, 3, 1, 1])
check('an unknown game defaults to 1 rather than undefined', coefficientOf('Pinpoint'), 1)

// 9. The whole point: weighting must be able to FLIP the overall order.
// Ana wins 2 Tango puzzles (weighted 2x3 = 6); Ben wins 3 Zip puzzles
// (weighted 3x1 = 3). On raw counts Ben leads 3-2; weighted, Ana leads 6-3.
{
  const results = [
    r('Ana', 'Tango', 1, 10), r('Ben', 'Tango', 1, 20),
    r('Ana', 'Tango', 2, 10), r('Ben', 'Tango', 2, 20),
    r('Ben', 'Zip', 1, 10), r('Ana', 'Zip', 1, 20),
    r('Ben', 'Zip', 2, 10), r('Ana', 'Zip', 2, 20),
    r('Ben', 'Zip', 3, 10), r('Ana', 'Zip', 3, 20),
  ]
  const { rows } = buildMedalTable(results)
  const ana = rows.find(x => x.player === 'Ana'), ben = rows.find(x => x.player === 'Ben')

  check('raw counts would favour Ben, weighted favours Ana',
    [ben.total.gold, ana.total.gold, ana.weighted.gold, ben.weighted.gold],
    [3, 2, 6, 3])
  check('...and the table is sorted on the weighted figure', rows[0].player, 'Ana')

  // The per-game columns are what the UI shows; they must stay untouched.
  check('per-game counts are never weighted',
    [ana.games.Tango.gold, ana.games.Zip.silver, ben.games.Zip.gold, ben.games.Tango.silver],
    [2, 3, 3, 2])

  // "Parties" counts puzzles, so doubling it would be nonsense.
  check('played is not weighted', [ana.total.played, ben.total.played], [5, 5])
}

// 10. The toggle: { weighted: false } must reorder, not just relabel. Same
// fixture as above — Ben leads on raw golds, Ana on weighted ones.
{
  const results = [
    r('Ana', 'Tango', 1, 10), r('Ben', 'Tango', 1, 20),
    r('Ana', 'Tango', 2, 10), r('Ben', 'Tango', 2, 20),
    r('Ben', 'Zip', 1, 10), r('Ana', 'Zip', 1, 20),
    r('Ben', 'Zip', 2, 10), r('Ana', 'Zip', 2, 20),
    r('Ben', 'Zip', 3, 10), r('Ana', 'Zip', 3, 20),
  ]
  check('weighting off sorts by raw medals, weighting on by weighted ones',
    [buildMedalTable(results, undefined, { weighted: false }).rows[0].player,
     buildMedalTable(results, undefined, { weighted: true }).rows[0].player,
     buildMedalTable(results).rows[0].player],   // default stays weighted
    ['Ben', 'Ana', 'Ana'])

  // Both figures are present whichever way it is sorted, so the UI can render
  // either without recomputing.
  const off = buildMedalTable(results, undefined, { weighted: false }).rows[0]
  check('both raw and weighted totals are returned regardless of the sort',
    [off.player, off.total.gold, off.weighted.gold], ['Ben', 3, 3])
}

// 11. On a single-game view the coefficient scales everything equally, so it
// cannot reorder anyone — but the numbers would look inflated, which is why the
// UI shows raw there. Verify the maths so that choice stays safe.
{
  const results = [r('Ana', 'Tango', 1, 10), r('Ben', 'Tango', 1, 20)]
  const tango = buildMedalTable(results, ['Tango']).rows
  check('single-game weighted is exactly raw x coefficient, order unchanged',
    [tango[0].player, tango[0].total.gold, tango[0].weighted.gold, tango[1].weighted.silver],
    ['Ana', 1, 3, 3])

  const zipOnly = buildMedalTable([r('Ana', 'Zip', 1, 10)], ['Zip']).rows
  check('a coefficient of 1 leaves weighted equal to raw',
    [zipOnly[0].total.gold, zipOnly[0].weighted.gold], [1, 1])
}

// --- field-size filter -----------------------------------------------------
{
  // Queens #1 had four players, Queens #2 only two, Tango #1 exactly four.
  const results = [
    r('Ana', 'Queens', 1, 10), r('Ben', 'Queens', 1, 20), r('Caz', 'Queens', 1, 30), r('Dee', 'Queens', 1, 40),
    r('Ana', 'Queens', 2, 10), r('Ben', 'Queens', 2, 20),
    r('Ana', 'Tango', 1, 10), r('Ben', 'Tango', 1, 20), r('Caz', 'Tango', 1, 30), r('Dee', 'Tango', 1, 40),
  ]
  const kept = filterByFieldSize(results, 4)
  check('keeps only puzzles with 4+ players, whole puzzles at a time',
    [kept.length, new Set(kept.map(x => `${x.game}${x.puzzle}`)).size, kept.some(x => x.puzzle === 2)],
    [8, 2, false])

  // The boundary is inclusive: exactly 4 stays, 3 goes.
  const three = [r('Ana', 'Zip', 1, 10), r('Ben', 'Zip', 1, 20), r('Caz', 'Zip', 1, 30)]
  check('4 is inclusive, 3 is excluded',
    [filterByFieldSize(three, 4).length, filterByFieldSize([...three, r('Dee', 'Zip', 1, 40)], 4).length],
    [0, 4])

  check('no filter when min is absent or 1',
    [filterByFieldSize(three, 0).length, filterByFieldSize(three, 1).length, filterByFieldSize(three, undefined).length],
    [3, 3, 3])

  // Distinct PLAYERS, not rows: a duplicated import must not fake a full field.
  const dupes = [
    r('Ana', 'Zip', 9, 10), r('Ana', 'Zip', 9, 10), r('Ana', 'Zip', 9, 10), r('Ana', 'Zip', 9, 10),
  ]
  check('duplicate rows cannot inflate a field size', filterByFieldSize(dupes, 4).length, 0)

  // Dropping the thin puzzles must RECOMPUTE medals, not just hide rows: Ana's
  // free gold on the two-player Queens #2 has to disappear from her total.
  const before = buildMedalTable(results).rows.find(x => x.player === 'Ana')
  const after = buildMedalTable(filterByFieldSize(results, 4)).rows.find(x => x.player === 'Ana')
  check('a gold won on a thin puzzle is removed, not merely hidden',
    [before.total.gold, after.total.gold, before.total.played, after.total.played],
    [3, 2, 3, 2])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
