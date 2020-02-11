import {runInAction, decorate, observable} from 'mobx';
import {objKeys} from '../utils';
import {ESRequest, ESResponse, FilterKind, BaseFilterConfig, AggregationResults} from '../types';
import BaseFilter from './base';
import utils from './utils';

/**
 * Config
 */
const RANGE_CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    getDistribution: true,
    getRangeBounds: true,
    rangeInterval: 1,
    aggsEnabled: false
};

export interface IRangeConfig extends BaseFilterConfig {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    getDistribution?: boolean;
    getRangeBounds?: boolean;
    rangeInterval?: number;
    aggsEnabled?: boolean;
}

export type IRangeConfigs<RangeFields extends string> = {
    [esFieldName in RangeFields]: IRangeConfig;
};

/**
 * Filter
 */

export type GreaterThanFilter = {
    greaterThan: number;
};

export function isGreaterThanFilter(filter: GreaterThanFilter | {}): filter is GreaterThanFilter {
    return (filter as GreaterThanFilter).greaterThan !== undefined;
}

export type GreaterThanEqualFilter = {
    greaterThanEqual: number;
};

export function isGreaterThanEqualFilter(
    filter: GreaterThanEqualFilter | {}
): filter is GreaterThanEqualFilter {
    return (filter as GreaterThanEqualFilter).greaterThanEqual !== undefined;
}

export type LessThanFilter = {
    lessThan: number;
};

export function isLessThanFilter(filter: LessThanFilter | {}): filter is LessThanFilter {
    return (filter as LessThanFilter).lessThan !== undefined;
}

export type LessThanEqualFilter = {
    lessThanEqual: number;
};

export function isLessThanEqualFilter(
    filter: LessThanEqualFilter | {}
): filter is LessThanEqualFilter {
    return (filter as LessThanEqualFilter).lessThanEqual !== undefined;
}

export type RangeFilter = (GreaterThanFilter | GreaterThanEqualFilter | {}) &
    (LessThanFilter | LessThanEqualFilter | {});

export type Filters<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeFilter | undefined;
};

/**
 * Filter Utilities
 */
const convertGreaterRanges = (filter: RangeFilter) => {
    if (isGreaterThanFilter(filter)) {
        return {gt: filter.greaterThan};
    } else if (isGreaterThanEqualFilter(filter)) {
        return {gte: filter.greaterThanEqual};
    } else {
        return undefined;
    }
};

const convertLesserRanges = (filter: RangeFilter) => {
    if (isLessThanFilter(filter)) {
        return {lt: filter.lessThan};
    } else if (isLessThanEqualFilter(filter)) {
        return {gt: filter.lessThanEqual};
    } else {
        return undefined;
    }
};

const convertRanges = (fieldName: string, filter: RangeFilter | undefined) => {
    if (!filter) {
        return undefined;
    }
    const greaterRanges = convertGreaterRanges(filter);
    const lesserRanges = convertLesserRanges(filter);
    if (greaterRanges || lesserRanges) {
        return {range: {[`${fieldName}`]: {...greaterRanges, ...lesserRanges}}};
    } else {
        return undefined;
    }
};

/**
 * Kind
 */

export type RangeFilterKinds<RangeFields extends string> = {
    [esFieldName in RangeFields]: FilterKind | undefined;
};

/**
 * Results - Distribution
 */
export type RawRangeDistributionResult = {
    buckets: Array<{
        key: number;
        doc_count: number;
    }>;
};
export type RangeDistributionResult = Array<{
    key: number;
    doc_count: number;
}>;

export type RangeDistributionResults<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeDistributionResult;
};

function isHistResult(result: AggregationResults): result is RawRangeDistributionResult {
    return (result as RawRangeDistributionResult).buckets !== undefined;
}

/**
 * Results - Bounds
 */
