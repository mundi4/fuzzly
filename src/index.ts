// Types
export type {
    FuzzyQuery,
    FuzzyChar,
    FuzzyStrokes,
    StrokeMatchMap,
    MatchRange
} from "./types";

// Core builders
export { buildFuzzyQuery } from "./buildFuzzyQuery";
export { extractStrokes } from "./extractStrokes";

// Matching
export { matchLiteral } from "./matchLiteral";
export { matchFuzzyStrokes } from "./matchFuzzyStrokes";

// Post-processing
export { buildMatchRanges } from "./buildMatchRanges";
