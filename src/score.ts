import type { MatchResult } from "./types";

export function defaultScore(result: MatchResult): number {
    let s = 0;
    if (result.startsAtZero) s += 1000;
    s += result.boundaryHits * 100;
    s -= result.runCount * 5;
    if (result.initialConsonantOnly) s -= 20;
    return s;
}
