import type { MatchResult } from "./types";

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

export function defaultScore(result: MatchResult): number {
    let s = 0;
    if (result.startsAtZero) s += 1000;
    s += result.boundaryHits * 100;
    s -= result.runCount * 5;
    if (result.initialConsonantOnly) s -= 20;
    return s;
}
