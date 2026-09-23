// Parses the raw sample and prints what it actually found, so the numbers can be
// checked against the source text rather than against a rendered UI.
import { readFileSync } from 'node:fs'
import { parseConversation, shortNames } from '../src/lib/parse.js'
import { buildMedalTable, rankPuzzle, GAMES } from '../src/lib/ranking.js'

const text = readFileSync(new URL('../raw/sample-conversation.txt', import.meta.url), 'utf8')
const { results, ignored, unmatched, senders } = parseConversation(text)
const short = shortNames(senders)
const named = results.map(r => ({ ...r, player: short[r.player] ?? r.player }))

console.log(`parsed   ${results.length} results from ${senders.length} people`)
console.log(`ignored  ${ignored.length}  (${[...new Set(ignored.map(i => i.game))].join(', ') || 'none'})`)
console.log(`UNMATCHED ${unmatched.length}`)
for (const u of unmatched) console.log(`   line ${u.line}: ${u.text}  ${u.why ?? ''}`)

console.log('\nper game / puzzle:')
for (const g of GAMES) {
  const puzzles = [...new Set(named.filter(r => r.game === g).map(r => r.puzzle))].sort((a, b) => a - b)
  for (const p of puzzles) {
    const entries = rankPuzzle(named.filter(r => r.game === g && r.puzzle === p), g)
    const medal = pl => (pl === 1 ? '🥇' : pl === 2 ? '🥈' : pl === 3 ? '🥉' : '  ')
    console.log(`  ${g} #${p}: ` + entries.map(e => `${medal(e.place)}${e.player} ${e.display}`).join('  '))
  }
}

const { rows, puzzleCount, resultCount } = buildMedalTable(named)
console.log(`\nmedal table (${resultCount} results over ${puzzleCount} puzzles):`)
console.log('  player           🥇  🥈  🥉   played')
for (const r of rows) {
  console.log(`  ${r.player.padEnd(16)} ${String(r.total.gold).padStart(2)}  ${String(r.total.silver).padStart(2)}  ${String(r.total.bronze).padStart(2)}   ${String(r.total.played).padStart(3)}`)
}

const tally = rows.reduce((a, r) => a + r.total.played, 0)
console.log(`\nsanity: medal-table rows account for ${tally} of ${results.length} parsed results`)
