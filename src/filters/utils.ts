import {decorate, computed, observable} from 'mobx';

export const decorateFilter = (filterClass: any) => {
    decorate(filterClass, {
        fields: computed,
        _shouldRunFilteredQueryAndAggs: computed,
        fieldConfigDefault: observable,
        fieldConfigs: observable,
        fieldKinds: observable,
        fieldFilters: observable,
        filterKind: observable,
        _fieldsThatHaveUnfilteredStateFetched: observable,
        _shouldUpdateUnfilteredAggsSubscribers: observable,
        _shouldUpdateFilteredAggsSubscribers: observable
    });
};
