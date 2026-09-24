// Parser for LinkedIn conversation text pasted straight out of the browser.
//
// Everything here was written against real messages in raw/, not against a guess
// at the format. The share text is identical in French and English apart from the
// trailing blurb, which we ignore entirely — we only need the game, the puzzle
// number and the time.

export const TRACKED_GAMES = ['Queens', 'Tango', 'Zip', 'Patches']

const ALL_GAMES = ['Queens', 'Tango', 'Zip', 'Patches', 'Pinpoint', 'Crossclimb', 'Mini Sudoku']

// The separator before the puzzle number is usually "#", but LinkedIn also emits
// "no." and "n°" on some clients — seen in the wild as "Queens no. 870 | 0:15"
// and "Patches n°181 | 0:07". Times exceed a minute often enough to matter
// ("Queens #873 | 4:19").
//
// No leading \b: people jam commentary straight onto the share text with no
// space ("...de cette convoTango #699 | 2:30"), and a word boundary would miss
// it. The rest of the pattern — a puzzle number, a pipe and a clock time — is
// specific enough to carry the match on its own.
const RESULT_RE = new RegExp(
  `(${ALL_GAMES.join('|')})\\s*(?:#|no\\.?\\s*|n[°o]\\s*)(\\d+)\\s*\\|\\s*(\\d+):(\\d{2})\\b`, 'g')

// LinkedIn's export writes UTF-8 bytes but labels them CP1252, so "arrivée"
// arrives as "arrivÃ©e", "'" as "â€™", "🧶" as "ðŸ§¶", and — the part that
// actually broke parsing — "n°" as "nÂ°". Reversing that decode repairs the
// whole string at once, which is safer than teaching every pattern to recognise
// mangled characters.
//
// It must be CP1252 and not Latin-1: bytes 0x80-0x9F map to characters ABOVE
// U+00FF in CP1252 (0x80 -> €, 0x9F -> Ÿ, 0x99 -> ™), so a Latin-1 round trip
// both rejects them as out of byte range and corrupts them. This is the inverse
// of that block; every other character maps straight to its own code point.
const CP1252_HIGH = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

// Only text carrying the signature is touched, and if the round trip yields a
// replacement character the decode was wrong, so the original is kept.
const MOJIBAKE_RE = /Ã.|Â.|â€|ðŸ/
export function repairMojibake(text) {
  if (!MOJIBAKE_RE.test(text)) return text
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i)
    const byte = cp <= 0xff ? cp : CP1252_HIGH[cp]
    if (byte === undefined) return text      // not CP1252-mojibake after all
    bytes[i] = byte
  }
  const repaired = new TextDecoder('utf-8').decode(bytes)
  return repaired.includes('�') ? text : repaired
}

// A result is NOT always at the start of its line: people top-and-tail the share
// text with commentary ("contreperf dsl Tango #712 | 0:51 with no hints"). So we
// search the whole line — which means quoted-reply previews have to be excluded
// explicitly instead, because LinkedIn inlines a whole quoted message after a
// "Mahaut : " prefix and that would double-count the score.
const QUOTED_REPLY_RE = /^\*?\s*\p{Lu}[\p{L}'’-]*(?:[ -]\p{Lu}[\p{L}'’-]*)?\s:\s/u

// Primary sender anchor: the profile-link line that precedes every block. It is
// language-independent, unlike "a envoyé les messages suivants".
const SENDER_LINK_RE = /^\[([^\]]+)\]\(https:\/\/[^)]*linkedin\.com\/in\/[^)]*\)(?:\s*\([^)]*\))?\s*(\d{1,2}):(\d{2})\s*$/

// Fallback sender anchor, FR and EN.
const SENDER_SENT_RE = /^\*?\s*(.+?)\s+(?:a\s+envoyé\s+les?\s+messages?\s+suivants?|sent\s+the\s+following\s+messages?)\s+(?:à|at)\s+(\d{1,2}):(\d{2})/i

