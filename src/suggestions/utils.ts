import {decorate, observable, computed} from 'mobx';

const decorateSuggester = (suggestionClass: any) => {
    decorate(suggestionClass, {
        fields: computed,
        activeFields: computed,
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
