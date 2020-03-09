import Manager from './manager';
import {FieldKinds, FieldFilters, FieldSearches} from './types';
import {reaction, toJS, runInAction, decorate, observable} from 'mobx';
import debounce from 'lodash.debounce';
import UrlStore from 'query-params-data';

type FilterHistoryPlace = {
    fieldKinds?: FieldKinds<any>;
    fieldFilters?: FieldFilters<any, any>;
};

type SuggestionHistoryPlace = {
    fieldKinds?: FieldKinds<any>;
    fieldSearches?: FieldSearches<any>;
};

type HistoryLocation = {
    filters?: Record<string, FilterHistoryPlace>;
    suggestions?: Record<string, SuggestionHistoryPlace>;
};

interface IHistoryOptions<State> {
    historySize: number;
    currentLocationStore: UrlStore<State>;
}

class History {
    public historySize: number;
    public manager: Manager;
    public history: Array<HistoryLocation | undefined>;
    public currentLocationInHistoryCursor: number;
    public currentLocationStore: UrlStore<HistoryLocation>;

    constructor(
        manager: Manager,
        queryParamKey: string,
        options?: IHistoryOptions<HistoryLocation>
    ) {
        runInAction(() => {
            this.manager = manager;
            this.historySize = (options && options.historySize) || 100;
            this.currentLocationStore =
                (options && options.currentLocationStore) ||
                new UrlStore<HistoryLocation>(queryParamKey);
            this.currentLocationInHistoryCursor = 0;
            this.history = [];
        });

        this.currentLocationStore.subscribeToStateChanges(this.currentStateSubscriber);

        const debounceHistoryChange = debounce(this._recordHistoryChange, 500);

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
        // reaction(
        //     () => JSON.stringify(this.history),
        //     history => console.log('HISTORY', toJS(history))
        // );
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
        console.log(
            'CHECKING IF NEW INTERNAL STATE',
            '\n-------------\n',
            newLocationString,
            '\n-------------\n',
            existingLocationString,
            '\n-------------\n',
            this.currentLocationInHistoryCursor
        );
        if (newLocationString !== existingLocationString) {
            console.log(
                'NEW INTERNAL STATE DETECTED',
                '\n-------------\n',
                newLocationString,
                '\n-------------\n',
                existingLocationString,
                '\n-------------\n',
                this.currentLocationInHistoryCursor
            );
            this.addToHistory({...newHistoryLocation});
            this.currentLocationStore.setState({...newHistoryLocation});
        }
    };

    public currentStateSubscriber = (newHistoryLocation: HistoryLocation | undefined) => {
        console.log('url location update');

        if (
            JSON.stringify(newHistoryLocation) !==
            JSON.stringify(this.history[this.currentLocationInHistoryCursor])
        ) {
            console.log('found new location, rehydrating store');

            this.addToHistory({...newHistoryLocation});
            this._rehydrateFromLocation({...newHistoryLocation});
        }
    };

    public addToHistory = (location: HistoryLocation | undefined) => {
        runInAction(() => {
            this.currentLocationInHistoryCursor = 0;
            this.history = [{...toJS(location)}, ...this.history];
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

            const newHistoryLocation = this.history[this.currentLocationInHistoryCursor];
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
