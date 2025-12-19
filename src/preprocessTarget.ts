import type { Atoms, Target, TargetOptions } from "./types";
import { decomposeToAtoms } from "./internal/utils";
import segmenter from "./internal/segmenter";

const DEFAULT_OPTIONS: TargetOptions = {
    caseSensitive: false,
};

export function preprocessTarget(input: string, options: TargetOptions = DEFAULT_OPTIONS): Target {
    const graphemes: Array<Atoms> = [];
    const graphemeIndexes: number[] = [];
    const charIndexes: number[] = [];

    let graphemeIndex = 0;
    const normalizedInput = options.caseSensitive ? input : input.toLowerCase();

    for (const seg of segmenter.segment(normalizedInput)) {
        const cluster = seg.segment;
        const startIndex = seg.index;

        // graphemeIndex -> utf16 start index
        charIndexes[graphemeIndex] = startIndex;

        if (cluster.length === 1) {
            const arr = decomposeToAtoms(cluster);
            graphemes.push(arr);
            graphemeIndexes[startIndex] = graphemeIndex;
        } else {
            graphemes.push(cluster);
            for (let i = 0; i < cluster.length; i++) {
                graphemeIndexes[startIndex + i] = graphemeIndex;
            }
        }

        graphemeIndex++;
    }

    return {
        input,
        normalizedInput,
        graphemes,
        graphemeIndexes,
        charIndexes,
    };
}
