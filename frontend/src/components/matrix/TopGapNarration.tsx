import { useId } from 'react'
import type { TopMove } from '../../lib/narrate'
import './matrix.css'

// Top-moves display (spec 005, extended): a small, single-purpose render of `narrateTopGaps`'s
// already-computed result — no LLM call, no scoring, no reformatting of its numbers here. The
// component's only job is to give the ranked shortlist a labelled, keyboard-reachable home.
//
// `headline` is rendered byte-identically (it IS `narrateTopGap`'s narrative for the #1 move — the
// Bounded-AI provenance suite validates that string). Each move's stat chips and note likewise come
// straight from `narrateTopGaps`, already `formatNum`-formatted — never recomputed here.
export function TopGapNarration({ headline, moves }: { headline: string; moves: TopMove[] }) {
  const titleId = useId()
  const lead = moves[0]?.row.skill_name_raw ?? ''

  return (
    <section className="narration-root" aria-labelledby={titleId}>
      <h2 id={titleId} className="narration-title">
        Your top moves — start with {lead}
      </h2>
      <p className="narration-text">{headline}</p>
      <ol className="topmoves-list">
        {moves.map((move) => (
          <li className="topmove" data-rank={move.rank} key={move.row.skill_key ?? move.row.skill_name_raw}>
            <span className="topmove-rank" aria-hidden="true">
              {move.rank}
            </span>
            <div>
              <span className="topmove-name">{move.row.skill_name_raw}</span>
              {move.note && <p className="topmove-note">{move.note}</p>}
              {move.stats.length > 0 && (
                <div className="topmove-stats">
                  {move.stats.map((stat) => (
                    <span className="topmove-stat" key={stat}>
                      {stat}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
