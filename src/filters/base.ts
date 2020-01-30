import {runInAction, set, observable, decorate, computed, toJS} from 'mobx';
import {objKeys} from '../utils';
import {
    BaseConfig,
    FieldConfigs,
    FieldKinds,
    FieldFilters,
    FilterKind,
    ESRequest,
    ESResponse,
    PartialFieldConfigs
} from '../types';

type FieldSubscribers<Fields extends string> = (filterKind: string, fieldName: Fields) => void;

type FieldUnfilteredStateFetched<Fields extends string> = Record<Fields, boolean>;

class BaseFilter<Fields extends string, Config extends BaseConfig, Filter extends object> {
    public fieldConfigDefault: Omit<Required<BaseConfig>, 'field'>;
    public fieldConfigs: FieldConfigs<Fields, Config>;
    public fieldKinds: FieldKinds<Fields>;
    public fieldFilters: FieldFilters<Fields, Filter>;
    public fieldsThatHaveUnfilteredStateFetched: FieldUnfilteredStateFetched<Fields>;
    public shouldUpdateUnfilteredAggsSubscribers: Array<FieldSubscribers<Fields>>;
    public shouldUpdateFilteredAggsSubscribers: Array<FieldSubscribers<Fields>>;
    public filterKind: string;

    constructor(
        filterKind: string,
        defaultConfig: Omit<Required<BaseConfig>, 'field'>,
        specificConfigs?: PartialFieldConfigs<Fields, Config>
    ) {
        runInAction(() => {
            this.filterKind = filterKind;
            this.fieldConfigDefault = defaultConfig;
            this.fieldFilters = {} as FieldFilters<Fields, Filter>;
            this.fieldKinds = {} as FieldKinds<Fields>;
            this.fieldConfigs = {} as FieldConfigs<Fields, Config>;
            this.shouldUpdateUnfilteredAggsSubscribers = [];
            this.shouldUpdateFilteredAggsSubscribers = [];
            this.fieldsThatHaveUnfilteredStateFetched = {} as FieldUnfilteredStateFetched<Fields>;
            if (specificConfigs) {
                this.setConfigs(specificConfigs);
            }
        });

        this.findConfigForField = this.findConfigForField.bind(this);
        this.addConfigForField = this.addConfigForField.bind(this);
        this.setConfigs = this.setConfigs.bind(this);
        this.setFilter = this.setFilter.bind(this);
        this.clearFilter = this.clearFilter.bind(this);
        this.setKind = this.setKind.bind(this);
        this.kindForField = this.kindForField.bind(this);
        this.setAggsEnabledToTrue = this.setAggsEnabledToTrue.bind(this);
        this.setAggsEnabledToFalse = this.setAggsEnabledToFalse.bind(this);
    }

    public subscribeToShouldUpdateUnfilteredAggs = (subscriber: FieldSubscribers<Fields>) => {
        runInAction(() => {
            this.shouldUpdateUnfilteredAggsSubscribers.push(subscriber);
        });
    };

    public subscribeToShouldUpdateFilteredAggs = (subscriber: FieldSubscribers<Fields>) => {
        runInAction(() => {
            this.shouldUpdateFilteredAggsSubscribers.push(subscriber);
        });
    };

    /**
     * State that affects the global filters
     *
     * Changes to this state is tracked by the manager so that it knows when to run a new filter query
     * Ideally, this
     */
    public get filterAffectiveState(): object {
        throw new Error('filterAffectiveState is not defined');
    }

    public get hasUnfilteredState(): object {
        throw new Error('filterAffectiveState is not defined');
    }

    /**
     * Transforms the request obj that is created `onStart` with the addition of specific aggs
     */
    public startRequestTransform = (_request: ESRequest): ESRequest => {
        throw new Error('startRequestTransform is not defined');
    };

    /**
     * Extracts state, relative to this filter type, from an elastic search response
     */
    public extractStateFromStartResponse = (_response: ESResponse): void => {
        throw new Error('extractStateFromStartResponse is not defined');
    };

    /**
     * Transforms the request, run on filter state change, with the addition of specific aggs and queries
     */
    public filterRequestTransform = (_request: ESRequest): ESRequest => {
        throw new Error('filterRequestTransform is not defined');
    };

