'use strict';
import {RangeFilter, BooleanFilter, BaseFilter} from './filters';
import {ESRequest, ESResponse, IClient, ESHit, ESRequestSortField, ESMappingType} from './types';
import {objKeys} from './utils';
import {decorate, observable, runInAction, reaction, toJS, computed} from 'mobx';
import Timeout from 'await-timeout';
import chunk from 'lodash.chunk';
import {PrefixSuggestion, FuzzySuggestion, BaseSuggestion} from './suggestions';

/**
 * How the naming works:
 *
 * [un]filtered - whether the query section has a filter applied
 * query - whether results (hits) come back in the query section
 * aggs - whether aggregations come bck in the aggs section
 *
 * Ex:
 * filteredQueryAggs - would have a query filter applied, hits returned,  and aggs on the result set
 * filteredAggs - would have a query filter applied,  no hits returned, and aggs on the result set
 */

const BLANK_ES_REQUEST = {
    query: {
        bool: {
            must: [] as any[],
            should: [] as any[]
        }
    },
    aggs: {}
};

// tslint:disable-next-line
const removeEmptyArrays = <O extends {}>(data: O): any => {
    objKeys(data).forEach(k => {
        const v = data[k];
        if (Array.isArray(v)) {
            if (v.length === 0) {
                delete data[k];
            }
        } else if (typeof v === 'object') {
            return removeEmptyArrays(v);
        }
    });
    return data;
};

const DEFAULT_MANAGER_OPTIONS: Omit<
    Required<ManagerOptions>,
    'fieldWhiteList' | 'fieldBlackList'
> = {
    pageSize: 10,
    queryThrottleInMS: 1000,
    filters: {
        boolean: new BooleanFilter(),
        range: new RangeFilter()
    },
    suggestions: {
        fuzzy: new FuzzySuggestion(),
        prefix: new PrefixSuggestion()
    }
};

interface IFilters {
    range: RangeFilter<any>;
    boolean: BooleanFilter<any>;
    [customFilter: string]: BaseFilter<any, any, any>;
}

interface ISuggestions {
    fuzzy: FuzzySuggestion<any>;
    prefix: PrefixSuggestion<any>;
    [customSuggestion: string]: BaseSuggestion<any, any>;
}

type ManagerOptions = {
    pageSize?: number;
    queryThrottleInMS?: number;
    fieldWhiteList?: string[];
    fieldBlackList?: string[];
    filters?: IFilters;
    suggestions?: ISuggestions;
};

type EffectInput<EffectKind extends string> = {
    kind: EffectKind;
    effect: QueryFn;
    debouncedByKind?: EffectKind[];
    debounce?: 'leading' | 'trailing' | DebounceFn;
    throttle: number; // in milliseconds
    params: any[];
};

const debounceSuggestionsFn = <CurrentEffectKind extends string, LookingEffectKind extends string>(
    currentEffectRequest: EffectRequest<CurrentEffectKind>,
    lookingAtEffectRequest: EffectRequest<LookingEffectKind>
) =>
    currentEffectRequest.kind === 'suggestion' &&
    lookingAtEffectRequest.kind === 'suggestion' &&
    currentEffectRequest.params.length === 2 &&
    currentEffectRequest.params[0] === lookingAtEffectRequest.params[0] &&
    currentEffectRequest.params[1] === lookingAtEffectRequest.params[1];

type DebounceFn = <CurrentEffectKind extends string, LookingEffectKind extends string>(
    currentEffectRequest: EffectRequest<CurrentEffectKind>,
    lookingAtEffectRequest: EffectRequest<LookingEffectKind>
) => boolean;

type EffectRequest<EffectKind extends string> = {
    kind: EffectKind;
    effect: QueryFn;
    debouncedByKind?: EffectKind[];
    debounce?: 'leading' | 'trailing' | DebounceFn;
    throttle: number; // in milliseconds
    params: any[];
};

const createEffectRequest = <EffectKind extends string>(
    input: EffectInput<EffectKind>
): EffectRequest<EffectKind> => input;

