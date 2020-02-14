import {runInAction, decorate, observable, set, toJS, reaction} from 'mobx';
import {objKeys} from '../utils';
import {
    ESRequest,
    ESResponse,
    FilterKind,
    BaseFilterConfig,
    IBaseOptions,
    ESMappingType,
    MultiSelectSubFieldFilterValue,
    MultiSelectFieldFilter,
    RawMultiSelectAggs
} from '../types';
import BaseFilter from './base';
import utils from './utils';

/**
 * Config
 */
const CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    defaultFilterInclusion: 'include',
    getCount: true,
    aggsEnabled: false
};

export interface IConfig extends BaseFilterConfig {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    defaultFilterInclusion?: 'include' | 'exclude';
    getCount?: boolean;
    aggsEnabled?: boolean;
}

export type IConfigs<Fields extends string> = {
    [esFieldName in Fields]: IConfig;
};

/**
 *  Results
 */

export type MultiSelectCountResult = {
    [selectedValue: string]: number;
};

export type CountResults<Fields extends string> = {
    [esFieldName in Fields]: MultiSelectCountResult;
};

// use with all fields b/c exists can check any field data value for existence
export const shouldUseField = (_fieldName: string, fieldType: ESMappingType) =>
    fieldType === 'keyword' || fieldType === 'text';

class MultiSelectFilter<Fields extends string> extends BaseFilter<
    Fields,
    IConfig,
    MultiSelectFieldFilter
