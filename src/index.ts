export { buildMatchRanges } from "./buildMatchRanges";
export { buildQuery } from "./buildQuery";
export { createSearcher } from "./createSearcher";
export { matchBest, matchLiteral } from "./match";
export { matchFields } from "./matchFields";
export { PREPROCESS_VERSION, preprocessTarget } from "./preprocessTarget";
export { createGraphemeBonuses, defaultScore, SCORING } from "./score";
export type {
    Atoms,
    FieldsMatchResult,
    GraphemeIndices,
    MatchField,
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
