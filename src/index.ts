export { buildMatchRanges } from "./buildMatchRanges";
export { buildQuery } from "./buildQuery";
export { createSearcher } from "./createSearcher";
export { matchBest, matchLiteral } from "./match";
export { matchFields } from "./matchFields";
export { PREPROCESS_VERSION, preprocessTarget } from "./preprocessTarget";
export { createGraphemeBonuses, defaultScore, SCORING } from "./score";
export type { TextSegment } from "./segmentByRanges";
export { segmentByRanges } from "./segmentByRanges";
export type {
    Atoms,
    FieldsMatchResult,
    GraphemeIndices,
    MatchBestOptions,
    MatchField,
    MatchRange,
    MatchResult,
    MultiFieldSearcher,
    MultiFieldSearcherOptions,
    MultiFieldSearchResult,
    Query,
    QueryGrapheme,
    ScanCursor,
    ScoringConfig,
    ScoringWeights,
    Searcher,
    SearcherFieldSpec,
    SearcherOptions,
    SearchOptions,
    SearchResult,
    SearchResultOptions,
    Target,
    WhitespaceMode,
} from "./types";
