import Manager from './manager';
import {FieldKinds, FieldFilters, FieldSearches} from './types';
import {reaction, toJS, runInAction, decorate, observable} from 'mobx';
import debounce from 'lodash.debounce';
import UrlStore from 'query-params-data';
import pkg from '../package.json';

export type FilterHistoryPlace = {
    fieldKinds?: FieldKinds<any>;
    fieldFilters?: FieldFilters<any, any>;
};

export type SuggestionHistoryPlace = {
    fieldKinds?: FieldKinds<any>;
    fieldSearches?: FieldSearches<any>;
};

export type HistoryLocation = {
    filters?: Record<string, FilterHistoryPlace>;
    suggestions?: Record<string, SuggestionHistoryPlace>;
};

export interface IHistoryOptions<State> {
    historySize?: number;
    currentLocationStore?: ICurrentLocationStore<State>;
    historyPersister?: IHistoryPersister;
    rehydrateOnStart?: boolean;
}

export type CurrentLocationStateObserver<State> = (newState: State | undefined) => any;

export interface ICurrentLocationStore<State> {
    setState: (
        location: State | undefined,
        options?: {
            replaceLocation: boolean;
        }
    ) => void;
    getState: () => State | undefined | void;
    subscribeToStateChanges: (
        observer: CurrentLocationStateObserver<State>,
        options?: {getCurrentState: boolean}
    ) => void;
}

export interface IHistoryPersister {
    setHistory: (location: Array<HistoryLocation | undefined>) => void;
    getHistory: () => HistoryLocation[];
}

const LOCAL_STORAGE_KEY = `${pkg.name}/history`;

export const localStorageHistoryPersister = (localStorageSuffix: string): IHistoryPersister => ({
    setHistory: (location: Array<HistoryLocation | undefined>) => {
        localStorage.setItem(
            `${LOCAL_STORAGE_KEY}/${localStorageSuffix}`,
            JSON.stringify(location)
        );
    },
    getHistory: () => {
        const existingHistory = localStorage.getItem(`${LOCAL_STORAGE_KEY}/${localStorageSuffix}`);
        if (existingHistory) {
            try {
                return JSON.parse(existingHistory);
            } catch {
                return [];
            }
        } else {
            return [];
        }
    }
});

class History {
    public historySize: number;
    public manager: Manager;
    public history: Array<HistoryLocation | undefined>;
    public currentLocationInHistoryCursor: number;
    public currentLocationStore: ICurrentLocationStore<HistoryLocation>;
    public historyPersister: IHistoryPersister | undefined;
    public hasRehydratedLocation: boolean;

    constructor(
        manager: Manager,
        queryParamKey: string,
        options?: IHistoryOptions<HistoryLocation>
    ) {
        // tslint:disable-next-line
        runInAction(() => {
            this.manager = manager;
            this.historySize = (options && options.historySize) || 30;
            this.currentLocationStore =
                (options && options.currentLocationStore) ||
                new UrlStore<HistoryLocation>(queryParamKey);
            this.currentLocationInHistoryCursor = 0;
            this.history = [];
            this.historyPersister = options && options.historyPersister;
            this.hasRehydratedLocation = false;
            if (options && options.rehydrateOnStart) {
                this.rehydrate();
            }
        });

        this.currentLocationStore.subscribeToStateChanges(this._currentStateSubscriber, {
            getCurrentState: false
        });

        const debounceHistoryChange = debounce(this._recordHistoryChange, 300);

        reaction(() => {
            return Object.keys(this.manager.filters).reduce((acc, filterName) => {
                return {
                    acc,
                    [filterName]: toJS(
                        this.manager.filters[filterName]._shouldRunFilteredQueryAndAggs
                    )
                };
            }, {});
        }, debounceHistoryChange);

        Object.keys(this.manager.suggestions).forEach(suggesterName => {
            const suggester = this.manager.suggestions[suggesterName];
            suggester._subscribeToShouldRunSuggestionSearch(debounceHistoryChange);
        });

        reaction(
            () => {
                return {
                    mostRecentLocation: this._deepCopy(this.history[0] || {}),
                    historyLength: this.history.length
                };
            },
            () => {
                if (this.historyPersister) {
                    this.historyPersister.setHistory(this.history);
                }
            },
            {fireImmediately: true}
        );
    }

