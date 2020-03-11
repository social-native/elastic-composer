import {runInAction, decorate, observable} from 'mobx';
import {objKeys} from '../utils';
import {
    ESRequest,
    ESResponse,
    FilterKind,
    BaseFilterConfig,
    AggregationResults,
    ESMappingType,
    IBaseOptions,
    RawRangeDistributionAggs,
    RawRangeBoundAggs,
    RawRangeBoundAggsWithString,
    GreaterThanFilter,
    GreaterThanEqualFilter,
    LessThanEqualFilter,
    RangeFieldFilter,
    LessThanFilter,
    FieldFilters
} from '../types';
import BaseFilter from './base';
import utils from './utils';

/**
 * Config
 */
const DATE_RANGE_CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    getDistribution: true,
    getRangeBounds: true,
    calendarInterval: '1d',
    aggsEnabled: false
};

export interface IDateRangeConfig extends BaseFilterConfig {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    getDistribution?: boolean;
    getRangeBounds?: boolean;
    calendarInterval?:
        | 'm'
        | '1m'
        | 'h'
        | '1h'
        | 'd'
        | '1d'
        | 'w'
        | '1w'
        | 'M'
        | '1M'
        | 'q'
        | '1q'
        | 'y'
        | '1y';
    fixedInterval?: string;
    aggsEnabled?: boolean;
}

export type IDateRangeConfigs<DateRangeFields extends string> = {
    [esFieldName in DateRangeFields]: IDateRangeConfig;
};

/**
 * Typeguards
 */

export function isGreaterThanFilter(filter: GreaterThanFilter | {}): filter is GreaterThanFilter {
    return (filter as GreaterThanFilter).greaterThan !== undefined;
}

export function isGreaterThanEqualFilter(
    filter: GreaterThanEqualFilter | {}
): filter is GreaterThanEqualFilter {
    return (filter as GreaterThanEqualFilter).greaterThanEqual !== undefined;
}

export function isLessThanFilter(filter: LessThanFilter | {}): filter is LessThanFilter {
    return (filter as LessThanFilter).lessThan !== undefined;
}

export function isLessThanEqualFilter(
    filter: LessThanEqualFilter | {}
): filter is LessThanEqualFilter {
    return (filter as LessThanEqualFilter).lessThanEqual !== undefined;
}

/**
 * Filter Utilities
 */
const convertGreaterRanges = (filter: RangeFieldFilter) => {
    if (isGreaterThanFilter(filter)) {
        return {gt: filter.greaterThan};
    } else if (isGreaterThanEqualFilter(filter)) {
        return {gte: filter.greaterThanEqual};
    } else {
        return undefined;
    }
};

const convertLesserRanges = (filter: RangeFieldFilter) => {
    if (isLessThanFilter(filter)) {
        return {lt: filter.lessThan};
    } else if (isLessThanEqualFilter(filter)) {
        return {gt: filter.lessThanEqual};
    } else {
        return undefined;
    }
};

const convertRanges = (fieldName: string, filter: RangeFieldFilter | undefined) => {
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
 * Results - Distribution
 */

export type RangeDistributionResult = Array<{
    key: number;
    doc_count: number;
}>;

export type RangeDistributionResults<DateRangeFields extends string> = {
    [esFieldName in DateRangeFields]: RangeDistributionResult;
};

function isHistResult(result: AggregationResults): result is RawRangeDistributionAggs {
    return (result as RawRangeDistributionAggs).buckets !== undefined;
}

/**
 * Results - Bounds
 */

function isRangeResult(result: AggregationResults): result is RawRangeBoundAggs {
    return (result as RawRangeBoundAggs).value !== undefined;
}

function isRangeResultWithString(
    result: AggregationResults
): result is RawRangeBoundAggsWithString {
    return (result as RawRangeBoundAggsWithString).value_as_string !== undefined;
}

export type RangeBoundResult = {
    min: number;
    max: number;
};

export type RangeBoundResults<DateRangeFields extends string> = {
    [esFieldName in DateRangeFields]: RangeBoundResult;
};

export const rangeShouldUseFieldFn = (_fieldName: string, fieldType: ESMappingType) =>
    fieldType === 'long' ||
    fieldType === 'double' ||
    fieldType === 'integer' ||
    fieldType === 'float';

class DateRangeFilterClass<DateRangeFields extends string> extends BaseFilter<
    DateRangeFields,
    IDateRangeConfig,
    RangeFieldFilter
> {
    public filteredRangeBounds: RangeBoundResults<DateRangeFields>;
    public unfilteredRangeBounds: RangeBoundResults<DateRangeFields>;
    public filteredDistribution: RangeDistributionResults<DateRangeFields>;
    public unfilteredDistribution: RangeDistributionResults<DateRangeFields>;

    constructor(
        defaultConfig?: Omit<Required<IDateRangeConfig>, 'field'>,
        specificConfigs?: IDateRangeConfigs<DateRangeFields>,
        options?: IBaseOptions
    ) {
        super(
            'date_range',
            defaultConfig ||
                (DATE_RANGE_CONFIG_DEFAULT as Omit<Required<IDateRangeConfig>, 'field'>),
            specificConfigs as IDateRangeConfigs<DateRangeFields>
        );
        runInAction(() => {
            this._shouldUseField = (options && options.shouldUseField) || rangeShouldUseFieldFn;
            this.filteredRangeBounds = {} as RangeBoundResults<DateRangeFields>;
            this.unfilteredRangeBounds = {} as RangeBoundResults<DateRangeFields>;
            this.filteredDistribution = {} as RangeDistributionResults<DateRangeFields>;
            this.unfilteredDistribution = {} as RangeDistributionResults<DateRangeFields>;
        });
    }

    /**
     * Alias to getter b/c computed getters can't be inherited
     */

    public get fields() {
        return this._fields;
    }
    /**
     * Alias to getter b/c computed getters can't be inherited
     */
    public get activeFields() {
        return this._activeFields;
    }

    /**
     * Clears all field filters for this filter.
     * Clears all state related to aggregations.
     */
    public clearAllFieldFilters = () => {
        runInAction(() => {
            this.fieldFilters = {} as FieldFilters<DateRangeFields, RangeFieldFilter>;
            this.filteredRangeBounds = {} as RangeBoundResults<DateRangeFields>;
            this.unfilteredRangeBounds = {} as RangeBoundResults<DateRangeFields>;
            this.filteredDistribution = {} as RangeDistributionResults<DateRangeFields>;
            this.unfilteredDistribution = {} as RangeDistributionResults<DateRangeFields>;
        });
    };

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
                if (!config.calendarInterval && !config.fixedInterval) {
                    throw new Error(
                        `calendarInterval or fixedInterval must be specified for ${name}`
                    );
                }
                const interval = config.calendarInterval
                    ? {calendar_interval: config.calendarInterval}
                    : {fixed_interval: config.fixedInterval};

                return {
                    ...acc,
                    aggs: {
                        ...acc.aggs,
                        [`${name}__hist`]: {
                            date_histogram: {
                                ...interval,
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
            {...existingBounds} as RangeBoundResults<DateRangeFields>
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
            {...existingDistribution} as RangeDistributionResults<DateRangeFields>
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

decorate(DateRangeFilterClass, {
    filteredRangeBounds: observable,
    unfilteredRangeBounds: observable,
    filteredDistribution: observable,
    unfilteredDistribution: observable
});

utils.decorateFilter(DateRangeFilterClass);

export default DateRangeFilterClass;
