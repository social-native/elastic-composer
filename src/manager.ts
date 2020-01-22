'use strict';
import {RangeFilterClass} from 'filters';
import {ESRequest, ESResponse} from 'types';
import {objKeys} from './utils';
import axios from 'axios';
import {decorate, observable, runInAction, reaction} from 'mobx';
// import debounce from 'lodash.debounce';
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

    constructor(filters: Filters<RangeFilter>) {
        runInAction(() => {
            this.filters = filters;
            this.enqueueRunStartQuery = false;
            this.filterQueryRunning = false;
        });

        reaction(
            () => ({...this.filters.range.rangeFilters} && {...this.filters.range.rangeKinds}),
            () => {
                console.log('Change detected!!');
                runInAction(() => (this.enqueueRunStartQuery = true));
                // this.runFilterQuery();
                // debounce(() => runInAction(this.runFilterQuery), 3000, {leading: true})();
            }
        );

        reaction(
            () => this.enqueueRunStartQuery,
            shouldRun => {
                console.log('checking if should run', shouldRun, this.filterQueryRunning);
                if (shouldRun && this.filterQueryRunning === false) {
                    runInAction(this.runFilterQuery);
                }
            }
        );
    }

    public runStartQuery = async () => {
        const request = this.createStartRequest();
        const response = await this.queryES(removeEmptyArrays(request));
        this.parseStartResponse(response);
    };

    public runFilterQuery = async () => {
        runInAction(() => {
            this.filterQueryRunning = true;
            this.enqueueRunStartQuery = false;
        });
        console.log('Running filter query');
        const request = this.createFilterRequest();
        const response = await this.queryES(removeEmptyArrays(request));
        this.parseFilterResponse(response);
        await Timeout.set(2000);

        runInAction(() => {
            this.filterQueryRunning = false;
        });
        if (this.enqueueRunStartQuery) {
            this.runFilterQuery();
        }
    };

    public queryES = async (request: ESRequest): Promise<ESResponse> => {
        // console.log(JSON.stringify(request));
        const {data} = await axios.get(
            'https://search-sn-sandbox-mphutfambi5xaqixojwghofuo4.us-east-1.es.amazonaws.com/leads/_search',
            {
                params: {
                    source: JSON.stringify(request),
                    source_content_type: 'application/json'
                }
            }
        );
        // console.log(data);
        return data;
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
    results: observable
});

export default Manager;

// type RF = 'instagram_avg_like_rate';
// const defaultRangeConfig: RangeConfigs<RF> = {
//     instagram_avg_like_rate: {
//         field: 'instagram.avg_like_rate',
//         defaultFilterType: 'should',
//         getDistribution: true,
//         getRangeBounds: true,
//         rangeInterval: 1
//     }
//     // age: {
//     //     field: 'age',
//     //     defaultFilterType: 'should',
//     //     getDistribution: false,
//     //     getRangeBounds: true,
//     //     rangeInterval: 1
//     // }
// };

// const rangeFilter = new RangeFilterClass<RF>({rangeConfig: defaultRangeConfig});
// const creatorCRM = new Manager<typeof rangeFilter>(rangeFilter);

// creatorCRM.runStartQuery();

// creatorCRM.range.rangeFilters['instagram_avg_like_rate'];
