import { matchBest, mergeMatchResults } from "./match";
import type { FieldsMatchResult, MatchField, MatchResult, Query, ScoringConfig, Target } from "./types";

// D1: 부호 보존 배율. weight를 올리면 양·음수 전 구간에서 항상 유리해진다.
function applyWeight(score: number, w: number): number {
    return score >= 0 ? score * w : score / w;
}

/**
 * 하나의 (split) 쿼리를 여러 필드(Target)에 대해 토큰 단위 cross-field AND로 매칭한다.
 *
 * - 각 토큰은 모든 필드 중 weighted score가 최대인 필드(argmax)에 귀속된다 (winner-takes-highlight).
 * - 모든 토큰이 ≥1 필드에서 hit해야 통과(AND). 하나라도 미커버면 `null`.
 * - 최상위 `score`는 토큰별 best weighted score의 합, `perField[i].score`는 raw(비가중) 합.
 *
 * @param query - `buildQuery`의 출력. split 모드면 `subQueries`가 토큰이 된다.
 * @param fields - 필드 정의 배열. 각 필드는 `target`(필수)·`weight`를 가진다.
 * @param opts - `scoring`(config 또는 target별 함수), `strict`.
 */
export function matchFields(
    query: Query,
    fields: MatchField[],
    opts?: { scoring?: ScoringConfig | ((target: Target) => ScoringConfig); strict?: boolean },
): FieldsMatchResult | null {
    for (const f of fields) {
        const w = f.weight ?? 1;
        if (!(w > 0)) throw new RangeError(`matchFields: field weight must be > 0, got ${w}`);
    }
    if (fields.length === 0) return null;

    // D7: 토큰 = subQueries가 있으면 그것, 없으면 쿼리 통째 1토큰
    const tokens = (query.subQueries ?? [query]).filter((t) => t.graphemes.length > 0);
    if (tokens.length === 0) {
        // 빈 쿼리 = match-all (matchBest의 빈 쿼리 시맨틱과 일치)
        return { score: 0, perField: fields.map(() => null) };
    }

    const strict = opts?.strict ?? false;
    const scoringOpt = opts?.scoring;
    const cfgFor: (t: Target) => ScoringConfig | undefined =
        typeof scoringOpt === "function" ? scoringOpt : scoringOpt != null ? () => scoringOpt : () => undefined;
    // 필드에 pre-resolved scoring 이 있으면 우선, 없으면 opts.scoring 을 필드당 1회 resolve.
    const fieldCfgs = fields.map((f) => f.scoring ?? cfgFor(f.target));

    let totalScore = 0;
    const winners: MatchResult[][] = fields.map(() => []);

    for (const token of tokens) {
        let bestIdx = -1;
        let bestWeighted = -Infinity;
        let bestResult: MatchResult | null = null;
        for (let i = 0; i < fields.length; i++) {
            const r = matchBest(token, fields[i].target, fieldCfgs[i], strict);
            if (r === null) continue;
            const weighted = applyWeight(r.score ?? 0, fields[i].weight ?? 1);
            if (weighted > bestWeighted) {
                // strict > : 동점이면 낮은 인덱스 유지 (D3)
                bestWeighted = weighted;
                bestIdx = i;
                bestResult = r;
            }
        }
        if (bestIdx === -1 || bestResult === null) return null; // 토큰 미커버 → AND 실패 (D2)
        totalScore += bestWeighted;
        winners[bestIdx].push(bestResult);
    }

    const perField = winners.map((ws) => (ws.length === 0 ? null : mergeMatchResults(ws)));
    return { score: totalScore, perField };
}
