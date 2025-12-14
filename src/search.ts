import { buildFuzzyQuery } from "./buildFuzzyQuery";
import { extractStrokes } from "./extractStrokes";
import { matchLiteral } from "./matchLiteral";
import { matchFuzzyStrokes } from "./matchFuzzyStrokes";
import { buildMatchRanges } from "./buildMatchRanges";
import type { FuzzyStrokes, StrokeMatchMap, MatchRange } from "./types";

/**
 * Options for configuring search behavior
 */
export interface SearchOptions {
    /**
     * Fields to search within each item
     * Can be field names (string) or accessor functions
     */
    keys?: (string | ((item: any) => string))[];

    /**
     * Whether to allow spillover of final consonants (받침) to next character
     * Useful for partial input during typing
     * @default true
     */
    allowTailSpillover?: boolean;

    /**
     * How to handle whitespace in query
     * - 'boundary': whitespace acts as a boundary (no spillover)
     * - 'split': split query into multiple tokens (AND logic)
     * - 'literal': treat whitespace as literal character to match
     * @default 'split'
     */
    whitespaceMode?: 'boundary' | 'split' | 'literal';

    /**
     * Threshold for match quality (0-1)
     * Lower values are more permissive
     * @default 0
     */
    threshold?: number;

    /**
     * Sort results by match quality
     * @default true
     */
    sort?: boolean;

    /**
     * Maximum number of results to return
     * @default undefined (return all matches)
     */
    limit?: number | undefined;

    /**
     * Case sensitivity for non-Korean text
     * @default false
     */
    caseSensitive?: boolean;
}

/**
 * Search result with match information
 */
export interface SearchResult<T = any> {
    /** The matched item */
    item: T;
    
    /** Match score (higher is better) */
    score: number;
    
    /** Array of match ranges per field */
    matches: Array<MatchRange[] | undefined>;
    
    /** Index of the item in original array */
    index: number;
}

/**
 * Internal resolved options (all required except limit)
 */
interface ResolvedSearchOptions {
    keys: (string | ((item: any) => string))[];
    allowTailSpillover: boolean;
    whitespaceMode: 'boundary' | 'split' | 'literal';
    threshold: number;
    sort: boolean;
    limit: number | undefined;
    caseSensitive: boolean;
}

/**
 * Internal search context
 */
interface SearchContext<T> {
    items: T[];
    options: ResolvedSearchOptions;
    query: string;
    queries: string[];
}

/**
 * Main search function - searches through an array of items
 * 
 * @param query - Search query string
 * @param items - Array of items to search through
 * @param options - Search configuration options
 * @returns Array of search results sorted by relevance
 * 
 * @example
 * ```ts
 * const results = search('값', ['값어치', '가치', '갑작스런']);
 * // Returns matches for '값어치'
 * 
 * const items = [
 *   { name: '파일 열기', cmd: 'open' },
 *   { name: '파일 닫기', cmd: 'close' }
 * ];
 * const results = search('파열', items, { keys: ['name'] });
 * // Returns match for '파일 열기'
 * ```
 */
export function search<T = string>(
    query: string,
    items: T[],
    options: SearchOptions = {}
): SearchResult<T>[] {
    if (!query || query.trim() === '') {
        return [];
    }

    if (!items || items.length === 0) {
        return [];
    }

    const ctx = createContext(items, query, options);
    const results: SearchResult<T>[] = [];

    for (let i = 0; i < items.length; i++) {
        const result = searchItem(items[i], i, ctx);
        if (result) {
            results.push(result);
        }
    }

    if (ctx.options.sort) {
        results.sort((a, b) => b.score - a.score);
    }

    if (ctx.options.limit && ctx.options.limit > 0) {
        return results.slice(0, ctx.options.limit);
    }

    return results;
}

/**
 * Create search context with normalized options
 */
function createContext<T>(
    items: T[],
    query: string,
    options: SearchOptions
): SearchContext<T> {
    const whitespaceMode = options.whitespaceMode ?? 'split';
    const queries = whitespaceMode === 'split' 
        ? query.trim().split(/\s+/).filter(q => q.length > 0)
        : [query];

    return {
        items,
        query,
        queries,
        options: {
            keys: options.keys ?? [],
            allowTailSpillover: options.allowTailSpillover ?? true,
            whitespaceMode,
            threshold: options.threshold ?? 0,
            sort: options.sort ?? true,
            limit: options.limit,
            caseSensitive: options.caseSensitive ?? false,
        }
    };
}

/**
 * Search a single item
 */
