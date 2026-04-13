// Types

// Post-processing
export { buildMatchRanges } from "./buildMatchRanges";

// Core builders
export { buildQuery } from "./buildQuery";
// Matching
export { match } from "./match";
export { preprocessTarget } from "./preprocessTarget";
export type {
    Atoms,
    GraphemeIndices,
    MatchOptions,
    MatchRange,
    Query,
    QueryGrapheme,
    QueryOptions,
    Target,
    TargetOptions,
} from "./types";
