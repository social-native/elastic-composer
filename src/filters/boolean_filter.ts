import {runInAction, decorate, observable} from 'mobx';
import {objKeys} from '../utils';
import {
    ESRequest,
    ESResponse,
    FilterKind,
    BaseFilterConfig,
    IBaseOptions,
    ESMappingType,
    BooleanFieldFilter,
    RawBooleanAggs
} from '../types';
import BaseFilter from './base';
import utils from './utils';

/**
 * Config
 */
const BOOLEAN_CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    getCount: true,
    aggsEnabled: false
};

export interface IBooleanConfig extends BaseFilterConfig {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    getCount?: boolean;
    aggsEnabled?: boolean;
}

export type IBooleanConfigs<BooleanFields extends string> = {
    [esFieldName in BooleanFields]: IBooleanConfig;
};

/**
 * Results
 */

export type BooleanCountResult = {
    true: number;
    false: number;
};

export type BooleanCountResults<BooleanFields extends string> = {
    [esFieldName in BooleanFields]: BooleanCountResult;
};

export const booleanShouldUseField = (_fieldName: string, fieldType: ESMappingType) =>
    fieldType === 'boolean';

class BooleanFilter<BooleanFields extends string> extends BaseFilter<
    BooleanFields,
    IBooleanConfig,
    BooleanFieldFilter
> {
    public filteredCount: BooleanCountResults<BooleanFields>;
    public unfilteredCount: BooleanCountResults<BooleanFields>;

    constructor(
        defaultConfig?: Omit<Required<IBooleanConfig>, 'field'>,
        specificConfigs?: IBooleanConfigs<BooleanFields>,
        options?: IBaseOptions
    ) {
        super(
            'boolean',
            defaultConfig || (BOOLEAN_CONFIG_DEFAULT as Omit<Required<IBooleanConfig>, 'field'>),
            specificConfigs as IBooleanConfigs<BooleanFields>
        );
        runInAction(() => {
            this._shouldUseField = (options && options.shouldUseField) || booleanShouldUseField;
            this.filteredCount = {} as BooleanCountResults<BooleanFields>;
            this.unfilteredCount = {} as BooleanCountResults<BooleanFields>;
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
        return objKeys(this.fieldConfigs).reduce((acc, booleanFieldName) => {
            if (!this.fieldFilters) {
                return acc;
            }
            const config = this.fieldConfigs[booleanFieldName];
            const name = config.field;

            const filter = this.fieldFilters[booleanFieldName];
            if (!filter) {
                return acc;
            }

            const kind = this.kindForField(booleanFieldName);
            if (!kind) {
                throw new Error(`kind is not set for range type ${booleanFieldName}`);
            }

            if (filter) {
                const existingFiltersForKind = acc.query.bool[kind as FilterKind] || [];
                return {
                    ...acc,
                    query: {
                        ...acc.query,
                        bool: {
                            ...acc.query.bool,
                            [kind as FilterKind]: [
                                ...existingFiltersForKind,
                                {term: {[name]: filter.state}}
                            ]
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
        return objKeys(this.fieldConfigs || {}).reduce((acc, booleanFieldName) => {
            if (fieldToFilterOn && booleanFieldName !== fieldToFilterOn) {
                return acc;
            }
            const config = this.fieldConfigs[booleanFieldName];
            const name = config.field;
            if (!config || !config.aggsEnabled) {
                return acc;
            }
            if (config.getCount) {
                return {
                    ...acc,
                    aggs: {
                        ...acc.aggs,
                        [`${name}__count`]: {
                            terms: {
                                field: name,
                                size: 2
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
        const booleanCount = objKeys(this.fieldConfigs).reduce(
            // tslint:disable-next-line
            (acc, booleanFieldName) => {
                const config = this.fieldConfigs[booleanFieldName];
                const name = config.field;
                if (config.getCount && response.aggregations) {
                    const allCounts = response.aggregations[`${name}__count`] as RawBooleanAggs;
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
            {...existingCount} as BooleanCountResults<BooleanFields>
        );

        if (isUnfilteredQuery) {
            runInAction(() => {
                this.unfilteredCount = booleanCount;
            });
        } else {
            runInAction(() => {
                this.filteredCount = booleanCount;
            });
        }
    };
}

decorate(BooleanFilter, {
    filteredCount: observable,
    unfilteredCount: observable
});

utils.decorateFilter(BooleanFilter);

export default BooleanFilter;
