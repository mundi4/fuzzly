import type { MatchResult, ScoringConfig, Target } from "./types";

/**
 * `matchBest` DP 스코어링의 기본 가중치 상수.
 * `ScoringConfig.weights`로 개별 오버라이드 가능.
 *
 * 스코어 구성:
 * - 후보 선택 시: POSITION_ZERO, BOUNDARY, graphemeBonus (candidatePositionScore)
 * - DP 전이 시: CONSECUTIVE (연속 보너스), GAP_PENALTY (gap 페널티)
 * - 최종 보정: PREFIX_BONUS, EXACT_BONUS, INITIAL_CONSONANT_PENALTY, TARGET_LENGTH_PENALTY
 */
export const SCORING = {
    POSITION_ZERO: 100,
    BOUNDARY: 50,
    CONSECUTIVE: 20,
    GAP_PENALTY: -3,
    PREFIX_BONUS: 200,
    EXACT_BONUS: 500,
    INITIAL_CONSONANT_PENALTY: -30,
    TARGET_LENGTH_PENALTY: -1,
} as const;

export type ResolvedScoring = {
    positionZero: number;
    boundary: number;
    consecutive: number;
    gapPenalty: number;
    prefixBonus: number;
    exactBonus: number;
    initialConsonantPenalty: number;
    targetLengthPenalty: number;
    getBonus: (graphemeIndex: number) => number;
};

const NO_BONUS = () => 0;

export function resolveScoring(config: ScoringConfig | undefined, target: Target): ResolvedScoring {
    const w = config?.weights;
    const gb = config?.graphemeBonus;
    let getBonus: (gi: number) => number;
    if (gb == null) {
        getBonus = NO_BONUS;
    } else if (typeof gb === "function") {
        getBonus = (gi) => gb(gi, target);
    } else {
        getBonus = (gi) => (gi < gb.length ? Number(gb[gi] ?? 0) : 0);
    }
    return {
        positionZero: w?.positionZero ?? SCORING.POSITION_ZERO,
        boundary: w?.boundary ?? SCORING.BOUNDARY,
        consecutive: w?.consecutive ?? SCORING.CONSECUTIVE,
        gapPenalty: w?.gapPenalty ?? SCORING.GAP_PENALTY,
        prefixBonus: w?.prefixBonus ?? SCORING.PREFIX_BONUS,
        exactBonus: w?.exactBonus ?? SCORING.EXACT_BONUS,
        initialConsonantPenalty: w?.initialConsonantPenalty ?? SCORING.INITIAL_CONSONANT_PENALTY,
        targetLengthPenalty: w?.targetLengthPenalty ?? SCORING.TARGET_LENGTH_PENALTY,
        getBonus,
    };
}

/**
 * 타겟의 UTF-16 문자 범위 [start, end)를 grapheme 인덱스로 변환하여
 * `ScoringConfig.graphemeBonus`에 사용할 수 있는 배열을 생성한다.
 * 여러 범위가 겹치면 bonus가 누적된다.
 *
 * 반환 배열의 길이는 `target.graphemes.length`와 같고,
 * 범위에 속하지 않는 grapheme의 값은 0이다.
 *
 * @param target - `preprocessTarget`으로 생성한 타겟
 * @param ranges - 각 원소의 start/end는 원문 UTF-16 offset (end exclusive), bonus는 가산할 점수
 * @returns `graphemeBonus`로 바로 사용 가능한 number 배열
 *
 * @example
 * ```ts
 * const target = preprocessTarget("프로젝트 설정 파일");
 * // "설정" 부분(char offset 5~7)에 100점 가중치
 * const bonuses = createGraphemeBonuses(target, [{ start: 5, end: 7, bonus: 100 }]);
 * matchBest(query, target, { graphemeBonus: bonuses });
 * ```
 */
export function createGraphemeBonuses(
    target: Target,
    ranges: { start: number; end: number; bonus: number }[],
): number[] {
    const bonuses = new Array<number>(target.graphemes.length).fill(0);
    const gIdx = target.graphemeIndexes;
    for (const { start, end, bonus } of ranges) {
        if (start >= end) continue;
        const startGi = gIdx[start];
        const endGi = gIdx[Math.min(end - 1, gIdx.length - 1)];
        if (startGi == null || endGi == null) continue;
        for (let gi = startGi; gi <= endGi; gi++) {
            bonuses[gi] += bonus;
        }
    }
    return bonuses;
}

/**
 * `matchBest`를 사용하지 않을 때의 간이 스코어링 함수.
 * `match`의 MatchResult 메타데이터만으로 점수를 계산한다.
 * `SearchOptions.score`에 전달하거나 직접 호출할 수 있다.
 */
export function defaultScore(result: MatchResult): number {
    let s = 0;
    if (result.startsAtZero) s += 1000;
    s += result.boundaryHits * 100;
    s -= result.runCount * 5;
    if (result.initialConsonantOnly) s -= 20;
    return s;
}
