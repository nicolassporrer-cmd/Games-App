// Turns raw LinkedIn conversation text into the committed scoreboard.
//
//   raw/*.txt  ->  public/data/results.json
//
// Only derived scores cross that line: short display name, game, puzzle number,
// time. No message text, no profile URLs, no full names. raw/ is gitignored, so
// the private conversation never reaches the repo.
//
// Re-importing overlapping pastes is safe: entries already in results.json win,
// so a score can never be rewritten by a later paste.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { parseConversation, TRACKED_GAMES } from '../src/lib/parse.js'
import { resolvePlayer, isKnown } from '../src/lib/players.js'
import { puzzleToDate, dateSpan } from '../src/lib/dates.js'

const rawDir = new URL('../raw/', import.meta.url)
const outFile = new URL('../public/data/results.json', import.meta.url)

const files = existsSync(rawDir) ? readdirSync(rawDir).filter(f => f.endsWith('.txt')) : []
if (!files.length) {
  console.error('No .txt files in raw/. Paste a LinkedIn conversation into raw/<name>.txt first.')
  process.exit(1)
}

const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : { results: [] }
const byKey = new Map(existing.results.map(r => [`${r.player}|${r.game}|${r.puzzle}`, r]))
const before = byKey.size

let parsedTotal = 0, ignoredTotal = 0
const problems = []
const allSenders = new Set()

for (const f of files) {
  const text = readFileSync(new URL(f, rawDir), 'utf8')
  const { results, ignored, quoted, unmatched, senders } = parseConversation(text)
  senders.forEach(s => allSenders.add(s))

  parsedTotal += results.length
  ignoredTotal += ignored.length
  for (const u of unmatched) problems.push(`${f}:${u.line}  ${u.text}`)

  for (const r of results) {
    const player = resolvePlayer(r.player)
    const key = `${player}|${r.game}|${r.puzzle}`
    if (byKey.has(key)) continue          // first recorded score wins
    byKey.set(key, { player, game: r.game, puzzle: r.puzzle, date: puzzleToDate(r.game, r.puzzle), score: r.score, display: r.display })
  }
  console.log(`  ${f}: ${results.length} results, ${ignored.length} ignored, ${quoted.length} quoted, ${unmatched.length} unmatched`)
}

const results = [...byKey.values()].sort((a, b) =>
  a.game.localeCompare(b.game) || a.puzzle - b.puzzle || a.score - b.score)

writeFileSync(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  games: TRACKED_GAMES,
  results,
}, null, 2) + '\n')

console.log(`\nparsed ${parsedTotal} result lines across ${files.length} file(s)`)
console.log(`ignored ${ignoredTotal} (untracked games)`)
console.log(`stored ${results.length} unique results (+${results.length - before} new)`)

const span = dateSpan(results)
if (span) console.log(`derived dates: ${span.first} to ${span.last} (${span.days} distinct days)`)

const strangers = [...allSenders].filter(s => !isKnown(s))
if (strangers.length) {
  console.log(`\nsenders not on the roster (add them to src/lib/players.js for a nicer label):`)
  for (const s of strangers) console.log(`  ${s} -> ${resolvePlayer(s)}`)
}

if (problems.length) {
  console.log(`\n${problems.length} result-shaped line(s) the parser could not read:`)
  for (const p of problems) console.log('  ' + p)
  process.exitCode = 1   // fail loudly rather than publish a partial scoreboard
}
