import {runInAction, set} from 'mobx';
import {objKeys} from '../utils';
import {
    BaseConfig,
    BaseDefaultConfig,
    FieldConfigs,
    FieldKinds,
    FieldFilters,
    FilterKind
} from '../types';

class BaseFilter<
    Fields extends string,
    Config extends BaseConfig,
    ConfigDefault extends BaseDefaultConfig,
    Filter extends object
> {
    public fieldConfigDefault: ConfigDefault;
    public fieldConfigs: FieldConfigs<Fields, Config>;
    public fieldKinds: FieldKinds<Fields>;
    public fieldFilters: FieldFilters<Fields, Filter>;

    constructor(defaultConfig: ConfigDefault, specificConfigs?: FieldConfigs<Fields, Config>) {
        console.log('hur base');

        runInAction(() => {
            this.fieldConfigDefault = defaultConfig;
            this.fieldFilters = {} as FieldFilters<Fields, Filter>;
            this.fieldKinds = {} as FieldKinds<Fields>;
            this.fieldConfigs = {} as FieldConfigs<Fields, Config>;
            if (specificConfigs) {
                this.setConfigs(specificConfigs);
            }
        });
    }

    // /**
    //  * State that affects the global filters
    //  *
    //  * Changes to this state is tracked by the manager so that it knows when to run a new filter query
    //  * Ideally, this
    //  */
    // public get filterAffectiveState(): object {
    //     throw new Error('filterAffectiveState is not defined');
    // }

    // /**
    //  * Transforms the request obj that is created `onStart` with the addition of specific aggs
    //  */
    // public startRequestTransform = (_request: ESRequest): ESRequest => {
    //     throw new Error('startRequestTransform is not defined');
    // };

    // /**
    //  * Extracts state, relative to this filter type, from an elastic search response
    //  */
    // public extractStateFromStartResponse = (_response: ESResponse): void => {
    //     throw new Error('extractStateFromStartResponse is not defined');
    // };

    // /**
    //  * Transforms the request, run on filter state change, with the addition of specific aggs and queries
    //  */
    // public filterRequestTransform = (_request: ESRequest): ESRequest => {
    //     throw new Error('filterRequestTransform is not defined');
    // };

    // /**
    //  * Extracts state, relative to this filter type, from an elastic search response
    //  */
    // public extractStateFromFilterResponse = (_response: ESResponse): void => {
    //     throw new Error('extractStateFromFilterResponse is not defined');
    // };

    // /**
    //  * Transforms the request, run on pagination change, with the addition of queries
    //  */
    // public paginationRequestTransform = (_request: ESRequest): ESRequest => {
    //     throw new Error('paginationRequestTransform is not defined');
    // };

    /**
     * Returns any config obj that has the same filter name or field name as the passed in field
     */
    public findConfigForField = (field: Fields): Config | undefined => {
        const foundFilterName = objKeys(this.fieldConfigs).find(filterName => {
            const config = this.fieldConfigs[filterName];
            return config.field === field || filterName === field;
        });
        if (foundFilterName) {
            return this.fieldConfigs[foundFilterName];
        } else {
            return undefined;
        }
    };
    /**
     * Creates configs for the passed in fields.
     * Uses the default config unless an override config has already been specified.
     */
    public addConfigForField = (field: Fields): void => {
        const configAlreadyExists = this.findConfigForField(field);
        if (!configAlreadyExists) {
            runInAction(() => {
                this.fieldConfigs = {...this.fieldConfigs, ...this.fieldConfigDefault, field};
            });
        }
    };

    /**
     * Sets the config for a filter
     */
    public setConfigs = (fieldConfigs: FieldConfigs<Fields, Config>): void => {
        runInAction(() => {
            this.fieldConfigs = objKeys(fieldConfigs).reduce((parsedConfig, field) => {
                const config = fieldConfigs[field];

                parsedConfig[field] = {
                    ...this.fieldConfigDefault,
                    ...config
                };
                return parsedConfig;
            }, {} as {[field in Fields]: Required<Config>});
        });
    };

    public setFilter = (field: Fields, filter: Filter): void => {
        runInAction(() => {
            set(this.fieldFilters, {
                [field]: filter
            });
        });
    };

    public clearFilter = (field: Fields): void => {
        runInAction(() => {
            delete this.fieldFilters[field];
        });
    };

    public setKind = (field: Fields, kind: FilterKind): void => {
        runInAction(() => {
            this.fieldKinds[field] = kind;
        });
    };

    /**
     * Retrieves the kind of a filter field. Kinds are either specified explicitly on `fieldKinds`
     * or implicitly using the default filter kind.
     */
    public kindForField = (field: Fields): FilterKind => {
        const kind = this.fieldKinds[field];
        if (kind === undefined) {
            return this.fieldConfigDefault.defaultFilterKind;
        } else {
            return kind as FilterKind;
        }
    };
}

// decorate(BaseFilter, {
//     // filterAffectiveState: computed,
//     fieldConfigs: observable,
//     fieldFilters: observable,
//     fieldKinds: observable
// });

export default BaseFilter;
