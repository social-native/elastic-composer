'use strict';
import {RangeFilterClass} from 'filters';
import {ESRequest, ESResponse, IClient} from 'types';
import {objKeys} from './utils';
import {decorate, observable, runInAction, reaction} from 'mobx';
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

class Manager<RangeFilter extends RangeFilterClass<any>> {
    public filters: Filters<RangeFilter>;
    public results: object[];
    public enqueueRunStartQuery: boolean;
    public filterQueryRunning: boolean;
    public client: IClient;

    constructor(client: IClient, filters: Filters<RangeFilter>) {
        runInAction(() => {
            this.client = client;
            this.filters = filters;
            this.enqueueRunStartQuery = false;
            this.filterQueryRunning = false;
        });

        reaction(
            () => ({...this.filters.range.rangeFilters} && {...this.filters.range.rangeKinds}),
            () => {
                runInAction(() => (this.enqueueRunStartQuery = true));
            }
        );

        reaction(
            () => this.enqueueRunStartQuery,
            shouldRun => {
                if (shouldRun && this.filterQueryRunning === false) {
                    runInAction(this.runFilterQuery);
                }
            }
        );
    }

    public runStartQuery = async () => {
        const request = this.createStartRequest();
        const response = await this.client.query(removeEmptyArrays(request));
        this.parseStartResponse(response);
    };

    public runFilterQuery = async () => {
        runInAction(() => {
            this.filterQueryRunning = true;
            this.enqueueRunStartQuery = false;
        });
        const request = this.createFilterRequest();
        const response = await this.client.query(removeEmptyArrays(request));
        this.parseFilterResponse(response);
        await Timeout.set(2000);

        runInAction(() => {
            this.filterQueryRunning = false;
        });
        if (this.enqueueRunStartQuery) {
            this.runFilterQuery();
        }
    };

    public createStartRequest = (): ESRequest => {
        return objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }
            return filter.addToStartRequest(request);
        }, BLANK_ES_REQUEST as ESRequest);
    };

    public createFilterRequest = (): ESRequest => {
        return objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            if (!filter) {
                return request;
            }

            return filter.addToFilterRequest(request);
        }, BLANK_ES_REQUEST as ESRequest);
    };

    public parseStartResponse = (response: ESResponse): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter.parseStartResponse(response);
        });
    };

    public parseFilterResponse = (response: ESResponse): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            if (!filter) {
                return;
            }
            filter.parseFilterResponse(response);
        });
    };
}

decorate(Manager, {
    filterQueryRunning: observable,
    enqueueRunStartQuery: observable,
    filters: observable,
    results: observable,
    client: observable
});

export default Manager;
