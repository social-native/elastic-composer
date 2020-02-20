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
    FieldSearches,
    ShouldUseFieldFn,
    ESMappingType
} from '../types';

class BaseSuggestion<Fields extends string, Config extends BaseSuggestionConfig> {
    public fieldConfigDefault: Omit<Required<BaseSuggestionConfig>, 'field'>;
    public fieldConfigs: FieldSuggestionConfigs<Fields, Config>;
    public fieldKinds: FieldKinds<Fields>;
    public fieldSuggestions: FieldSuggestions<Fields>;
    public fieldSearches: FieldSearches<Fields>;
    public _shouldRunSuggestionSearchSubscribers: Array<FieldSuggestionSubscribers<Fields>>;
    public suggestionKind: string;
    public _shouldUseField: ShouldUseFieldFn;

    constructor(
        suggestionKind: string,
        defaultConfig: Omit<Required<BaseSuggestionConfig>, 'field'>,
        specificConfigs?: PartialFieldSuggestionConfigs<Fields, Config>
    ) {
        runInAction(() => {
            this.suggestionKind = suggestionKind;
            this.fieldConfigDefault = defaultConfig;
            this.fieldConfigs = {} as FieldSuggestionConfigs<Fields, Config>;
            this.fieldKinds = {} as FieldKinds<Fields>;
            this.fieldSuggestions = {} as FieldSuggestions<Fields>;
            this.fieldSearches = {} as FieldSearches<Fields>;
            this._shouldUseField = (_fieldName: string, _fieldType: ESMappingType) => {
                throw new Error(
                    '_shouldUseField is not implemented. The extending class should set the _shouldUseField attribute'
                );
            };
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
        this._shouldRunQuery = this._shouldRunQuery.bind(this);
        this.clearAllFieldSuggestions = this.clearAllFieldSuggestions.bind(this);
    }

    public _subscribeToShouldRunSuggestionSearch(subscriber: FieldSuggestionSubscribers<Fields>) {
        runInAction(() => {
            this._shouldRunSuggestionSearchSubscribers.push(subscriber);
        });
    }

    /**
     * Transforms the request obj.
     *
     * Adds query and aggs to the request to obtain suggestions.
     * Is mainly called when filters change and there is an ongoing search suggestion.
     */
    public _addSuggestionQueryAndAggsToRequestForAllFields(request: ESRequest): ESRequest {
        return this.fields.reduce(
            (acc, fieldName) => {
                return this._addSuggestionQueryAndAggsToRequest(acc, fieldName);
            },
            {...request}
        );
    }

    public get _fields(): Fields[] {
        return objKeys(this.fieldConfigs);
    }

    public get fields(): Fields[] {
        throw new Error('fields is not defined');
    }

    public get _activeFields(): Fields[] {
        return objKeys(this.fieldSearches);
    }

    public get activeFields(): Fields[] {
        throw new Error('activeFields is not defined');
    }

    public _shouldRunQuery(fieldName: Fields) {
        const fieldConfig = this._findConfigForField(fieldName);
        if (!fieldConfig || !fieldConfig.enabled) {
            return false;
        } else {
            return true;
        }
    }

    /**
     * Clears all field suggestions for this suggestions.
     * This includes `fieldSearches` and `fieldSuggestions`.
     */
    public clearAllFieldSuggestions() {
        runInAction(() => {
            this.fieldSearches = {} as FieldSearches<Fields>;
            this.fieldSuggestions = {} as FieldSuggestions<Fields>;
        });
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
        const fieldConfig = this._findConfigForField(field);
        if (!fieldConfig || !fieldConfig.enabled) {
            return;
        }

        if (searchTerm.length === 0) {
            runInAction(() => {
                set(this.fieldSuggestions, {
                    [field]: []
                });
            });
        } else {
            this._shouldRunSuggestionSearchSubscribers.forEach(s => s(this.suggestionKind, field));
        }
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
//     activeFields: computed,
//     fieldConfigDefault: observable,
//     fieldConfigs: observable,
//     fieldKinds: observable,
//     fieldSuggestions: observable,
//     fieldSearches: observable,
//     suggestionKind: observable,
//     _shouldRunSuggestionSearchSubscribers: observable
// });

export default BaseSuggestion;