> {
    public filteredCount: CountResults<Fields>;
    public unfilteredCount: CountResults<Fields>;

    constructor(
        defaultConfig?: Omit<Required<IConfig>, 'field'>,
        specificConfigs?: IConfigs<Fields>,
        options?: IBaseOptions
    ) {
        super(
            'multiselect',
            defaultConfig || (CONFIG_DEFAULT as Omit<Required<IConfig>, 'field'>),
            specificConfigs as IConfigs<Fields>
        );
        runInAction(() => {
            this._shouldUseField = (options && options.shouldUseField) || shouldUseField;
            this.filteredCount = {} as CountResults<Fields>;
            this.unfilteredCount = {} as CountResults<Fields>;
        });

        reaction(
            () => {
                const filteredCountFieldNames = objKeys(this.filteredCount);

                const fieldsMissingUnfilteredCounts = filteredCountFieldNames.reduce(
                    (acc, fieldName) => {
                        const filteredSubFieldNameValues = Object.keys(
                            this.filteredCount[fieldName] || {}
                        );
                        const unfilteredSubFieldNameObj = this.unfilteredCount[fieldName] || {};

                        const fieldIsMissingUnfilteredCounts = filteredSubFieldNameValues.reduce(
                            (missingUnfilteredCounts, name) => {
                                if (unfilteredSubFieldNameObj[name] === undefined) {
                                    return true;
                                } else {
                                    return missingUnfilteredCounts;
                                }
                            },
                            false
                        );

                        if (fieldIsMissingUnfilteredCounts) {
                            return [...acc, fieldName];
                        } else {
                            return acc;
                        }
                    },
                    [] as string[]
                );

                return fieldsMissingUnfilteredCounts;
            },
            fieldsMissingUnfilteredCounts => {
                if (fieldsMissingUnfilteredCounts && fieldsMissingUnfilteredCounts.length > 0) {
                    fieldsMissingUnfilteredCounts.forEach(field => {
                        this._shouldUpdateUnfilteredAggsSubscribers.forEach(s =>
                            s(this.filterKind, field as Fields)
                        );
                    });
                }
            }
        );
    }

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
        return [this._addCountAggsToEsRequest].reduce((newRequest, fn) => fn(newRequest), request);
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
        return [this._addCountAggsToEsRequest].reduce(
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
        return [this._addQueriesToESRequest, this._addCountAggsToEsRequest].reduce(
            (newRequest, fn) => fn(newRequest, fieldToFilterOn),
            request
        );
    };

    /**
     * Transforms the request obj.
     *
     * Adds query and aggs to the request.
     */
    public _addFilteredQueryAndAggsToRequest = (request: ESRequest): ESRequest => {
        return [this._addQueriesToESRequest, this._addCountAggsToEsRequest].reduce(
            (newRequest, fn) => fn(newRequest),
            request
        );
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
        [this._parseCountFromResponse].forEach(fn => fn(true, response));
    };

    /**
     * Extracts filtered agg stats from a response obj.
     */
    public _extractFilteredAggsStateFromResponse = (response: ESResponse): void => {
        [this._parseCountFromResponse].forEach(fn => fn(false, response));
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
                throw new Error(`kind is not set for multi-select filter type ${fieldName}`);
            }

            if (filter) {
                return objKeys(filter as MultiSelectFieldFilter).reduce(
                    (newQuery, selectedValue) => {
                        const selectedValueFilter = filter[selectedValue];
                        const newFilter =
                            selectedValueFilter.inclusion === 'include'
                                ? {match: {[name]: selectedValue}}
                                : {bool: {must_not: {match: {[name]: selectedValue}}}};
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
                    },
                    acc
                );
            } else {
                return acc;
            }
        }, request);
    };

    public _addCountAggsToEsRequest = (request: ESRequest, fieldToFilterOn?: string): ESRequest => {
        // tslint:disable-next-line
        return objKeys(this.fieldConfigs || {}).reduce((acc, fieldName) => {
            if (fieldToFilterOn && fieldName !== fieldToFilterOn) {
                return acc;
            }
            const config = this.fieldConfigs[fieldName];

            const name = config.field;
            if (!config || !config.aggsEnabled) {
                return acc;
            }

            const filter = this.fieldFilters[fieldName];
            if (!filter) {
                return acc;
            }
            const valuesToFilterOn = objKeys(filter as MultiSelectFieldFilter);

            const aggsToAdd = valuesToFilterOn.reduce((aggFilters, value) => {
                return {
                    ...aggFilters,
                    [value]: {
                        match: {
                            [name]: value
                        }
                    }
                };
            }, {});

            if (config.getCount) {
                return {
                    ...acc,
                    aggs: {
                        ...acc.aggs,
                        [`${name}__multiselect_count`]: {
                            filters: {
                                filters: aggsToAdd
                            }
                        }
                    }
                };
            } else {
                return acc;
            }
        }, request);
    };

    public _parseCountFromResponse = (isUnfilteredQuery: boolean, response: ESResponse): void => {
        if (!this.fieldFilters) {
            return;
        }
        const existingCount = isUnfilteredQuery ? this.unfilteredCount : this.filteredCount;
        const count = objKeys(this.fieldConfigs).reduce(
            // tslint:disable-next-line
            (acc, multiselectFieldName) => {
                const config = this.fieldConfigs[multiselectFieldName];
                const name = config.field;
                if (config.getCount && response.aggregations) {
                    const allCounts = response.aggregations[
                        `${name}__multiselect_count`
                    ] as RawMultiSelectAggs;
                    if (allCounts && allCounts.buckets) {
                        const countedSelections = Object.keys(allCounts.buckets);
                        const countsForSelections = countedSelections.reduce(
                            (newState, selection) => {
                                return {
                                    ...newState,
                                    [selection]: allCounts.buckets[selection as any].doc_count
                                };
                            },
                            {}
                        );

                        return {
                            ...acc,
                            [multiselectFieldName]: countsForSelections
                        };
                    } else {
                        return acc;
                    }
                } else {
                    return acc;
                }
            },
            {...existingCount} as CountResults<Fields>
        );
        if (isUnfilteredQuery) {
            runInAction(() => {
                this.unfilteredCount = count;
            });
        } else {
            runInAction(() => {
                this.filteredCount = count;
            });
        }
    };
}

decorate(MultiSelectFilter, {
    filteredCount: observable,
    unfilteredCount: observable
});

utils.decorateFilter(MultiSelectFilter);

export default MultiSelectFilter;
