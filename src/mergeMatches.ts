import type { MatchRange, StrokeMatchMap } from "./types";
import { compressMatchIndexes } from "./compressMatchIndexes";

export function mergeMatches(
    perToken: StrokeMatchMap[]
): Array<MatchRange[] | undefined> {

    const merged: Array<number[] | undefined> = [];

    for (const tokenResult of perToken) {
        for (let di = 0; di < tokenResult.length; di++) {
            const idxs = tokenResult[di];
            if (!idxs || idxs.length === 0) continue;
            if (!merged[di]) merged[di] = [];
            merged[di]!.push(...idxs);
        }
    }

    // 2) 정렬 + dedup + range 변환
    const ranges: Array<MatchRange[] | undefined> = new Array(merged.length);

    for (let di = 0; di < merged.length; di++) {
        const idxs = merged[di];
        if (!idxs || idxs.length === 0) continue;

        idxs.sort((a, b) => a - b);

        const dedup: number[] = [];
        let prev = -1;

        for (const idx of idxs) {
            if (idx !== prev) {
                dedup.push(idx);
                prev = idx;
            }
        }

        ranges[di] = compressMatchIndexes(dedup);
    }

    return ranges;
}