type EffectKinds =
    | 'suggestion'
    | 'batchAggs'
    | 'unfilteredQuery'
    | 'unfilteredAggs'
    | 'unfilteredQueryAndAggs'
    | 'filteredQuery'
    | 'filteredAggs'
    | 'filteredQueryAndAggs';

type QueryFn = (...params: any[]) => void;

type DefaultOptions = {
    filters: IFilters;
    suggestions: ISuggestions;
};

class Manager<
    Options extends DefaultOptions = DefaultOptions,
    ResultObject extends object = object
> {
    public pageSize: number;
    public queryThrottleInMS: number;
    public filters: Options['filters'];
    public suggestions: Options['suggestions'];
    public results: Array<ESHit<ResultObject>>;

    public _sideEffectQueue: Array<EffectRequest<EffectKinds>>;
    public isSideEffectRunning: boolean;

    public client: IClient<ResultObject>;
    public currentPage: number;
    public _pageCursorInfo: Record<number, ESRequestSortField>;
    public indexFieldNamesAndTypes: Record<string, ESMappingType>;

    public fieldWhiteList: string[];
    public fieldBlackList: string[];

    constructor(client: IClient<ResultObject>, options?: ManagerOptions) {
        const filters =
            options && options.filters
                ? {...DEFAULT_MANAGER_OPTIONS.filters, ...options.filters}
                : DEFAULT_MANAGER_OPTIONS.filters;
        const suggestions =
            options && options.suggestions
                ? {...DEFAULT_MANAGER_OPTIONS.suggestions, ...options.suggestions}
                : DEFAULT_MANAGER_OPTIONS.suggestions;
        // tslint:disable-next-line
        runInAction(() => {
            this.client = client;
            this.filters = filters;
            this.suggestions = suggestions;
            this.isSideEffectRunning = false;
            this._sideEffectQueue = [];
            this.results = [] as Array<ESHit<ResultObject>>;

            this.pageSize = (options && options.pageSize) || DEFAULT_MANAGER_OPTIONS.pageSize;
            this.queryThrottleInMS =
                (options && options.queryThrottleInMS) || DEFAULT_MANAGER_OPTIONS.queryThrottleInMS;
            this._pageCursorInfo = {};
            this.currentPage = 0; // set to 0 b/c there are no results on init
            this.indexFieldNamesAndTypes = {};

            if (options && options.fieldWhiteList && options.fieldBlackList) {
                throw new Error(
                    `Field blacklist used with field whitelist. Only one can be used at a time`
                );
            }
            if (options && options.fieldWhiteList) {
                this.fieldWhiteList = options.fieldWhiteList;
            } else {
                this.fieldWhiteList = [];
            }
            if (options && options.fieldBlackList) {
                this.fieldBlackList = options.fieldBlackList;
            } else {
                this.fieldBlackList = [];
            }
        });

        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName] as Options['filters'][keyof Options['filters']];
            filter._subscribeToShouldUpdateFilteredAggs(this._enqueueFilteredAggs);
            filter._subscribeToShouldUpdateUnfilteredAggs(this._enqueueUnfilteredAggs);
        });

        objKeys(this.suggestions).forEach(suggesterName => {
            const suggester = this.suggestions[
                suggesterName
            ] as Options['suggestions'][keyof Options['suggestions']];
            suggester._subscribeToShouldRunSuggestionSearch(this._enqueueSuggestionSearch);
        });

        /**
         * React to state changes in the filters.
         * Run a new filter query.
         */
        reaction(
            () => {
                return objKeys(this.filters).reduce((acc, filterName) => {
                    return {
                        acc,
                        [filterName]: toJS(this.filters[filterName]._shouldRunFilteredQueryAndAggs)
                    };
                }, {});
            },
            () => {
                this._enqueueFilteredQueryAndAggs();
            }
        );

        reaction(
            () => this.indexFieldNamesAndTypes,
            (indexFieldNamesAndTypes: Record<string, ESMappingType>) => {
                // tslint:disable-next-line
                objKeys(indexFieldNamesAndTypes).forEach(fieldName => {
                    const fieldType = indexFieldNamesAndTypes[fieldName];
                    objKeys(this.filters).forEach(filterName => {
                        const filter = this.filters[filterName];
                        if (filter._shouldUseField(fieldName, fieldType)) {
                            filter._addConfigForField(fieldName);
                        }
                    });

                    objKeys(this.suggestions).forEach(suggestionName => {
                        const suggestion = this.suggestions[suggestionName];
                        if (suggestion._shouldUseField(fieldName, fieldType)) {
                            suggestion._addConfigForField(fieldName);
                        }
                    });
                });
            }
        );
        // FOR TESTING - DELETE  ME
        reaction(
            () => ({
                queue: [...this._sideEffectQueue],
                isSideEffectRunning: !!this.isSideEffectRunning
            }),
            data => {
                console.log('CURRENT QUEUE', data.queue);
            }
        );

        reaction(
            () => ({
                queue: [...this._sideEffectQueue],
                isSideEffectRunning: !!this.isSideEffectRunning
            }),
            data => {
                if (data.isSideEffectRunning === false) {
                    this._tryToRunEffect();
                }
            }
        );
    }

    public _tryToRunEffect = () => {
        if (this.isSideEffectRunning) {
            return;
        }
        const effect = this._shiftFirstEffectOffQueue();

        if (!effect) {
            return;
        } else {
            this._runEffect(effect);
        }
    };

    public get fieldsToFilterType(): Record<string, string> {
        return objKeys(this.filters).reduce((map, filterName) => {
            const filter = this.filters[filterName];
            const typeMaps = filter.fields.reduce((filterMap, fieldName) => {
                return {...filterMap, [fieldName]: filter.filterKind};
            }, {} as Record<string, string>);

            return {...map, ...typeMaps};
        }, {} as Record<string, string>);
    }

    public _runEffect = async (effectRequest: EffectRequest<EffectKinds>) => {
        try {
            // tslint:disable-next-line
            runInAction(() => {
                this.isSideEffectRunning = true;
            });

            const params = effectRequest.params || [];
            if (effectRequest.throttle) {
                await Timeout.set(effectRequest.throttle);
            }

            if (effectRequest.debounce === 'leading') {
                this._removeAllOtherEffectsOfKindFromQueue(effectRequest);

                await effectRequest.effect(...params);
            } else if (effectRequest.debounce === 'trailing') {
                const newEffectRequest = this._findLastEffectOfKindAndRemoveAllOthersFromQueue(
                    effectRequest
                );

                await newEffectRequest.effect(effectRequest, ...params);
            } else if (typeof effectRequest.debounce === 'function') {
                const newEffectRequest = this._debounceEffectsUsingDebounceFn(effectRequest);

                await newEffectRequest.effect(effectRequest, ...params);
            } else {
                await effectRequest.effect(effectRequest, ...params);
            }
        } catch (e) {
            throw e;
        } finally {
            runInAction(() => {
                this.isSideEffectRunning = false;
            });
        }
    };

    public _debounceEffectsUsingDebounceFn = (
        effectRequest: EffectRequest<EffectKinds>
    ): EffectRequest<EffectKinds> => {
        if (
            !effectRequest.debounce ||
            typeof effectRequest.debounce !== 'function' ||
            this._sideEffectQueue.length === 0
        ) {
            return effectRequest;
        }

        const newSideEffectQueue = this._sideEffectQueue.filter(lookingAtEffect => {
            return !(effectRequest.debounce as DebounceFn)(effectRequest, lookingAtEffect);
        });
        runInAction(() => {
            this._sideEffectQueue = [...newSideEffectQueue];
        });

        return effectRequest;
    };

    public _findLastEffectOfKindAndRemoveAllOthersFromQueue = (
        effectRequest: EffectRequest<EffectKinds>
    ): EffectRequest<EffectKinds> => {
        const lastEffectOfKind = this._sideEffectQueue
            .slice()
            .reverse()
            .find(e => e && e.kind === effectRequest.kind);

        this._removeAllOtherEffectsOfKindFromQueue(effectRequest);

        return lastEffectOfKind ? lastEffectOfKind : effectRequest;
    };

    public _removeAllOtherEffectsOfKindFromQueue = (
        effectRequest: EffectRequest<EffectKinds>
    ): void => {
        runInAction(() => {
            this._sideEffectQueue = this._sideEffectQueue.filter(
                e =>
                    e &&
                    e.kind !== effectRequest.kind &&
                    // debounce other kinds.
                    // this clears the queue of stale batched effect requests.
                    !(e.debouncedByKind && e.debouncedByKind.includes(effectRequest.kind))
            );
        });
    };

    /**
     *
     */
    public _shiftFirstEffectOffQueue = (): EffectRequest<EffectKinds> | null => {
        if (this._sideEffectQueue.length === 0) {
            return null;
        }
        const firstEffect = this._sideEffectQueue[0];
        runInAction(() => {
            this._sideEffectQueue.shift();
        });
        return firstEffect;
    };

    /**
     *
     */
    public _addToQueueLiFo = (effect: EffectRequest<EffectKinds>) => {
        runInAction(() => {
            this._sideEffectQueue = [effect, ...this._sideEffectQueue];
        });
    };

    public _addToQueueFiFo = (effect: EffectRequest<EffectKinds>) => {
        runInAction(() => {
            this._sideEffectQueue = [...this._sideEffectQueue, effect];
        });
    };

    /**
     * ***************************************************************************
     * SIDE EFFECT ENQUEUEING
     * ***************************************************************************
     */

    /**
     * Never used but is a possible permutation. Leave as a placeholder.
     */
    public _enqueueUnfilteredQuery = () => {
        throw new Error('Not implemented');
    };

    /**
     * Used for to get suggestions for ongoing searches - before a particular filter has been set
     * as a user is figuring out terms for the filter. This is mainly used by the multiselect
     * and keyword filters
     *
     * Predicate debouncing - b/c we don't want to interfere with other suggesters but a single
     * field suggestion should be debounced
     */
    public _enqueueSuggestionSearch = (filter: string, field: string) => {
        this._addToQueueLiFo(
            createEffectRequest({
                kind: 'suggestion',
                effect: this._runSuggestionSearch,
                debounce: debounceSuggestionsFn,
                throttle: this.queryThrottleInMS,
                params: [filter, field]
            })
        );
    };

    /**
     * We need to get the baseline for the filter if it wasn't fetched during startup
     * (b/c it was hidden)
     *
     * No debouncing - b/c we don't want the data request lost
     */
    public _enqueueUnfilteredAggs = (filter: string, field: string) => {
        this._addToQueueLiFo(
            createEffectRequest({
                kind: 'unfilteredAggs',
                effect: this._runUnfilteredAggs,
                debounce: undefined,
                throttle: this.queryThrottleInMS,
                params: [filter, field]
            })
        );
    };

    /**
     * On startup
     *
     * We want the initial unfilteredQuery and the unfilteredAggs
     *
     * No debouncing - b/c its only run once
     */

    public runStartQuery = () => {
        this._enqueueUnfilteredQueryAndAggs();
    };

    public _enqueueUnfilteredQueryAndAggs = () => {
        this._addToQueueLiFo(
            createEffectRequest({
                kind: 'unfilteredQueryAndAggs',
                effect: this._runUnfilteredQueryAndAggs,
                debounce: undefined,
                throttle: 0,
                params: []
            })
        );
    };

    /**
     * Pagination
     *
     * Aggs aren't needed b/c they don't change during pagination
     *
     * Debouncing - b/c you want to get to where want to be, but not necessarily all the places in between
     * Leading edge buffer - b/c of the same reasoning as above
     */
    public _enqueueFilteredQuery = (pageDirection: 'forward' | 'backward') => {
        this._addToQueueLiFo(
            createEffectRequest({
                kind: 'filteredQuery',
                effect: this._runFilteredQuery,
                params: [pageDirection],
                debounce: 'trailing',
                throttle: this.queryThrottleInMS
            })
        );
    };

    /**
     * We need to get the current filter data for the filter if it was hidden.
     *
     * No debouncing - b/c used in batching
     */
    public _enqueueFilteredAggs = (filter: string, field: string) => {
        this._addToQueueLiFo(
            createEffectRequest({
                kind: 'filteredAggs',
                debouncedByKind: ['filteredQueryAndAggs'],
                effect: this._runFilteredAggs,
                debounce: undefined,
                throttle: this.queryThrottleInMS,
                params: [filter, field]
            })
        );
    };

    /**
     * Every time a filter is changed
     *
     * Debouncing - b/c you want to get to where want to be, but not necessarily all the places in between
     * Leading edge buffer - b/c of the same reasoning as above
     */
    public _enqueueFilteredQueryAndAggs = () => {
        this._addToQueueLiFo(
            createEffectRequest({
                kind: 'filteredQueryAndAggs',
                effect: this._runFilteredQueryAndAggs,
                debounce: 'trailing',
                params: [],
                throttle: this.queryThrottleInMS
            })
        );
    };

    /**
     * ***************************************************************************
     * INDEX FIELDS
     * ***************************************************************************
     */

    public _filterFieldNamesAndTypesUsingWhiteAndBlackList = (
        mappings: Record<string, ESMappingType>
    ): Record<string, ESMappingType> => {
        if (this.fieldWhiteList.length > 0) {
            return objKeys(mappings)
                .filter(fieldName => this.fieldWhiteList.includes(fieldName))
                .reduce(
                    (newMappings, filteredFieldName) => ({
                        ...newMappings,
                        [filteredFieldName]: mappings[filteredFieldName]
                    }),
                    {} as Record<string, ESMappingType>
                );
        } else if (this.fieldBlackList.length > 0) {
            return objKeys(mappings)
                .filter(fieldName => !this.fieldBlackList.includes(fieldName))
                .reduce(
                    (newMappings, filteredFieldName) => ({
                        ...newMappings,
                        [filteredFieldName]: mappings[filteredFieldName]
                    }),
                    {} as Record<string, ESMappingType>
                );
        } else {
            return mappings;
        }
    };
    /**
     * Returns the field names and types for the elasticsearch mapping(s)
     */
    public getFieldNamesAndTypes = async () => {
        const mappings = await this.client.mapping();
        runInAction(() => {
            this.indexFieldNamesAndTypes = this._filterFieldNamesAndTypesUsingWhiteAndBlackList(
                mappings
            );
        });
    };

    /**
     * ***************************************************************************
     * RESPONSE UTILS
     * ***************************************************************************
     */

    public _formatResponse = (
        response: ESResponse<ResultObject>
    ): Required<ESResponse<ResultObject>> => {
        return {aggregations: {}, ...response};
    };

    /**
     * ***************************************************************************
     * RESPONSE STATE EXTRACTORS
     * ***************************************************************************
     */

    /**
     * Save the results
     * The results contain the documents found in the query that match the filters
     */
    public _saveQueryResults = (response: ESResponse<ResultObject>) => {
        if (response.timed_out === false && response.hits.total > 0) {
            runInAction(() => {
                if (response && response.hits && response.hits.hits) {
                    this.results = response.hits.hits;
                }
            });
        }
    };

    public _extractUnfilteredAggsStateFromResponse = (response: ESResponse<ResultObject>): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter._extractUnfilteredAggsStateFromResponse(response);
        });
    };

    public _extractFilteredAggsStateFromResponse = (response: ESResponse<ResultObject>): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter._extractFilteredAggsStateFromResponse(response);
        });
    };

    public _extractSuggestionStateFromResponse = (response: ESResponse<ResultObject>): void => {
        objKeys(this.suggestions).forEach(suggesterName => {
            const suggester = this.suggestions[suggesterName];
            if (!suggester) {
                return;
            }
            suggester._extractSuggestionFromResponse(response);
        });
    };

    /**
     * ***************************************************************************
     * REQUEST MIDDLEWARE
     * ***************************************************************************
     */

    public _batchAggsMiddleware = (
        effectRequest: EffectRequest<EffectKinds>,
        request: ESRequest
    ): ESRequest => {
        if (!request.aggs || Object.keys(request.aggs).length === 0) {
            return request;
        }

        const aggregationKeys = Object.keys(request.aggs);
        const batchedAggregationTerms = chunk(aggregationKeys, 6);

        const batchedRequests = batchedAggregationTerms.map(terms => {
            const batchAggregations = terms.reduce((agg, term) => {
                const a = request.aggs[term];
                if (a) {
                    agg[term] = a;
                }
                return agg;
            }, {} as Record<string, any>);
            return {...request, aggs: batchAggregations};
        });

        const firstRequest = batchedRequests.shift() as ESRequest; // this should always exist
        batchedRequests.forEach(r => {
            // add FiFo so its easy to debounce these in case
            // a competing filter comes about
            this._addToQueueFiFo(
                createEffectRequest({
                    kind: 'batchAggs',
                    debouncedByKind: [effectRequest.kind],
                    debounce: undefined,
                    effect:
                        effectRequest.kind === 'unfilteredAggs' ||
                        effectRequest.kind === 'unfilteredQueryAndAggs'
                            ? this._runUnfilteredBatchedAggs
                            : this._runFilteredBatchedAggs,
                    throttle: 0,
                    params: [r]
                })
            );
        });
        return firstRequest;
    };

    public _requestMiddleware = (
        effectRequest: EffectRequest<EffectKinds>,
        request: ESRequest
    ): ESRequest => {
        return [this._batchAggsMiddleware].reduce((newRequest, m) => {
            return m(effectRequest, newRequest);
        }, request as ESRequest);
    };

    /**
     * ***************************************************************************
     * REQUEST BUILDERS
     * ***************************************************************************
     */

    public _createSearchSuggestionRequest = (
        effectRequest: EffectRequest<EffectKinds>,
        blankRequest: ESRequest,
        suggesterName: string,
        field: string
    ): ESRequest => {
        const suggester = (this.suggestions as any)[suggesterName as any] as BaseSuggestion<
            any,
            any
        >;
        if (!suggester) {
            throw new Error('Tried to create an ESRequest for a suggester that doesnt exist');
        }
        const requestWithSuggestion = suggester._addSuggestionQueryAndAggsToRequest(
            blankRequest,
            field
        );
        const fullRequest = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter._addFilteredQueryToRequest(request);
        }, requestWithSuggestion);
        // We want:
        // - no results
        return this._addZeroPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest));
    };

    public _createUnfilteredQueryAndAggsRequest = (
        effectRequest: EffectRequest<EffectKinds>,
        blankRequest: ESRequest
    ): ESRequest => {
        const fullRequest = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }
            return filter._addUnfilteredQueryAndAggsToRequest(request);
        }, blankRequest);

        // We want:
        // - a page of results
        // - the results to be sorted
        return this._addSortToQuery(
            this._addPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest))
        );
    };

    public _createFilteredAggsRequest = (
        effectRequest: EffectRequest<EffectKinds>,
        blankRequest: ESRequest,
        filterName: string,
        field: string
    ): ESRequest => {
        const filter = (this.filters as any)[filterName as any];
        if (!filter) {
            throw new Error('Tried to create an ESRequest for a filter that doesnt exist');
        }
        const fullRequest = filter._addFilteredAggsToRequest(blankRequest, field);
        // We want:
        // - no results
        return this._addZeroPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest));
    };

    public _createUnfilteredAggsRequest = (
        effectRequest: EffectRequest<EffectKinds>,
        blankRequest: ESRequest,
        filterName: string,
        field: string
    ): ESRequest => {
        const filter = (this.filters as any)[filterName as any];
        if (!filter) {
            throw new Error('Tried to create an ESRequest for a filter that doesnt exist');
        }
        const fullRequest = filter._addUnfilteredAggsToRequest(blankRequest, field);

        // We want:
        // - no results
        // - the results to be sorted
        return this._addZeroPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest));
    };

    public _createFilteredQueryAndAggsRequest = (
        effectRequest: EffectRequest<EffectKinds>,
        blankRequest: ESRequest
    ): ESRequest => {
        const fullRequest = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter._addFilteredQueryAndAggsToRequest(request);
        }, blankRequest);

        // We want:
        // - a page of results
        // - the results to be sorted
        return this._addSortToQuery(
            this._addPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest))
        );
    };

    public _createFilteredQueryRequest = (
        effectRequest: EffectRequest<EffectKinds>,
        startingRequest: ESRequest
    ): ESRequest => {
        const fullRequest = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter._addFilteredQueryToRequest(request);
        }, startingRequest);

        // We want:
        // - a page of results
        // - the results to be sorted
        return this._addSortToQuery(
            this._addPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest))
        );
    };

    /**
     * ***************************************************************************
     * ES QUERY MANAGERS
     * ***************************************************************************
     */

    public _runSuggestionSearch = async (
        effectRequest: EffectRequest<EffectKinds>,
        filter: string,
        field: string
    ) => {
        try {
            const request = this._createSearchSuggestionRequest(
                effectRequest,
                BLANK_ES_REQUEST,
                filter,
                field
            );
            const response = await this.client.search(removeEmptyArrays(request));

            // Pass the response to the filter instances so they can extract info relevant to them.
            this._extractSuggestionStateFromResponse(response);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryThrottleInMS);
        } catch (e) {
            throw e;
        } // No cursor change b/c only dealing with filters
    };

    public _runUnfilteredQueryAndAggs = async (effectRequest: EffectRequest<EffectKinds>) => {
        try {
            const request = this._createUnfilteredQueryAndAggsRequest(
                effectRequest,
                BLANK_ES_REQUEST
            );
            const response = await this.client.search(removeEmptyArrays(request));
            const formattedResponse = this._formatResponse(response);
            this._saveQueryResults(formattedResponse);
            this._extractUnfilteredAggsStateFromResponse(formattedResponse);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryThrottleInMS);
        } catch (e) {
            throw e;
        } finally {
            // Since the filters have changed, we should set the cursor back to
            // the first page.
            this._setCursorToFirstPage();
        }
    };

    public _runFilteredQueryAndAggs = async (effectRequest: EffectRequest<EffectKinds>) => {
        try {
            const request = this._createFilteredQueryAndAggsRequest(
                effectRequest,
                BLANK_ES_REQUEST
            );
            const response = await this.client.search(removeEmptyArrays(request));

            // Save the results
            this._saveQueryResults(response);

            // Pass the response to the filter instances so they can extract info relevant to them.
            this._extractFilteredAggsStateFromResponse(response);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryThrottleInMS);
        } catch (e) {
            throw e;
        } finally {
            // Since the filters have changed, we should set the cursor back to
            // the first page.
            this._setCursorToFirstPage();
        }
    };

    public _runFilteredQuery = async (
        effectRequest: EffectRequest<EffectKinds>,
        direction: 'forward' | 'backwards'
    ) => {
        try {
            const startingRequest =
                direction === 'forward' ? this._nextPageRequest() : this._prevPageRequest();

            const request = this._createFilteredQueryRequest(effectRequest, startingRequest);
            const response = await this.client.search(removeEmptyArrays(request));

            // Save the results
            this._saveQueryResults(response);

            await Timeout.set(this.queryThrottleInMS);
        } catch (e) {
            throw e;
        } finally {
            if (direction === 'forward') {
                this._incrementCursorToNextPage();
            } else {
                this._decrementCursorToPrevPage();
            }
        }
    };

    public _runFilteredAggs = async (
        effectRequest: EffectRequest<EffectKinds>,
        filter: string,
        field: string
    ) => {
        try {
            const request = this._createFilteredAggsRequest(
                effectRequest,
                BLANK_ES_REQUEST,
                filter,
                field
            );
            const response = await this.client.search(removeEmptyArrays(request));

            // Pass the response to the filter instances so they can extract info relevant to them.
            this._extractFilteredAggsStateFromResponse(response);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryThrottleInMS);
        } catch (e) {
            throw e;
        } // No cursor change b/c only dealing with filters
    };

    public _runUnfilteredAggs = async (
        effectRequest: EffectRequest<EffectKinds>,
        filter: string,
        field: string
    ) => {
        try {
            const request = this._createUnfilteredAggsRequest(
                effectRequest,
                BLANK_ES_REQUEST,
                filter,
                field
            );
            const response = await this.client.search(removeEmptyArrays(request));

            // Pass the response to the filter instances so they can extract info relevant to them.
            this._extractUnfilteredAggsStateFromResponse(response);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryThrottleInMS);
        } catch (e) {
            throw e;
        } // No cursor change b/c only dealing with filters
    };

    public _runUnfilteredBatchedAggs = async (effectRequest: EffectRequest<EffectKinds>) => {
        try {
            const request = effectRequest.params[0] as ESRequest;
            const response = await this.client.search(removeEmptyArrays(request));

            // Pass the response to the filter instances so they can extract info relevant to them.
            this._extractUnfilteredAggsStateFromResponse(response);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryThrottleInMS);
        } catch (e) {
            throw e;
        } // no cursor change b/c that should already be handled by the initial request in the batch
    };

    public _runFilteredBatchedAggs = async (effectRequest: EffectRequest<EffectKinds>) => {
        try {
            const request = effectRequest.params[0] as ESRequest;
            const response = await this.client.search(removeEmptyArrays(request));

            // Pass the response to the filter instances so they can extract info relevant to them.
            this._extractFilteredAggsStateFromResponse(response);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryThrottleInMS);
        } catch (e) {
            throw e;
        } // no cursor change b/c that should already be handled by the initial request in the batch
    };

    /**
     * ***************************************************************************
     * PAGINATION
     * ***************************************************************************
     */

    public _addPageSizeToQuery = (request: ESRequest): ESRequest => {
        return {...request, size: this.pageSize, track_scores: true};
    };

    public _addSortToQuery = (request: ESRequest): ESRequest => {
        return {...request, sort: ['_doc', '_score']};
    };

    public _addZeroPageSizeToQuery = (request: ESRequest): ESRequest => {
        return {...request, size: 0, track_scores: false};
    };

    public nextPage = () => {
        this._enqueueFilteredQuery('forward');
    };

    public _nextPageRequest = () => {
        const newRequest: ESRequest = {
            ...BLANK_ES_REQUEST,
            search_after: this._getCursorForNextPage()
        };
        return newRequest;
    };

    public prevPage = () => {
        this._enqueueFilteredQuery('backward');
    };

    public _prevPageRequest = () => {
        const newRequest: ESRequest = {
            ...BLANK_ES_REQUEST,
            search_after: this._getCursorForPreviousPage()
        };
        return newRequest;
    };

    public _getCursorForPreviousPage = (): ESRequestSortField => {
        const prevPage = this.currentPage - 1;

        if (this.currentPage > 2) {
            const cursorOfNextPage = this._pageCursorInfo[prevPage];
            if (!cursorOfNextPage) {
                throw new Error(`Missing cursor for page ${prevPage}`);
            }
            return cursorOfNextPage;
        } else if (this.currentPage === 2) {
            return [];
        } else {
            throw new Error(`Cannot go to previous page from page ${this.currentPage}`);
        }
    };

    public _getCursorForNextPage = (): ESRequestSortField => {
        const nextPage = this.currentPage + 1;

        const cursorOfNextPage = this._pageCursorInfo[nextPage];
        if (!cursorOfNextPage) {
            throw new Error(`Missing cursor for page ${nextPage}`);
        }
        return cursorOfNextPage;
    };

    public _incrementCursorToNextPage = () => {
        const newCurrentPage = this.currentPage + 1;
        const nextPage = newCurrentPage + 1;

        runInAction(() => {
            this.currentPage = newCurrentPage;
            this._pageCursorInfo[nextPage] = this._nextPageCursor;
        });
    };

    public _decrementCursorToPrevPage = () => {
        const newCurrentPage = this.currentPage - 1;

        runInAction(() => {
            this.currentPage = newCurrentPage;
        });
    };

    public _setCursorToFirstPage = () => {
        runInAction(() => {
            this.currentPage = 1;
            this._pageCursorInfo = {};
            this._pageCursorInfo[2] = this._nextPageCursor;
        });
    };

    public get _nextPageCursor(): ESRequestSortField {
        return this.results[this.results.length - 1].sort;
    }
}

decorate(Manager, {
    pageSize: observable,
    queryThrottleInMS: observable,
    filters: observable,
    suggestions: observable,
    results: observable,
    _sideEffectQueue: observable,
    isSideEffectRunning: observable,
    client: observable,
    currentPage: observable,
    _pageCursorInfo: observable,
    indexFieldNamesAndTypes: observable,
    _nextPageCursor: computed,
    fieldsToFilterType: computed,
    fieldBlackList: observable,
    fieldWhiteList: observable
});

export default Manager;
