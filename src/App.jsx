import { useEffect, useMemo, useState } from 'react'
import { buildMedalTable, rankPuzzle, GAMES } from './lib/ranking.js'
import { parseConversation } from './lib/parse.js'
import { resolvePlayer } from './lib/players.js'

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }

// Merge on (player, game, puzzle) with the existing score winning, mirroring the
// importer exactly so a paste preview can never disagree with the published data.
function merge(existing, incoming) {
  const byKey = new Map(existing.map(r => [`${r.player}|${r.game}|${r.puzzle}`, r]))
  let added = 0
  for (const r of incoming) {
    const key = `${r.player}|${r.game}|${r.puzzle}`
    if (byKey.has(key)) continue
    byKey.set(key, r)
    added++
  }
  return { results: [...byKey.values()], added }
}

function MedalTable({ rows, games }) {
  if (!rows.length) return <p className="empty">Aucun résultat.</p>
  return (
    <div className="table-wrap">
      <table className="medals">
        <thead>
          <tr>
            <th className="rank"></th>
            <th className="who">Joueur</th>
            <th>🥇 1<sup>er</sup></th><th>🥈 2<sup>e</sup></th><th>🥉 3<sup>e</sup></th>
            <th className="played">Parties</th>
            {games.length > 1 && games.map(g => <th key={g} className="per-game">{g}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player}>
              <td className="rank">{i + 1}</td>
              <td className="who">{r.player}</td>
              <td className="gold">{r.total.gold}</td>
              <td className="silver">{r.total.silver}</td>
              <td className="bronze">{r.total.bronze}</td>
              <td className="played">{r.total.played}</td>
              {games.length > 1 && games.map(g => (
                <td key={g} className="per-game">
                  {r.games[g].played === 0
                    ? <span className="dash">–</span>
                    : `${r.games[g].gold}/${r.games[g].silver}/${r.games[g].bronze}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {games.length > 1 && <p className="legend">Colonnes par jeu : 1<sup>er</sup>/2<sup>e</sup>/3<sup>e</sup> — « – » signifie que le joueur n’a jamais posté ce jeu.</p>}
    </div>
  )
}

function Podiums({ results, games }) {
  const puzzles = useMemo(() => {
    const keys = new Map()
    for (const r of results) {
      const key = `${r.game}|${r.puzzle}`
      if (!keys.has(key)) keys.set(key, [])
      keys.get(key).push(r)
    }
    return [...keys.entries()]
      .map(([key, entries]) => {
        const [game, puzzle] = key.split('|')
        return { game, puzzle: Number(puzzle), entries: rankPuzzle(entries, game) }
      })
      .sort((a, b) => b.puzzle - a.puzzle || a.game.localeCompare(b.game))
  }, [results])

  return (
    <div className="podiums">
      {puzzles.map(p => (
        <section className="puzzle" key={`${p.game}-${p.puzzle}`}>
          <h3>{p.game} <span className="num">#{p.puzzle}</span></h3>
          <ol>
            {p.entries.map(e => (
              <li key={e.player} className={e.place <= 3 ? 'podium' : ''}>
                <span className="medal">{MEDALS[e.place] ?? ''}</span>
                <span className="name">{e.player}</span>
                <span className="time">{e.display}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function AddResults({ onMerge }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [report, setReport] = useState(null)

  function run() {
    const { results, ignored, unmatched, senders } = parseConversation(text)
    const incoming = results.map(r => ({
      player: resolvePlayer(r.player), game: r.game, puzzle: r.puzzle, score: r.score, display: r.display,
    }))
    const added = onMerge(incoming)
    setReport({ parsed: results.length, ignored: ignored.length, unmatched, senders: senders.length, added })
  }

  return (
    <section className="add">
      <button className="toggle" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} Ajouter des résultats
      </button>
      {open && (
        <div className="add-body">
          <p className="hint">
            Sélectionne la conversation LinkedIn, copie, colle ici. Les scores déjà enregistrés ne sont jamais
            écrasés, donc coller deux fois la même période est sans effet.
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
            placeholder="Colle la conversation ici…" />
          <div className="add-actions">
            <button className="primary" onClick={run} disabled={!text.trim()}>Analyser</button>
          </div>
          {report && (
            <div className="report">
              <p>
                {report.parsed} résultat{report.parsed > 1 ? 's' : ''} lu{report.parsed > 1 ? 's' : ''} de{' '}
                {report.senders} personne{report.senders > 1 ? 's' : ''} —{' '}
                <strong>{report.added} nouveau{report.added > 1 ? 'x' : ''}</strong>
                {report.ignored > 0 && `, ${report.ignored} ignoré${report.ignored > 1 ? 's' : ''} (jeux non suivis)`}
              </p>
              {report.unmatched.length > 0 && (
                <div className="problems">
                  <p><strong>{report.unmatched.length} ligne(s) non comprises</strong> — elles ne sont pas comptées :</p>
                  <ul>{report.unmatched.map(u => <li key={u.line}>ligne {u.line} : <code>{u.text}</code></li>)}</ul>
                </div>
              )}
              {report.added > 0 && (
                <p className="warn">
                  Cet aperçu est local à ton navigateur. Pour que les autres le voient, relance
                  <code>npm run import</code> et commite <code>public/data/results.json</code>.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [scope, setScope] = useState('all')
  const [extra, setExtra] = useState([])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/results.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  const all = useMemo(() => merge(data?.results ?? [], extra).results, [data, extra])
  const games = scope === 'all' ? GAMES : [scope]
  const scoped = useMemo(() => all.filter(r => games.includes(r.game)), [all, scope])
  const { rows, puzzleCount, resultCount } = useMemo(() => buildMedalTable(scoped, games), [scoped, scope])

  if (error) return <main className="app"><h1>Games App</h1><p className="empty">Chargement impossible : {error}</p></main>
  if (!data) return <main className="app"><h1>Games App</h1><p className="empty">Chargement…</p></main>

  return (
    <main className="app">
      <header>
        <h1>Games App</h1>
        <p className="sub">
          {resultCount} résultats · {puzzleCount} grilles · {rows.length} joueurs
          {extra.length > 0 && <span className="local"> · aperçu local non publié</span>}
        </p>
      </header>

      <nav className="tabs">
        <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Tout</button>
        {GAMES.map(g => (
          <button key={g} className={scope === g ? 'on' : ''} onClick={() => setScope(g)}>{g}</button>
        ))}
      </nav>

      <MedalTable rows={rows} games={games} />

      <h2>Grille par grille</h2>
      <Podiums results={scoped} games={games} />

      <AddResults onMerge={incoming => {
        const { results, added } = merge(all, incoming)
        setExtra(results.filter(r => !(data.results ?? []).some(d =>
          d.player === r.player && d.game === r.game && d.puzzle === r.puzzle)))
        return added
      }} />

      <footer>
        <p>Classement par temps brut. Égalité = même médaille, la place suivante est sautée.
        Les médailles ne sont attribuées qu’entre les joueurs ayant posté cette grille.</p>
        <p className="gen">Données générées le {new Date(data.generatedAt).toLocaleString('fr-FR')}</p>
      </footer>
    </main>
  )
}
