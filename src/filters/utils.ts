import {decorate, computed, observable} from 'mobx';

const decorateFilter = (filterClass: any) => {
    decorate(filterClass, {
        // fields: computed, // TODO figure out why this cant be decorated without causing memory issues
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
