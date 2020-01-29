import {RawRangeBoundResult, RawRangeDistributionResult} from 'filters/range_filter';

/**
 * ES Request
 */

export type ESRequestSortField = Array<object | string>;

export type ESRequest = {
    query: {
        bool: {
            must: object[];
            should: object[];
        };
    };
    aggs: object;
    from?: number;
    size?: number;
    track_scores?: boolean;
    sort?: ESRequestSortField;
    search_after?: ESRequestSortField;
};

/**
 * ES RESPONSE
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
 * Client
 */
export interface IClient<Source extends object = object> {
    search: (request: ESRequest) => Promise<ESResponse<Source>>;
    mapping: () => Promise<Record<string, ESMappingType>>;
}

/**
 * ES Mapping
 */

export type ESMappingType = 'long' | 'double' | 'integer';

/**
 * Base Filter
 */

export type BaseConfig = {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    aggsEnabled?: boolean;
};

export type FieldConfigs<Fields extends string, Config extends BaseConfig> = {
    [esFieldName in Fields]: Required<Config>;
};

export type PartialFieldConfigs<Fields extends string, Config extends BaseConfig> = {
    [esFieldName in Fields]: Config;
};

export type FieldFilters<Fields extends string, Filter extends object> = {
    [esFieldName in Fields]: Filter | undefined;
};

export type FilterKind = 'should' | 'must';

export type FieldKinds<Fields extends string> = {
    [esFieldName in Fields]: FilterKind | undefined;
};
