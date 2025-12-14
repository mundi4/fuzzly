// Types
export type {
    FuzzyQuery as FuzzQuery,
    FuzzyChar as FuzzChar,
    FuzzyStrokes as FuzzStrokes,
    StrokeMatchMap,
    MatchRange
} from "./types";

// Core builders
export { buildFuzzyQuery as buildFuzzQuery } from "./buildFuzzyQuery";
export { extractStrokes } from "./extractStrokes";

// Matching
export { matchLiteral } from "./matchLiteral";
export { matchFuzzyStrokes } from "./matchFuzzyStrokes";

// Post-processing
export { mergeMatches } from "./mergeMatches";
export { compressMatchIndexes } from "./compressMatchIndexes";

