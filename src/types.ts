import {RawRangeBoundResult, RawRangeDistributionResult} from 'filters/range_filter';

/**
 * ***********************************
 * ES Request
 * ***********************************
 */
export type ESRequestSortField = Array<object | string>;

export type ESRequest = {
    query: {
        bool: {
            must: object[];
            should: object[];
        };
    };
    aggs: Record<string, any>;
    from?: number;
    size?: number;
    track_scores?: boolean;
    sort?: ESRequestSortField;
    search_after?: ESRequestSortField;
};

/**
 * ***********************************
 * ES Response
 * ***********************************
 */

export type AllRangeAggregationResults = RawRangeBoundResult | RawRangeDistributionResult;
export type ESResponse<Source extends object = object> = {
    took: number;
    timed_out: boolean;
    _shards: {total: number; successful: number; skipped: number; failed: number};
    hits: {total: number; max_score: number; hits: Array<ESHit<Source>>};
    aggregations?: {
        [boundary: string]: AllRangeAggregationResults;
    };
};

export type ESHit<Source extends object = object> = {
    _index: string;
    _type: string;
    _id: string;
    _score: number;
    _source: Source;
    sort: ESRequestSortField;
};

/**
 * ***********************************
 * Client
 * ***********************************
 */
export interface IClient<Source extends object = object> {
    search: (request: ESRequest) => Promise<ESResponse<Source>>;
    mapping: () => Promise<Record<string, ESMappingType>>;
}

/**
 * ***********************************
 * ES Mapping
 * ***********************************
 */

export type ESMappingType = 'long' | 'double' | 'integer' | 'keyword' | 'text';

/**
 * ***********************************
 * Base Filter
 * ***********************************
 */
export type FilterKind = 'should' | 'must';

export type BaseFilterConfig = {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    aggsEnabled?: boolean;
};

export type FieldFilterConfigs<Fields extends string, Config extends BaseFilterConfig> = {
    [esFieldName in Fields]: Required<Config>;
};

export type PartialFieldFilterConfigs<Fields extends string, Config extends BaseFilterConfig> = {
    [esFieldName in Fields]: Config;
};

export type FieldFilters<Fields extends string, Filter extends object> = {
    [esFieldName in Fields]: Filter | undefined;
};

/**
 * A subscriber that will get notified when a field changes
 */
export type FieldFilterSubscribers<Fields extends string> = (
    filterKind: string,
    fieldName: Fields
) => void;

/**
 * ***********************************
 * Base Suggestion
 * ***********************************
 */

export type SuggestionKind = 'should' | 'must';

export type BaseSuggestionConfig = {
    field: string;
    defaultSuggestionKind?: 'should' | 'must';
    enabled?: boolean;
};

export type FieldSuggestionConfigs<Fields extends string, Config extends BaseSuggestionConfig> = {
    [esFieldName in Fields]: Required<Config>;
};

export type PartialFieldSuggestionConfigs<
    Fields extends string,
    Config extends BaseSuggestionConfig
> = {
    [esFieldName in Fields]: Config;
};

export type Suggestion = Array<{suggestion: string; count: number}>; // array of suggestions ordered best to worst

export type FieldSuggestions<Fields extends string> = {
    [esFieldName in Fields]: Suggestion | undefined;
};

export type FieldSearches<Fields extends string> = {
    [esFieldName in Fields]: string;
};

/**
 * A subscriber that will get notified when a field changes
 */
export type FieldSuggestionSubscribers<Fields extends string> = (
    suggestionKind: string,
    fieldName: Fields
) => void;

/**
 * ***********************************
 * Generic to Filters and Suggestions
 * ***********************************
 */

export type FieldKinds<Fields extends string> = {
    [esFieldName in Fields]: FilterKind | undefined;
};
