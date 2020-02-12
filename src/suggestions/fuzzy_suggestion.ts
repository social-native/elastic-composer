import {runInAction} from 'mobx';
import {objKeys} from '../utils';
import {
    ESRequest,
    ESResponse,
    FilterKind,
    FieldSuggestions,
    BaseSuggestionConfig,
    IBaseOptions,
    ESMappingType
} from '../types';
import BaseSuggestion from './base';
import utils from './utils';

/**
 * Config
 */

const CONFIG_DEFAULT = {
    defaultSuggestionKind: 'should',
    enabled: true
};

export interface IConfig extends BaseSuggestionConfig {
    field: string;
    defaultSuggestionKind?: 'should' | 'must';
    enabled?: boolean;
}

export type Configs<Fields extends string> = {
    [esFieldName in Fields]: IConfig;
};

/**
 *  Results
 */

export type RawFuzzySuggestionResult = {
    buckets: Array<{
        key: string;
        doc_count: number;
    }>;
};
export const fuzzyShouldUseFieldFn = (_fieldName: string, fieldType: ESMappingType) =>
    fieldType === 'keyword' || fieldType === 'text';

class FuzzySuggestion<Fields extends string> extends BaseSuggestion<Fields, IConfig> {
    constructor(
        defaultConfig?: Omit<Required<IConfig>, 'field'>,
        specificConfigs?: Configs<Fields>,
        options?: IBaseOptions
    ) {
        super(
            'fuzzy',
            defaultConfig || (CONFIG_DEFAULT as Omit<Required<IConfig>, 'field'>),
            specificConfigs as Configs<Fields>
        );

        runInAction(() => {
            this._shouldUseField = (options && options.shouldUseField) || fuzzyShouldUseFieldFn;
        });
    }

    /**
     * Transforms the request obj.
     *
     * Adds query and aggs to the request to obtain suggestions.
     */
    public _addSuggestionQueryAndAggsToRequest = (
        request: ESRequest,
        fieldName: Fields
    ): ESRequest => {
        if (this._shouldRunQuery(fieldName)) {
            return [this._addQueriesToESRequest, this._addAggsToESRequest].reduce(
                (newRequest, fn) => fn(newRequest, fieldName),
                request
            );
        } else {
            return request;
        }
    };

    /**
     * Extracts filtered aggs from the response obj.
     *
     * Extracted state will be the suggestions for the search.
     */
    public _extractSuggestionFromResponse = (response: ESResponse): void => {
        [this._parseAggsFromESResponse].forEach(fn => fn(response));
    };

    /**
     * ***************************************************************************
     * CUSTOM TO TEMPLATE
     * ***************************************************************************
     */

    public _addQueriesToESRequest = (request: ESRequest, fieldName: Fields): ESRequest => {
        // tslint:disable-next-line
        if (!this.fieldSearches) {
            return request;
        }
        const config = this.fieldConfigs[fieldName];
        const esFieldName = config.field;

        const searchTerm = this.fieldSearches[fieldName];
        if (!searchTerm) {
            return request;
        }

        const kind = this.kindForField(fieldName);
        if (!kind) {
            throw new Error(`kind is not set for range type ${fieldName}`);
        }

        if (searchTerm) {
            const existingFiltersForKind = request.query.bool[kind as FilterKind] || [];
            return {
                ...request,
                query: {
                    ...request.query,
                    bool: {
                        ...request.query.bool,
                        [kind as FilterKind]: [
                            ...existingFiltersForKind,
                            {
                                fuzzy: {
                                    [esFieldName]: {
                                        value: searchTerm
                                    }
                                }
                            }
                        ]
                    }
                }
            };
        } else {
            return request;
        }
    };

    public _addAggsToESRequest = (request: ESRequest, fieldName: Fields): ESRequest => {
        const config = this.fieldConfigs[fieldName];
        const esFieldName = config.field;
        if (!config || !config.enabled) {
            return request;
        }
        return {
            ...request,
            aggs: {
                ...request.aggs,
                [`${esFieldName}__fuzzy_suggestion`]: {
                    terms: {
                        field: esFieldName,
                        size: 20
                    }
                }
            }
        };
    };

    public _parseAggsFromESResponse = (response: ESResponse): void => {
        if (!this.fieldSuggestions) {
            return;
        }
        const existingSuggestions = this.fieldSuggestions;
        const newSuggestions = objKeys(this.fieldConfigs).reduce(
            // tslint:disable-next-line
            (acc, suggestionFieldName) => {
                const config = this.fieldConfigs[suggestionFieldName];
                const name = config.field;
                if (response.aggregations) {
                    const rawSuggestions = response.aggregations[
                        `${name}__fuzzy_suggestion`
                    ] as RawFuzzySuggestionResult;
                    if (
                        rawSuggestions &&
                        rawSuggestions.buckets &&
                        rawSuggestions.buckets.length > 0
                    ) {
                        const suggestions = rawSuggestions.buckets
                            .map(raw => ({
                                suggestion: raw.key,
                                count: raw.doc_count
                            }))
                            .sort((first, second) => {
                                return first.count < second.count ? -1 : 1;
                            });

                        return {
                            ...acc,
                            [suggestionFieldName]: suggestions
                        };
                    } else if (
                        rawSuggestions &&
                        rawSuggestions.buckets &&
                        rawSuggestions.buckets.length === 0
                    ) {
                        return {
                            ...acc,
                            [suggestionFieldName]: []
                        };
                    } else {
                        return acc;
                    }
                } else {
                    return acc;
                }
            },
            {...existingSuggestions} as FieldSuggestions<Fields>
        );

        runInAction(() => {
            this.fieldSuggestions = newSuggestions;
        });
    };
}

utils.decorateSuggester(FuzzySuggestion);

export default FuzzySuggestion;
