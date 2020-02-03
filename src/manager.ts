'use strict';
import {RangeFilterClass} from 'filters';
import {ESRequest, ESResponse, IClient, ESHit, ESRequestSortField, ESMappingType} from 'types';
import {objKeys} from './utils';
import {decorate, observable, runInAction, reaction, toJS, computed} from 'mobx';
import Timeout from 'await-timeout';
import chunk from 'lodash.chunk';

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

type Filters<RangeFilter extends RangeFilterClass<any>> = {
    range: RangeFilter;
};

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
    queryThrottleInMS: 2000
};
type ManagerOptions = {
    pageSize?: number;
    queryThrottleInMS?: number;
    fieldWhiteList?: string[];
    fieldBlackList?: string[];
};

type EffectInput<EffectKind extends string> = {
    kind: EffectKind;
    effect: QueryFn;
    debouncedByKind?: EffectKind[];
    debounce?: 'leading' | 'trailing';
    throttle: number; // in miliseconds
    params: any[];
};
type EffectRequest<EffectKind extends string> = {
    kind: EffectKind;
    effect: QueryFn;
    debouncedByKind?: EffectKind[];
    debounce?: 'leading' | 'trailing';
    throttle: number; // in miliseconds
    params: any[];
};

const createEffectRequest = <EffectKind extends string>(
    input: EffectInput<EffectKind>
): EffectRequest<EffectKind> => input;

type EffectKinds =
    | 'batchAggs'
    | 'unfilteredQuery'
    | 'unfilteredAggs'
    | 'unfilteredQueryAndAggs'
    | 'filteredQuery'
    | 'filteredAggs'
    | 'filteredQueryAndAggs';

type QueryFn = (...params: any[]) => void;

class Manager<RangeFilter extends RangeFilterClass<any>, ResultObject extends object = object> {
    public pageSize: number;
    public queryThrottleInMS: number;
    public filters: Filters<RangeFilter>;
    public results: Array<ESHit<ResultObject>>;

    public sideEffectQueue: Array<EffectRequest<EffectKinds> | null>;
    public isSideEffectRunning: boolean;

    public client: IClient<ResultObject>;
    public currentPage: number;
    public pageCursorInfo: Record<number, ESRequestSortField>;
    public indexFieldNamesAndTypes: Record<string, ESMappingType>;

    public fieldWhiteList: string[];
    public fieldBlackList: string[];

    constructor(
        client: IClient<ResultObject>,
        filters: Filters<RangeFilter>,
        options?: ManagerOptions
    ) {
        // tslint:disable-next-line
        runInAction(() => {
            this.client = client;
            this.filters = filters;
            this.isSideEffectRunning = false;
            this.sideEffectQueue = [];

            this.pageSize = (options && options.pageSize) || DEFAULT_MANAGER_OPTIONS.pageSize;
            this.queryThrottleInMS =
                (options && options.queryThrottleInMS) || DEFAULT_MANAGER_OPTIONS.queryThrottleInMS;
            this.pageCursorInfo = {};
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
            const filter = this.filters[filterName];
            filter._subscribeToShouldUpdateFilteredAggs(this.enqueueFilteredAggs);
            filter._subscribeToShouldUpdateUnfilteredAggs(this.enqueueUnfilteredAggs);
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
                this.enqueueFilteredQueryAndAggs();
            }
        );

        reaction(
            () => this.indexFieldNamesAndTypes,
            (indexFieldNamesAndTypes: Record<string, ESMappingType>) => {
                Object.keys(indexFieldNamesAndTypes).forEach(fieldName => {
                    const type = indexFieldNamesAndTypes[fieldName];
                    if (type === 'long' || type === 'double' || type === 'integer') {
                        this.filters.range._addConfigForField(fieldName);
                    }
                });
            }
        );

        reaction(
            () => ({
                queue: [...this.sideEffectQueue],
                isSideEffectRunning: !!this.isSideEffectRunning
            }),
            data => {
                if (data.isSideEffectRunning === false) {
                    this.tryToRunEffect();
                }
            }
        );
    }

    public tryToRunEffect = () => {
        if (this.isSideEffectRunning) {
            return;
        }
        const effect = this.shiftFirstEffectOffQueue();

        if (!effect) {
            return;
        } else {
            this.runEffect(effect);
        }
    };

