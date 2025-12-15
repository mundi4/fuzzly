// Types
export type {
    Query,
    QueryGrapheme,
    Target,
    MatchRange,
    GraphemeIndices,
    Atoms,
    QueryOptions,
    TargetOptions,
    MatchOptions,
} from "./types";

// Core builders
export { buildQuery } from "./buildQuery";
export { preprocessTarget } from "./preprocessTarget";

// Matching
export { match } from "./match";

// Post-processing
export { buildMatchRanges } from "./buildMatchRanges";
