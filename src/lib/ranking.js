// Ranking engine. Pure functions over normalised results — no parsing, no DOM.
//
// A normalised result is:
//   { player, game, puzzle, score, postedAt }
// `score` is always a number where LOWER IS BETTER unless the game is listed in
// HIGHER_IS_BETTER. `puzzle` is the game's own daily puzzle number, which is what
// we group by — never the post date, so late posts and timezones can't split a day.

export const GAMES = ['Queens', 'Tango', 'Zip', 'Patches']

// All four games are timed and lower is better — now confirmed against real
// share text for every one of them, Patches included.
export const HIGHER_IS_BETTER = new Set([])

// Difficulty weighting for the OVERALL ranking only. The coefficient never
// touches the per-game columns: a gold in Tango is still one gold there, and
// scaling it would misreport what happened. It also cannot change a single-game
// view, where multiplying every medal by the same factor leaves the order
// identical.
export const COEFFICIENTS = { Queens: 4, Tango: 3, Zip: 1, Patches: 1 }

export const coefficientOf = game => COEFFICIENTS[game] ?? 1

// A puzzle only one or two people played hands out a nearly free gold. This
// keeps puzzles with a real field, counting DISTINCT PLAYERS rather than rows so
// a duplicated import can never inflate a field size.
export const CONTESTED_MIN = 4

export function filterByFieldSize(results, min) {
  if (!min || min <= 1) return results
  const fields = new Map()
  for (const r of results) {
    const key = `${r.game}|${r.puzzle}`
    if (!fields.has(key)) fields.set(key, new Set())
    fields.get(key).add(r.player)
  }
  return results.filter(r => fields.get(`${r.game}|${r.puzzle}`).size >= min)
}

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
// `weighted` selects which figures drive the ORDER. Both are always returned, so
// the UI can render either, but the sort has to follow the same choice — showing
// raw counts in an order computed from weighted ones would look like a bug.
export function buildMedalTable(results, games = GAMES, { weighted = true } = {}) {
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

  // `total` is the honest medal count. `weighted` applies the per-game
  // coefficient to each tier separately, so the Olympic tiebreak structure is
  // preserved without inventing point values for gold/silver/bronze.
  // `played` is never weighted — it counts puzzles, not medals.
  const rows = [...players.values()].map(p => {
    const total = { gold: 0, silver: 0, bronze: 0, played: 0 }
    const weighted = { gold: 0, silver: 0, bronze: 0 }
    for (const g of games) {
      const coef = coefficientOf(g)
      for (const k of ['gold', 'silver', 'bronze']) {
        total[k] += p.games[g][k]
        weighted[k] += p.games[g][k] * coef
      }
      total.played += p.games[g].played
    }
    return { ...p, total, weighted }
  })

  // Olympic ordering: golds, then silvers, then bronzes, then name for stability.
  const by = weighted ? 'weighted' : 'total'
  rows.sort((a, b) =>
    b[by].gold - a[by].gold ||
    b[by].silver - a[by].silver ||
    b[by].bronze - a[by].bronze ||
    a.player.localeCompare(b.player))

  return { rows, puzzleCount: puzzles.size, resultCount: clean.length }
}
