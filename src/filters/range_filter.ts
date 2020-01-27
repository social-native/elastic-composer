import {runInAction, decorate, observable, set, computed} from 'mobx';
import {objKeys} from '../utils';
import {ESRequest, AllRangeAggregationResults, ESResponse} from '../types';

/**
 * Range config
 */
const RANGE_CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    getDistribution: true,
    getRangeBounds: true,
    rangeInterval: 1
};

export type RangeConfigDefault = {
    defaultFilterKind: 'should' | 'must';
    getDistribution: boolean;
    getRangeBounds: boolean;
    rangeInterval: number;
};

export type RangeConfig = {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    getDistribution?: boolean;
    getRangeBounds?: boolean;
    rangeInterval?: number;
};

export type RangeConfigs<RangeFields extends string> = {
    [esFieldName in RangeFields]: Required<RangeConfig>;
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

export type Filter = (GreaterThanFilter | GreaterThanEqualFilter | {}) &
    (LessThanFilter | LessThanEqualFilter | {});

export type Filters<RangeFields extends string> = {
    [esFieldName in RangeFields]: Filter | undefined;
};

/**
 * Range Filter Utilities
 */
const convertGreaterRanges = (filter: Filter) => {
    if (isGreaterThanFilter(filter)) {
        return {gt: filter.greaterThan};
    } else if (isGreaterThanEqualFilter(filter)) {
        return {gte: filter.greaterThanEqual};
    } else {
        return undefined;
    }
};

const convertLesserRanges = (filter: Filter) => {
    if (isLessThanFilter(filter)) {
        return {lt: filter.lessThan};
    } else if (isLessThanEqualFilter(filter)) {
        return {gt: filter.lessThanEqual};
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
    // Generic
    public fieldConfigDefault: RangeConfigDefault;
    public fieldConfigs: RangeConfigs<RangeFields>;
    public fieldKinds: RangeFilterKinds<RangeFields>;
    public fieldFilters: Filters<RangeFields>;

    // Specific
    public filteredRangeBounds: RangeBoundResults<RangeFields>;
    public unfilteredRangeBounds: RangeBoundResults<RangeFields>;
    public filteredDistribution: RangeDistributionResults<RangeFields>;
    public unfilteredDistribution: RangeDistributionResults<RangeFields>;

    constructor(defaultConfig?: RangeConfigDefault, specificConfigs?: RangeConfigs<RangeFields>) {
        runInAction(() => {
            // Generic
            this.fieldConfigDefault = defaultConfig || (RANGE_CONFIG_DEFAULT as RangeConfigDefault);
            this.fieldFilters = {} as Filters<RangeFields>;
            this.fieldKinds = {} as RangeFilterKinds<RangeFields>;
            this.fieldConfigs = {} as RangeConfigs<RangeFields>;
            if (specificConfigs) {
                this.setConfigs(specificConfigs);
            }

            // Specific
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
    public get filterAffectiveState(): object {
        return {filters: {...this.fieldFilters}, kinds: {...this.fieldKinds}};
    }

    /**
     * Transforms the request obj that is created `onStart` with the addition of specific aggs
     */
    public startRequestTransform = (request: ESRequest): ESRequest => {
        return [this.addDistributionsAggsToEsRequest, this.addBoundsAggsToEsRequest].reduce(
            (newRequest, fn) => fn(newRequest),
            request
        );
    };

    /**
     * Extracts state, relative to this filter type, from an elastic search response
     */
    public extractStateFromStartResponse = (response: ESResponse): void => {
        [this.parseBoundsFromResponse, this.parseDistributionFromResponse].forEach(fn =>
            fn(true, response)
        );
    };

    /**
     * Transforms the request, run on filter state change, with the addition of specific aggs and queries
     */
    public filterRequestTransform = (request: ESRequest): ESRequest => {
        return [
            this.addQueriesToESRequest,
            this.addDistributionsAggsToEsRequest,
            this.addBoundsAggsToEsRequest
        ].reduce((newRequest, fn) => fn(newRequest), request);
    };

    /**
     * Extracts state, relative to this filter type, from an elastic search response
     */
    public extractStateFromFilterResponse = (response: ESResponse): void => {
        [this.parseBoundsFromResponse, this.parseDistributionFromResponse].forEach(fn =>
            fn(false, response)
        );
    };

    /**
     * Transforms the request, run on pagination change, with the addition of queries
     */
    public paginationRequestTransform = (request: ESRequest): ESRequest => {
        return [this.addQueriesToESRequest].reduce((newRequest, fn) => fn(newRequest), request);
    };

    /**
     * Returns any config obj that has the same filter name or field name as the passed in field
     */
    public findConfigForField = (field: RangeFields): RangeConfig | undefined => {
        const foundFilterName = objKeys(this.fieldConfigs).find(filterName => {
            const config = this.fieldConfigs[filterName];
            return config.field === field || filterName === field;
        });
        if (foundFilterName) {
            return this.fieldConfigs[foundFilterName];
        } else {
            return undefined;
        }
    };
    /**
     * Creates configs for the passed in fields.
     * Uses the default config unless an override config has already been specified.
     */
    public addConfigForField = (field: RangeFields): void => {
        const configAlreadyExists = this.findConfigForField(field);
        if (!configAlreadyExists) {
            runInAction(() => {
                this.fieldConfigs = {...this.fieldConfigs, ...this.fieldConfigDefault, field};
            });

            // runInAction(() => {
            //     this.setKind(field, this.fieldConfigDefault.defaultFilterKind);
            // });
        }
    };

    /**
     * Sets the config for a filter
     */
    public setConfigs = (fieldConfigs: RangeConfigs<RangeFields>): void => {
        runInAction(() => {
            this.fieldConfigs = objKeys(fieldConfigs).reduce((parsedConfig, field) => {
                const config = fieldConfigs[field];
                const {rangeInterval} = config;
                if (!rangeInterval) {
                    throw new Error(`rangeInterval must be specified for ${field}`);
                }
                parsedConfig[field] = {
                    ...RANGE_CONFIG_DEFAULT,
                    ...config,
                    rangeInterval
                };
                return parsedConfig;
            }, {} as {[field in RangeFields]: Required<RangeConfig>});
        });

        // runInAction(() => {
        //     objKeys(this.fieldConfigs).forEach(field => {
        //         const config = fieldConfigs[field];
        //         if (config.defaultFilterKind) {
        //             this.setKind(field, config.defaultFilterKind);
        //         }
        //     });
        // });
    };

    public setFilter = (field: RangeFields, filter: Filter): void => {
        runInAction(() => {
            set(this.fieldFilters, {
                [field]: filter
            });
        });
    };

    public clearFilter = (field: RangeFields): void => {
        runInAction(() => {
            delete this.fieldFilters[field];
        });
    };

    public setKind = (field: RangeFields, kind: FilterKind): void => {
        runInAction(() => {
            this.fieldKinds[field] = kind;
        });
    };

    /**
     * Retrieves the kind of a filter field. Kinds are either specified explicitly on `fieldKinds`
     * or implicitly using the default filter kind.
     */
    public kindForField = (field: RangeFields): FilterKind => {
        const kind = this.fieldKinds[field];
        if (kind === undefined) {
            return this.fieldConfigDefault.defaultFilterKind;
        } else {
            return kind as FilterKind;
        }
    };

    public addQueriesToESRequest = (request: ESRequest): ESRequest => {
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

    public addBoundsAggsToEsRequest = (request: ESRequest): ESRequest => {
        return objKeys(this.fieldConfigs || {}).reduce((acc, rangeFieldName) => {
            const config = this.fieldConfigs[rangeFieldName];
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
        return objKeys(this.fieldConfigs || {}).reduce((acc, rangeFieldName) => {
            const config = this.fieldConfigs[rangeFieldName];
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
        if (!this.fieldFilters) {
            return;
        }
        // tslint:disable-next-line
        const rangeBounds = objKeys(this.fieldConfigs).reduce((acc, rangeFieldName) => {
            const config = this.fieldConfigs[rangeFieldName];
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
        if (!this.fieldFilters) {
            return;
        }
        // tslint:disable-next-line
        const rangeHist = objKeys(this.fieldConfigs).reduce((acc, rangeFieldName) => {
            const config = this.fieldConfigs[rangeFieldName];
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
    filterAffectiveState: computed,
    fieldConfigs: observable,
    fieldFilters: observable,
    fieldKinds: observable,
    filteredRangeBounds: observable,
    unfilteredRangeBounds: observable,
    filteredDistribution: observable,
    unfilteredDistribution: observable
});

export default RangeFilterClass;
