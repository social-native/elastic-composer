import {runInAction, decorate, observable, reaction, extendObservable, set, autorun} from 'mobx';
import {objKeys} from '../utils';
import {ESRequest, AllRangeAggregationResults, ESResponse} from '../types';

/**
 * Range config
 */
const DEFAULT_RANGE_CONFIG = {
    defaultFilterKind: 'should',
    getDistribution: true,
    getRangeBounds: true
};
export type RangeConfig = {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    getDistribution?: boolean;
    getRangeBounds?: boolean;
    rangeInterval?: number;
};

export type RangeConfigs<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeConfig;
};

/**
 * Range Filter
 */

export type GreaterThenFilter = {
    greaterThen: number;
};

export function isGreaterThenFilter(filter: GreaterThenFilter | {}): filter is GreaterThenFilter {
    return (filter as GreaterThenFilter).greaterThen !== undefined;
}

export type GreaterThenEqualFilter = {
    greaterThenEqual: number;
};

export function isGreaterThenEqualFilter(
    filter: GreaterThenEqualFilter | {}
): filter is GreaterThenEqualFilter {
    return (filter as GreaterThenEqualFilter).greaterThenEqual !== undefined;
}

export type LessThenFilter = {
    lessThen: number;
};

export function isLessThenFilter(filter: LessThenFilter | {}): filter is LessThenFilter {
    return (filter as LessThenFilter).lessThen !== undefined;
}

export type LessThenEqualFilter = {
    lessThenEqual: number;
};

export function isLessThenEqualFilter(
    filter: LessThenEqualFilter | {}
): filter is LessThenEqualFilter {
    return (filter as LessThenEqualFilter).lessThenEqual !== undefined;
}

export type Filter = (GreaterThenFilter | GreaterThenEqualFilter | {}) &
    (LessThenFilter | LessThenEqualFilter | {});

export type Filters<RangeFields extends string> = {
    [esFieldName in RangeFields]: Filter | undefined;
};

/**
 * Range Filter Utilities
 */
const convertGreaterRanges = (filter: Filter) => {
    if (isGreaterThenFilter(filter)) {
        return {gt: filter.greaterThen};
    } else if (isGreaterThenEqualFilter(filter)) {
        return {gte: filter.greaterThenEqual};
    } else {
        return undefined;
    }
};

const convertLesserRanges = (filter: Filter) => {
    if (isLessThenFilter(filter)) {
        return {lt: filter.lessThen};
    } else if (isLessThenEqualFilter(filter)) {
        return {gt: filter.lessThenEqual};
    } else {
        return undefined;
    }
};

