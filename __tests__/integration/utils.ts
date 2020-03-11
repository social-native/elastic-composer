import {Manager, IClient, History, HistoryLocation, CurrentLocationStateObserver} from '../../src';

export const setUp = () => {
    // mock ES client
    const client: IClient = {
        search: jest.fn(),
        mapping: jest.fn()
    };
    // manager using mock client
    const manager = new Manager(client);

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
