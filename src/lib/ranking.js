// Ranking engine. Pure functions over normalised results — no parsing, no DOM.
//
// A normalised result is:
//   { player, game, puzzle, score, postedAt }
// `score` is always a number where LOWER IS BETTER unless the game is listed in
// HIGHER_IS_BETTER. `puzzle` is the game's own daily puzzle number, which is what
// we group by — never the post date, so late posts and timezones can't split a day.

export const GAMES = ['Queens', 'Tango', 'Zip', 'Patches']

// Zip, Tango and Queens are timed, so lower is better. Patches is unconfirmed:
// until we've seen real share text this stays empty and Patches is treated as
// lower-is-better like the rest. Flip it here once we know.
export const HIGHER_IS_BETTER = new Set([])

// One result per (player, game, puzzle). If someone posts the same puzzle twice,
// keep the FIRST one — re-posting a better score later shouldn't win a medal.
export function dedupe(results) {
  const byKey = new Map()
  for (const r of results) {
    const key = `${r.player}|${r.game}|${r.puzzle}`
    const seen = byKey.get(key)
    if (!seen || (r.postedAt ?? Infinity) < (seen.postedAt ?? Infinity)) byKey.set(key, r)
  }
  return [...byKey.values()]
}

// Standard competition ranking: ties share a place and the next place is skipped,
// so two players tied at the top are both 1st and the next is 3rd.
export function rankPuzzle(entries, game) {
  const dir = HIGHER_IS_BETTER.has(game) ? -1 : 1
  const sorted = [...entries]
    .filter(e => Number.isFinite(e.score))
    .sort((a, b) => dir * (a.score - b.score))

  const ranked = []
  let place = 0
  sorted.forEach((e, i) => {
    if (i === 0 || e.score !== sorted[i - 1].score) place = i + 1
    ranked.push({ ...e, place })
  })
  return ranked
}

// Medals are only awarded among players who actually posted that puzzle, so a
// two-player day produces a gold and a silver and no bronze. Not posting simply
// keeps you off the podium — there is no penalty and no zero.
export function buildMedalTable(results, games = GAMES) {
  const clean = dedupe(results).filter(r => games.includes(r.game))

  const puzzles = new Map()
  for (const r of clean) {
    const key = `${r.game}|${r.puzzle}`
    if (!puzzles.has(key)) puzzles.set(key, [])
    puzzles.get(key).push(r)
  }

  const players = new Map()
  const blank = () => Object.fromEntries(games.map(g => [g, { gold: 0, silver: 0, bronze: 0, played: 0 }]))
  const slotFor = place => (place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : null)

  for (const [key, entries] of puzzles) {
    const [game] = key.split('|')
    for (const e of rankPuzzle(entries, game)) {
      if (!players.has(e.player)) players.set(e.player, { player: e.player, games: blank() })
      const row = players.get(e.player).games[game]
      row.played++
      const slot = slotFor(e.place)
      if (slot) row[slot]++
    }
  }

  const rows = [...players.values()].map(p => {
    const total = { gold: 0, silver: 0, bronze: 0, played: 0 }
    for (const g of games) for (const k of Object.keys(total)) total[k] += p.games[g][k]
    return { ...p, total }
  })

  // Olympic ordering: golds, then silvers, then bronzes, then name for stability.
  rows.sort((a, b) =>
    b.total.gold - a.total.gold ||
    b.total.silver - a.total.silver ||
    b.total.bronze - a.total.bronze ||
    a.player.localeCompare(b.player))

  return { rows, puzzleCount: puzzles.size, resultCount: clean.length }
}
