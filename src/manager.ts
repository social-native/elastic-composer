'use strict';
import {RangeFilterClass} from 'filters';
import {ESRequest, ESResponse, IClient, ESHit, ESRequestSortField, ESMappingType} from 'types';
import {objKeys} from './utils';
import {decorate, observable, runInAction, reaction, toJS, computed, autorun} from 'mobx';
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
    queryDebounceInMS: 2000
};
type ManagerOptions = {
    pageSize?: number;
    queryDebounceInMS?: number;
};

class Manager<RangeFilter extends RangeFilterClass<any>, ResultObject extends object = object> {
    public pageSize: number;
    public queryDebounceInMS: number;
    public filters: Filters<RangeFilter>;
    public results: Array<ESHit<ResultObject>>;
    public enqueueStartQuery: boolean;
    public enqueueFilteredQuery: boolean;
    public enqueueForwardsPaginationQuery: boolean;
    public enqueueBackwardsPaginationQuery: boolean;
    public startQueryRunning: boolean;
    public filterQueryRunning: boolean;
    public paginationQueryRunning: boolean;
    public client: IClient<ResultObject>;
    public currentPage: number;
    public pageCursorInfo: Record<number, ESRequestSortField>;
    public fieldNamesAndTypes: Record<string, ESMappingType>;

    constructor(
        client: IClient<ResultObject>,
        filters: Filters<RangeFilter>,
        options?: ManagerOptions
    ) {
        runInAction(() => {
            this.client = client;
            this.filters = filters;
            this.enqueueStartQuery = false;
            this.enqueueFilteredQuery = false;
            this.enqueueForwardsPaginationQuery = false;
            this.enqueueBackwardsPaginationQuery = false;
            this.startQueryRunning = false;
            this.filterQueryRunning = false;
            this.paginationQueryRunning = false;
            this.pageSize = (options && options.pageSize) || DEFAULT_MANAGER_OPTIONS.pageSize;
            this.queryDebounceInMS =
                (options && options.queryDebounceInMS) || DEFAULT_MANAGER_OPTIONS.queryDebounceInMS;
            this.pageCursorInfo = {};
            this.currentPage = 0; // set to 0 b/c there are no results on init
            this.fieldNamesAndTypes = {};
        });

        /**
         * React to state changes in the filters.
         * Run a new filter query.
         */
        reaction(
            () => {
                return objKeys(this.filters).reduce((acc, filterName) => {
                    return {acc, [filterName]: toJS(this.filters[filterName].filterAffectiveState)};
                }, {});
            },
            () => {
                runInAction(() => {
                    this.enqueueFilteredQuery = true;
                });
            }
        );

        /**
         * React to changes in query run state or requests to enqueue a query.
         * Run any queries that are enqueued.
         */
        reaction(
            () => this.isQueryRunning || this.shouldEnqueueQuery,
            () => {
                // tslint:disable-next-line
                if (this.startQueryRunning === false && this.enqueueStartQuery) {
                    this.runStartQuery();
                } else if (this.filterQueryRunning === false && this.enqueueFilteredQuery) {
                    this.runFilteredQuery();
                } else if (
                    this.paginationQueryRunning === false &&
                    this.enqueueForwardsPaginationQuery
                ) {
                    this.runPaginationQuery('forward');
                } else if (
                    this.paginationQueryRunning === false &&
                    this.enqueueBackwardsPaginationQuery
                ) {
                    this.runPaginationQuery('backwards');
                } else {
                    this.clearQueryQueues();
                }
            }
        );
        // );
    }

    /**
     * Returns the field names and types for the elasticsearch mapping(s)
     */
    public getFieldNamesAndTypes = async () => {
        const mappings = await this.client.mapping();
        runInAction(() => {
            this.fieldNamesAndTypes = mappings;
        });
    };

    /**
     * Is an query currently running?
     */
    public get isQueryRunning() {
        return this.startQueryRunning || this.filterQueryRunning || this.paginationQueryRunning;
    }

    /**
     * Are there any queries waiting to run?
     */
    public get shouldEnqueueQuery() {
        return {
            enqueueStartQuery: this.enqueueStartQuery,
            enqueueFilteredQuery: this.enqueueFilteredQuery,
            enqueueForwardsPaginationQuery: this.enqueueForwardsPaginationQuery,
            enqueueBackwardsPaginationQuery: this.enqueueBackwardsPaginationQuery
        };
    }

    /**
     * Cancel any queries waiting to be run
     */
    public clearQueryQueues = () => {
        runInAction(() => {
            this.startQueryRunning = false;
            this.enqueueFilteredQuery = false;
            this.enqueueForwardsPaginationQuery = false;
            this.enqueueBackwardsPaginationQuery = false;
        });
    };

