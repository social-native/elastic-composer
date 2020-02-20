import {decorate, computed, observable} from 'mobx';

const decorateFilter = (filterClass: any) => {
    decorate(filterClass, {
        fields: computed,
        activeFields: computed,
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

const utils = {
    decorateFilter
};

export default utils;
