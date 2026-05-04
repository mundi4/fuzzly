export { buildMatchRanges } from "./buildMatchRanges";
export { buildQuery } from "./buildQuery";
export { createSearcher } from "./createSearcher";
export { matchBest, matchLiteral } from "./match";
export { preprocessTarget } from "./preprocessTarget";
export { createGraphemeBonuses, defaultScore, SCORING } from "./score";
export type {
    Atoms,
    GraphemeIndices,
    MatchRange,
    MatchResult,
    Query,
    QueryGrapheme,
    ScoringConfig,
    ScoringWeights,
    Searcher,
    SearcherOptions,
    SearchOptions,
    SearchResult,
    SearchResultOptions,
    Target,
    WhitespaceMode,
} from "./types";
