import {decorate, computed, observable} from 'mobx';

export const decorateFilter = (filterClass: any) => {
    decorate(filterClass, {
        filterAffectiveState: computed,
        fieldConfigs: observable,
        fieldFilters: observable,
        fieldKinds: observable
    });
};
