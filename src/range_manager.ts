import {runInAction, reaction} from 'mobx';
import {objKeys} from 'utils';

type FilterKind = 'should' | 'must';

type GreaterThenFilter = {
    greaterThen: number;
};

function isGreaterThenFilter(filter: GreaterThenFilter | {}): filter is GreaterThenFilter {
    return (filter as GreaterThenFilter).greaterThen !== undefined;
}

type GreaterThenEqualFilter = {
    greaterThenEqual: number;
};

function isGreaterThenEqualFilter(
    filter: GreaterThenEqualFilter | {}
): filter is GreaterThenEqualFilter {
    return (filter as GreaterThenEqualFilter).greaterThenEqual !== undefined;
}

type LessThenFilter = {
    lessThen: number;
};

function isLessThenFilter(filter: LessThenFilter | {}): filter is LessThenFilter {
    return (filter as LessThenFilter).lessThen !== undefined;
}

type LessThenEqualFilter = {
    lessThenEqual: number;
};

function isLessThenEqualFilter(filter: LessThenEqualFilter | {}): filter is LessThenEqualFilter {
    return (filter as LessThenEqualFilter).lessThenEqual !== undefined;
}

type RangeFilter = (GreaterThenFilter | GreaterThenEqualFilter | {}) &
    (LessThenFilter | LessThenEqualFilter | {});

const DEFAULT_RANGE_CONFIG = {
    defaultFilterType: 'should',
    getDistribution: true,
    getRangeBounds: true
};
type RangeConfig = {
    field: string;
    defaultFilterType?: 'should' | 'must';
    getDistribution?: boolean;
    getRangeBounds?: boolean;
    rangeInterval?: number;
};

type RangeConfigs<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeConfig;
};

type RangeFilterKinds<RangeFields extends string> = {
    [esFieldName in RangeFields]: FilterKind;
};

type RangeDefault = {
    min: number;
    max: number;
};

type RangeDefaults<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeDefault;
};

// tslint:disable-next-line
type RangeFilters<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeFilter;
};

type RawRangeDistributionResult = {
    buckets: Array<{
        key: number;
        doc_count: number;
    }>;
};
type RangeDistributionResult = {
    value: number;
    count: number;
};

type RangeDistributionResults<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeDistributionResult;
};

type ESRequest = {
    query: {
        must: object[];
        should: object[];
    };
    aggs: object;
};

type AllAggregationResults = RawRangeBoundResult | RawRangeDistributionResult;
type ESResponse = {
    aggregations: {
        [boundary: string]: AllAggregationResults;
    };
};

function isHistResult(
    result: AllAggregationResults | RawRangeDistributionResult
): result is RawRangeDistributionResult {
    return (result as RawRangeDistributionResult).buckets !== undefined;
}

const convertGreaterRanges = (filter: RangeFilter) => {
    if (isGreaterThenFilter(filter)) {
        return {gt: filter.greaterThen};
    } else if (isGreaterThenEqualFilter(filter)) {
        return {gte: filter.greaterThenEqual};
    } else {
        return undefined;
    }
};

const convertLesserRanges = (filter: RangeFilter) => {
    if (isLessThenFilter(filter)) {
        return {lt: filter.lessThen};
    } else if (isLessThenEqualFilter(filter)) {
        return {gt: filter.lessThenEqual};
    } else {
        return undefined;
    }
};
const convertRanges = (fieldName: string, filter: RangeFilter) => {
    const greaterRanges = convertGreaterRanges(filter);
    const lesserRanges = convertLesserRanges(filter);
    if (greaterRanges || lesserRanges) {
        return {range: {[`${fieldName}`]: {...greaterRanges, ...lesserRanges}}};
    } else {
        return undefined;
    }
};

type RawRangeBoundResult =
    | {
          value: number;
      }
    | {
          value: number;
          value_as_string: number;
      };

type RangeBoundResult = {
    min: {
        value: number;
        value_as_string?: string;
    };
    max: {
        value: number;
        value_as_string?: string;
    };
};

type RangeBoundResults<RangeFields extends string> = {
    [esFieldName in RangeFields]: RangeBoundResult;
};

class RangeManager<RangeFields extends string> {
    public rangeConfigs: RangeConfigs<RangeFields>;
    public rangeFilters: RangeFilters<RangeFields>;
    public rangeKinds: RangeFilterKinds<RangeFields>;
    public filteredRangeBounds: RangeBoundResults<RangeFields>;
    public unfilteredRangeBounds: RangeBoundResults<RangeFields>;
    public filteredDistribution: RangeDistributionResults<RangeFields>;
    public unfilteredDistribution: RangeDistributionResults<RangeFields>;