    /**
     * Executes a query that runs on instantiation.
     * This query is used to get the unfiltered aggs, which describe the shape of the
     * total data set.
     * This query will have no `query` component but likely have an `ags` component.
     */
    public runStartQuery = async () => {
        try {
            runInAction(() => {
                this.startQueryRunning = true;
                this.clearQueryQueues();
            });

            const request = this._createStartRequest(BLANK_ES_REQUEST);
            const response = await this.client.search(removeEmptyArrays(request));
            this._saveQueryResults(response);
            this._extractStateFromStartResponse(response);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryDebounceInMS);

            // Since the filters have changed, we should set the cursor back to
            // the first page.
            this._setCursorToFirstPage();
        } catch (e) {
            throw e;
        } finally {
            runInAction(() => {
                this.startQueryRunning = false;
            });
        }
    };

    public _createStartRequest = (blankRequest: ESRequest): ESRequest => {
        return objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }
            return filter.startRequestTransform(request);
        }, blankRequest);
    };

    public _extractStateFromStartResponse = (response: ESResponse<ResultObject>): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter.extractStateFromStartResponse(response);
        });
    };

    /**
     * Executes a filtered query.
     * This query will likely have both a `query` component and an `ags` component.
     */
    public runFilteredQuery = async () => {
        try {
            runInAction(() => {
                this.filterQueryRunning = true;
                this.clearQueryQueues();
            });

            const request = this._createFilterRequest(BLANK_ES_REQUEST);
            const response = await this.client.search(removeEmptyArrays(request));

            // Save the results
            this._saveQueryResults(response);

            // Pass the response to the filter instances so they can extract info relevant to them.
            this._extractStateFromFilterResponse(response);

            // Timeout used as the debounce time.
            await Timeout.set(this.queryDebounceInMS);

            // Since the filters have changed, we should set the cursor back to
            // the first page.
            this._setCursorToFirstPage();
        } catch (e) {
            throw e;
        } finally {
            runInAction(() => {
                this.filterQueryRunning = false;
            });
        }
    };

    public _createFilterRequest = (blankRequest: ESRequest): ESRequest => {
        const requestWithFilters = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter.filterRequestTransform(request);
        }, blankRequest);

        return this._addPageSizeToFilterQuery(requestWithFilters);
    };

    public _extractStateFromFilterResponse = (response: ESResponse<ResultObject>): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter.extractStateFromFilterResponse(response);
        });
    };

    /**
     * Executes a pagination query.
     * This query will likely have a `query` component but not an agg component.
     */
    public runPaginationQuery = async (direction: 'forward' | 'backwards') => {
        try {
            runInAction(() => {
                this.paginationQueryRunning = true;
                this.clearQueryQueues();
            });

            const startingRequest =
                direction === 'forward' ? this._nextPageRequest() : this._prevPageRequest();

            const request = this._createPaginationRequest(startingRequest);
            const response = await this.client.search(removeEmptyArrays(request));

            // Save the results
            this._saveQueryResults(response);

            await Timeout.set(this.queryDebounceInMS);

            if (direction === 'forward') {
                this._incrementCursorToNextPage();
            } else {
                this._decrementCursorToPrevPage();
            }
        } catch (e) {
            throw e;
        } finally {
            runInAction(() => {
                this.paginationQueryRunning = false;
            });
        }
    };

    public _createPaginationRequest = (blankRequest: ESRequest): ESRequest => {
        const requestWithFilters = objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter.paginationRequestTransform(request);
        }, blankRequest);

        return this._addPageSizeToFilterQuery(requestWithFilters);
    };

    public _addPageSizeToFilterQuery = (request: ESRequest): ESRequest => {
        return {...request, size: this.pageSize, sort: ['_doc', '_score'], track_scores: true};
    };

    public nextPage = () => {
        runInAction(() => {
            this.enqueueForwardsPaginationQuery = true;
        });
    };

    public _nextPageRequest = () => {
        const newRequest: ESRequest = {
            ...BLANK_ES_REQUEST,
            search_after: this._getCursorForNextPage()
        };
        return newRequest;
    };

    public prevPage = () => {
        runInAction(() => {
            this.enqueueBackwardsPaginationQuery = true;
        });
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
}

decorate(Manager, {
    startQueryRunning: observable,
    paginationQueryRunning: observable,
    filterQueryRunning: observable,
    enqueueStartQuery: observable,
    enqueueFilteredQuery: observable,
    enqueueForwardsPaginationQuery: observable,
    enqueueBackwardsPaginationQuery: observable,
    filters: observable,
    results: observable,
    client: observable,
    pageSize: observable,
    queryDebounceInMS: observable,
    currentPage: observable,
    pageCursorInfo: observable,
    shouldEnqueueQuery: computed,
    isQueryRunning: computed,
    _nextPageCursor: computed
});

export default Manager;