// LinkedIn glues the day separator onto the name on that fallback line, with no
// space: "mardiNicolas Malhomme", and for older messages a date instead of a
// weekday: "15 sept.Pierre-Alexandre Medinger".
const DAY_PREFIX_RE = /^(?:\d{1,2}\s*[\p{L}]{3,10}\.?|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|aujourd['’]hui|hier|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday)/iu

// Lines that look like a sender link but carry no time — LinkedIn chrome, not people.
const NOT_A_NAME_RE = /^(?:Voir le profil|View .*profile|Le statut est|Status is)/i

function cleanName(raw) {
  let name = raw.replace(DAY_PREFIX_RE, '').trim()
  name = name.replace(/\s*\((?:He|She|They)\/[^)]*\)\s*$/i, '').trim()
  return name
}

// Broad net for format drift: a line mentioning a game, a pipe and a clock time
// is almost certainly a result. If RESULT_RE did not match such a line, that is
// reported rather than silently dropped.
function looksLikeResult(line) {
  return ALL_GAMES.some(g => line.includes(g)) && line.includes('|') && /\d:\d{2}/.test(line)
}

// Parser for LinkedIn's own message export ("get a copy of your data"), whose
// rows carry the sender in FROM and the message body in CONTENT. This is much
// simpler than the pasted-DOM case: there is no sender to track across lines and
// no quoted-reply previews, because each row IS one message someone sent.
//
// The export mangles accented characters (UTF-8 read as CP1252, so "arrivée"
// becomes "arrivÃ©e"). It does not matter here — game names, puzzle numbers and
// times are all ASCII — so no repair is attempted.
//
// The export also has a real DATE column, which is deliberately NOT used as the
// result's date. A puzzle belongs to its own day, not to whenever somebody got
// round to posting it, and 1.13% of this history was posted the following day.
// Using the puzzle number for both sources also keeps exports and pastes
// consistent. DATE served its purpose by confirming the anchor in dates.js.
export function parseExportRows(rows) {
  const results = []
  const ignored = []
  const unmatched = []
  const senders = new Set()

  rows.forEach((row, i) => {
    const line = i + 2                      // +1 for the header, +1 for 1-indexing
    const sender = repairMojibake(String(row.FROM ?? '')).trim()
    const content = repairMojibake(String(row.CONTENT ?? ''))
    if (sender) senders.add(sender)

    const matches = [...content.matchAll(RESULT_RE)]
    if (!matches.length) {
      if (looksLikeResult(content)) unmatched.push({ line, text: content.trim().slice(0, 160) })
      return
    }
    if (!sender) {
      unmatched.push({ line, text: content.trim().slice(0, 160), why: 'row has no FROM' })
      return
    }

    for (const m of matches) {
      const [, game, puzzle, mins, secs] = m
      const entry = {
        player: sender,
        game,
        puzzle: Number(puzzle),
        score: Number(mins) * 60 + Number(secs),
        display: `${Number(mins)}:${secs}`,
        order: i,
      }
      if (TRACKED_GAMES.includes(game)) results.push(entry)
      else ignored.push(entry)
    }
  })

  return { results, ignored, quoted: [], unmatched, senders: [...senders] }
}

export function parseConversation(text) {
  const lines = text.split(/\r?\n/)
  const results = []
  const ignored = []       // real results for games we don't track
  const quoted = []        // results inside quoted-reply previews — deliberately skipped
  const unmatched = []     // result-shaped lines the parser failed on — must stay empty
  const senders = new Set()
  let sender = null

  lines.forEach((line, i) => {
    const linkMatch = line.match(SENDER_LINK_RE)
    if (linkMatch && !NOT_A_NAME_RE.test(linkMatch[1])) {
      sender = cleanName(linkMatch[1])
      senders.add(sender)
      return
    }
    const sentMatch = line.match(SENDER_SENT_RE)
    if (sentMatch) {
      const name = cleanName(sentMatch[1])
      if (name && !NOT_A_NAME_RE.test(name)) { sender = name; senders.add(sender) }
      return
    }

    // A quoted reply repeats someone else's message inside the current block, so
    // its scores are already counted from the original and its sender is wrong.
    if (QUOTED_REPLY_RE.test(line)) {
      for (const m of line.matchAll(RESULT_RE)) quoted.push({ line: i + 1, game: m[1], puzzle: Number(m[2]) })
      return
    }

    const matches = [...line.matchAll(RESULT_RE)]
    if (!matches.length) {
      if (looksLikeResult(line)) unmatched.push({ line: i + 1, text: line.trim().slice(0, 160) })
      return
    }

    for (const m of matches) {
      const [, game, puzzle, mins, secs] = m
      if (!sender) { unmatched.push({ line: i + 1, text: line.trim().slice(0, 160), why: 'no sender established' }); continue }
      const entry = {
        player: sender,
        game,
        puzzle: Number(puzzle),
        score: Number(mins) * 60 + Number(secs),
        display: `${Number(mins)}:${secs}`,
        order: i,
      }
      if (TRACKED_GAMES.includes(game)) results.push(entry)
      else ignored.push(entry)
    }
  })

  return { results, ignored, quoted, unmatched, senders: [...senders] }
}
