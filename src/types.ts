import PrefixSuggestion, {RawPrefixSuggestionResult} from './suggestions/prefix_suggestion';
import {RangeFilter, BooleanFilter, BaseFilter, ExistsFilter, MultiSelectFilter, DateRangeFilter} from './filters';
import {FuzzySuggestion, BaseSuggestion} from './suggestions';
/**
 * ***********************************
 * ES Request
 * ***********************************
 */
export type ESRequestSortField = Array<object | string>;

export type ESRequest = {
    query: {
        bool: {
            must: object[];
            should: object[];
        };
    };
    _source?: {
        includes?: string[];
        excludes?: string[];
    };
    aggs: Record<string, any>;
    from?: number;
    size?: number;
    track_scores?: boolean;
    sort?: ESRequestSortField;
    search_after?: ESRequestSortField;
};

/**
 * ***********************************
 * ES Response
 * ***********************************
 */

export type AggregationResults =
    | RawMultiSelectAggs
    | RawExistsAggs
    | RawRangeBoundAggs
    | RawRangeDistributionAggs
    | RawBooleanAggs
    | RawPrefixSuggestionResult;

export type ESResponse<Source extends object = object> = {
    took: number;
    timed_out: boolean;
    _shards: {total: number; successful: number; skipped: number; failed: number};
    hits: {total: number; max_score: number; hits: Array<ESHit<Source>>};
    aggregations?: {
        [boundary: string]: AggregationResults;
    };
};

export type ESHit<Source extends object = object> = {
    _index: string;
    _type: string;
    _id: string;
    _score: number;
    _source: Source;
    sort: ESRequestSortField;
};

/**
 * ***********************************
 * Client
 * ***********************************
 */
export interface IClient<Source extends object = object> {
    search: (request: ESRequest) => Promise<ESResponse<Source>>;
    mapping: () => Promise<Record<string, ESMappingType>>;
}

/**
 * ***********************************
 * ES Mapping
 * ***********************************
 */

export type ESMappingType =
    | 'long'
    | 'double'
    | 'integer'
    | 'keyword'
    | 'text'
    | 'boolean'
    | 'float';

/**
 * ***********************************
 * Base Filter
 * ***********************************
 */

export type FilterKind = 'should' | 'must';

export type BaseFilterConfig = {
    field: string;
    defaultFilterKind?: 'should' | 'must';
    aggsEnabled?: boolean;
};

export type FieldFilterConfigs<Fields extends string, Config extends BaseFilterConfig> = {
    [esFieldName in Fields]: Required<Config>;
};

export type PartialFieldFilterConfigs<Fields extends string, Config extends BaseFilterConfig> = {
    [esFieldName in Fields]: Config;
};

export type FieldFilters<Fields extends string, Filter extends object> = {
    [esFieldName in Fields]: Filter | undefined;
};

/**
 * A subscriber that will get notified when a field changes
 */
export type FieldFilterSubscribers<Fields extends string> = (
    filterKind: string,
    fieldName: Fields
) => void;

/**
 * ***********************************
 * Base Suggestion
 * ***********************************
 */

export type SuggestionKind = 'should' | 'must';

export type BaseSuggestionConfig = {
    field: string;
    defaultSuggestionKind?: 'should' | 'must';
    enabled?: boolean;
};

export type FieldSuggestionConfigs<Fields extends string, Config extends BaseSuggestionConfig> = {
    [esFieldName in Fields]: Required<Config>;
};

export type PartialFieldSuggestionConfigs<
    Fields extends string,
    Config extends BaseSuggestionConfig
> = {
    [esFieldName in Fields]: Config;
};

export type Suggestion = Array<{suggestion: string; count: number}>; // array of suggestions ordered best to worst

export type FieldSuggestions<Fields extends string> = {
    [esFieldName in Fields]: Suggestion | undefined;
};

export type FieldSearches<Fields extends string> = {
    [esFieldName in Fields]: string;
};

/**
 * A subscriber that will get notified when a field changes
 */
export type FieldSuggestionSubscribers<Fields extends string> = (
    suggestionKind: string,
    fieldName: Fields
) => void;

/**
 * ***********************************
 * Generic to Filters and Suggestions
 * ***********************************
 */

export type FieldNameModifier = (fieldName: string) => string;

export type ShouldUseFieldFn = (fieldName: string, fieldType: ESMappingType) => boolean;

export type IBaseOptions = {
    shouldUseField?: ShouldUseFieldFn;
};

export type FieldKinds<Fields extends string> = {
    [esFieldName in Fields]: FilterKind | undefined;
};

/**
 * ***********************************
 * Effects
 * ***********************************
 */
export type EffectInput<EffectKind extends string> = {
    kind: EffectKind;
    effect: QueryFn;
    debouncedByKind?: EffectKind[];
    debounce?: 'leading' | 'trailing' | DebounceFn;
    throttle: number; // in milliseconds
    params: any[];
};

