// Parser tests. Every fixture here is a real line shape taken from the group's
// conversation — each one was found by importing actual history, not imagined.
import { parseConversation, parseExportRows, repairMojibake } from '../src/lib/parse.js'
import { resolvePlayer } from '../src/lib/players.js'

let pass = 0, fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) { console.log(`        got  ${JSON.stringify(got)}`); console.log(`        want ${JSON.stringify(want)}`); fail++ } else pass++
}

const SENDER = '[Pierre-Alexandre Medinger](https://www.linkedin.com/in/ACoAAC3niYY) 11:55'
const parse = body => parseConversation(`${SENDER}\n${body}`)

// 1. "no." instead of "#". Seen once in real data; the old regex required "#",
// so this score vanished AND the safety net missed it too.
{
  const { results, unmatched } = parse('Queens no. 870 | 0:15 👑')
  check('"Queens no. 870" parses like "#870"',
    [results.length, results[0]?.game, results[0]?.puzzle, results[0]?.score, unmatched.length],
    [1, 'Queens', 870, 15, 0])
}

// 2. Commentary on the same line as the result. Anchoring to line start (which
// is what excluded quoted replies) silently dropped these.
{
  const { results } = parse('contreperf dsl Tango #712 | 0:51 with no hints')
  check('result preceded by commentary on the same line',
    [results.length, results[0]?.game, results[0]?.score], [1, 'Tango', 51])
}

// 3. Quoted-reply previews inline a whole message. Must be skipped, not counted.
{
  const { results, quoted } = parse('* Mahaut : Queens #874 | 0:21 sans erreur ni indice 🏅 …voir plus')
  check('quoted reply is skipped, not attributed to the current sender',
    [results.length, quoted.length, quoted[0]?.game, quoted[0]?.puzzle], [0, 1, 'Queens', 874])
}

// 4. LinkedIn glues the day separator onto the sender name with no space —
// a weekday for recent days, a date for older ones.
{
  const weekday = parseConversation('* mardiNicolas Malhomme a envoyé les messages suivants à 09:43\nQueens #875 | 0:26')
  const dated = parseConversation('* 15 sept.Pierre-Alexandre Medinger a envoyé les messages suivants à 14:25\nQueens #869 | 0:05')
  check('day and date prefixes are stripped from the sender name',
    [weekday.results[0]?.player, dated.results[0]?.player],
    ['Nicolas Malhomme', 'Pierre-Alexandre Medinger'])
  check('and both resolve to roster labels',
    [resolvePlayer(weekday.results[0]?.player), resolvePlayer(dated.results[0]?.player)],
    ['Nicolas M.', 'Pierre-Alexandre'])
}

// 5. Times run well past a minute in real play.
{
  const { results } = parse('Queens #873 | 4:19')
  check('times over a minute convert correctly', [results[0]?.score, results[0]?.display], [259, '4:19'])
}

// 6. Untracked games are counted separately, never mixed in.
{
  const { results, ignored } = parse('Mini Sudoku #406 | 0:25 with no mistakes & no hints ✏️')
  check('Mini Sudoku is ignored but counted', [results.length, ignored.length, ignored[0]?.game], [0, 1, 'Mini Sudoku'])
}

// 7. A result with no sender established is reported, never guessed at.
{
  const { results, unmatched } = parseConversation('Queens #876 | 0:08')
  check('orphan result is reported rather than attributed',
    [results.length, unmatched.length, unmatched[0]?.why], [0, 1, 'no sender established'])
}

// 8. The share blurb contains percentages and streak counts with digits and
// colons; none of it may be mistaken for a second result.
{
  const { results } = parse([
    'Zip #555 | 0:09 🏁',
    'Avec 2 retours en arrière 🛑',
    'XMessage: Invalid argument type NSTaggedPointerString. Expected NSNumber.: 🏅 Je comptabilise 10- jour(s)',
    '🏅 I’m on a 92-day win streak!',
  ].join('\n'))
  check('surrounding blurb produces no phantom results', [results.length, results[0]?.score], [1, 9])
}

// 9. LinkedIn's export is UTF-8 read as CP1252. Bytes 0x80-0x9F map to
// characters above U+00FF there, which is why a Latin-1 round trip fails.
{
  check('mojibake repair fixes the degree sign that broke "n°"',
    repairMojibake('Patches nÂ°181 | 0:07'), 'Patches n°181 | 0:07')
  check('...and the CP1252-only characters a Latin-1 decode would mangle',
    [repairMojibake('arrivÃ©e'), repairMojibake('Jâ€™ai'), repairMojibake('ðŸ§¶')],
    ['arrivée', 'J’ai', '🧶'])
  check('text that is not mojibake is left untouched',
    [repairMojibake('Queens #876 | 0:08'), repairMojibake('déjà propre')],
    ['Queens #876 | 0:08', 'déjà propre'])
}

// 10. The two real export lines that defeated the first version of the parser.
{
  const rows = [
    { FROM: 'Pierre-Alexandre Medinger', CONTENT: 'Patches nÂ°181 | 0:07 ðŸ§¶\r\nlnkd.in/patches' },
    { FROM: 'Nicolas Malhomme', CONTENT: 'Je pense que câ€™est la pire perf de lâ€™histoire de cette convoTango #699 | 2:30' },
  ]
  const { results, unmatched } = parseExportRows(rows)
  check('mojibake "n°" and a game name with no preceding space both parse',
    [results.length, unmatched.length,
      `${results[0].game} #${results[0].puzzle} = ${results[0].score}s`,
      `${results[1].game} #${results[1].puzzle} = ${results[1].score}s`],
    [2, 0, 'Patches #181 = 7s', 'Tango #699 = 150s'])
}

// 11. The export attributes by column, not by tracking a sender across lines.
{
  const { results, ignored, senders } = parseExportRows([
    { FROM: 'Juliette Bourgain', CONTENT: 'Queens #590 | 0:31' },
    { FROM: 'Ariane Delecroix', CONTENT: 'Mini Sudoku #402 | 0:37 ✏️' },
  ])
  check('FROM drives attribution, untracked games still counted',
    [results[0].player, resolvePlayer(results[0].player), ignored.length, senders.length],
    ['Juliette Bourgain', 'Juliette', 1, 2])
}

// 12. A row with a result but no sender must be reported, never guessed at.
{
  const { results, unmatched } = parseExportRows([{ FROM: '', CONTENT: 'Zip #555 | 0:09' }])
  check('export row with no FROM is reported',
    [results.length, unmatched.length, unmatched[0]?.why], [0, 1, 'row has no FROM'])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
