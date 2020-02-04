import {runInAction, decorate, observable} from 'mobx';
import {objKeys} from '../utils';
import {ESRequest, ESResponse, FilterKind} from '../types';
import BaseFilter from './base';
import {decorateFilter} from './utils';

/**
 * Range config
 */
const BOOLEAN_CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    getCount: true,
    aggsEnabled: true
};

export type BooleanConfig = {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    getCount?: boolean;
    aggsEnabled?: boolean;
};

export type BooleanConfigs<BooleanFields extends string> = {
    [esFieldName in BooleanFields]: BooleanConfig;
};

/**
 * Boolean Filter
 */

export type Filter = {
    state: boolean;
};

export type Filters<BooleanFields extends string> = {
    [esFieldName in BooleanFields]: Filter | undefined;
};

/**
 * Boolean Kind
 */

export type BooleanFilterKinds<BooleanFields extends string> = {
    [esFieldName in BooleanFields]: FilterKind | undefined;
};

/**
 * Range Distribution
 */
export type RawBooleanCountResult = {
    buckets: Array<{
        key: 0 | 1;
        key_as_string: 'true' | 'false';
        doc_count: number;
    }>;
};
// export type BooleanCountResult = Array<{
//     state: boolean;
//     count: number;
// }>;

export type BooleanCountResult = {
    true: number;
    false: number;
};

export type BooleanCountResults<BooleanFields extends string> = {
    [esFieldName in BooleanFields]: BooleanCountResult;
};

// export type RangeBoundResults<BooleanFields extends string> = {
//     [esFieldName in BooleanFields]: RangeBoundResult;
// };

class BooleanFilterClass<BooleanFields extends string> extends BaseFilter<
    BooleanFields,
    BooleanConfig,
    Filter
> {
    public filteredCount: BooleanCountResults<BooleanFields>;
    public unfilteredCount: BooleanCountResults<BooleanFields>;
    // public filteredDistribution: RangeDistributionResults<BooleanFields>;
    // public unfilteredDistribution: RangeDistributionResults<BooleanFields>;

    constructor(
        defaultConfig?: Omit<Required<BooleanConfig>, 'field'>,
        specificConfigs?: BooleanConfigs<BooleanFields>
    ) {
        super(
            'range',
            defaultConfig || (BOOLEAN_CONFIG_DEFAULT as Omit<Required<BooleanConfig>, 'field'>),
            specificConfigs as BooleanConfigs<BooleanFields>
        );
        runInAction(() => {
            this.filteredCount = {} as BooleanCountResults<BooleanFields>;
            this.unfilteredCount = {} as BooleanCountResults<BooleanFields>;
            // this.filteredDistribution = {} as RangeDistributionResults<BooleanFields>;
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
            // const range = convertRanges(name, filter);

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
                                {[name]: filter.state}
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
        return objKeys(this.fieldConfigs || {}).reduce((acc, rangeFieldName) => {
            if (fieldToFilterOn && rangeFieldName !== fieldToFilterOn) {
                return acc;
            }
            const config = this.fieldConfigs[rangeFieldName];
            const name = config.field;
            if (!config.aggsEnabled) {
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
                    const allCounts = response.aggregations[
                        `${name}__count`
                    ] as RawBooleanCountResult;
                    // const maxResult = response.aggregations[`${name}__max`];
                    if (allCounts && allCounts.buckets && allCounts.buckets.length > 1) {
                        const trueBucket = allCounts.buckets.find(b => b.key === 1);
                        const falseBucket = allCounts.buckets.find(b => b.key === 0);
                        if (trueBucket && falseBucket) {
                            return {
                                ...acc,
                                [booleanFieldName]: {
                                    true: trueBucket.doc_count,
                                    false: falseBucket.doc_count
                                }
                            };
                        } else {
                            return acc;
                        }
                    } else if (allCounts && allCounts.buckets && allCounts.buckets.length > 3) {
                        throw new Error(
                            `There shouldnt be more than 3 states for boolean fields. Check data for ${booleanFieldName}`
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

decorate(BooleanFilterClass, {
    filteredCount: observable,
    unfilteredCount: observable
});

decorateFilter(BooleanFilterClass);

export default BooleanFilterClass;
