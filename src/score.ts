import type { MatchResult, ScoringConfig, Target } from "./types";

export const SCORING = {
    POSITION_ZERO: 100, // 타겟 위치 0에서 매치
    BOUNDARY: 50, // 단어 경계(공백/밑줄/대시/점 뒤)에서 매치
    CONSECUTIVE: 20, // 연속 매치 보너스 (누적: 20, 40, 60...)
    GAP_PENALTY: -3, // 스킵된 타겟 그래핌당 페널티
    PREFIX_BONUS: 200, // 타겟 시작부터 연속 매치 (완벽 prefix)
    EXACT_BONUS: 500, // 쿼리 == 타겟 (완전 일치)
    INITIAL_CONSONANT_PENALTY: -30, // 초성만 쿼리
    TARGET_LENGTH_PENALTY: -1, // 타겟 그래핌 수당 페널티 (짧은 타겟 선호)
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
        getBonus = (gi) => (gi < gb.length ? gb[gi] : 0);
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
 * 타겟의 문자 범위 [start, end)에 해당하는 그래핌에 bonus를 부여하는
 * graphemeBonus 배열 생성. 여러 범위가 겹치면 bonus가 누적된다.
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

export function defaultScore(result: MatchResult): number {
    let s = 0;
    if (result.startsAtZero) s += 1000;
    s += result.boundaryHits * 100;
    s -= result.runCount * 5;
    if (result.initialConsonantOnly) s -= 20;
    return s;
}
