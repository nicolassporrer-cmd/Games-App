// Synthetic fixtures ONLY — these numbers exist to prove the engine's edge cases
// and must never reach data/ or the UI.
import { buildMedalTable, rankPuzzle, dedupe } from '../src/lib/ranking.js'

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
