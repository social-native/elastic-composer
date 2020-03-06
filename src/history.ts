import Manager from './manager';
import {FieldKinds, FieldFilters, FieldSearches} from './types';
import {reaction, toJS, runInAction, decorate, observable} from 'mobx';
import debounce from 'lodash.debounce';
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

class History {
    public manager: Manager;
    public history: HistoryLocation[];
    public currentLocationInHistory: number;

    constructor(manager: Manager) {
        runInAction(() => {
            this.manager = manager;
            this.currentLocationInHistory = 0;
            this.history = [];
        });

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
            // suggester._subscribeToShouldRunSuggestionSearch(this._recordHistoryChange);
            suggester._subscribeToShouldRunSuggestionSearch(debounceHistoryChange);
        });
        reaction(
            () => this.history,
            history => console.log('HISTORY', toJS(history))
        );
    }

    // tslint:disable-next-line
    public _recordHistoryChange = () => {
        const filters = Object.keys(this.manager.filters).reduce((acc, filterName) => {
            const filter = this.manager.filters[filterName];
            const serializedState = filter.userState();
            if (serializedState) {
                return {...acc, [filterName]: serializedState};
            } else {
                return acc;
            }
        }, {} as Record<string, FilterHistoryPlace>);
        const suggestions = Object.keys(this.manager.suggestions).reduce((acc, suggestionName) => {
            const filter = this.manager.suggestions[suggestionName];
            const serializedState = filter.userState();
            if (serializedState) {
                return {...acc, [suggestionName]: serializedState};
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

        if (
            newHistoryLocation &&
            JSON.stringify(newHistoryLocation) !== JSON.stringify(this.history[0])
        ) {
            this.goToHistoryLocation(newHistoryLocation, false);
        }
    };

    public goToHistoryLocation = (
        location: HistoryLocation,
        rehydrateFromLocation: boolean | undefined = true
    ) => {
        runInAction(() => {
            this.history = [location, ...this.history];
            this.currentLocationInHistory = 0;
        });
        if (rehydrateFromLocation) {
            this._rehydrateFromLocation(location);
        }
    };

    public _rehydrateFromLocation = (location: HistoryLocation) => {
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
            this.currentLocationInHistory = 0;
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
        const newLocation = this.currentLocationInHistory - historyChange;

        runInAction(() => {
            // if within the range of recorded history, set as the new history location
            if (newLocation + 1 <= this.history.length && newLocation >= 0) {
                this.currentLocationInHistory = newLocation;

                // if too far in the future, set as the most recent history
            } else if (newLocation + 1 <= this.history.length) {
                this.currentLocationInHistory = 0;

                // if too far in the past, set as the last recorded history
            } else if (newLocation >= 0) {
                this.currentLocationInHistory = this.history.length - 1;
            }

            const locationData = this.history[this.currentLocationInHistory];
            this._rehydrateFromLocation(locationData);
        });
    };
}

decorate(History, {
    history: observable,
    currentLocationInHistory: observable
});

export default History;