export type RawRangeBoundResultBasic = {
    value: number;
};
export type RawRangeBoundResultWithString = {
    value: number;
    value_as_string: number;
};
export type RawRangeBoundResult = RawRangeBoundResultBasic | RawRangeBoundResultWithString;

function isRangeResult(result: AggregationResults): result is RawRangeBoundResult {
    return (result as RawRangeBoundResult).value !== undefined;
}

function isRangeResultWithString(
    result: AggregationResults
): result is RawRangeBoundResultWithString {
    return (result as RawRangeBoundResultWithString).value_as_string !== undefined;
}

export type RangeBoundResult = {
    min: {
        value: number;
        value_as_string?: string;
    };
    max: {
        value: number;
        value_as_string?: string;
    };
};

export type RangeBoundResults<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeBoundResult;
};

class RangeFilterClass<RangeFields extends string> extends BaseFilter<
    RangeFields,
    IRangeConfig,
    RangeFilter
> {
    public filteredRangeBounds: RangeBoundResults<RangeFields>;
    public unfilteredRangeBounds: RangeBoundResults<RangeFields>;
    public filteredDistribution: RangeDistributionResults<RangeFields>;
    public unfilteredDistribution: RangeDistributionResults<RangeFields>;

    constructor(
        defaultConfig?: Omit<Required<IRangeConfig>, 'field'>,
        specificConfigs?: IRangeConfigs<RangeFields>
    ) {
        super(
            'range',
            defaultConfig || (RANGE_CONFIG_DEFAULT as Omit<Required<IRangeConfig>, 'field'>),
            specificConfigs as IRangeConfigs<RangeFields>
        );
        runInAction(() => {
            this.filteredRangeBounds = {} as RangeBoundResults<RangeFields>;
            this.unfilteredRangeBounds = {} as RangeBoundResults<RangeFields>;
            this.filteredDistribution = {} as RangeDistributionResults<RangeFields>;
            this.unfilteredDistribution = {} as RangeDistributionResults<RangeFields>;
        });
    }

    /**
     * State that should cause a global ES query request using all filters
     *
     * Changes to this state is tracked by the manager so that it knows when to run a new filter query
     */
    public get _shouldRunFilteredQueryAndAggs(): object {
        return {filters: {...this.fieldFilters}, kinds: {...this.fieldKinds}};
    }

    /**
     * ***************************************************************************
     * REQUEST BUILDERS
     * ***************************************************************************
     */

    /**
     * Transforms the request obj.
     *
     * Adds aggs to the request, but no query.
     */
    public _addUnfilteredQueryAndAggsToRequest = (request: ESRequest): ESRequest => {
        return [this._addDistributionsAggsToEsRequest, this._addBoundsAggsToEsRequest].reduce(
            (newRequest, fn) => fn(newRequest),
            request
        );
    };

    /**
     * Transforms the request obj.
     *
     * Adds aggs to the request, but no query.
     */
    public _addUnfilteredAggsToRequest = (
        request: ESRequest,
        fieldToFilterOn: string
    ): ESRequest => {
        return [this._addDistributionsAggsToEsRequest, this._addBoundsAggsToEsRequest].reduce(
            (newRequest, fn) => fn(newRequest, fieldToFilterOn),
            request
        );
    };

    /**
     * Transforms the request obj.
     *
     * Adds aggs to the request, but no query.
     */
    public _addFilteredAggsToRequest = (request: ESRequest, fieldToFilterOn: string): ESRequest => {
        return [
            this._addQueriesToESRequest,
            this._addDistributionsAggsToEsRequest,
            this._addBoundsAggsToEsRequest
        ].reduce((newRequest, fn) => fn(newRequest, fieldToFilterOn), request);
    };

    /**
     * Transforms the request obj.
     *
     * Adds query and aggs to the request.
     */
    public _addFilteredQueryAndAggsToRequest = (request: ESRequest): ESRequest => {
        return [
            this._addQueriesToESRequest,
            this._addDistributionsAggsToEsRequest,
            this._addBoundsAggsToEsRequest
        ].reduce((newRequest, fn) => fn(newRequest), request);
    };

    /**
     * Transforms the request obj.
     *
     * Adds query to the request, but no aggs.
     */
    public _addFilteredQueryToRequest = (request: ESRequest): ESRequest => {
        return [this._addQueriesToESRequest].reduce((newRequest, fn) => fn(newRequest), request);
    };

    /**
     * ***************************************************************************
     * RESPONSE PARSERS
     * ***************************************************************************
     */

    /**
     * Extracts unfiltered agg stats from a response obj.
     */
    public _extractUnfilteredAggsStateFromResponse = (response: ESResponse): void => {
        [this._parseBoundsFromResponse, this._parseDistributionFromResponse].forEach(fn =>
            fn(true, response)
        );
    };

    /**
     * Extracts filtered agg stats from a response obj.
     */
    public _extractFilteredAggsStateFromResponse = (response: ESResponse): void => {
        [this._parseBoundsFromResponse, this._parseDistributionFromResponse].forEach(fn =>
            fn(false, response)
        );
    };

    /**
     * ***************************************************************************
     * CUSTOM TO TEMPLATE
     * ***************************************************************************
     */

    public _addQueriesToESRequest = (request: ESRequest): ESRequest => {
        if (!this.fieldFilters) {
            return request;
        }
        // tslint:disable-next-line
        return objKeys(this.fieldConfigs).reduce((acc, rangeFieldName) => {
            if (!this.fieldFilters) {
                return acc;
            }
            const config = this.fieldConfigs[rangeFieldName];
            const name = config.field;

            const filter = this.fieldFilters[rangeFieldName];
            if (!filter) {
                return acc;
            }

            const kind = this.kindForField(rangeFieldName);
            if (!kind) {
                throw new Error(`kind is not set for range type ${rangeFieldName}`);
            }
            const range = convertRanges(name, filter);

            if (range) {
                const existingFiltersForKind = acc.query.bool[kind as FilterKind] || [];
                return {
                    ...acc,
                    query: {
                        ...acc.query,
                        bool: {
                            ...acc.query.bool,
                            [kind as FilterKind]: [...existingFiltersForKind, range]
                        }
                    }
                };
            } else {
                return acc;
            }
        }, request);
    };

    public _addBoundsAggsToEsRequest = (
        request: ESRequest,
        fieldToFilterOn?: string
    ): ESRequest => {
        // tslint:disable-next-line
        return objKeys(this.fieldConfigs || {}).reduce((acc, rangeFieldName) => {
            if (fieldToFilterOn && rangeFieldName !== fieldToFilterOn) {
                return acc;
            }
            const config = this.fieldConfigs[rangeFieldName];
            const name = config.field;
            if (!config || !config.aggsEnabled) {
                return acc;
            }
            if (config.getRangeBounds) {
                return {
                    ...acc,
                    aggs: {
                        ...acc.aggs,
                        [`${name}__min`]: {
                            min: {
                                field: name
                            }
                        },
                        [`${name}__max`]: {
                            max: {
                                field: name
                            }
                        }
                    }
                };
            } else {
                return acc;
            }
        }, request);
    };

    public _addDistributionsAggsToEsRequest = (
        request: ESRequest,
        fieldToFilterOn?: string
    ): ESRequest => {
        // tslint:disable-next-line
        return objKeys(this.fieldConfigs || {}).reduce((acc, rangeFieldName) => {
            if (fieldToFilterOn && rangeFieldName !== fieldToFilterOn) {
                return acc;
            }
            const config = this.fieldConfigs[rangeFieldName];
            const name = config.field;
            if (!config.aggsEnabled) {
                return acc;
            }
            if (config.getDistribution) {
                if (!config.rangeInterval) {
                    throw new Error(`rangeInterval must be specified for ${name}`);
                }
                return {
                    ...acc,
                    aggs: {
                        ...acc.aggs,
                        [`${name}__hist`]: {
                            histogram: {
                                field: name,
                                interval: config.rangeInterval
                            }
                        }
                    }
                };
            } else {
                return acc;
            }
        }, request);
    };

    public _parseBoundsFromResponse = (isUnfilteredQuery: boolean, response: ESResponse): void => {
        if (!this.fieldFilters) {
            return;
        }
        const existingBounds = isUnfilteredQuery
            ? this.unfilteredRangeBounds
            : this.filteredRangeBounds;
        const rangeBounds = objKeys(this.fieldConfigs).reduce(
            // tslint:disable-next-line
            (acc, rangeFieldName) => {
                const config = this.fieldConfigs[rangeFieldName];
                const name = config.field;

                if (config.getRangeBounds && response.aggregations) {
                    const minResult = response.aggregations[`${name}__min`];
                    const maxResult = response.aggregations[`${name}__max`];
                    if (
                        minResult &&
                        maxResult &&
                        isRangeResult(minResult) &&
                        isRangeResult(maxResult)
                    ) {
                        return {
                            ...acc,
                            [rangeFieldName]: {
                                min: isRangeResultWithString(minResult)
                                    ? minResult.value_as_string
                                    : minResult.value,
                                max: isRangeResultWithString(maxResult)
                                    ? maxResult.value_as_string
                                    : maxResult.value
                            }
                        };
                    } else if (minResult && isRangeResult(minResult)) {
                        return {
                            ...acc,
                            [rangeFieldName]: {
                                ...existingBounds[rangeFieldName],
                                min: isRangeResultWithString(minResult)
                                    ? minResult.value_as_string
                                    : minResult.value
                            }
                        };
                    } else if (maxResult && isRangeResult(maxResult)) {
                        return {
                            ...acc,
                            [rangeFieldName]: {
                                ...existingBounds[rangeFieldName],
                                max: isRangeResultWithString(maxResult)
                                    ? maxResult.value_as_string
                                    : maxResult.value
                            }
                        };
                    } else {
                        return acc;
                    }
                } else {
                    return acc;
                }
            },
            {...existingBounds} as RangeBoundResults<RangeFields>
        );

        if (isUnfilteredQuery) {
            runInAction(() => {
                this.unfilteredRangeBounds = rangeBounds;
            });
        } else {
            runInAction(() => {
                this.filteredRangeBounds = rangeBounds;
            });
        }
    };

    public _parseDistributionFromResponse = (
        isUnfilteredQuery: boolean,
        response: ESResponse
    ): void => {
        if (!this.fieldFilters) {
            return;
        }

        const existingDistribution = isUnfilteredQuery
            ? this.unfilteredDistribution
            : this.filteredDistribution;
        // tslint:disable-next-line
        const rangeHist = objKeys(this.fieldConfigs).reduce(
            (acc, rangeFieldName) => {
                const config = this.fieldConfigs[rangeFieldName];
                const name = config.field;

                if (config.getDistribution && response.aggregations) {
                    const histResult = response.aggregations[`${name}__hist`];
                    if (histResult && isHistResult(histResult)) {
                        return {
                            ...acc,
                            [rangeFieldName]: histResult.buckets
                        };
                    } else {
                        return acc;
                    }
                } else {
                    return acc;
                }
            },
            {...existingDistribution} as RangeDistributionResults<RangeFields>
        );

        if (isUnfilteredQuery) {
            runInAction(() => {
                this.unfilteredDistribution = rangeHist;
            });
        } else {
            runInAction(() => {
                this.filteredDistribution = rangeHist;
            });
        }
    };
}

decorate(RangeFilterClass, {
    filteredRangeBounds: observable,
    unfilteredRangeBounds: observable,
    filteredDistribution: observable,
    unfilteredDistribution: observable
});

utils.decorateFilter(RangeFilterClass);

export default RangeFilterClass;
