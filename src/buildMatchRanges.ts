import type { FuzzyStrokes, MatchRange, StrokeMatchMap } from "./types";
import { compressMatchIndexes } from "./compressMatchIndexes";

export function buildMatchRanges(
    perToken: StrokeMatchMap[],
    parts: FuzzyStrokes[]
): Array<MatchRange[] | undefined> {

    // part별 cluster index 누적 (undefined | number[])
    const mergedClusters: Array<number[] | undefined> = [];

    for (const tokenResult of perToken) {
        for (let pi = 0; pi < tokenResult.length; pi++) {
            const clusters = tokenResult[pi];
            if (!clusters || clusters.length === 0) continue;

            let bucket = mergedClusters[pi];
            if (!bucket) {
                bucket = [];
                mergedClusters[pi] = bucket;
            }

            bucket.push(...clusters);
        }
    }

    const ranges: Array<MatchRange[] | undefined> = new Array(mergedClusters.length);

    for (let pi = 0; pi < mergedClusters.length; pi++) {
        const clusters = mergedClusters[pi];
        if (!clusters || clusters.length === 0) {
            ranges[pi] = undefined;
            continue;
        }

        // 1) cluster 정렬 + dedup
        clusters.sort((a, b) => a - b);

        const uniqClusters: number[] = [];
        let prev = -1;
        for (const c of clusters) {
            if (c !== prev) {
                uniqClusters.push(c);
                prev = c;
            }
        }

        if (uniqClusters.length === 0) {
            ranges[pi] = undefined;
            continue;
        }

        // 2) cluster → char index
        const charToCluster = parts[pi].clusterIndexes;
        const charIndexes: number[] = [];

        for (let ci = 0; ci < charToCluster.length; ci++) {
            if (uniqClusters.includes(charToCluster[ci])) {
                charIndexes.push(ci);
            }
        }

        if (charIndexes.length === 0) {
            ranges[pi] = undefined;
            continue;
        }

        // 3) char index → range
        charIndexes.sort((a, b) => a - b);
        ranges[pi] = compressMatchIndexes(charIndexes);
    }

    return ranges;
}
