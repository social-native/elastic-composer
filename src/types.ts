import {RawRangeBoundResult, RawRangeDistributionResult} from 'filters/range_filter';

/**
 * ES Request
 */
export type ESRequest = {
    query: {
        bool: {
            must: object[];
            should: object[];
        };
    };
    aggs: object;
};

/**
 * ES RESPONSE
 */
export type AllRangeAggregationResults = RawRangeBoundResult | RawRangeDistributionResult;
export type ESResponse = {
    aggregations: {
        [boundary: string]: AllRangeAggregationResults;
    };
};

/**
 * Client
 */
export interface IClient {
    query: (request: ESRequest) => Promise<ESResponse>;
}