    /**
     * Extracts state, relative to this filter type, from an elastic search response
     */
    public extractStateFromFilterResponse = (_response: ESResponse): void => {
        throw new Error('extractStateFromFilterResponse is not defined');
    };

    /**
     * Transforms the request, run on pagination change, with the addition of queries
     */
    public paginationRequestTransform = (_request: ESRequest): ESRequest => {
        throw new Error('paginationRequestTransform is not defined');
    };

    /**
     * Returns any config obj that has the same filter name or field name as the passed in field
     */
    public findConfigForField(field: Fields): Config | undefined {
        const foundFilterName = objKeys(this.fieldConfigs).find(filterName => {
            const config = this.fieldConfigs[filterName];
            return config.field === field || filterName === field;
        });
        if (foundFilterName) {
            return this.fieldConfigs[foundFilterName];
        } else {
            return undefined;
        }
    }
    /**
     * Creates configs for the passed in fields.
     * Uses the default config unless an override config has already been specified.
     */
    public addConfigForField(field: Fields): void {
        if (Object.keys(this.fieldConfigs).length > 3) {
            return;
        }
        const configAlreadyExists = this.findConfigForField(field);
        if (!configAlreadyExists) {
            runInAction(() => {
                set(this.fieldConfigs, {
                    [field]: {...this.fieldConfigDefault, field}
                });
            });
        }
        console.log(toJS(this.fieldConfigs));
    }

    public get fields() {
        return Object.keys(this.fieldConfigs);
    }

    public setAggsEnabledToTrue(field: Fields): void {
        runInAction(() => {
            set(this.fieldConfigs, {
                [field]: {...this.fieldConfigs, aggsEnabled: true}
            });
        });
        if (!this.fieldsThatHaveUnfilteredStateFetched[field]) {
            this.shouldUpdateUnfilteredAggsSubscribers.forEach(s => s(this.filterKind, field));
        }
        this.shouldUpdateFilteredAggsSubscribers.forEach(s => s(this.filterKind, field));
    }

    public setAggsEnabledToFalse(field: Fields): void {
        runInAction(() => {
            set(this.fieldConfigs, {
                [field]: {...this.fieldConfigs, aggsEnabled: true}
            });
        });
    }

    /**
     * Sets the config for a filter
     */
    public setConfigs(fieldConfigs: PartialFieldConfigs<Fields, Config>): void {
        runInAction(() => {
            this.fieldConfigs = objKeys(fieldConfigs).reduce((parsedConfig, field: Fields) => {
                const config = fieldConfigs[field] as Config;

                parsedConfig[field] = {
                    ...this.fieldConfigDefault,
                    ...config
                } as Required<Config>;
                return parsedConfig;
            }, {} as FieldConfigs<Fields, Config>);
        });
    }

    public setFilter(field: Fields, filter: Filter): void {
        runInAction(() => {
            set(this.fieldFilters, {
                [field]: filter
            });
        });
    }

    public clearFilter(field: Fields): void {
        runInAction(() => {
            delete this.fieldFilters[field];
        });
    }

    public setKind(field: Fields, kind: FilterKind): void {
        runInAction(() => {
            this.fieldKinds[field] = kind;
        });
    }

    /**
     * Retrieves the kind of a filter field. Kinds are either specified explicitly on `fieldKinds`
     * or implicitly using the default filter kind.
     */
    public kindForField(field: Fields): FilterKind {
        const kind = this.fieldKinds[field];
        if (kind === undefined) {
            return this.fieldConfigDefault.defaultFilterKind;
        } else {
            return kind as FilterKind;
        }
    }
}

decorate(BaseFilter, {
    filterAffectiveState: computed,
    fields: computed,
    fieldConfigs: observable,
    fieldFilters: observable,
    fieldKinds: observable,
    fieldsThatHaveUnfilteredStateFetched: observable,
    shouldUpdateUnfilteredAggsSubscribers: observable,
    shouldUpdateFilteredAggsSubscribers: observable,
    filterKind: observable
});

export default BaseFilter;
