import {runInAction, decorate, observable} from 'mobx';
import {objKeys} from '../utils';
import {
    ESRequest,
    ESResponse,
    FilterKind,
    BaseFilterConfig,
    IBaseOptions,
    ESMappingType
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
    defaultFilterInclusion?: 'include' | 'exclude',
    getCount?: boolean;
    aggsEnabled?: boolean;
}

export type IConfigs<Fields extends string> = {
    [esFieldName in Fields]: IConfig;
};

/**
 * Filter
 */

export type Filter = {
    [selectedValue: string]: { inclusion: 'include' | 'exclude', kind?: 'should' | 'must' };
};

/**
 *  Results
 */
export type RawExistsCountResult = {
    buckets: Array<{
        key: 0 | 1;
        key_as_string: 'true' | 'false';
        doc_count: number;
    }>;
};

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
    Filter
> {
    public filteredCount: CountResults<Fields>;
    public unfilteredCount: CountResults<Fields>;

    constructor(
        defaultConfig?: Omit<Required<IConfig>, 'field'>,
        specificConfigs?: IConfigs<Fields>,
        options?: IBaseOptions
    ) {
        super(
            'exists',
            defaultConfig || (CONFIG_DEFAULT as Omit<Required<IConfig>, 'field'>),
            specificConfigs as IConfigs<Fields>
        );
        runInAction(() => {
            this._shouldUseField = (options && options.shouldUseField) || shouldUseField;
            this.filteredCount = {} as CountResults<Fields>;
            this.unfilteredCount = {} as CountResults<Fields>;
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
                throw new Error(`kind is not set for exits filter type ${fieldName}`);
            }

            if (filter) {
                return objKeys(filter as Filter).reduce((newQuery, selectedValue) => {
                    const selectedValueFilter = filter[selectedValue];
                    const newFilter = selectedValueFilter.inclusion === 'include' ? { match: { field: name }} : { must_not: { match: { field: name}}}
                    const kindForSelectedValue = selectedValueFilter.kind || kind;
                    const existingFiltersForKind = acc.query.bool[kindForSelectedValue as FilterKind] || [];
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
                }, acc)
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
            if (config.getCount) {
                return {
                    ...acc,
                    aggs: {
                        ...acc.aggs,
                        [`${name}__exists_doesnt_count`]: {
                            missing: {
                                field: name,
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
            (acc, booleanFieldName) => {
                const config = this.fieldConfigs[booleanFieldName];
                const name = config.field;
                if (config.getCount && response.aggregations) {
                    const allCounts = response.aggregations[
                        `${name}__exists_doesnt_count`
                    ] as RawExitsCountResult;
                    if (allCounts && allCounts.buckets && allCounts.buckets.length > 0) {
                        const trueBucket = allCounts.buckets.find(b => b.key === 1) || {
                            doc_count: 0
                        };
                        const falseBucket = allCounts.buckets.find(b => b.key === 0) || {
                            doc_count: 0
                        };

                        return {
                            ...acc,
                            [booleanFieldName]: {
                                true: trueBucket.doc_count,
                                false: falseBucket.doc_count
                            }
                        };
                    } else if (allCounts && allCounts.buckets && allCounts.buckets.length > 3) {
                        throw new Error(
                            `There shouldn't be more than 3 states for boolean fields. Check data for ${booleanFieldName}`
                        );
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
