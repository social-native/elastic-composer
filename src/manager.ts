'use strict';
import {RangeFilter, BooleanFilter, ExistsFilter, MultiSelectFilter} from './filters';
import {
    ESRequest,
    ESResponse,
    IClient,
    ESHit,
    ESRequestSortField,
    ESMappingType,
    Middleware,
    DebounceFn,
    EffectInput,
    EffectRequest,
    IFilters,
    ISuggestions,
    ManagerOptions,
    EffectKinds
} from './types';
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
        multiselect: new MultiSelectFilter(),
        exists: new ExistsFilter(),
        boolean: new BooleanFilter(),
        range: new RangeFilter()
    },
    suggestions: {
        fuzzy: new FuzzySuggestion(),
        prefix: new PrefixSuggestion()
    },
    middleware: []
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

const createEffectRequest = <EffectKind extends string>(
    input: EffectInput<EffectKind>
): EffectRequest<EffectKind> => input;

type DefaultOptions = {
    filters: IFilters;
    suggestions: ISuggestions;
};

type FiltersAndSuggestions = {
    filters: IFilters[];
    suggestions: ISuggestions[];
};

class Manager<
    Options extends DefaultOptions = DefaultOptions,
    ESDocSource extends object = object
> {
    public middleware: Middleware[];
    public defaultMiddleware: Middleware[];
    public pageSize: number;
    public queryThrottleInMS: number;
    public filters: IFilters;
    public suggestions: ISuggestions;

    public results: Array<ESHit<ESDocSource>>;
    public rawESResponse?: ESResponse<ESDocSource>;

    public _sideEffectQueue: Array<EffectRequest<EffectKinds>>;
    public isSideEffectRunning: boolean;

    public client: IClient<ESDocSource>;
    public currentPage: number;
    public _pageCursorInfo: Record<number, ESRequestSortField>;
    public indexFieldNamesAndTypes: Record<string, ESMappingType>;

    public fieldWhiteList: string[];
    public fieldBlackList: string[];

    constructor(client: IClient<ESDocSource>, options?: ManagerOptions) {
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
            this.filters = filters as IFilters;
            this.suggestions = suggestions as ISuggestions;
            this.isSideEffectRunning = false;
            this._sideEffectQueue = [];

            this.results = [] as Array<ESHit<ESDocSource>>;

            this.pageSize = (options && options.pageSize) || DEFAULT_MANAGER_OPTIONS.pageSize;
            this.queryThrottleInMS =
                options && options.queryThrottleInMS !== undefined
                    ? options.queryThrottleInMS
                    : DEFAULT_MANAGER_OPTIONS.queryThrottleInMS;
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

            this.defaultMiddleware = [
                this._batchAggsMiddleware,
                this._rerunSuggestionsOnFilterChange,
                this._applyBlackAndWhiteListsToSourceParam
            ];

            this.middleware = (options && options.middleware) || DEFAULT_MANAGER_OPTIONS.middleware;
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

        // // FOR TESTING - Don't delete this code
        // reaction(
        //     () => ({
        //         queue: [...this._sideEffectQueue],
        //         isSideEffectRunning: !!this.isSideEffectRunning
        //     }),
        //     data => {
        //         console.log(this._sideEffectQueue.map(k => k.kind));
        //     }
        // );

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

    public get activeFilters() {
        return objKeys(this.filters).reduce((acc, filterName) => {
            const filter = this.filters[filterName];
            const activeFieldsForFilter = filter.activeFields;
            return activeFieldsForFilter.reduce((acc2, activeFieldName) => {
                const existingActiveFilterNames = acc2[activeFieldName] || [];
                acc2[activeFieldName] = [...existingActiveFilterNames, filter];
                return acc2;
            }, acc);
        }, {});
    }

    public clearAllFilters = () => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            filter.clearAllFieldFilters();
        });
    };

    public get activeSuggestions() {
        return objKeys(this.suggestions).reduce((acc, suggestionName) => {
            const suggestion = this.suggestions[suggestionName];
            const activeFieldsForSuggestion = suggestion.activeFields;
            return activeFieldsForSuggestion.reduce((acc2, activeFieldName) => {
                const existingActiveSuggestionNames = acc2[activeFieldName] || [];
                acc2[activeFieldName] = [...existingActiveSuggestionNames, suggestion];
                return acc2;
            }, acc);
        }, {});
    }

    public clearAllSuggestions = () => {
        objKeys(this.suggestions).forEach(suggestionName => {
            const suggestion = this.suggestions[suggestionName];
            suggestion.clearAllFieldSuggestions();
        });
    };

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
        throw new Error('Deprecated. Use fieldsWithFiltersAndSuggestions instead');
    }

    public get fieldsWithFiltersAndSuggestions(): Record<string, FiltersAndSuggestions> {
        const fieldsWithFilters = objKeys(this.filters).reduce((acc, filterName) => {
            const filter = this.filters[filterName];
            const fieldsForFilter = filter.fields;
            return fieldsForFilter.reduce((acc2, fieldName) => {
                const existingFilterAndSuggestions = acc2[fieldName] || {};
                const existingFilters = existingFilterAndSuggestions.filters || [];
                acc2[fieldName] = {
                    ...existingFilterAndSuggestions,
                    filters: [...existingFilters, filter]
                } as FiltersAndSuggestions;
                return acc2;
            }, acc);
        }, {} as Record<string, FiltersAndSuggestions>);

        const fieldsWithFiltersAndSuggestions = objKeys(this.suggestions).reduce(
            (acc, suggestionName) => {
                const suggestion = this.suggestions[suggestionName];
                const fieldsForSuggestion = suggestion.fields;
                return fieldsForSuggestion.reduce((acc2, fieldName) => {
                    const existingFilterAndSuggestions = acc2[fieldName] || {};
                    const existingFilters = existingFilterAndSuggestions.suggestions || [];
                    acc2[fieldName] = {
                        ...existingFilterAndSuggestions,
                        suggestions: [...existingFilters, suggestion]
                    } as FiltersAndSuggestions;
                    return acc2;
                }, acc);
            },
            fieldsWithFilters
        );

        return fieldsWithFiltersAndSuggestions;
    }

    public _runEffect = async (effectRequest: EffectRequest<EffectKinds>) => {
        try {
            // tslint:disable-next-line
            runInAction(() => {
                this.isSideEffectRunning = true;
            });

            const params = effectRequest.params || [];
            if (effectRequest.throttle && effectRequest.throttle > 0) {
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

    public _fieldMatchesPrefixs = (field: string, prefixes: string[]): boolean => {
        return prefixes.reduce((acc, prefix) => {
            return field.startsWith(prefix) || acc;
        }, false as boolean);
    };

    public _filterFieldNamesAndTypesUsingWhiteAndBlackList = (
        mappings: Record<string, ESMappingType>
    ): Record<string, ESMappingType> => {
        if (this.fieldWhiteList.length > 0) {
            return objKeys(mappings)
                .filter(fieldName => this._fieldMatchesPrefixs(fieldName, this.fieldWhiteList))
                .reduce(
                    (newMappings, filteredFieldName) => ({
                        ...newMappings,
                        [filteredFieldName]: mappings[filteredFieldName]
                    }),
                    {} as Record<string, ESMappingType>
                );
        } else if (this.fieldBlackList.length > 0) {
            return objKeys(mappings)
                .filter(fieldName => !this._fieldMatchesPrefixs(fieldName, this.fieldBlackList))
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
        response: ESResponse<ESDocSource>
    ): Required<ESResponse<ESDocSource>> => {
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
    public _saveQueryResults = (response: ESResponse<ESDocSource>) => {
        if (response.timed_out === false && response.hits.total >= 0) {
            runInAction(() => {
                if (response && response.hits && response.hits.hits) {
                    this.results = response.hits.hits;
                }
            });
        }
        runInAction(() => {
            this.rawESResponse = response;
        });
    };

    public _extractUnfilteredAggsStateFromResponse = (response: ESResponse<ESDocSource>): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter._extractUnfilteredAggsStateFromResponse(response);
        });
    };

    public _extractFilteredAggsStateFromResponse = (response: ESResponse<ESDocSource>): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter._extractFilteredAggsStateFromResponse(response);
        });
    };

    public _extractSuggestionStateFromResponse = (response: ESResponse<ESDocSource>): void => {
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

    public _applyBlackAndWhiteListsToSourceParam = (
        // tslint:disable-next-line
        _effectRequest: EffectRequest<EffectKinds>,
        request: ESRequest
    ): ESRequest => {
        return this._applyBlackAndWhiteListsToQuery(request);
    };

    public _rerunSuggestionsOnFilterChange = (
        // tslint:disable-next-line
        effectRequest: EffectRequest<EffectKinds>,
        request: ESRequest
    ): ESRequest => {
        if (
            effectRequest.kind === 'filteredAggs' ||
            effectRequest.kind === 'filteredQuery' ||
            effectRequest.kind === 'filteredQueryAndAggs'
        ) {
            this._addToQueueLiFo(
                createEffectRequest({
                    kind: 'allEnabledSuggestions',
                    debouncedByKind: [effectRequest.kind],
                    debounce: undefined,
                    effect: this._runAllEnabledSuggestionSearch,
                    throttle: 0,
                    params: []
                })
            );
        }

        return request;
    };
    /**
     * When aggs are updated and there is an ongoing search suggestion,
     * we want to update the suggestion when the filters change
     */
    public _addSuggestionsToRequest = (request: ESRequest) => {
        return objKeys(this.suggestions).reduce(
            (acc, suggestionName) => {
                return this.suggestions[
                    suggestionName
                ]._addSuggestionQueryAndAggsToRequestForAllFields(acc);
            },
            {...request}
        );
    };

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
        return [...this.defaultMiddleware, ...this.middleware].reduce((newRequest, m) => {
            return m(effectRequest, newRequest);
        }, request as ESRequest);
    };

    public setMiddleware = (middlewares: Middleware[]) => {
        runInAction(() => {
            this.middleware = [...middlewares];
        });
    };

    /**
     * ***************************************************************************
     * REQUEST BUILDERS
     * ***************************************************************************
     */

    public _createAllEnabledSuggestionsRequest = (
        effectRequest: EffectRequest<EffectKinds>,
        blankRequest: ESRequest
    ): ESRequest => {
        const requestWithSuggestion = this._addSuggestionsToRequest(blankRequest);
        const fullRequest = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter._addFilteredQueryToRequest(request);
        }, requestWithSuggestion);
        // We want:
        // - no results
        return this._addSortToQuery(
            this._addZeroPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest))
        );
    };

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
        return this._addSortToQuery(
            this._addZeroPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest))
        );
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
        // // update any suggestions if they changed
        // // b/c an agg could have changed and the results are being filtered
        // const fullRequestWithSuggestions = this._addSuggestionsToRequest(fullRequest);
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

        // // update any suggestions if they changed
        // // b/c an agg could have changed and the results are being filtered
        // const fullRequestWithSuggestions = this._addSuggestionsToRequest(fullRequest);

        // We want:
        // - a page of results
        // - the results to be sorted
        return this._addSortToQuery(
            this._addPageSizeToQuery(this._requestMiddleware(effectRequest, fullRequest))
        );
    };

    public _createCustomFilteredQueryRequest = (
        startingRequest: ESRequest,
        options: Pick<ManagerOptions, 'fieldBlackList' | 'fieldWhiteList' | 'pageSize'>
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
        // no middleware used b/c this is a custom request that is used outside the side effect queue
        return this._applyBlackAndWhiteListsToQuery(
            this._addSortToQuery(this._addPageSizeToQuery(fullRequest, options.pageSize)),
            options
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

    public runCustomFilterQuery = async (
        options: Pick<ManagerOptions, 'fieldBlackList' | 'fieldWhiteList' | 'pageSize'>
    ): Promise<ESResponse> => {
        try {
            const request = this._createCustomFilteredQueryRequest(BLANK_ES_REQUEST, options);
            const response = await this.client.search(removeEmptyArrays(request));

            return response;
        } catch (e) {
            throw e;
        }
    };

    public _runAllEnabledSuggestionSearch = async (effectRequest: EffectRequest<EffectKinds>) => {
        try {
            const request = this._createAllEnabledSuggestionsRequest(
                effectRequest,
                BLANK_ES_REQUEST
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

    public _applyBlackAndWhiteListsToQuery = (
        request: ESRequest,
        // tslint:disable-next-line
        lists: Pick<ManagerOptions, 'fieldBlackList' | 'fieldWhiteList'> | undefined = undefined
    ): ESRequest => {
        if (lists && lists.fieldWhiteList && lists.fieldWhiteList.length > 0) {
            const body = {includes: lists.fieldWhiteList};
            return {
                ...request,
                _source: {
                    ...body
                }
            };
        } else if (lists && lists.fieldBlackList && lists.fieldBlackList.length > 0) {
            const body = {excludes: lists.fieldBlackList};
            return {
                ...request,
                _source: {
                    ...body
                }
            };
        } else {
            const body =
                this.fieldWhiteList.length > 0
                    ? {includes: this.fieldWhiteList}
                    : {excludes: this.fieldBlackList || []};
            return {
                ...request,
                _source: {
                    ...body
                }
            };
        }
    };

    public _addPageSizeToQuery = (
        request: ESRequest,
        // pageSize param can be used to override the default page size
        pageSize: number | undefined = undefined
    ): ESRequest => {
        return {...request, size: pageSize || this.pageSize, track_scores: true};
    };

    public _addSortToQuery = (request: ESRequest): ESRequest => {
        return {...request, sort: ['_score', '_doc']};
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

    public get hasNextPage() {
        const foundDocs =
            (this.rawESResponse && this.rawESResponse.hits && this.rawESResponse.hits.total) || 0;
        const currentDocsSeen = this.pageSize * this.currentPage;
        return currentDocsSeen < foundDocs;
    }

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
        const firstResult = this.results[this.results.length - 1];
        if (!firstResult) {
            throw new Error(
                'Could not calculate next page cursor. No results to extract sorting from'
            );
        }
        return firstResult.sort;
    }
}

decorate(Manager, {
    middleware: observable,
    defaultMiddleware: observable,
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
    fieldsWithFiltersAndSuggestions: computed,
    fieldBlackList: observable,
    fieldWhiteList: observable,
    hasNextPage: computed
});

export default Manager;
