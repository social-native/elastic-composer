import {runInAction, decorate, observable, set} from 'mobx';
import {objKeys} from '../utils';
import {
    ESRequest,
    ESResponse,
    FilterKind,
    BaseFilterConfig,
    IBaseOptions,
    ESMappingType,
    MultiSelectSubFieldFilterValue,
    DateRangeFieldFilter,
    FieldFilters,
    FieldKinds,
    GreaterThanFilter,
    GreaterThanEqualFilter,
    LessThanFilter,
    LessThanEqualFilter,
    DateRangeSubFieldFilter,
    AggregationResults,
    RawRangeDistributionAggs,
    RawRangeBoundAggs,
    RawRangeBoundAggsWithString
} from '../types';
import BaseFilter from './base';
import utils from './utils';

/**
 * Config
 */
const CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    defaultFilterInclusion: 'include',
    aggsEnabled: false,
    getDistribution: false,
    getRangeBounds: false,
    fieldNameModifierQuery: (fieldName: string) => fieldName,
    fieldNameModifierAggs: (fieldName: string) => fieldName
};

export interface IDateRangeConfig extends BaseFilterConfig {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    defaultFilterInclusion: 'include';
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
const convertGreaterRanges = (filter: DateRangeSubFieldFilter) => {
    if (isGreaterThanFilter(filter)) {
        return {gt: filter.greaterThan};
    } else if (isGreaterThanEqualFilter(filter)) {
        return {gte: filter.greaterThanEqual};
    } else {
        return undefined;
    }
};

const convertLesserRanges = (filter: DateRangeSubFieldFilter) => {
    if (isLessThanFilter(filter)) {
        return {lt: filter.lessThan};
    } else if (isLessThanEqualFilter(filter)) {
        return {lte: filter.lessThanEqual};
    } else {
        return undefined;
    }
};

const convertRanges = (fieldName: string, filter: DateRangeSubFieldFilter | undefined) => {
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
    fieldType === 'date';

// use with all fields b/c exists can check any field data value for existence
export const shouldUseField = (_fieldName: string, fieldType: ESMappingType) =>
    fieldType === 'date';

class DateRangeFilter<Fields extends string> extends BaseFilter<
    Fields,
    IDateRangeConfig,
    DateRangeFieldFilter
> {
    public filteredRangeBounds: RangeBoundResults<Fields>;
    public unfilteredRangeBounds: RangeBoundResults<Fields>;
    public filteredDistribution: RangeDistributionResults<Fields>;
    public unfilteredDistribution: RangeDistributionResults<Fields>;

    constructor(
        defaultConfig?: Omit<Required<IDateRangeConfig>, 'field'>,
        specificConfigs?: IDateRangeConfigs<Fields>,
        options?: IBaseOptions
    ) {
        super(
            'date_range',
            defaultConfig ||
                (CONFIG_DEFAULT as Omit<
                    Required<IDateRangeConfig>,
                    'field' | 'calendarInterval' | 'fixedInterval'
                >),
            specificConfigs as IDateRangeConfigs<Fields>
        );
        runInAction(() => {
            this._shouldUseField = (options && options.shouldUseField) || shouldUseField;
            this.filteredRangeBounds = {} as RangeBoundResults<Fields>;
            this.unfilteredRangeBounds = {} as RangeBoundResults<Fields>;
            this.filteredDistribution = {} as RangeDistributionResults<Fields>;
            this.unfilteredDistribution = {} as RangeDistributionResults<Fields>;
        });
    }

    public userState(): {
        fieldKinds?: FieldKinds<Fields>;
        fieldFilters?: FieldFilters<Fields, DateRangeFieldFilter>;
    } | void {
        const kinds = Object.keys(this.fieldFilters).reduce((fieldKinds, fieldName) => {
            return {
                ...fieldKinds,
                [fieldName]: this.kindForField(fieldName as Fields)
            };
        }, {} as FieldKinds<Fields>);

        const fieldFilters = Object.keys(this.fieldFilters).reduce((fieldFilterAcc, fieldName) => {
            const filter = this.fieldFilters[fieldName as Fields] as DateRangeFieldFilter;
            if (filter && Object.keys(filter).length > 0) {
                return {
                    ...fieldFilterAcc,
                    [fieldName]: filter
                };
            } else {
                return fieldFilterAcc;
            }
        }, {} as FieldFilters<Fields, DateRangeFieldFilter>);

        if (Object.keys(kinds).length > 0 && Object.keys(fieldFilters).length > 0) {
            return {
                fieldKinds: kinds,
                fieldFilters
            };
        } else if (Object.keys(kinds).length > 0) {
            return {
                fieldKinds: kinds
            };
        } else if (Object.keys(fieldFilters).length > 0) {
            return {
                fieldFilters
            };
        } else {
            return;
        }
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
            this.fieldFilters = {} as FieldFilters<Fields, DateRangeFieldFilter>;
            this.filteredRangeBounds = {} as RangeBoundResults<Fields>;
            this.unfilteredRangeBounds = {} as RangeBoundResults<Fields>;
            this.filteredDistribution = {} as RangeDistributionResults<Fields>;
            this.unfilteredDistribution = {} as RangeDistributionResults<Fields>;
        });
    };