export type EffectRequest<EffectKind extends string> = {
    kind: EffectKind;
    effect: QueryFn;
    debouncedByKind?: EffectKind[];
    debounce?: 'leading' | 'trailing' | DebounceFn;
    throttle: number; // in milliseconds
    params: any[];
};

export type QueryFn = (...params: any[]) => void;

export type DebounceFn = <CurrentEffectKind extends string, LookingEffectKind extends string>(
    currentEffectRequest: EffectRequest<CurrentEffectKind>,
    lookingAtEffectRequest: EffectRequest<LookingEffectKind>
) => boolean;

export type EffectKinds =
    | 'allEnabledSuggestions'
    | 'suggestion'
    | 'batchAggs'
    | 'unfilteredQuery'
    | 'unfilteredAggs'
    | 'unfilteredQueryAndAggs'
    | 'filteredQuery'
    | 'filteredAggs'
    | 'filteredQueryAndAggs';

/**
 * ***********************************
 * Middleware
 * ***********************************
 */

export type Middleware = (
    effectRequest: EffectRequest<EffectKinds>,
    request: ESRequest
) => ESRequest;

/**
 * ***********************************
 * Manager
 * ***********************************
 */

export type ManagerOptions = {
    pageSize?: number;
    queryThrottleInMS?: number;
    fieldWhiteList?: string[];
    fieldBlackList?: string[];
    filters?: IFiltersOptions;
    suggestions?: ISuggestionsOptions;
    middleware?: Middleware[];
};

export interface IFiltersOptions {
    multiselect?: MultiSelectFilter<any>;
    dateRange?: DateRangeFilter<any>;
    range?: RangeFilter<any>;
    boolean?: BooleanFilter<any>;
    exists?: ExistsFilter<any>;
    [customFilter: string]: BaseFilter<any, any, any> | undefined;
}

export interface ISuggestionsOptions {
    fuzzy?: FuzzySuggestion<any>;
    prefix?: PrefixSuggestion<any>;
    [customSuggestion: string]: BaseSuggestion<any, any> | undefined;
}

export interface IFilters {
    multiselect: MultiSelectFilter<any>;
    dateRange: DateRangeFilter<any>;
    range: RangeFilter<any>;
    boolean: BooleanFilter<any>;
    exists: ExistsFilter<any>;
    [customFilter: string]: BaseFilter<any, any, any>;
}

export interface ISuggestions {
    fuzzy: FuzzySuggestion<any>;
    prefix: PrefixSuggestion<any>;
    [customSuggestion: string]: BaseSuggestion<any, any>;
}

/**
 * ***********************************
 * Filter Specific
 * ***********************************
 */

/**
 * Multi Select Filter
 */

export type MultiSelectSubFieldFilterValue = {
    inclusion: 'include' | 'exclude';
    kind?: 'should' | 'must';
};

export type MultiSelectFieldFilter = {
    [selectedValue: string]: MultiSelectSubFieldFilterValue;
};

export type RawMultiSelectAggs = {
    buckets: Array<{
        doc_count: number;
    }>;
};

/**
 * Boolean Filter
 */

export type BooleanFieldFilter = {
    state: boolean;
};

export type RawBooleanAggs = {
    buckets: Array<{
        key: 0 | 1;
        key_as_string: 'true' | 'false';
        doc_count: number;
    }>;
};

/**
 * Exists Filter
 */

export type ExistsFieldFilter = {
    exists: boolean;
};

export type RawExistsAggs = {doc_count: number};

/**
 * Range Filter
 */

export type GreaterThanFilter = {
    greaterThan: number;
};

export type GreaterThanEqualFilter = {
    greaterThanEqual: number;
};

export type LessThanFilter = {
    lessThan: number;
};

export type LessThanEqualFilter = {
    lessThanEqual: number;
};

export type RangeFieldFilter = (GreaterThanFilter | GreaterThanEqualFilter | {}) &
    (LessThanFilter | LessThanEqualFilter | {});

export type RawRangeDistributionAggs = {
    buckets: Array<{
        key: number;
        doc_count: number;
    }>;
};

export type RawRangeBoundAggsBasic = {
    value: number;
};
export type RawRangeBoundAggsWithString = {
    value: number;
    value_as_string: number;
};
export type RawRangeBoundAggs = RawRangeBoundAggsBasic | RawRangeBoundAggsWithString;

/**
 * ***********************************
 * Mappings
 * ***********************************
 */
export type ESMappingPropertyType = {
    type: ESMappingType;
};
export type ESMappingProperties = {
    [field: string]: ESMappingPropertyType | {properties: ESMappingProperties};
};

export type ESMapping<Alias extends string> = {
    [index: string]: {
        mappings: {
            [alias in Alias]: {
                dynamic: string;
                _all: object;
                properties: ESMappingProperties;
            };
        };
    };
};
