// Parses raw/ and prints what it actually found, so the numbers can be checked
// against the source text rather than against a rendered UI.
import { readFileSync, readdirSync } from 'node:fs'
import { parseConversation } from '../src/lib/parse.js'
import { resolvePlayer } from '../src/lib/players.js'
import { buildMedalTable, rankPuzzle, GAMES } from '../src/lib/ranking.js'
import { puzzleToDate } from '../src/lib/dates.js'

const rawDir = new URL('../raw/', import.meta.url)
const files = readdirSync(rawDir).filter(f => f.endsWith('.txt'))

const seen = new Map()
let parsed = 0, ignoredAll = [], quotedAll = [], unmatchedAll = []
const senders = new Set()

for (const f of files) {
  const { results, ignored, quoted, unmatched, senders: s } = parseConversation(readFileSync(new URL(f, rawDir), 'utf8'))
  parsed += results.length
  ignoredAll.push(...ignored); quotedAll.push(...quoted)
  unmatchedAll.push(...unmatched.map(u => ({ ...u, file: f })))
  s.forEach(x => senders.add(x))
  for (const r of results) {
    const player = resolvePlayer(r.player)
    const key = `${player}|${r.game}|${r.puzzle}`
    if (!seen.has(key)) seen.set(key, { ...r, player, date: puzzleToDate(r.game, r.puzzle) })
  }
}

const all = [...seen.values()]
console.log(`files     ${files.length}`)
console.log(`parsed    ${parsed} result lines -> ${all.length} unique after dedupe`)
console.log(`people    ${senders.size}`)
console.log(`ignored   ${ignoredAll.length} (${[...new Set(ignoredAll.map(i => i.game))].join(', ') || 'none'})`)
console.log(`quoted    ${quotedAll.length} skipped reply previews`)
console.log(`UNMATCHED ${unmatchedAll.length}`)
for (const u of unmatchedAll) console.log(`   ${u.file}:${u.line}  ${u.text}  ${u.why ?? ''}`)

console.log('\nper game / puzzle:')
for (const g of GAMES) {
  const puzzles = [...new Set(all.filter(r => r.game === g).map(r => r.puzzle))].sort((a, b) => a - b)
  for (const p of puzzles) {
    const entries = rankPuzzle(all.filter(r => r.game === g && r.puzzle === p), g)
    const medal = pl => (pl === 1 ? '1.' : pl === 2 ? '2.' : pl === 3 ? '3.' : '  ')
    console.log(`  ${g} #${p} ${puzzleToDate(g, p)}: ` + entries.map(e => `${medal(e.place)}${e.player} ${e.display}`).join('  '))
  }
}

const { rows, puzzleCount, resultCount } = buildMedalTable(all)
console.log(`\nmedal table (${resultCount} results over ${puzzleCount} puzzles):`)
console.log('  player            1st 2nd 3rd  played')
for (const r of rows) {
  console.log(`  ${r.player.padEnd(17)} ${String(r.total.gold).padStart(2)}  ${String(r.total.silver).padStart(2)}  ${String(r.total.bronze).padStart(2)}   ${String(r.total.played).padStart(3)}`)
}
console.log(`\nsanity: rows account for ${rows.reduce((a, r) => a + r.total.played, 0)} of ${all.length} unique results`)