    /**
     * Sets a sub filter for a field.
     */
    public addToFilter(
        field: Fields,
        subFilterName: string,
        subFilterValue: MultiSelectSubFieldFilterValue
    ): void {
        runInAction(() => {
            const subFilters = this.fieldFilters[field];
            const newSubFilters = {
                ...subFilters,
                [subFilterName]: subFilterValue
            };
            set(this.fieldFilters, {
                [field]: newSubFilters
            });
        });
    }

    /**
     * Deletes a sub filter for a field.
     */
    public removeFromFilter(field: Fields, subFilterName: string): void {
        runInAction(() => {
            const subFilters = this.fieldFilters[field];
            if (!subFilters) {
                return;
            }

            delete subFilters[subFilterName];

            set(this.fieldFilters, {
                [field]: subFilters
            });
        });
    }

    /**
     * State that should cause a global ES query request using all filters
     *
     * Changes to this state is tracked by the manager so that it knows when to run a new filter query
     */
    public get _shouldRunFilteredQueryAndAggs(): object {
        const fieldFilters = objKeys(this.fieldFilters).reduce((acc, fieldName) => {
            const subFields = this.fieldFilters[fieldName] as DateRangeFieldFilter;
            if (!subFields) {
                return {...acc};
            }
            // access sub field filters so those changes are tracked too
            const subFieldFilters = Object.keys(subFields).reduce((accc, subFieldName) => {
                return {
                    ...accc,
                    [`_$_${fieldName}-${subFieldName}`]: subFields[subFieldName]
                };
            }, {} as DateRangeFieldFilter);
            return {...acc, ...subFieldFilters};
        }, {});
        return {filters: {...fieldFilters}, kinds: {...this.fieldKinds}};
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
        return objKeys(this.fieldConfigs).reduce((acc, fieldName) => {
            if (!this.fieldFilters) {
                return acc;
            }
            const config = this.fieldConfigs[fieldName];
            const name = config.field;

            const filter = this.fieldFilters[fieldName];
            if (!filter) {
                return acc;
            }

            const kind = this.kindForField(fieldName);
            if (!kind) {
                throw new Error(`kind is not set for date range filter type ${fieldName}`);
            }

            if (filter) {
                return objKeys(filter as DateRangeFieldFilter).reduce((newQuery, selectedValue) => {
                    const selectedValueFilter = filter[selectedValue];
                    const range = convertRanges(name, selectedValueFilter);

                    const inclusion =
                        selectedValueFilter.inclusion || config.defaultFilterInclusion;
                    const newFilter =
                        inclusion === 'include'
                            ? range
                            : {
                                  bool: {
                                      must_not: range
                                  }
                              };
                    const kindForSelectedValue = selectedValueFilter.kind || kind;
                    const existingFiltersForKind =
                        newQuery.query.bool[kindForSelectedValue as FilterKind] || [];

                    return {
                        ...newQuery,
                        query: {
                            ...newQuery.query,
                            bool: {
                                ...newQuery.query.bool,
                                [kindForSelectedValue as FilterKind]: [
                                    ...existingFiltersForKind,
                                    newFilter
                                ]
                            }
                        }
                    };
                }, acc);
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
                        [`${name}__date_range_min`]: {
                            min: {
                                field: name
                            }
                        },
                        [`${name}__date_range_max`]: {
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
                        [`${name}__date_range_hist`]: {
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
                    const minResult = response.aggregations[`${name}__date_range_min`];
                    const maxResult = response.aggregations[`${name}__date_range_max`];
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
            {...existingBounds} as RangeBoundResults<Fields>
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
                    const histResult = response.aggregations[`${name}__date_range_hist`];
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
            {...existingDistribution} as RangeDistributionResults<Fields>
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

decorate(DateRangeFilter, {
    filteredRangeBounds: observable,
    unfilteredRangeBounds: observable,
    filteredDistribution: observable,
    unfilteredDistribution: observable
});

utils.decorateFilter(DateRangeFilter);

export default DateRangeFilter;
