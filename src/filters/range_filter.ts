import {runInAction, decorate, observable} from 'mobx';
import {objKeys} from '../utils';
import {ESRequest, AllRangeAggregationResults, ESResponse} from '../types';
import BaseFilter from './base';
import {decorateFilter} from './utils';

/**
 * Range config
 */
const RANGE_CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    getDistribution: true,
    getRangeBounds: true,
    rangeInterval: 1,
    aggsEnabled: false
};

export type RangeConfig = {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    getDistribution?: boolean;
    getRangeBounds?: boolean;
    rangeInterval?: number;
    aggsEnabled?: boolean;
};

export type RangeConfigs<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeConfig;
};

/**
 * Range Filter
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
 * Range Filter Utilities
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
 * Range Kind
 */
export type FilterKind = 'should' | 'must';

export type RangeFilterKinds<RangeFields extends string> = {
    [esFieldName in RangeFields]: FilterKind | undefined;
};

/**
 * Range Distribution
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

function isHistResult(
    result: AllRangeAggregationResults | RawRangeDistributionResult
): result is RawRangeDistributionResult {
    return (result as RawRangeDistributionResult).buckets !== undefined;
}

/**
 * Range Bounds
 */
export type RawRangeBoundResultBasic = {
    value: number;
};
export type RawRangeBoundResultWithString = {
    value: number;
    value_as_string: number;
};
export type RawRangeBoundResult = RawRangeBoundResultBasic | RawRangeBoundResultWithString;

function isRangeResult(
    result: AllRangeAggregationResults | RawRangeBoundResult
): result is RawRangeBoundResult {
    return (result as RawRangeBoundResult).value !== undefined;
}

function isRangeResultWithString(
    result: AllRangeAggregationResults | RawRangeBoundResultWithString
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
    RangeConfig,
    RangeFilter
> {
    public filteredRangeBounds: RangeBoundResults<RangeFields>;
    public unfilteredRangeBounds: RangeBoundResults<RangeFields>;
    public filteredDistribution: RangeDistributionResults<RangeFields>;
    public unfilteredDistribution: RangeDistributionResults<RangeFields>;

    constructor(
        defaultConfig?: Omit<Required<RangeConfig>, 'field'>,
        specificConfigs?: RangeConfigs<RangeFields>
    ) {
        super(
            'range',
            defaultConfig || (RANGE_CONFIG_DEFAULT as Omit<Required<RangeConfig>, 'field'>),
            specificConfigs as RangeConfigs<RangeFields>
        );
        runInAction(() => {
            this.filteredRangeBounds = {} as RangeBoundResults<RangeFields>;
            this.unfilteredRangeBounds = {} as RangeBoundResults<RangeFields>;
            this.filteredDistribution = {} as RangeDistributionResults<RangeFields>;
            this.unfilteredDistribution = {} as RangeDistributionResults<RangeFields>;
        });
    }

    /**
     * State that affects the global filters
     *
     * Changes to this state is tracked by the manager so that it knows when to run a new filter query
     * Ideally, this
     */
    public get shouldRunFilteredQueryAndAggs(): object {
        return {filters: {...super.fieldFilters}, kinds: {...super.fieldKinds}};
    }

    /**
     * ***************************************************************************
     * REQUEST BUILDERS
     * ***************************************************************************
     */

    public _addUnfilteredQueryAndAggsToRequest = (request: ESRequest): ESRequest => {
        return [this.addDistributionsAggsToEsRequest, this.addBoundsAggsToEsRequest].reduce(
            (newRequest, fn) => fn(newRequest),
            request
        );
    };

    public _addUnfilteredAggsToRequest = (request: ESRequest): ESRequest => {
        return [this.addDistributionsAggsToEsRequest, this.addBoundsAggsToEsRequest].reduce(
            (newRequest, fn) => fn(newRequest),
            request
        );
    };

    public _addFilteredQueryAndAggsToRequest = (request: ESRequest): ESRequest => {
        return [
            this.addQueriesToESRequest,
            this.addDistributionsAggsToEsRequest,
            this.addBoundsAggsToEsRequest
        ].reduce((newRequest, fn) => fn(newRequest), request);
    };

    public _addFilteredQueryToRequest = (request: ESRequest): ESRequest => {
        return [this.addQueriesToESRequest].reduce((newRequest, fn) => fn(newRequest), request);
    };

    /**
     * ***************************************************************************
     * RESPONSE PARSERS
     * ***************************************************************************
     */

    public _extractUnfilteredAggsStateFromResponse = (response: ESResponse): void => {
        [this.parseBoundsFromResponse, this.parseDistributionFromResponse].forEach(fn =>
            fn(true, response)
        );
    };

    public _extractFilteredAggsStateFromResponse = (response: ESResponse): void => {
        [this.parseBoundsFromResponse, this.parseDistributionFromResponse].forEach(fn =>
            fn(false, response)
        );
    };

    /**
     * ***************************************************************************
     * CUSTOM TO TEMPLATE
     * ***************************************************************************
     */

    public addQueriesToESRequest = (request: ESRequest): ESRequest => {
        if (!super.fieldFilters) {
            return request;
        }
        // tslint:disable-next-line
        return objKeys(super.fieldConfigs).reduce((acc, rangeFieldName) => {
            if (!super.fieldFilters) {
                return acc;
            }
            const config = super.fieldConfigs[rangeFieldName];
            const name = config.field;

            const filter = super.fieldFilters[rangeFieldName];
            if (!filter) {
                return acc;
            }

            const kind = super.kindForField(rangeFieldName);
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

    public addBoundsAggsToEsRequest = (request: ESRequest): ESRequest => {
        return objKeys(super.fieldConfigs || {}).reduce((acc, rangeFieldName) => {
            const config = super.fieldConfigs[rangeFieldName];
            const name = config.field;
            if (!config.aggsEnabled) {
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

    public addDistributionsAggsToEsRequest = (request: ESRequest): ESRequest => {
        return objKeys(super.fieldConfigs || {}).reduce((acc, rangeFieldName) => {
            const config = super.fieldConfigs[rangeFieldName];
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

    public parseBoundsFromResponse = (isUnfilteredQuery: boolean, response: ESResponse): void => {
        if (!super.fieldFilters) {
            return;
        }
        // tslint:disable-next-line
        const rangeBounds = objKeys(super.fieldConfigs).reduce((acc, rangeFieldName) => {
            const config = super.fieldConfigs[rangeFieldName];
            const name = config.field;

            if (config.getRangeBounds && response.aggregations) {
                console.log('resssss', response);
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
                } else if (minResult || maxResult) {
                    throw new Error(
                        `Only found one bound for field ${name}. Min: ${minResult}. Max: ${maxResult}`
                    );
                } else {
                    return acc;
                }
            } else {
                return acc;
            }
        }, {} as RangeBoundResults<RangeFields>);

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

    public parseDistributionFromResponse = (
        isUnfilteredQuery: boolean,
        response: ESResponse
    ): void => {
        if (!super.fieldFilters) {
            return;
        }
        // tslint:disable-next-line
        const rangeHist = objKeys(super.fieldConfigs).reduce((acc, rangeFieldName) => {
            const config = super.fieldConfigs[rangeFieldName];
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
        }, {} as RangeDistributionResults<RangeFields>);

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

decorateFilter(RangeFilterClass);

export default RangeFilterClass;
