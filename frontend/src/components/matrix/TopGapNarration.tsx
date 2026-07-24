import { useId } from 'react'
import type { TopMove } from '../../lib/narrate'
import './matrix.css'

// Top-moves display (spec 005, extended): a small, single-purpose render of `narrateTopGaps`'s
// already-computed result — no LLM call, no scoring, no reformatting of its numbers here. The
// component's only job is to give the ranked shortlist a labelled, keyboard-reachable home.
//
// The old "X ranks above Y on leverage: A vs B" comparison sentence is intentionally NOT rendered:
// it just restated the visible ranking (rank 1 is already listed above rank 2). `narrateTopGaps`
// still returns that string (its Bounded-AI provenance suite is unchanged) — the UI simply doesn't
// echo it. In its place: one static value-framing line that explains WHAT leverage means, which the
// ranked list itself can't convey. Each move's stat chips and note come straight from
// `narrateTopGaps`, already `formatNum`-formatted — never recomputed here.
export function TopGapNarration({ moves }: { moves: TopMove[] }) {
  const titleId = useId()
  const lead = moves[0]?.row.skill_name_raw ?? ''

  return (
    <section className="narration-root" aria-labelledby={titleId}>
      <h2 id={titleId} className="narration-title">
        Your top moves — start with {lead}
      </h2>
      <p className="narration-text">
        Ranked by leverage — skills lots of jobs want but few people have, so you compete less for
        the same payoff.
      </p>
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
