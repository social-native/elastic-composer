import {
    Manager,
    IClient,
    History,
    HistoryLocation,
    CurrentLocationStateObserver,
    IFiltersOptions,
    ESRequest,
    ESResponse,
    ESHit,
    ESMappingType
} from '../../src';

export const fakeResponse = <Source extends object = object>(params?: Partial<ESResponse>) => {
    // tslint:disable-next-line
    return {
        took: (params && params.took) || 20,
        timed_out: (params && params.timed_out) || false,
        _shards: (params && params._shards) || {total: 5, successful: 4, skipped: 1, failed: 0},
        hits: (params && params.hits) || {total: 200, max_score: 1, hits: [fakeResponseHit()]},
        aggregations: (params && params.aggregations) || {}
    } as ESResponse<Source>;
};

export const fakeResponseHit = <Source extends object = object>(params?: Partial<ESHit>) => {
    // tslint:disable-next-line
    return {
        _index: (params && params._index) || 'awesome_index',
        _type: (params && params._type) || 'test type',
        _id: (params && params._id) || '1234',
        _score: (params && params._score) || 22,
        _source: (params && params._source) || {},
        sort: (params && params.sort) || ['_score', '_doc']
    } as ESHit<Source>;
};

export const fakeMapping = () => {
    return {
        boolean_field: 'boolean',
        double_field: 'double',
        integer_field: 'integer',
        keyword_field: 'keyword',
        text_field: 'text',
        float_field: 'float'
    } as Record<string, ESMappingType>;
};
export const setUp = <Source extends object>(options?: {
    response?: ESResponse<Source>;
    mapping?: Record<string, ESMappingType>;
    filters?: IFiltersOptions;
}) => {
    // mock ES client
    const client: IClient = {
        search: jest.fn((_request: ESRequest) =>
            Promise.resolve((options && options.response) || fakeResponse())
        ),
        mapping: jest.fn(() => Promise.resolve((options && options.mapping) || fakeMapping()))
    };
    // manager using mock client
    const manager = new Manager(client, {
        filters: (options && options.filters) || {},
        queryThrottleInMS: 0
    });

    // simple history persister instead of localStorage
    const historyPersister = {
        persistedHistory: [] as HistoryLocation[],
        setHistory(newLocation: Array<HistoryLocation | undefined>) {
            this.persistedHistory = newLocation as HistoryLocation[];
        },
        getHistory() {
            return this.persistedHistory;
        }
    };

    // simple current location store instead of UrlStore
    const currentLocationStore = {
        _observers: [] as Array<CurrentLocationStateObserver<HistoryLocation>>,
        _state: {} as HistoryLocation | undefined,
        setState(s: HistoryLocation | undefined) {
            this._state = s;
            this._observers.forEach(o => o(s));
        },
        getState() {
            return this._state;
        },
        subscribeToStateChanges(observer: CurrentLocationStateObserver<HistoryLocation>) {
            this._observers.push(observer);
        }
    };

    // history using simple history persister and location store
    const history = new History(manager, 'mockHistory', {historyPersister, currentLocationStore});

    return {client, manager, history, historyPersister, currentLocationStore};
};
