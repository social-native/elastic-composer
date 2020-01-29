'use strict';
import {RangeFilterClass} from 'filters';
import {ESRequest, ESResponse, IClient, ESHit, ESRequestSortField, ESMappingType} from 'types';
import {objKeys} from './utils';
import {decorate, observable, runInAction, reaction, toJS, computed} from 'mobx';
import Timeout from 'await-timeout';

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

const DEFAULT_MANAGER_OPTIONS: Required<ManagerOptions> = {
    pageSize: 10,
    queryThrottleInMS: 2000
};
type ManagerOptions = {
    pageSize?: number;
    queryThrottleInMS?: number;
};

type EffectInput<EffectKind extends string> = {
    kind: EffectKind;
    effect: QueryFn;
    debounce?: 'leading' | 'trailing';
    throttle: number; // in miliseconds
    params: any[];
};
type EffectRequest<EffectKind extends string> = {
    kind: EffectKind;
    effect: QueryFn;
    debounce?: 'leading' | 'trailing';
    throttle: number; // in miliseconds
    params: any[];
};

const createEffectRequest = <EffectKind extends string>(
    input: EffectInput<EffectKind>
): EffectRequest<EffectKind> => input;

type EffectKinds =
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

    // public enqueueStartQuery: boolean;
    // public enqueueFilteredQuery: boolean;
    // public enqueueForwardsPaginationQuery: boolean;
    // public enqueueBackwardsPaginationQuery: boolean;
    // public startQueryRunning: boolean;
    // public filterQueryRunning: boolean;
    // public paginationQueryRunning: boolean;
    public client: IClient<ResultObject>;
    public currentPage: number;
    public pageCursorInfo: Record<number, ESRequestSortField>;
    public indexFieldNamesAndTypes: Record<string, ESMappingType>;

    constructor(
        client: IClient<ResultObject>,
        filters: Filters<RangeFilter>,
        options?: ManagerOptions
    ) {
        console.log('hur manager');

        runInAction(() => {
            this.client = client;
            this.filters = filters;
            this.isSideEffectRunning = false;
            this.sideEffectQueue = [];
            // this.enqueueStartQuery = false;
            // this.enqueueFilteredQuery = false;
            // this.enqueueForwardsPaginationQuery = false;
            // this.enqueueBackwardsPaginationQuery = false;
            // this.startQueryRunning = false;
            // this.filterQueryRunning = false;
            // this.paginationQueryRunning = false;
            this.pageSize = (options && options.pageSize) || DEFAULT_MANAGER_OPTIONS.pageSize;
            this.queryThrottleInMS =
                (options && options.queryThrottleInMS) || DEFAULT_MANAGER_OPTIONS.queryThrottleInMS;
            this.pageCursorInfo = {};
            this.currentPage = 0; // set to 0 b/c there are no results on init
            this.indexFieldNamesAndTypes = {};
        });

        /**
         * React to state changes in the filters.
         * Run a new filter query.
         */
        // reaction(() => {
        //     return objKeys(this.filters).reduce((acc, filterName) => {
        //         return {
        //             acc,
        //             [filterName]: toJS(this.filters[filterName].shouldRunFilteredQuery)
        //         };
        //     }, {});
        // }, this.enqueueFilteredQuery);

        /**
         * Never used but is a possible permutation. Leave as a placeholder.
         */
        // reaction(() => {
        //     return objKeys(this.filters).reduce((acc, filterName) => {
        //         return {
        //             acc,
        //             [filterName]: toJS(this.filters[filterName].shouldRunFilteredAggs)
        //         };
        //     }, {});
        // }, this.enqueueFilteredAggs);

        reaction(() => {
            return objKeys(this.filters).reduce((acc, filterName) => {
                return {
                    acc,
                    [filterName]: toJS(this.filters[filterName].shouldRunFilteredQueryAndAggs)
                };
            }, {});
        }, this.enqueueFilteredQueryAndAggs);

        /**
         * Never used but is a possible permutation. Leave as a placeholder.
         */
        // reaction(() => {
        //     return objKeys(this.filters).reduce((acc, filterName) => {
        //         return {
        //             acc,
        //             [filterName]: toJS(this.filters[filterName].shouldRunUnfilteredQuery)
        //         };
        //     }, {});
        // }, this.enqueueUnfilteredQuery);

        // reaction(() => {
        //     return objKeys(this.filters).reduce((acc, filterName) => {
        //         return {
        //             acc,
        //             [filterName]: toJS(this.filters[filterName].shouldRunUnfilteredAggs)
        //         };
        //     }, {});
        // }, this.enqueueUnfilteredAggs);

        // reaction(() => {
        //     return objKeys(this.filters).reduce((acc, filterName) => {
        //         return {
        //             acc,
        //             [filterName]: toJS(this.filters[filterName].shouldRunUnfilteredQueryAndAggs)
        //         };
        //     }, {});
        // }, this.enqueueUnfilteredQueryAndAggs);

        /**
         * React to changes in query run state or requests to enqueue a query.
         * Run any queries that are enqueued.
         */
        // reaction(
        //     () => this.isQueryRunning || this.shouldEnqueueQuery,
        //     () => {
        //         // tslint:disable-next-line
        //         if (this.startQueryRunning === false && this.enqueueStartQuery) {
        //             this.runStartQuery();
        //         } else if (this.filterQueryRunning === false && this.enqueueFilteredQuery) {
        //             this.runFilteredQuery();
        //         } else if (
        //             this.paginationQueryRunning === false &&
        //             this.enqueueForwardsPaginationQuery
        //         ) {
        //             this.runPaginationQuery('forward');
        //         } else if (
        //             this.paginationQueryRunning === false &&
        //             this.enqueueBackwardsPaginationQuery
        //         ) {
        //             this.runPaginationQuery('backwards');
        //         } else {
        //             this.clearQueryQueues();
        //         }
        //     }
        // );

        reaction(
            () => this.indexFieldNamesAndTypes,
            (indexFieldNamesAndTypes: Record<string, ESMappingType>) => {
                Object.keys(indexFieldNamesAndTypes).forEach(fieldName => {
                    const type = indexFieldNamesAndTypes[fieldName];
                    if (type === 'long' || type === 'double' || type === 'integer') {
                        this.filters.range.addConfigForField(fieldName);
                    }
                });
            }
        );

        reaction(() => [...this.sideEffectQueue] && this.isSideEffectRunning, this.tryToRunEffect);
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
                await newEffectRequest.effect(...params);
            } else {
                await effectRequest.effect(...params);
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
                e => e && e.kind !== effectRequest.kind
            );
        });
    };

    /**
     *
     */
    public shiftFirstEffectOffQueue = (): EffectRequest<EffectKinds> | null => {
        const firstEffect = this.sideEffectQueue[0];
        runInAction(() => {
            this.sideEffectQueue.shift();
        });
        return firstEffect;
    };

    /**
     *
     */
    public addToQueue = (effect: EffectRequest<EffectKinds>) => {
        runInAction(() => {
            this.sideEffectQueue.push(effect);
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
     * First time a filter is shown (if not initially)
     *
     * We need to get the baseline for the filter if it wasn't fetched during startup
     * (b/c it was hidden)
     *
     * No debouncing - b/c we need to get very specific data
     */
    public enqueueUnfilteredAggs = (agg: aggregation) => {
        this.addToQueue(
            createEffectRequest({
                kind: 'unfilteredAggs',
                effect: this.runUnfilteredAggs,
                debounce: undefined,
                throttle: this.queryThrottleInMS,
                params: [agg]
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
    public enqueueUnfilteredQueryAndAggs = () => {
        this.addToQueue(
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
        this.addToQueue(
            createEffectRequest({
                kind: 'filteredFilteredQuery',
                effect: this.runFilteredQuery,
                params: [pageDirection],
                debounce: 'trailing',
                throttle: this.queryThrottleInMS
            })
        );
    };

    /**
     * Never used but is a possible permutation. Leave as a placeholder.
     */
    public enqueueFilteredAggs = () => {
        throw new Error('Not implemented');
    };

    /**
     * Every time a filter is changed
     *
     * Debouncing - b/c you want to get to where want to be, but not necessarily all the places in between
     * Leading edge buffer - b/c of the same reasoning as above
     */
    public enqueueFilteredQueryAndAggs = () => {
        this.addToQueue(
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

    /**
     * Returns the field names and types for the elasticsearch mapping(s)
     */
    public getFieldNamesAndTypes = async () => {
        const mappings = await this.client.mapping();
        runInAction(() => {
            this.indexFieldNamesAndTypes = mappings;
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
            filter.extractUnfilteredAggsStateFromResponse(response);
        });
    };

    public _extractFilteredAggsStateFromResponse = (response: ESResponse<ResultObject>): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter.extractFilteredAggsStateFromResponse(response);
        });
    };

    /**
     * ***************************************************************************
     * REQUEST BUILDERS
     * ***************************************************************************
     */

    public _createUnfilteredQueryAndAggsRequest = (blankRequest: ESRequest): ESRequest => {
        const startRequest = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }
            return filter.addUnfilteredQueryAndAggsToRequest(request);
        }, blankRequest);
        return this._addPageSizeToQuery(startRequest);
    };

    public _createUnfilteredAggsRequest = (blankRequest: ESRequest): ESRequest => {
        const startRequest = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }
            return filter.addUnfilteredAggsToRequest(request);
        }, blankRequest);
        return this._addPageSizeToQuery(startRequest);
    };

    public _createFilteredQueryAndAggsRequest = (blankRequest: ESRequest): ESRequest => {
        const requestWithFilters = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter.addFilteredQueryAndAggsToRequest(request);
        }, blankRequest);

        return this._addPageSizeToQuery(requestWithFilters);
    };

    public _createFilteredQueryRequest = (blankRequest: ESRequest): ESRequest => {
        const requestWithFilters = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter.addFilteredQueryToRequest(request);
        }, blankRequest);

        return this._addPageSizeToQuery(requestWithFilters);
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
    public runUnfilteredQueryAndAggs = async () => {
        try {
            const request = this._createUnfilteredQueryAndAggsRequest(BLANK_ES_REQUEST);
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
    public runFilteredQueryAndAggs = async () => {
        try {
            const request = this._createFilteredQueryAndAggsRequest(BLANK_ES_REQUEST);
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
    public runFilteredQuery = async (direction: 'forward' | 'backwards') => {
        try {
            const startingRequest =
                direction === 'forward' ? this._nextPageRequest() : this._prevPageRequest();

            const request = this._createFilteredQueryRequest(startingRequest);
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
    public runUnfilteredAggs = async () => {
        try {
            const request = this._createUnfilteredAggsRequest(BLANK_ES_REQUEST);
            const response = await this.client.search(removeEmptyArrays(request));

            // Save the results
            this._saveQueryResults(response);

            // Pass the response to the filter instances so they can extract info relevant to them.
            this._extractUnfilteredAggsStateFromResponse(response);

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
     * ***************************************************************************
     * PAGINATION
     * ***************************************************************************
     */

    public _addPageSizeToQuery = (request: ESRequest): ESRequest => {
        return {...request, size: this.pageSize, sort: ['_doc', '_score'], track_scores: true};
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
        // runInAction(() => {
        //     this.enqueueBackwardsPaginationQuery = true;
        // });
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
    // startQueryRunning: observable,
    // paginationQueryRunning: observable,
    // filterQueryRunning: observable,
    // enqueueStartQuery: observable,
    // enqueueFilteredQuery: observable,
    // enqueueForwardsPaginationQuery: observable,
    // enqueueBackwardsPaginationQuery: observable,
    filters: observable,
    results: observable,
    client: observable,
    pageSize: observable,
    queryThrottleInMS: observable,
    currentPage: observable,
    pageCursorInfo: observable,
    shouldEnqueueQuery: computed,
    isQueryRunning: computed,
    _nextPageCursor: computed,
    indexFieldNamesAndTypes: observable
});

export default Manager;
