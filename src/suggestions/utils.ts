import {decorate, observable} from 'mobx';

const decorateSuggester = (suggestionClass: any) => {
    decorate(suggestionClass, {
        // fields: computed, // TODO figure out why this cant be decorated without causing memory issues
        fieldConfigDefault: observable,
        fieldConfigs: observable,
        fieldKinds: observable,
        fieldSuggestions: observable,
        fieldSearches: observable,
        suggestionKind: observable,
        _shouldRunSuggestionSearchSubscribers: observable
    });
};

const utils = {
    decorateSuggester
};

export default utils;
