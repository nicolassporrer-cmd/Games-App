// Turns raw conversation data into the committed scoreboard.
//
//   raw/*.txt              (LinkedIn conversation copy-pasted from the browser)
//   raw/*.xlsx, raw/*.csv  (LinkedIn "get a copy of your data" message export)
//        ->  public/data/results.json
//
// Both sources feed the same dedupe, so they can be mixed freely: backfill from
// an export once, then top up with weekly pastes.
//
// Only derived scores cross that line: short display name, game, puzzle number,
// time. No message text, no profile URLs, no full names. raw/ is gitignored, so
// the private conversation never reaches the repo.
//
// Re-importing overlapping data is safe: entries already in results.json win,
// so a score can never be rewritten by a later import.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { parseConversation, parseExportRows, TRACKED_GAMES } from '../src/lib/parse.js'
import { resolvePlayer, isKnown } from '../src/lib/players.js'
import { puzzleToDate, dateSpan } from '../src/lib/dates.js'

const rawDir = new URL('../raw/', import.meta.url)
const outFile = new URL('../public/data/results.json', import.meta.url)

const all = existsSync(rawDir) ? readdirSync(rawDir) : []
const pastes = all.filter(f => f.endsWith('.txt'))
const exports_ = all.filter(f => /\.(xlsx|xlsm|csv)$/i.test(f))

if (!pastes.length && !exports_.length) {
  console.error('Nothing in raw/. Put a conversation paste in raw/<name>.txt, or a LinkedIn')
  console.error('message export in raw/<name>.xlsx (or .csv), then run this again.')
  process.exit(1)
}

const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : { results: [] }
const byKey = new Map(existing.results.map(r => [`${r.player}|${r.game}|${r.puzzle}`, r]))
const before = byKey.size

let parsedTotal = 0, ignoredTotal = 0, quotedTotal = 0
const problems = []
const allSenders = new Set()

function absorb(label, { results, ignored, quoted, unmatched, senders }) {
  senders.forEach(s => allSenders.add(s))
  parsedTotal += results.length
  ignoredTotal += ignored.length
  quotedTotal += quoted.length
  for (const u of unmatched) problems.push(`${label}:${u.line}  ${u.text}  ${u.why ?? ''}`)

  let added = 0
  for (const r of results) {
    const player = resolvePlayer(r.player)
    const key = `${player}|${r.game}|${r.puzzle}`
    if (byKey.has(key)) continue          // first recorded score wins
    byKey.set(key, { player, game: r.game, puzzle: r.puzzle, date: puzzleToDate(r.game, r.puzzle), score: r.score, display: r.display })
    added++
  }
  console.log(`  ${label}: ${results.length} results (+${added} new), ${ignored.length} ignored, ${quoted.length} quoted, ${unmatched.length} unmatched`)
}

// Exports first: they are the historical backfill, and "first recorded wins"
// should therefore resolve in their favour when a paste covers the same day.
for (const f of exports_) {
  const { default: XLSX } = await import('xlsx').catch(() => {
    console.error(`\nCannot read ${f}: the "xlsx" package is missing. Run: npm install`)
    process.exit(1)
  })
  const wb = XLSX.readFile(new URL(f, rawDir).pathname.replace(/^\//, ''))
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  absorb(f, parseExportRows(rows))
}

for (const f of pastes) {
  absorb(f, parseConversation(readFileSync(new URL(f, rawDir), 'utf8')))
}

const results = [...byKey.values()].sort((a, b) =>
  a.game.localeCompare(b.game) || a.puzzle - b.puzzle || a.score - b.score)

writeFileSync(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  games: TRACKED_GAMES,
  results,
}, null, 2) + '\n')

console.log(`\nparsed ${parsedTotal} result lines across ${exports_.length} export(s) and ${pastes.length} paste(s)`)
console.log(`ignored ${ignoredTotal} (untracked games), skipped ${quotedTotal} quoted reply previews`)
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
