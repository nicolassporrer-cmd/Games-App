// Synthetic fixtures ONLY — these numbers exist to prove the engine's edge cases
// and must never reach data/ or the UI.
import { buildMedalTable, rankPuzzle, dedupe, coefficientOf } from '../src/lib/ranking.js'
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
check('Queens and Tango count double, Zip and Patches single',
  [coefficientOf('Queens'), coefficientOf('Tango'), coefficientOf('Zip'), coefficientOf('Patches')],
  [2, 2, 1, 1])
check('an unknown game defaults to 1 rather than undefined', coefficientOf('Pinpoint'), 1)

// 9. The whole point: weighting must be able to FLIP the overall order.
// Ana wins 2 Tango puzzles (weighted 4); Ben wins 3 Zip puzzles (weighted 3).
// On raw counts Ben leads 3-2; weighted, Ana leads 4-3.
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
    [3, 2, 4, 3])
  check('...and the table is sorted on the weighted figure', rows[0].player, 'Ana')

  // The per-game columns are what the UI shows; they must stay untouched.
  check('per-game counts are never weighted',
    [ana.games.Tango.gold, ana.games.Zip.silver, ben.games.Zip.gold, ben.games.Tango.silver],
    [2, 3, 3, 2])

  // "Parties" counts puzzles, so doubling it would be nonsense.
  check('played is not weighted', [ana.total.played, ben.total.played], [5, 5])
}

// 10. On a single-game view the coefficient scales everything equally, so it
// cannot reorder anyone — but the numbers would look inflated, which is why the
// UI shows raw there. Verify the maths so that choice stays safe.
{
  const results = [r('Ana', 'Tango', 1, 10), r('Ben', 'Tango', 1, 20)]
  const tango = buildMedalTable(results, ['Tango']).rows
  check('single-game weighted is exactly raw x coefficient, order unchanged',
    [tango[0].player, tango[0].total.gold, tango[0].weighted.gold, tango[1].weighted.silver],
    ['Ana', 1, 2, 2])

  const zipOnly = buildMedalTable([r('Ana', 'Zip', 1, 10)], ['Zip']).rows
  check('a coefficient of 1 leaves weighted equal to raw',
    [zipOnly[0].total.gold, zipOnly[0].weighted.gold], [1, 1])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
