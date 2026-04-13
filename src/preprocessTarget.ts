import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Target, TargetGrapheme, TargetOptions } from "./types";

const DEFAULT_OPTIONS: TargetOptions = {
    caseSensitive: false,
};

export function preprocessTarget(input: string, options: TargetOptions = DEFAULT_OPTIONS): Target {
    const graphemes: TargetGrapheme[] = [];
    const graphemeIndexes: number[] = [];
    const charIndexes: number[] = [];

    let graphemeIndex = 0;
    const normalizedInput = options.caseSensitive ? input : input.toLowerCase();

    for (const seg of segmenter.segment(normalizedInput)) {
        const cluster = seg.segment;
        const startIndex = seg.index;

        charIndexes[graphemeIndex] = startIndex;

        let atoms: string;
        if (cluster.length === 1) {
            atoms = decomposeToAtoms(cluster);
            graphemeIndexes[startIndex] = graphemeIndex;
        } else {
            atoms = cluster;
            for (let i = 0; i < cluster.length; i++) {
                graphemeIndexes[startIndex + i] = graphemeIndex;
            }
        }

        const { vowelIndex, tailIndex } = computeAtomRoles(atoms);
        graphemes.push({ atoms, vowelIndex, tailIndex });

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