    /**
     * Rehydrates state from current state store (URL) or persistent storage (localStorage)
     */
    public rehydrate = () => {
        // tslint:disable-next-line
        runInAction(() => {
            if (this.historyPersister) {
                const persistedHistory = this.historyPersister.getHistory();
                this.history = persistedHistory;
                if (persistedHistory.length > 0) {
                    const existingStateFromUrl = this.currentLocationStore.getState();
                    if (!existingStateFromUrl) {
                        const newHistoryLocation = this._deepCopy(
                            persistedHistory[0] as HistoryLocation
                        );
                        // if only suggestions are present then we should
                        // act as if no location was rehydrated
                        if (newHistoryLocation.filters) {
                            this.hasRehydratedLocation = true;
                        }
                        this.currentLocationStore.setState(newHistoryLocation);

                        this._rehydrateFromLocation(newHistoryLocation);
                    } else {
                        if (existingStateFromUrl.filters) {
                            this.hasRehydratedLocation = true;
                        }
                        this._rehydrateFromLocation(existingStateFromUrl);
                    }
                } else {
                    const existingStateFromUrl = this.currentLocationStore.getState();
                    if (existingStateFromUrl) {
                        if (existingStateFromUrl.filters) {
                            this.hasRehydratedLocation = true;
                        }
                        this._rehydrateFromLocation(existingStateFromUrl);
                    }
                }
            }
        });
    };

    // tslint:disable-next-line
    public _recordHistoryChange = () => {
        const newHistoryLocation = this.manager.getUserState();

        const newLocationString = JSON.stringify(newHistoryLocation);
        const existingLocationString = JSON.stringify(
            this.history[this.currentLocationInHistoryCursor]
        );

        if (newLocationString !== existingLocationString) {
            this.addToHistory({...newHistoryLocation});
            this.currentLocationStore.setState({...newHistoryLocation});
        }
    };

    public _currentStateSubscriber = (newHistoryLocation: HistoryLocation | undefined) => {
        if (
            newHistoryLocation &&
            JSON.stringify(newHistoryLocation) !==
                JSON.stringify(this.history[this.currentLocationInHistoryCursor])
        ) {
            this.addToHistory({...newHistoryLocation});
            this._rehydrateFromLocation({...newHistoryLocation});
        }
    };

    public _deepCopy = (location: HistoryLocation): HistoryLocation =>
        JSON.parse(JSON.stringify(location));

    public addToHistory = (location: HistoryLocation | undefined) => {
        runInAction(() => {
            this.history = [
                this._deepCopy(location as HistoryLocation),
                ...this.history.slice(this.currentLocationInHistoryCursor, this.historySize - 1)
            ];
            this.currentLocationInHistoryCursor = 0;
        });
    };

    public setCurrentState = (location: HistoryLocation): void => {
        this.currentLocationStore.setState({...location});
    };

    public _rehydrateFromLocation = (location: HistoryLocation | undefined = {}) => {
        runInAction(() => {
            this.manager.setUserState(location);
        });
    };

    public clearHistory = (): void => {
        runInAction(() => {
            this.history = [];
            this.currentLocationInHistoryCursor = 0;
        });
    };

    public back = (): void => {
        this._go(-1);
    };

    public forward = (): void => {
        this._go(1);
    };

    // adapted from https://github.com/erhathaway/router-primitives (MIT licensed)
    // tslint:disable-next-line
    public _go = (historyChange: number): void => {
        if (!historyChange || historyChange === 0) {
            throw new Error('No history size change specified');
        }

        // calculate request history location
        const newLocation = this.currentLocationInHistoryCursor - historyChange;

        runInAction(() => {
            // if within the range of recorded history, set as the new history location
            if (newLocation + 1 <= this.history.length && newLocation >= 0) {
                this.currentLocationInHistoryCursor = newLocation;

                // if too far in the future, set as the most recent history
            } else if (newLocation + 1 <= this.history.length) {
                this.currentLocationInHistoryCursor = 0;

                // if too far in the past, set as the last recorded history
            } else if (newLocation >= 0) {
                this.currentLocationInHistoryCursor = this.history.length - 1;
            }

            const newHistoryLocation = this._deepCopy(
                this.history[this.currentLocationInHistoryCursor] as HistoryLocation
            );
            this.currentLocationStore.setState(newHistoryLocation);
            this._rehydrateFromLocation(newHistoryLocation);
        });
    };
}

decorate(History, {
    history: observable,
    currentLocationInHistoryCursor: observable
});

export default History;
