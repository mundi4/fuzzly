// ============================================================
// Public API - Recommended for most use cases
// ============================================================

/**
 * Main search API - flexible and easy to use
 * @see search - Main search function with options
 * @see matches - Quick boolean check if item matches
 * @see getMatchRanges - Get highlight ranges for matched text
 */
export {
    search,
    matches,
    getMatchRanges,
    type SearchOptions,
    type SearchResult
} from "./search";

// ============================================================
// Core Types - Useful for advanced usage
// ============================================================

export type {
    FuzzyQuery,
    FuzzyChar,
    FuzzyStrokes,
    StrokeMatchMap,
    MatchRange
} from "./types";

// ============================================================
// Low-level API - For advanced customization
// ============================================================

/**
 * Low-level building blocks
 * Use these if you need fine-grained control over the search process
 * Most users should use the high-level `search` function instead
 */
export { buildFuzzyQuery } from "./buildFuzzyQuery";
export { extractStrokes } from "./extractStrokes";
export { matchLiteral } from "./matchLiteral";
export { matchFuzzyStrokes } from "./matchFuzzyStrokes";
export { buildMatchRanges } from "./buildMatchRanges";