    constructor(fieldTypeConfigs: {rangeConfig?: RangeConfigs<RangeFields>}) {
        runInAction(() => {
            const {rangeConfig} = fieldTypeConfigs;
            if (rangeConfig) {
                this.setConfigs(rangeConfig);
            }
        });
    }

    public setConfigs = (rangeConfigs: RangeConfigs<RangeFields>): void => {
        runInAction(() => {
            this.rangeConfigs = objKeys(rangeConfigs).reduce((parsedConfig, field) => {
                const config = rangeConfigs[field];
                parsedConfig[field] = {
                    ...DEFAULT_RANGE_CONFIG,
                    ...config
                };
                return parsedConfig;
            }, {} as {[field in RangeFields]: Required<RangeConfig>});
        });
    };

    public setFilter = (field: RangeFields, filter: RangeFilter): void => {
        runInAction(() => {
            this.rangeFilters[field] = filter;
        });
    };

    public setKind = (field: RangeFields, kind: FilterKind): void => {
        runInAction(() => {
            this.rangeKinds[field] = kind;
        });
    };

    public addQueriesToESRequest = (request: ESRequest): ESRequest => {
        return objKeys(this.rangeFilters).reduce((acc, rangeFieldName) => {
            const filter = this.rangeFilters[rangeFieldName];
            const kind = this.rangeKinds[rangeFieldName];
            const range = convertRanges(rangeFieldName, filter);

            if (range) {
                return {
                    ...acc,
                    query: {
                        ...acc.query,
                        [kind]: [...acc.query[kind], range]
                    }
                };
            } else {
                return acc;
            }
        }, request);
    };

    public addBoundsAggsToEsRequest = (request: ESRequest): ESRequest => {
        return objKeys(this.rangeFilters).reduce((acc, rangeFieldName) => {
            const config = this.rangeConfigs[rangeFieldName];

            if (config.getRangeBounds) {
                return {
                    ...acc,
                    aggs: {
                        ...acc.aggs,
                        [`${rangeFieldName}__min`]: {
                            min: {
                                field: rangeFieldName
                            }
                        },
                        [`${rangeFieldName}__max`]: {
                            max: {
                                field: rangeFieldName
                            }
                        }
                    }
                };
            } else {
                return acc;
            }
        }, request);
    };

    public addHistogramAggsToEsRequest = (request: ESRequest): ESRequest => {
        return objKeys(this.rangeFilters).reduce((acc, rangeFieldName) => {
            const config = this.rangeConfigs[rangeFieldName];

            if (config.getDistribution) {
                if (!config.rangeInterval) {
                    throw new Error(`rangeInterval must be specified for ${rangeFieldName}`);
                }
                return {
                    ...acc,
                    aggs: {
                        ...acc.aggs,
                        [`${rangeFieldName}__hist`]: {
                            histogram: {
                                field: rangeFieldName,
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

    parseBoundsFromResponse = (isUnfilteredQuery: boolean, response: ESResponse): void => {
        // tslint:disable-next-line
        const rangeBounds = objKeys(this.rangeFilters).reduce((acc, rangeFieldName) => {
            const config = this.rangeConfigs[rangeFieldName];

            if (config.getRangeBounds) {
                const minResult = response.aggregations[`${rangeFieldName}__min`];
                const maxResult = response.aggregations[`${rangeFieldName}__max`];
                if (minResult && maxResult) {
                    return {
                        ...acc,
                        [rangeFieldName]: {
                            min: minResult,
                            max: maxResult
                        }
                    };
                } else if (minResult || maxResult) {
                    throw new Error(
                        `Only found one bound for field ${rangeFieldName}. Min: ${minResult}. Max: ${maxResult}`
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

    parseHistFromResponse = (isUnfilteredQuery: boolean, response: ESResponse): void => {
        // tslint:disable-next-line
        const rangeHist = objKeys(this.rangeFilters).reduce((acc, rangeFieldName) => {
            const config = this.rangeConfigs[rangeFieldName];

            if (config.getDistribution) {
                const histResult = response.aggregations[`${rangeFieldName}__hist`];
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

export default Manager;

type RF = 'engagementRate';
const defaultRangeConfig: RangeConfigs<RF> = {
    engagementRate: {
        field: 'engagement_rate',
        defaultFilterType: 'should',
        getDistribution: true,
        getRangeBounds: true
    }
};

const creatorCRMManager = new RangeManager<RF>({rangeConfig: defaultRangeConfig});

creatorCRMManager.setFilter('engagementRate', {
    greaterThenEqual: 0,
    lessThen: 0,
    kind: 'should'
});
