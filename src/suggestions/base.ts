import {runInAction, set} from 'mobx';
import {objKeys} from '../utils';
import {
    BaseSuggestionConfig,
    FieldSuggestionConfigs,
    FieldKinds,
    FieldSuggestions,
    FieldSuggestionSubscribers,
    FilterKind,
    ESRequest,
    ESResponse,
    PartialFieldSuggestionConfigs,
    FieldSearches
} from '../types';

class BaseSuggestion<Fields extends string, Config extends BaseSuggestionConfig> {
    public fieldConfigDefault: Omit<Required<BaseSuggestionConfig>, 'field'>;
    public fieldConfigs: FieldSuggestionConfigs<Fields, Config>;
    public fieldKinds: FieldKinds<Fields>;
    public fieldSuggestions: FieldSuggestions<Fields>;
    public fieldSearches: FieldSearches<Fields>;
    public _shouldRunSuggestionSearchSubscribers: Array<FieldSuggestionSubscribers<Fields>>;
    public suggestionKind: string;

    constructor(
        suggestionKind: string,
        defaultConfig: Omit<Required<BaseSuggestionConfig>, 'field'>,
        specificConfigs?: PartialFieldSuggestionConfigs<Fields, Config>
    ) {
        console.log('HEREE', suggestionKind, defaultConfig, specificConfigs);

        runInAction(() => {
            this.suggestionKind = suggestionKind;
            this.fieldConfigDefault = defaultConfig;
            this.fieldConfigs = {} as FieldSuggestionConfigs<Fields, Config>;
            this.fieldKinds = {} as FieldKinds<Fields>;
            this.fieldSuggestions = {} as FieldSuggestions<Fields>;
            this.fieldSearches = {} as FieldSearches<Fields>;

            this._shouldRunSuggestionSearchSubscribers = [];
        });

        if (specificConfigs) {
            this._setConfigs(specificConfigs);
        }

        this._subscribeToShouldRunSuggestionSearch = this._subscribeToShouldRunSuggestionSearch.bind(
            this
        );
        this._findConfigForField = this._findConfigForField.bind(this);
        this._addConfigForField = this._addConfigForField.bind(this);
        this.setEnabledToTrue = this.setEnabledToTrue.bind(this);
        this.setEnabledToFalse = this.setEnabledToFalse.bind(this);
        this._setConfigs = this._setConfigs.bind(this);
        this.setSearch = this.setSearch.bind(this);
        this.clearSearch = this.clearSearch.bind(this);
        this.setKind = this.setKind.bind(this);
        this.kindForField = this.kindForField.bind(this);
    }

    public _subscribeToShouldRunSuggestionSearch(subscriber: FieldSuggestionSubscribers<Fields>) {
        runInAction(() => {
            this._shouldRunSuggestionSearchSubscribers.push(subscriber);
        });
    }

    public get fields() {
        return Object.keys(this.fieldConfigs);
    }

    /**
     * Transforms the request obj.
     *
     * Adds query and aggs to the request to obtain suggestions.
     */
    public _addSuggestionQueryAndAggsToRequest(_request: ESRequest, _fieldName: Fields): ESRequest {
        throw new Error('_addSuggestionQueryAndAggsToRequest is not defined');
    }

    /**
     * Extracts filtered aggs from the response obj.
     *
     * Extracted state will be the suggestions for the search.
     */
    public _extractSuggestionFromResponse(_response: ESResponse): void {
        throw new Error('_extractSuggestionFromResponse is not defined');
    }

    /**
     * Returns any config obj that has the same filter name or field name as the passed in field
     */
    public _findConfigForField(field: Fields): Config | undefined {
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
    public _addConfigForField(field: Fields): void {
        const configAlreadyExists = this._findConfigForField(field);
        if (!configAlreadyExists) {
            runInAction(() => {
                set(this.fieldConfigs, {
                    [field]: {...this.fieldConfigDefault, field}
                });
            });
        }
    }

    /**
     * Updates a fields config such that aggs will be included when a manager asks this
     * filter to add aggs to a request object.
     */
    public setEnabledToTrue(field: Fields): void {
        runInAction(() => {
            set(this.fieldConfigs, {
                [field]: {...this.fieldConfigs[field], enabled: true}
            });
        });
        this._shouldRunSuggestionSearchSubscribers.forEach(s => s(this.suggestionKind, field));
    }

    /**
     * Updates a fields config such that aggs will NOT be included when a manager asks this
     * filter to add aggs to a request object.
     */
    public setEnabledToFalse(field: Fields): void {
        runInAction(() => {
            set(this.fieldConfigs, {
                [field]: {...this.fieldConfigs[field], enabled: false}
            });
        });
    }

    /**
     * Sets the config for a filter.
     */
    public _setConfigs(fieldConfigs: PartialFieldSuggestionConfigs<Fields, Config>): void {
        runInAction(() => {
            this.fieldConfigs = objKeys(fieldConfigs).reduce((parsedConfig, field: Fields) => {
                const config = fieldConfigs[field] as Config;

                parsedConfig[field] = {
                    ...this.fieldConfigDefault,
                    ...config
                } as Required<Config>;
                return parsedConfig;
            }, {} as FieldSuggestionConfigs<Fields, Config>);
        });
    }

    public setSearch = (field: Fields, searchTerm: string) => {
        runInAction(() => {
            set(this.fieldSearches, {
                [field]: searchTerm
            });
        });
        this._shouldRunSuggestionSearchSubscribers.forEach(s => s(this.suggestionKind, field));
    };

    /**
     * Clears a search and suggestion for a field.
     */
    public clearSearch(field: Fields): void {
        runInAction(() => {
            delete this.fieldSearches[field];
            this.fieldSuggestions[field] = [];
        });
    }

    /**
     * Sets the kind for a field. For example, this is how you change a field from 'must' to 'should' and vice versa.
     */
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
            return this.fieldConfigDefault.defaultSuggestionKind;
        } else {
            return kind as FilterKind;
        }
    }
}

/**
 * Base class, so decorating it isn't necessary. Don't delete b/c this is an easy validation check on the base class.
 * These decorations are copied in to `src/suggestions/utils#decorateSuggestion`.
 */
// decorate(BaseSuggestion, {
//     fields: computed,
//     fieldConfigDefault: observable,
//     fieldConfigs: observable,
//     fieldKinds: observable,
//     fieldSuggestions: observable,
//     fieldSearches: observable,
//     suggestionKind: observable,
//     _shouldRunSuggestionSearchSubscribers: observable
// });

export default BaseSuggestion;
