import {decorate, computed, observable} from 'mobx';

export const decorateFilter = (suggestionClass: any) => {
    decorate(suggestionClass, {
        fields: computed,
        fieldConfigDefault: observable,
        fieldConfigs: observable,
        fieldKinds: observable,
        fieldSuggestions: observable,
        fieldSearches: observable,
        suggestionKind: observable,
        _shouldRunSuggestionSearchSubscribers: observable
    });
};
