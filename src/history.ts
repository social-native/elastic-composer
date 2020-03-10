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
    currentLocationStore?: UrlStore<State>;
    historyPersistor?: IHistoryPersistor;
}

export interface IHistoryPersistor {
    setHistory: (location: Array<HistoryLocation | undefined>) => void;
    getHistory: () => HistoryLocation[];
}

const LOCAL_STORAGE_KEY = `${pkg.name}/history`;

export const localStorageHistoryPersistor = (localStorageSuffix: string): IHistoryPersistor => ({
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
    public currentLocationStore: UrlStore<HistoryLocation>;
    public historyPersistor: IHistoryPersistor | undefined;

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
            this.historyPersistor = options && options.historyPersistor;
            if (this.historyPersistor) {
                this.history = this.historyPersistor.getHistory();
                if (this.history.length > 0) {
                    const existingStateFromUrl = this.currentLocationStore.getState();
                    if (!existingStateFromUrl) {
                        const newHistoryLocation = this._deepCopy(
                            this.history[0] as HistoryLocation
                        );
                        this.currentLocationStore.setState(newHistoryLocation);
                        this._rehydrateFromLocation(newHistoryLocation);
                    }
                }
            }
        });

        this.currentLocationStore.subscribeToStateChanges(this.currentStateSubscriber);

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
                if (this.historyPersistor) {
                    this.historyPersistor.setHistory(this.history);
                }
            },
            {fireImmediately: true}
        );
    }

    // tslint:disable-next-line
    public _recordHistoryChange = () => {
        const filters = Object.keys(this.manager.filters).reduce((acc, filterName) => {
            const filter = this.manager.filters[filterName];
            const filterUserState = filter.userState();
            if (filterUserState) {
                return {...acc, [filterName]: filterUserState};
            } else {
                return acc;
            }
        }, {} as Record<string, FilterHistoryPlace>);
        const suggestions = Object.keys(this.manager.suggestions).reduce((acc, suggestionName) => {
            const filter = this.manager.suggestions[suggestionName];
            const suggestionUserState = filter.userState();
            if (suggestionUserState) {
                return {...acc, [suggestionName]: suggestionUserState};
            } else {
                return acc;
            }
        }, {} as Record<string, SuggestionHistoryPlace>);

        let newHistoryLocation: HistoryLocation | undefined;
        if (Object.keys(filters).length > 0 && Object.keys(suggestions).length > 0) {
            newHistoryLocation = {filters, suggestions};
        } else if (Object.keys(suggestions).length > 0) {
            newHistoryLocation = {suggestions};
        } else if (Object.keys(filters).length > 0) {
            newHistoryLocation = {filters};
        } else {
            newHistoryLocation = undefined;
        }

        const newLocationString = JSON.stringify(newHistoryLocation);
        const existingLocationString = JSON.stringify(
            this.history[this.currentLocationInHistoryCursor]
        );

        if (newLocationString !== existingLocationString) {
            this.addToHistory({...newHistoryLocation});
            this.currentLocationStore.setState({...newHistoryLocation});
        }
    };

    public currentStateSubscriber = (newHistoryLocation: HistoryLocation | undefined) => {
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

    public setCurrentState = (location: HistoryLocation) => {
        this.currentLocationStore.setState({...location});
    };

    public _rehydrateFromLocation = (location: HistoryLocation | undefined = {}) => {
        runInAction(() => {
            if (location.filters) {
                Object.keys(location.filters).forEach(fieldName => {
                    const userState = (location.filters || {})[fieldName];
                    this.manager.filters[fieldName].rehydrateFromUserState(
                        userState as FilterHistoryPlace
                    );
                });
            }
            if (location.suggestions) {
                Object.keys(location.suggestions).forEach(fieldName => {
                    const userState = (location.suggestions || {})[fieldName];
                    this.manager.suggestions[fieldName].rehydrateFromUserState(
                        userState as SuggestionHistoryPlace
                    );
                });
            }
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
