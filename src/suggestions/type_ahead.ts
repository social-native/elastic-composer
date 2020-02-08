import {runInAction} from 'mobx';
import {objKeys} from '../utils';
import {ESRequest, ESResponse, FilterKind, FieldSuggestions, BaseSuggestionConfig} from '../types';
import BaseSuggestion from './base';
import {decorateFilter} from '../filters/utils';

/**
 * Config
 */

const TYPE_AHEAD_CONFIG_DEFAULT = {
    defaultFilterKind: 'should',
    enabled: true
};

export interface ITypeAheadConfig extends BaseSuggestionConfig {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    enabled?: boolean;
}

export type TypeAheadConfigs<TypeAheadFields extends string> = {
    [esFieldName in TypeAheadFields]: ITypeAheadConfig;
};

/**
 * Filter
 */

export type Filter = {
    search: string;
};

export type Filters<TypeAheadFields extends string> = {
    [esFieldName in TypeAheadFields]: Filter | undefined;
};

/**
 * Kind
 */

export type FilterKinds<TypeAheadFields extends string> = {
    [esFieldName in TypeAheadFields]: FilterKind | undefined;
};

/**
 *  Results
 */

export type RawSuggestions = {
    buckets: Array<{
        key: 0 | 1;
        key_as_string: 'true' | 'false';
        doc_count: number;
    }>;
};

class TypeAheadSuggestionClass<TypeAheadFields extends string> extends BaseSuggestion<
    TypeAheadFields,
    ITypeAheadConfig
> {
    constructor(
        defaultConfig?: Omit<Required<ITypeAheadConfig>, 'field'>,
        specificConfigs?: TypeAheadConfigs<TypeAheadFields>
    ) {
        super(
            'type_ahead',
            defaultConfig ||
                (TYPE_AHEAD_CONFIG_DEFAULT as Omit<Required<ITypeAheadConfig>, 'field'>),
            specificConfigs as TypeAheadConfigs<TypeAheadFields>
        );
    }

    /**
     * Transforms the request obj.
     *
     * Adds query and aggs to the request to obtain suggestions.
     */
    public _addSuggestionQueryAndAggsToRequest = (
        request: ESRequest,
        fieldName: TypeAheadFields
    ): ESRequest => {
        return [this._addQueriesToESRequest, this._addAggsToESRequest].reduce(
            (newRequest, fn) => fn(newRequest, fieldName),
            request
        );
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

    public _addQueriesToESRequest = (request: ESRequest, fieldName: TypeAheadFields): ESRequest => {
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
                                prefix: {
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

    public _addAggsToESRequest = (request: ESRequest, fieldName: TypeAheadFields): ESRequest => {
        const config = this.fieldConfigs[fieldName];
        const esFieldName = config.field;
        if (!config || !config.enabled) {
            return request;
        }
        return {
            ...request,
            aggs: {
                ...request.aggs,
                [`${esFieldName}__type_ahead`]: {
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
                        `${name}__type_ahead`
                    ] as RawSuggestions;
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
                    } else {
                        return acc;
                    }
                } else {
                    return acc;
                }
            },
            {...existingSuggestions} as FieldSuggestions<TypeAheadFields>
        );

        runInAction(() => {
            this.fieldSuggestions = newSuggestions;
        });
    };
}

decorateFilter(TypeAheadSuggestionClass);

export default TypeAheadSuggestionClass;