const convertRanges = (fieldName: string, filter: Filter | undefined) => {
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

class RangeFilterClass<RangeFields extends string> {
    public rangeConfigs: RangeConfigs<RangeFields>;
    public rangeFilters: Filters<RangeFields>;
    public rangeKinds: RangeFilterKinds<RangeFields>;
    public filteredRangeBounds: RangeBoundResults<RangeFields>;
    public unfilteredRangeBounds: RangeBoundResults<RangeFields>;
    public filteredDistribution: RangeDistributionResults<RangeFields>;
    public unfilteredDistribution: RangeDistributionResults<RangeFields>;

    constructor(fieldTypeConfigs: {rangeConfig?: RangeConfigs<RangeFields>}) {
        runInAction(() => {
            this.rangeFilters = {} as Filters<RangeFields>;
            this.rangeKinds = {} as RangeFilterKinds<RangeFields>;
            this.filteredRangeBounds = {} as RangeBoundResults<RangeFields>;
            this.unfilteredRangeBounds = {} as RangeBoundResults<RangeFields>;
            this.filteredDistribution = {} as RangeDistributionResults<RangeFields>;
            this.unfilteredDistribution = {} as RangeDistributionResults<RangeFields>;
            const {rangeConfig} = fieldTypeConfigs;
            if (rangeConfig) {
                this.setConfigs(rangeConfig);
            }
        });
        reaction(
            () => ({...this.rangeFilters}),
            // this.rangeFilters => {
            filters => console.log('Filters cahngeddd', filters)
        );
    }

    public addToStartRequest = (request: ESRequest): ESRequest => {
        return [this.addDistributionsAggsToEsRequest, this.addBoundsAggsToEsRequest].reduce(
            (newRequest, fn) => fn(newRequest),
            request
        );
    };

    public parseStartResponse = (response: ESResponse): void => {
        [this.parseBoundsFromResponse, this.parseDistributionFromResponse].forEach(fn =>
            fn(true, response)
        );
    };

    public addToFilterRequest = (request: ESRequest): ESRequest => {
        return [
            this.addQueriesToESRequest,
            this.addDistributionsAggsToEsRequest,
            this.addBoundsAggsToEsRequest
        ].reduce((newRequest, fn) => fn(newRequest), request);
    };

    public parseFilterResponse = (response: ESResponse): void => {
        [this.parseBoundsFromResponse, this.parseDistributionFromResponse].forEach(fn =>
            fn(false, response)
        );
    };

    public setConfigs = (rangeConfigs: RangeConfigs<RangeFields>): void => {
        runInAction(() => {
            this.rangeConfigs = objKeys(rangeConfigs).reduce((parsedConfig, field) => {
                const config = rangeConfigs[field];
                const {rangeInterval} = config;
                if (!rangeInterval) {
                    throw new Error(`rangeInterval must be specified for ${field}`);
                }
                parsedConfig[field] = {
                    ...DEFAULT_RANGE_CONFIG,
                    ...config,
                    rangeInterval
                };
                return parsedConfig;
            }, {} as {[field in RangeFields]: Required<RangeConfig>});
        });

        runInAction(() => {
            objKeys(this.rangeConfigs).forEach(field => {
                const config = rangeConfigs[field];
                if (config.defaultFilterKind) {
                    this.setKind(field, config.defaultFilterKind);
                }
            });
        });
    };

    public setFilter = (field: RangeFields, filter: Filter): void => {
        runInAction(() => {
            set(this.rangeFilters, {
                [field]: filter
            });
            // this.rangeFilters[field] = filter;
            console.log('set filter', filter);
        });
    };

    public setKind = (field: RangeFields, kind: FilterKind): void => {
        runInAction(() => {
            this.rangeKinds[field] = kind;
        });
    };

    public addQueriesToESRequest = (request: ESRequest): ESRequest => {
        if (!this.rangeFilters) {
            return request;
        }
        // tslint:disable-next-line
        return objKeys(this.rangeConfigs).reduce((acc, rangeFieldName) => {
            if (!this.rangeFilters) {
                return acc;
            }
            const config = this.rangeConfigs[rangeFieldName];
            const name = config.field;

            const filter = this.rangeFilters[rangeFieldName];
            if (!filter) {
                return acc;
            }

            const kind = this.rangeKinds[rangeFieldName];
            if (!kind) {
                throw new Error(`kind is not set for range type ${rangeFieldName}`);
            }
            const range = convertRanges(name, filter);

            if (range) {
                return {
                    ...acc,
                    query: {
                        ...acc.query,
                        bool: {
                            ...acc.query.bool,
                            [kind as FilterKind]: [...acc.query.bool[kind as FilterKind], range]
                        }
                    }
                };
            } else {
                return acc;
            }
        }, request);
    };

    public addBoundsAggsToEsRequest = (request: ESRequest): ESRequest => {
        return objKeys(this.rangeConfigs || {}).reduce((acc, rangeFieldName) => {
            const config = this.rangeConfigs[rangeFieldName];
            const name = config.field;
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
        return objKeys(this.rangeConfigs || {}).reduce((acc, rangeFieldName) => {
            const config = this.rangeConfigs[rangeFieldName];
            const name = config.field;

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
        if (!this.rangeFilters) {
            return;
        }
        // tslint:disable-next-line
        const rangeBounds = objKeys(this.rangeFilters).reduce((acc, rangeFieldName) => {
            const config = this.rangeConfigs[rangeFieldName];
            const name = config.field;

            if (config.getRangeBounds) {
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

        console.log('LOOK AT ME', rangeBounds);

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
        if (!this.rangeFilters) {
            return;
        }
        // tslint:disable-next-line
        const rangeHist = objKeys(this.rangeFilters).reduce((acc, rangeFieldName) => {
            const config = this.rangeConfigs[rangeFieldName];
            const name = config.field;

            if (config.getDistribution) {
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
    rangeConfigs: observable,
    rangeFilters: observable,
    rangeKinds: observable,
    filteredRangeBounds: observable,
    unfilteredRangeBounds: observable,
    filteredDistribution: observable,
    unfilteredDistribution: observable
    // parseStartResponse: action,
    // parseFilterResponse: action,
    // setConfigs: action,
});

export default RangeFilterClass;

// type RF = 'engagementRate';
// const defaultRangeConfig: RangeConfigs<RF> = {
//     engagementRate: {
//         field: 'engagement_rate',
//         defaultFilterKind: 'should',
//         getDistribution: true,
//         getRangeBounds: true
//     }
// };

// const creatorCRMManager = new RangeManager<RF>({rangeConfig: defaultRangeConfig});

// creatorCRMManager.setFilter('engagementRate', {
//     greaterThenEqual: 0,
//     lessThen: 0,
//     kind: 'should'
// });
