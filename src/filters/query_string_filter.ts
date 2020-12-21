import {runInAction, decorate, observable, reaction} from 'mobx';
import {objKeys} from '../utils';
import {
    ESRequest,
    ESResponse,
    FilterKind,
    BaseFilterConfig,
    IBaseOptions,
    ESMappingType,
    QueryStringFieldFilter,
    FieldFilters,
    FieldNameModifier,
    FieldKinds
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
    aggsEnabled: false,
    fieldNameModifierQuery: (fieldName: string) => fieldName,
    fieldNameModifierAggs: (fieldName: string) => fieldName
};

export interface IConfig extends BaseFilterConfig {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    defaultFilterInclusion?: 'include' | 'exclude';
    aggsEnabled?: boolean;
    getCount?: boolean;
    fieldNameModifierQuery?: FieldNameModifier;
    fieldNameModifierAggs?: FieldNameModifier;
}

export type IConfigs<Fields extends string> = {
    [esFieldName in Fields]: IConfig;
};

/**
 *  Results
 */

export type QueryStringCountResult = {
    [selectedValue: string]: number;
};

export type CountResults<Fields extends string> = {
    [esFieldName in Fields]: QueryStringCountResult;
};

export const shouldUseField = (_fieldName: string, fieldType: ESMappingType) =>
    fieldType === 'keyword' || fieldType === 'text';

class QueryStringFilter<Fields extends string> extends BaseFilter<
    Fields,
    IConfig,
    QueryStringFieldFilter
> {
    public filteredCount: CountResults<Fields>;
    public unfilteredCount: CountResults<Fields>;

    constructor(
        defaultConfig?: Omit<Required<IConfig>, 'field'>,
        specificConfigs?: IConfigs<Fields>,
        options?: IBaseOptions
    ) {
        super(
            'query_string',
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

    public userState(): {
        fieldKinds?: FieldKinds<Fields>;
        fieldFilters?: FieldFilters<Fields, QueryStringFieldFilter>;
    } | void {
        const kinds = Object.keys(this.fieldFilters).reduce((fieldKinds, fieldName) => {
            return {
                ...fieldKinds,
                [fieldName]: this.kindForField(fieldName as Fields)
            };
        }, {} as FieldKinds<Fields>);

        const fieldFilters = Object.keys(this.fieldFilters).reduce((fieldFilterAcc, fieldName) => {
            const filter = this.fieldFilters[fieldName as Fields] as QueryStringFieldFilter;
            if (filter && Object.keys(filter).length > 0) {
                return {
                    ...fieldFilterAcc,
                    [fieldName]: filter
                };
            } else {
                return fieldFilterAcc;
            }
        }, {} as FieldFilters<Fields, QueryStringFieldFilter>);

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
            this.fieldFilters = {} as FieldFilters<Fields, QueryStringFieldFilter>;
            this.filteredCount = {} as CountResults<Fields>;
            this.unfilteredCount = {} as CountResults<Fields>;
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
        return objKeys(this.fieldConfigs).reduce((esRequest, fieldName) => {
            if (!this.fieldFilters) {
                return esRequest;
            }
            const config = this.fieldConfigs[fieldName];
            const name = config.field;

            const filter = this.fieldFilters[fieldName] as QueryStringFieldFilter;
            if (!filter) {
                return esRequest;
            }

            const kind = this.kindForField(fieldName);
            if (!kind) {
                throw new Error(`kind is not set for query_string filter type ${fieldName}`);
            }

            if (filter) {
                const query = filter.query;
                const inclusion = filter.inclusion ?? config.defaultFilterInclusion;

                // See https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-query-string-query.html
                const newFilter =
                    inclusion === 'include'
                        ? {query_string: {query, default_field: name}}
                        : {
                              bool: {
                                  must_not: {
                                      query_string: {query, default_field: name}
                                  }
                              }
                          };
                const kindForSelectedValue = filter.kind ?? kind;
                const existingFiltersForKind =
                    esRequest.query.bool[kindForSelectedValue as FilterKind] ?? [];

                return {
                    ...esRequest,
                    query: {
                        ...esRequest.query,
                        bool: {
                            ...esRequest.query.bool,
                            [kindForSelectedValue as FilterKind]: [
                                ...existingFiltersForKind,
                                newFilter
                            ]
                        }
                    }
                };
            } else {
                return esRequest;
            }
        }, request);
    };

    public _addCountAggsToEsRequest = (
        request: ESRequest,
        _fieldToFilterOn?: string
    ): ESRequest => {
        return request;
    };

    public _parseCountFromResponse = (_isUnfilteredQuery: boolean, _response: ESResponse): void => {
        return;
    };
}

decorate(QueryStringFilter, {
    filteredCount: observable,
    unfilteredCount: observable
});

utils.decorateFilter(QueryStringFilter);

export default QueryStringFilter;
