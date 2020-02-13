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
    getCount: true,
    aggsEnabled: false
};

export interface IConfig extends BaseFilterConfig {
    field: string;
    defaultFilterKind?: 'should' | 'must';
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
    exists: boolean;
};

/**
 *  Results
 */
export type RawExistsCountResult = number;

export type ExistsCountResult = {
    exists: number;
    doesntExist: number;
};

export type CountResults<Fields extends string> = {
    [esFieldName in Fields]: ExistsCountResult;
};

// use with all fields b/c exists can check any field data value for existence
export const shouldUseField = (_fieldName: string, _fieldType: ESMappingType) => true;

class ExistsFilter<Fields extends string> extends BaseFilter<Fields, IConfig, Filter> {
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
                const existingFiltersForKind = acc.query.bool[kind as FilterKind] || [];
                const newFilter = filter.exists
                    ? {exists: {field: name}}
                    : {bool: {must_not: {exists: {field: name}}}};
                return {
                    ...acc,
                    query: {
                        ...acc.query,
                        bool: {
                            ...acc.query.bool,
                            [kind as FilterKind]: [...existingFiltersForKind, newFilter]
                        }
                    }
                };
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

    public _parseCountFromResponse = (isUnfilteredQuery: boolean, response: ESResponse): void => {
        if (!this.fieldFilters) {
            return;
        }
        const existingCount = isUnfilteredQuery ? this.unfilteredCount : this.filteredCount;
        const count = objKeys(this.fieldConfigs).reduce(
            // tslint:disable-next-line
            (acc, existFieldName) => {
                const config = this.fieldConfigs[existFieldName];
                const name = config.field;
                if (config.getCount && response.aggregations) {
                    const doesntExistCount = (response.aggregations[
                        `${name}__exists_doesnt_count`
                    ] || 0) as RawExistsCountResult;
                    const totalCount = response.hits.total || 0;
                    const existCount = totalCount - doesntExistCount;
                    if (existCount && doesntExistCount) {
                        return {
                            ...acc,
                            [existFieldName]: {
                                exists: existCount,
                                doesntExist: doesntExistCount
                            }
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

decorate(ExistsFilter, {
    filteredCount: observable,
    unfilteredCount: observable
});

utils.decorateFilter(ExistsFilter);

export default ExistsFilter;