    public get fieldsToFilterType() {
        return objKeys(this.filters).reduce((map, filterName) => {
            const filter = this.filters[filterName];
            const typeMaps = filter.fields.reduce((filterMap, fieldName) => {
                return {...filterMap, [fieldName]: filter.filterKind};
            }, {} as Record<string, string>);

            return {...map, ...typeMaps};
        }, {} as Record<string, string>);
    }

    public runEffect = async (effectRequest: EffectRequest<EffectKinds>) => {
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
                this.removeAllOtherEffectsOfKindFromQueue(effectRequest);

                await effectRequest.effect(...params);
            } else if (effectRequest.debounce === 'trailing') {
                const newEffectRequest = this.findLastEffectOfKindAndRemoveAllOthersFromQueue(
                    effectRequest
                );

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

    public findLastEffectOfKindAndRemoveAllOthersFromQueue = (
        effectRequest: EffectRequest<EffectKinds>
    ): EffectRequest<EffectKinds> => {
        const lastEffectOfKind = this.sideEffectQueue
            .slice()
            .reverse()
            .find(e => e && e.kind === effectRequest.kind);

        this.removeAllOtherEffectsOfKindFromQueue(effectRequest);

        return lastEffectOfKind ? lastEffectOfKind : effectRequest;
    };

    public removeAllOtherEffectsOfKindFromQueue = (
        effectRequest: EffectRequest<EffectKinds>
    ): void => {
        runInAction(() => {
            this.sideEffectQueue = this.sideEffectQueue.filter(
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
    public shiftFirstEffectOffQueue = (): EffectRequest<EffectKinds> | null => {
        if (this.sideEffectQueue.length === 0) {
            return null;
        }
        const firstEffect = this.sideEffectQueue[0];
        runInAction(() => {
            this.sideEffectQueue.shift();
        });
        return firstEffect;
    };

    /**
     *
     */
    public addToQueueLiFo = (effect: EffectRequest<EffectKinds>) => {
        runInAction(() => {
            this.sideEffectQueue = [effect, ...this.sideEffectQueue];
        });
    };

    public addToQueueFiFo = (effect: EffectRequest<EffectKinds>) => {
        runInAction(() => {
            this.sideEffectQueue = [...this.sideEffectQueue, effect];
        });
    };

    /**
     * ***************************************************************************
     * SIDE EFFECT ENQEUEING
     * ***************************************************************************
     */

    /**
     * Never used but is a possible permutation. Leave as a placeholder.
     */
    public enqueueUnfilteredQuery = () => {
        throw new Error('Not implemented');
    };

    /**
     * We need to get the baseline for the filter if it wasn't fetched during startup
     * (b/c it was hidden)
     *
     * No debouncing - b/c we don't want the data request lost
     */
    public enqueueUnfilteredAggs = (filter: string, field: string) => {
        this.addToQueueLiFo(
            createEffectRequest({
                kind: 'unfilteredAggs',
                effect: this.runUnfilteredAggs,
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
        this.enqueueUnfilteredQueryAndAggs();
    };

    public enqueueUnfilteredQueryAndAggs = () => {
        this.addToQueueLiFo(
            createEffectRequest({
                kind: 'unfilteredQueryAndAggs',
                effect: this.runUnfilteredQueryAndAggs,
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
    public enqueueFilteredQuery = (pageDirection: 'forward' | 'backward') => {
        this.addToQueueLiFo(
            createEffectRequest({
                kind: 'filteredQuery',
                effect: this.runFilteredQuery,
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
    public enqueueFilteredAggs = (filter: string, field: string) => {
        this.addToQueueLiFo(
            createEffectRequest({
                kind: 'filteredAggs',
                debouncedByKind: ['filteredQueryAndAggs'],
                effect: this.runFilteredAggs,
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
    public enqueueFilteredQueryAndAggs = () => {
        this.addToQueueLiFo(
            createEffectRequest({
                kind: 'filteredQueryAndAggs',
                effect: this.runFilteredQueryAndAggs,
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

    public filterFieldNamesAndTypesUsingWhiteAndBlackList = (
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
            this.indexFieldNamesAndTypes = this.filterFieldNamesAndTypesUsingWhiteAndBlackList(
                mappings
            );
        });
    };

    /**
     * ***************************************************************************
     * RESPONSE UTILS
     * ***************************************************************************
     */

    public formatResponse = (
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
                this.results = response.hits.hits;
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

    /**
     * ***************************************************************************
     * REQUEST MIDDLEWARE
     * ***************************************************************************
     */

    public batchAggsMiddleware = (
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
            this.addToQueueFiFo(
                createEffectRequest({
                    kind: 'batchAggs',
                    debouncedByKind: [effectRequest.kind],
                    debounce: undefined,
                    effect:
                        effectRequest.kind === 'unfilteredAggs' ||
                        effectRequest.kind === 'unfilteredQueryAndAggs'
                            ? this.runUnfilteredBatchedAggs
                            : this.runFilteredBatchedAggs,
                    throttle: 0,
                    params: [r]
                })
            );
        });
        return firstRequest;
    };

    public requestMiddleware = (
        effectRequest: EffectRequest<EffectKinds>,
        request: ESRequest
    ): ESRequest => {
        return [this.batchAggsMiddleware].reduce((newRequest, m) => {
            return m(effectRequest, newRequest);
        }, request as ESRequest);
    };

    /**
     * ***************************************************************************
     * REQUEST BUILDERS
     * ***************************************************************************
     */

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
            this._addPageSizeToQuery(this.requestMiddleware(effectRequest, fullRequest))
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
        // - the results to be sorted
        return this._addZeroPageSizeToQuery(this.requestMiddleware(effectRequest, fullRequest));
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
        return this._addZeroPageSizeToQuery(this.requestMiddleware(effectRequest, fullRequest));
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
            this._addPageSizeToQuery(this.requestMiddleware(effectRequest, fullRequest))
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
            this._addPageSizeToQuery(this.requestMiddleware(effectRequest, fullRequest))
        );
    };

    /**
     * ***************************************************************************
     * ES QUERY MANAGERS
     * ***************************************************************************
     */

    /**
     * Executes a query that runs on instantiation.
     * This query is used to get the unfiltered aggs, which describe the shape of the
     * total data set.
     * This query will have no `query` component but likely have an `ags` component.
     */
    public runUnfilteredQueryAndAggs = async (effectRequest: EffectRequest<EffectKinds>) => {
        try {
            const request = this._createUnfilteredQueryAndAggsRequest(
                effectRequest,
                BLANK_ES_REQUEST
            );
            const response = await this.client.search(removeEmptyArrays(request));
            const formattedResponse = this.formatResponse(response);
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

    /**
     * Executes a filtered query.
     * This query will likely have both a `query` component and an `ags` component.
     */
    public runFilteredQueryAndAggs = async (effectRequest: EffectRequest<EffectKinds>) => {
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

    /**
     * Executes a pagination query.
     * This query will likely have a `query` component but not an agg component.
     */
    public runFilteredQuery = async (
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

    /**
     * Executes a filtered query.
     * This query will likely have both a `query` component and an `ags` component.
     */
    public runFilteredAggs = async (
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

    /**
     * Executes a filtered query.
     * This query will likely have both a `query` component and an `ags` component.
     */
    public runUnfilteredAggs = async (
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

    public runUnfilteredBatchedAggs = async (effectRequest: EffectRequest<EffectKinds>) => {
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

    public runFilteredBatchedAggs = async (effectRequest: EffectRequest<EffectKinds>) => {
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
        this.enqueueFilteredQuery('forward');
    };

    public _nextPageRequest = () => {
        const newRequest: ESRequest = {
            ...BLANK_ES_REQUEST,
            search_after: this._getCursorForNextPage()
        };
        return newRequest;
    };

    public prevPage = () => {
        this.enqueueFilteredQuery('backward');
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
            const cursorOfNextPage = this.pageCursorInfo[prevPage];
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

        const cursorOfNextPage = this.pageCursorInfo[nextPage];
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
            this.pageCursorInfo[nextPage] = this._nextPageCursor;
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
            this.pageCursorInfo = {};
            this.pageCursorInfo[2] = this._nextPageCursor;
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
    results: observable,
    sideEffectQueue: observable,
    isSideEffectRunning: observable,
    client: observable,
    currentPage: observable,
    pageCursorInfo: observable,
    indexFieldNamesAndTypes: observable,
    _nextPageCursor: computed,
    fieldsToFilterType: computed,
    fieldBlackList: observable,
    fieldWhiteList: observable
});

export default Manager;