function searchItem<T>(
    item: T,
    index: number,
    ctx: SearchContext<T>
): SearchResult<T> | null {
    const fields = extractFields(item, ctx.options.keys);
    if (fields.length === 0) {
        return null;
    }

    const parts = fields.map(f => extractStrokes(f));
    const allMatches: StrokeMatchMap[] = [];
    let totalMatchCount = 0;

    // Try to match each query token
    for (const queryToken of ctx.queries) {
        // Apply case sensitivity
        const normalizedQuery = ctx.options.caseSensitive 
            ? queryToken 
            : queryToken.toLowerCase();
        
        const fuzzyQuery = buildFuzzyQuery(normalizedQuery);
        if (!fuzzyQuery) {
            continue;
        }

        // Set allowTailSpillover for the last character of last query
        if (ctx.options.allowTailSpillover && fuzzyQuery.chars.length > 0) {
            fuzzyQuery.chars[fuzzyQuery.chars.length - 1].allowTailSpillover = true;
        }

        let tokenMatch: StrokeMatchMap | null = null;

        // For case-insensitive search, normalize fields as well
        const searchParts = ctx.options.caseSensitive 
            ? parts 
            : fields.map(f => extractStrokes(f.toLowerCase()));

        if (fuzzyQuery.isLiteral) {
            tokenMatch = matchLiteral(fuzzyQuery, searchParts);
        } else {
            tokenMatch = matchFuzzyStrokes(fuzzyQuery, searchParts);
        }

        if (!tokenMatch) {
            // If any token doesn't match, the whole search fails (AND logic)
            return null;
        }

        allMatches.push(tokenMatch);
        
        // Count total matches for scoring
        for (const partMatches of tokenMatch) {
            if (partMatches) {
                totalMatchCount += partMatches.length;
            }
        }
    }

    // Build match ranges using original parts (for correct positioning)
    const ranges = buildMatchRanges(allMatches, parts);
    
    // Calculate score
    const score = calculateScore(fields, ranges, totalMatchCount);
    
    if (score < ctx.options.threshold) {
        return null;
    }

    return {
        item,
        score,
        matches: ranges,
        index
    };
}

/**
 * Extract searchable fields from an item
 */
function extractFields<T>(item: T, keys: (string | ((item: T) => string))[]): string[] {
    // If no keys specified, treat item as string
    if (keys.length === 0) {
        return [String(item)];
    }

    const fields: string[] = [];
    for (const key of keys) {
        if (typeof key === 'function') {
            const value = key(item);
            if (value) {
                fields.push(String(value));
            }
        } else if (typeof key === 'string') {
            // Type-safe property access with proper checking
            const value = (item as Record<string, unknown>)?.[key];
            if (value !== undefined && value !== null) {
                fields.push(String(value));
            }
        }
    }

    return fields;
}

/**
 * Calculate match score
 * Higher score = better match
 */
function calculateScore(
    fields: string[],
    ranges: Array<MatchRange[] | undefined>,
    totalMatchCount: number
): number {
    if (totalMatchCount === 0) {
        return 0;
    }

    let totalLength = 0;
    let matchedLength = 0;
    let firstMatchPosition = Infinity;
    let consecutiveBonus = 0;

    for (let i = 0; i < fields.length; i++) {
        totalLength += fields[i].length;
        const fieldRanges = ranges[i];
        
        if (fieldRanges && fieldRanges.length > 0) {
            // Track first match position
            firstMatchPosition = Math.min(firstMatchPosition, fieldRanges[0].start);
            
            // Sum up matched character lengths
            for (const range of fieldRanges) {
                const rangeLength = range.end - range.start;
                matchedLength += rangeLength;
                
                // Bonus for consecutive matches
                if (rangeLength > 1) {
                    consecutiveBonus += (rangeLength - 1) * 0.1;
                }
            }
        }
    }

    // Base score: coverage ratio
    let score = matchedLength / Math.max(totalLength, 1);
    
    // Bonus for earlier matches
    if (firstMatchPosition < Infinity) {
        score += (1 - firstMatchPosition / totalLength) * 0.2;
    }
    
    // Bonus for consecutive matches
    score += consecutiveBonus;
    
    // Bonus for more matches relative to field count
    score += (totalMatchCount / Math.max(fields.length, 1)) * 0.1;

    return Math.min(score, 1);
}

/**
 * Simple filter function - returns true if item matches query
 * Useful for quick filtering without needing match details
 * 
 * @example
 * ```ts
 * const items = ['값어치', '가치', '갑작스런'];
 * const filtered = items.filter(item => matches('값', item));
 * ```
 */
export function matches<T = string>(
    query: string,
    item: T,
    options: SearchOptions = {}
): boolean {
    return search(query, [item], options).length > 0;
}

/**
 * Get match ranges for a single item without scoring
 * Useful when you just need highlight information
 * 
 * @example
 * ```ts
 * const ranges = getMatchRanges('파열', '파일 열기');
 * // Use ranges to highlight matched portions
 * ```
 */
export function getMatchRanges<T = string>(
    query: string,
    item: T,
    options: SearchOptions = {}
): Array<MatchRange[] | undefined> | null {
    const results = search(query, [item], options);
    return results.length > 0 ? results[0].matches : null;
}
