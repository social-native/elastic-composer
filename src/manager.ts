import {RangeFilter} from 'filters';
import {ESRequest, ESResponse} from 'types';
import {objKeys} from './utils';
import axios from 'axios';
import {decorate, observable, runInAction} from 'mobx';

type Filters<RangeFilterFields extends string> = {
    range: RangeFilter<RangeFilterFields>;
};

const BLANK_ES_REQUEST = {
    // query: {
    //     must: [],
    //     should: []
    // },
    aggs: {}
};

class Manager<RangeFilterFields extends string> {
    public filters: Filters<RangeFilterFields>;
    public results: object[];

    constructor(filters: Filters<RangeFilterFields>) {
        runInAction(() => {
            this.filters = filters;
        });
    }

    public runStartQuery = () => {
        const request = this.createStartRequest();
        console.log('REQUEST', request);
        this.queryES(request);
    };

    public runFilterQuery = () => {
        const request = this.createFilterRequest();
        console.log('REQUEST', request);

        // this.queryES(request);
    };

    public queryES = (request: ESRequest): void => {
        axios
            .get(
                'https://search-sn-sandbox-mphutfambi5xaqixojwghofuo4.us-east-1.es.amazonaws.com/creator_crm_test/_search',
                {
                    params: {
                        source: JSON.stringify(request),
                        source_content_type: 'application/json'
                    }
                }
            )
            .then(res => {
                console.log(res); // tslint:disable-line
            });
    };

    public createStartRequest = (): ESRequest => {
        return objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            const newRequest = filter.addToStartRequest(request);
            console.log('newRequest', newRequest);
            return newRequest;
        }, BLANK_ES_REQUEST as ESRequest);
    };

    public createFilterRequest = (): ESRequest => {
        return objKeys(this.filters).reduce((request, filterName) => {
            const filter = this.filters[filterName];
            return filter.addToFilterRequest(request);
        }, BLANK_ES_REQUEST as ESRequest);
    };

    public parseStartResponse = (response: ESResponse): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            filter.parseStartResponse(response);
        });
    };

    public parseFilterResponse = (response: ESResponse): void => {
        objKeys(this.filters).forEach(filterName => {
            const filter = this.filters[filterName];
            filter.parseFilterResponse(response);
        });
    };
}

decorate(Manager, {
    filters: observable,
    results: observable
    // runStartQuery: action,
    // runFilterQuery: action,
    // parseFilterResponse: action,
    // parseStartResponse: action
});

export default Manager;
