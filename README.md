# snpkg-client-elasticsearch

- [snpkg-client-elasticsearch](#snpkg-client-elasticsearch)
  - [Install](#install)
  - [Peer dependencies](#peer-dependencies)
  - [About](#about)
  - [Quick Examples](#quick-examples)
    - [Instantiate a manager](#instantiate-a-manager)
    - [Instantiate a manager with specific config options for a range filter](#instantiate-a-manager-with-specific-config-options-for-a-range-filter)
    - [Add a custom filter during manager instantiation](#add-a-custom-filter-during-manager-instantiation)
    - [Add a custom suggestion during manager instantiation](#add-a-custom-suggestion-during-manager-instantiation)
    - [Set middleware](#set-middleware)
    - [Get the initial results for a manager](#get-the-initial-results-for-a-manager)
    - [Run a custom elasticsearch query using the current filters](#run-a-custom-elasticsearch-query-using-the-current-filters)
    - [Setting a range filter](#setting-a-range-filter)
    - [Setting a boolean filter](#setting-a-boolean-filter)
    - [Setting a exists filter](#setting-a-exists-filter)
    - [Setting a multi-select filter](#setting-a-multi-select-filter)
    - [Clearing a single selection from a multi-select filter](#clearing-a-single-selection-from-a-multi-select-filter)
    - [Clearing a filter](#clearing-a-filter)
    - [Setting a prefix suggestion](#setting-a-prefix-suggestion)
    - [Setting a fuzzy suggestion](#setting-a-fuzzy-suggestion)
    - [Access suggestion results](#access-suggestion-results)
    - [Access the results of a query](#access-the-results-of-a-query)
    - [Paginating through the results set](#paginating-through-the-results-set)
    - [Enabling aggregation data for a filter](#enabling-aggregation-data-for-a-filter)
    - [Disabling aggregation data for a filter](#disabling-aggregation-data-for-a-filter)
    - [Enabling suggestions](#enabling-suggestions)
    - [Disabling suggestions](#disabling-suggestions)
    - [Setting filter 'should' or 'must' kind](#setting-filter-should-or-must-kind)
  - [API](#api)
    - [Manager](#manager)
      - [Initialization](#initialization)
        - [Client](#client)
        - [Options](#options)
      - [Methods](#methods)
      - [Attributes](#attributes)
    - [Common Among All Filters](#common-among-all-filters)
      - [Initialization](#initialization-1)
      - [Methods](#methods-1)
      - [Attributes](#attributes-1)
    - [Boolean Specific](#boolean-specific)
      - [Initialization](#initialization-2)
        - [defaultConfig](#defaultconfig)
        - [specificConfig](#specificconfig)
      - [Methods](#methods-2)
      - [Attributes](#attributes-2)
    - [Range Specific](#range-specific)
      - [Initialization](#initialization-3)
        - [defaultConfig](#defaultconfig-1)
        - [specificConfig](#specificconfig-1)
      - [Methods](#methods-3)
      - [Attributes](#attributes-3)
    - [Exists Specific](#exists-specific)
      - [Initialization](#initialization-4)
        - [defaultConfig](#defaultconfig-2)
        - [specificConfig](#specificconfig-2)
      - [Methods](#methods-4)
      - [Attributes](#attributes-4)
    - [Multi-Select Specific](#multi-select-specific)
      - [Initialization](#initialization-5)
        - [defaultConfig](#defaultconfig-3)
        - [specificConfig](#specificconfig-3)
      - [Methods](#methods-5)
      - [Attributes](#attributes-5)
    - [Common Among All Suggestions](#common-among-all-suggestions)
      - [Initialization](#initialization-6)
      - [Methods](#methods-6)
      - [Attributes](#attributes-6)
  - [Verbose Examples](#verbose-examples)
    - [Usage with React](#usage-with-react)
  - [Extending Filters and Suggestions](#extending-filters-and-suggestions)


## Install

```
npm install --save @social-native/snpkg-client-elasticsearch
```

## Peer dependencies

This package requires that you also install:

```typescript
{
        "await-timeout": "^1.1.1",
        "axios": "^0.19.1", <------- only used if using the AxiosESClient
        "lodash.chunk": "^4.2.0",
        "mobx": "^5.14.2"
}
```

## About

This package aids in querying an Elasticsearch index. It is written in MobX, which makes it reactive. If you don't want to use MobX, you can convert any attribute ([see all attributes in the API](#api)) to an observable stream (RxJS, 😎) using the [mobx-utils tool](https://github.com/mobxjs/mobx-utils#tostream).

You either: (A) define `filters` for each field in the index that you want to query or (B) use the package's introspection abilities to generate filters for all the fields in the index. Once filters have been defined, you can use a specific filter's API to do unique and compound filtering with field level granularity. 

The manager will: (1) react to all filter changes, (2) generate a valid query using all active filters, (3) enqueue the query (debouncing, throttling, and batching aggregations in the queries), and then (4) continually process of the queue - submitting queries, one by one, to elasticsearch via specific clients that were provided to the manager. Furthermore, the manager stores the results of all queries and handles pagination among a result set.

Additionally, similar to how filters work, you can define`suggestions` and use the specific API for each one to get search suggestions from elasticsearch. These results can be used to inform configuration for different `filters`.

The currently available filters are:

-   `range`: Filter documents by fields that fit within a LT (<), LTE(<=), GT(>), GTE(>=) range
-   `boolean`: Filter documents by fields that have a value of either `true` or `false`
-   `exists`: Filter documents by fields that have any value existing for that field
-   `multiselect`: Filter documents that have fields matching certain values (includes or excludes)

The currently available suggestions are:

-   `prefix`: Get suggestions for fields based on matches with the same prefix
-   `fuzzy`: Get suggestions for fields based on [fuzzy matching](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-fuzzy-query.html)

All filters affect both the `query` and `aggs` part of an Elasticsearch request object. The `query` part is how the filter impacts which documents match the filters. The `aggs` part provides information about how successfull the filter is - showing things like histogram of range results, count of exists and not exists, etc... By default, the `aggs` part is disabled for every filter. You should use `setAggsEnabledToTrue` and `setAggsEnabledToFalse` to toggle `aggs` for a filter. The idea is to only run `aggs` queries when you want to show this data to the user.

Simillarily, `suggestions` are disabled by default. For the same reason above, suggestions shouldn't run unless you explicitly are showing suggestion data to a user. To toggle suggestion state use the methods `setEnabledToTrue` and `setEnabledToFalse`.

The interplay between `suggestions` and `filters` is such:

- `suggestions` don't affect filters, but they will react to every filter change
- `filters` affect suggestions and don't react to suggestion changes


Extending and overriding the set of usable filters or suggestions is both possible, and easy. See [Extending Filters and Suggestions](#extending-filters-and-suggestions) for a complete guide. The basic idea is that you extend a `base` filter or `base` suggestion and fill out methods that tell: (A) when the manager should react to changes, (B) how to mutate a Elasticsearch request object to add filter or suggestion specific `query` and `aggs`, (C) how to parse an Elasticsearch response object to extract `aggs`.

## Quick Examples

Various use cases are described below. Be sure to check out the API for the full range of attributes and methods available on the manager, filters, and suggestions.

### Instantiate a manager

```typescript
import {AxiosESClient, Manager} from '@social-native/snpkg-client-elasticsearch';

// instantiate an elasticsearch axios client made for this lib
const client = new AxiosESClient('my_url/my_index');

// instantiate a manager
const manager = new Manager(client, {
    pageSize: 100,
    queryThrottleInMS: 350,
    fieldBlackList: ['id']
});
```

### Instantiate a manager with specific config options for a range filter

```typescript
import {AxiosESClient, Manager, RangeFilter} from '@social-native/snpkg-client-elasticsearch';

// set the default config all filters will have if not explicitly set
// by default we don't want aggs enabled unless we know the filter is being shown in the UI. So,
// we use lifecycle methods in react to toggle this config attribute and set the default to `false`.
const defaultRangeFilterConfig = {
    aggsEnabled: false,
    defaultFilterKind: 'should',
    getDistribution: true,
    getRangeBounds: true,
    rangeInterval: 1
};

// explicitly set the config for certain fields
const customRangeFilterConfig = {
    age: {
        field: 'user.age',
        rangeInterval: 10
    },
    invites: {
        field: 'user.invites',
        getDistribution: false
    }
};

// instantiate a range filter
const rangeFilter = new RangeFilter(defaultRangeFilterConfig, customRangeFilterConfig);

const options = {
    pageSize: 100,
    queryThrottleInMS: 350,
    fieldBlackList: ['id'],
    filters: {range: rangeFilter}
};

const manager = new Manager(client, options);
```

### Add a custom filter during manager instantiation

```typescript
import MyCustomFilter from 'my_custom_filter';
import {AxiosESClient, Manager} from '@social-native/snpkg-client-elasticsearch';

const client = new AxiosESClient('my_url/my_index');
const newCustomFilter = new MyCustomFilter();

const manager = new Manager(client, {
    pageSize: 100,
    queryThrottleInMS: 350,
    fieldBlackList: ['id'],
    filters: {myNewFilterName: newCustomFilter}
});
```

### Add a custom suggestion during manager instantiation

```typescript
import MyCustomSuggestion from 'my_custom_suggestion';
import {AxiosESClient, Manager} from '@social-native/snpkg-client-elasticsearch';

const client = new AxiosESClient('my_url/my_index');
const newCustomSuggestion = new MyCustomSuggestion();

const manager = new Manager(client, {
    pageSize: 100,
    queryThrottleInMS: 350,
    fieldBlackList: ['id'],
    suggestions: {myNewSuggestionName: newCustomSuggestion}
});
```

### Set middleware

```typescript
import {Middleware} from '@social-native/snpkg-client-elasticsearch';

const logRequestObj: Middleware = (
    _effectRequest: EffectRequest<EffectKinds>,
    request: ESRequest
) => {
    console.log(request);
    return request;
};

manager.setMiddleware([logRequestObj]);
```

### Get the initial results for a manager

All queries are treated as requests and added to an internal queue. Thus, you don't await this method but, react to the `manager.results` attribute.

```typescript
manager.runStartQuery();
```

### Run a custom elasticsearch query using the current filters

If you wanted to bulk export a subset of the filtered results without having to paginate programmatically, you could request the results for a much larger page size this way over a reduced field list:

```typescript
const results = await manager.runCustomFilterQuery({whiteList: ['id'], pageSize: 10000});
```

### Setting a range filter

```typescript
manager.filters.range.setFilter('age', {greaterThanEqual: 20, lessThan: 40});
```

> Note: This triggers a query to rerun with all the existing filters plus the range filter for `age` will be updated
> to only include people between the ages of 20-40 (inclusive to exclusive).

### Setting a boolean filter

```typescript
manager.filters.boolean.setFilter('isActive', {state: true});
```

### Setting a exists filter

For example, this will filter all documents so only the ones with a `facebook.id` are shown

```typescript
manager.filters.boolean.setFilter('facebook.id', {exists: true});
```

### Setting a multi-select filter

A multi select filter can be set in two ways: (1) all selections at once, or (2) one selection at a time.

To set all selections at once, you would do something like:

```typescript
manager.filters.multiselect.setFilter('tags', {
    is_good_user: {inclusion: 'include'},
    has_green_hair: {inclusion: 'exclude', kind: 'must'},
    likes_ham: {inclusion: 'include', kind: 'should'}
});
```

> Notice how `kind` is optional. If its not specified, it will default to whatever `defaultFilterKind` is set to for the filter (aka `manager.filter.multiselect.fieldConfigs['tags].defaultFilterKind`)

To set one selection at a time, you would do:

```typescript
manager.filters.multiselect.addToFilter('tags', 'has_green_hair', {
    inclusion: 'exclude',
    kind: 'must'
});
```

### Clearing a single selection from a multi-select filter

```typescript
manager.filters.multiselect.removeFromFilter('tags', 'has_green_hair');
```

### Clearing a filter

For example, to clear the `isActive` field on a boolean filter, we would do:

```typescript
manager.filters.boolean.clearFilter('isActive');
```

### Setting a prefix suggestion

```typescript
manager.suggestions.prefix.setSearch('tags', 'blu');
```

### Setting a fuzzy suggestion

```typescript
manager.suggestions.fuzzy.setSearch('tags', 'ca');
```

### Access suggestion results

All suggestions have the same interface (currently). For both `prefix` and `fuzzy` would get the suggestions for a search like:

```typescript
manager.suggestions.fuzzy.fieldSuggestions['tags'];

// => [{ suggestion: 'car', count: 120}, { suggestion: 'can', count: 9 }]
```

### Access the results of a query

```typescript
manager.results; // Array<ESHit>
```

Results are an array where each object in the array has the type:

```typescript
type ESHit<Source extends object = object> = {
    _index: string;
    _type: string;
    _id: string;
    _score: number;
    _source: Source;
    sort: ESRequestSortField;
};
```

> `_source` will be the document result from the index.

Thus, you would likely use the `results` like:

```typescript
manager.results.map(r => r._source);
```

### Paginating through the results set

```typescript
manager.nextPage();
manager.prevPage();

manager.currentPage; // number
// # => 0 when no results exist
// # => 1 for the first page of results
```

### Enabling aggregation data for a filter

By default, aggregation data is turned off for all filter. This data shows things like count of exists field, histogram of range data, etc..

```typescript
manager.filters.boolean.setAggsEnabledToTrue();
```

> The idea with enabling and disabling aggregation data is that these aggregations only need to run when a filter is visible to the user in the UI. Thus, enabling and disabling should mirror filter visibility in the UI.

### Disabling aggregation data for a filter

```typescript
manager.filters.boolean.setAggsEnabledToFalse();
```

### Enabling suggestions

Similar to `filters`, suggestions are disabled by default because they rely on elasticsearch aggregations to run, and there is no point in collecting the data unless the user cares about it.

```typescript
manager.filters.fuzzy.setEnabledToTrue('tags');
```

### Disabling suggestions

```typescript
manager.filters.fuzzy.setEnabledToFalse('tags');
```

### Setting filter 'should' or 'must' kind

All filters can be use in `should` or `must` mode. By default, all filters are `should` filters unless explicitly changed to `must` filters. [Read this for more info on the difference between should and must](https://stackoverflow.com/questions/28768277/elasticsearch-difference-between-must-and-should-bool-query)

```typescript
manager.filters.boolean.setKind('facebook.id', 'must');

// or to go back to should:

manager.filters.boolean.setKind('facebook.id', 'should');
```

## API

### Manager

#### Initialization

The manager constructor has the signature `(client, options) => ManagerInstance`

##### Client

`client` is an object than handles submitting query responses. It has the signature:

```typescript
interface IClient<Source extends object = object> {
    search: (request: ESRequest) => Promise<ESResponse<Source>>;
    mapping: () => Promise<Record<string, ESMappingType>>;
    // With ESMappingType equal to https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-types.html
}
```

At the moment there only exists an `AxiosESClient` client. This can be imported via a named import:

```ts
import {AxiosESClient} from '@social-native/snpkg-client-elasticsearch';

const axiosESClient = new AxiosESClient(endpoint);

// endpoint is in the form: blah2lalkdjhgak.us-east-1.es.amazonaws.com/myindex1
```

##### Options

`options` are used to configure the manager. There currently exist these options:

```ts
type ManagerOptions = {
    pageSize?: number;
    queryThrottleInMS?: number;
    fieldWhiteList?: string[];
    fieldBlackList?: string[];
    middleware?: Middleware[];
    filters?: IFilters;
    suggestions?: ISuggestions;
};
```

-   `pageSize`: the number of results to expect when calling `manager.results`. The default size is 10.
-   `queryThrottleInMS`: the amount of time to wait before executing an Elasticsearch query. The default time is 1000.
-   `fieldWhiteList`: A list of elasticsearch fields that you only want to allow filtering on. This can't be used with `fieldBlackList`. Only white list fields will be returned in an elasticsearch query response.
-   `fieldBlackList`: A list of elasticsearch fields that you don't want to allow filtering on. This can't be used with `fieldWhiteList`. Black list fields will be excluded from an elasticsearch query response.
-   `middleware`: An array of custom middleware to run during elasticsearch request object construction. See below for the type.
-   `filters`: An object of filter instances. Default filters will be instantiate if none are specified in this options field. This options field however can be used to override existing filters or specify a custom one.
-   `suggestions`: An object of suggestion instances. Default suggestions will be instantiated if none are specified in this options field. This options field however can be used to override existing suggestions or specify a custom one.

The middleware function type signature is:

```typescript
Middleware = (effectRequest: EffectRequest<EffectKinds>, request: ESRequest) => ESRequest;
```

Example of overriding the range filter:

```ts
const options = {filters: {range: rangeFilterInstance}};
```

Example of overriding the fuzzy suggestion:

```ts
const options = {suggestions: {fuzzy: fuzzyFilterInstance}};
```

#### Methods

| method                | description                                                                                                                                                                                       | type                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| nextPage              | paginates forward                                                                                                                                                                                 | `(): void`                                                                                                                                |
| prevPage              | paginates backward                                                                                                                                                                                | `(): void`                                                                                                                                |
| getFieldNamesAndTypes | runs an introspection query on the index mapping and generates an object of elasticsearch fields and the filter type they correspond to                                                           | `async (): void`                                                                                                                          |
| runStartQuery         | runs the initial elasticsearch query that fetches unfiltered data                                                                                                                                 | `(): void`                                                                                                                                |
| runCustomFilterQuery  | runs a custom query using the existing applied filters outside the side effect queue flow. white lists and black lists control which data is returned in the elasticsearch response source object | `async (options?: {fieldBlackList?: string[], fieldWhiteList?: string[], pageSize?: number }): Promise<ESResponse>`                       |
| setMiddleware         | adds middleware to run during construction of the elasticsearch query request object                                                                                                              | `(middlewares: Middleware): void`. Middleware has the type `(effectRequest: EffectRequest<EffectKinds>, request: ESRequest) => ESRequest` |

#### Attributes

| attribute               | description                                                                                                                                   | notes                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| isSideEffectRunning     | a flag telling if a query is running                                                                                                          | `boolean`                                                                           |
| currentPage             | the page number                                                                                                                               | `0` if there are no results. `1` for the first page. etc...                         |
| fieldWhiteList          | the white list of fields that filters can exist for                                                                                           |                                                                                     |
| fieldBlackList          | the black list of fields that filters can not exist for                                                                                       |                                                                                     |
| pageSize                | the page size                                                                                                                                 | The default size is 10. This can be changed by setting manager options during init. |
| queryThrottleInMS       | the throttle time for queries                                                                                                                 | The default is 1000 ms. This can be changed by setting manager options during init. |
| filters                 | the filter instances that the manager controls                                                                                                |
| indexFieldNamesAndTypes | A list of fields that can be filtered over and the filter name that this field uses. This is populated by the method `getFieldNamesAndTypes`. |

### Common Among All Filters

#### Initialization

All filter constructors have the signature `(defaultConfig, specificConfig) => FilterTypeInstance`

`defaultConfig` and `specificConfig` are specific to each filter class type.

#### Methods

| method                | description                                     | type                                                                             |
| --------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| setFilter             | sets the filter for a field                     | `(field: <name of field>, filter: <filter specific to filter class type>): void` |
| clearFilter           | clears the filter for a field                   | `(field: <name of field>): void`                                                 |
| setKind               | sets the kind for a field                       | `(field: <name of field>, kind: should or must): void`                           |
| setAggsEnabledToTrue  | enables fetching of aggs for this filter field  | `(field: <name of field>): void`                                                 |
| setAggsEnabledToFalse | disables fetching of aggs for this filter field | `(field: <name of field>): void`                                                 |

#### Attributes

| attribute    | description                                                  | type                                                              |
| ------------ | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| fieldConfigs | the config for a field, keyed by field name                  | `{ [<names of fields>]: <config specific to filter class type> }` |
| fieldFilters | the filters for a field, keyed by field name                 | `{ [<names of fields>]: Filter }`                                 |
| fieldKinds   | the kind (`should or must`) for a field, keyed by field name | `{ [<names of fields>]: 'should' or 'must' }`                     |

### Boolean Specific

#### Initialization

The boolean constructor has the signature `(defaultConfig, specificConfig) => BooleanFilterInstance`

##### defaultConfig

The configuration that each field will acquire if an override is not specifically set in `specificConfig`

```typescript
type DefaultConfig = {
    defaultFilterKind: 'should' or 'must';
    getCount: boolean;
    aggsEnabled: boolean;
};
```

##### specificConfig

The explicit configuration set on a per field level. If a config isn't specified or only partially specified for a field, the defaultConfig will be used to fill in the gaps.

```typescript
type SpecificConfig = Record<string, BooleanConfig>;

type BooleanConfig = {
    field: string;
    defaultFilterKind?: 'should' or 'must';
    getCount?: boolean;
    aggsEnabled?: boolean;
};
```

#### Methods

| method    | description                 | type                                                                     |
| --------- | --------------------------- | ------------------------------------------------------------------------ |
| setFilter | sets the filter for a field | `(field: <name of boolean field>, filter: {state: true or false}): void` |

#### Attributes

| attribute       | description                                                                  | type                                                               |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| filteredCount   | the count of boolean values of all filtered documents, keyed by field name   | `{ [<names of boolean fields>]: { true: number; false: number;} }` |
| unfilteredCount | the count of boolean values of all unfiltered documents, keyed by field name | `{ [<names of boolean fields>]: { true: number; false: number;} }` |

### Range Specific

#### Initialization

The range constructor has the signature `(defaultConfig, specificConfig) => RangeFilterInstance`

##### defaultConfig

The configuration that each field will acquire if an override is not specifically set in `specificConfig`

```typescript
type RangeConfig = {
    defaultFilterKind: 'should' or 'must';
    getDistribution: boolean;
    getRangeBounds: boolean;
    rangeInterval: number;
    aggsEnabled: boolean;
};
```

##### specificConfig

The explicit configuration set on a per field level. If a config isn't specified or only partially specified for a field, the defaultConfig will be used to fill in the gaps.

```typescript
type SpecificConfig = Record<string, RangeConfig>;

type RangeConfig = {
    field: string;
    defaultFilterKind?: 'should' or 'must';
    getDistribution?: boolean;
    getRangeBounds?: boolean;
    rangeInterval?: number;
    aggsEnabled?: boolean;
};
```

#### Methods

| method    | description                 | type                                                                                                                                        |
| --------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| setFilter | sets the filter for a field | `(field: <name of range field>, filter: {lessThan?: number, greaterThan?: number, lessThanEqual?: number, greaterThanEqual?: number): void` |

#### Attributes

| attribute              | description                                                            | type                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| filteredRangeBounds    | the bounds of all filtered ranges (ex: 20 - 75), keyed by field name   | `{ [<names of range fields>]: { min: { value: number; value_as_string?: string; }; max: { value: number; value_as_string?: string; };} }` |
| unfilteredRangeBounds  | the bounds of all unfiltered ranges (ex: 0 - 100), keyed by field name | `{ [<names of range fields>]: { min: { value: number; value_as_string?: string; }; max: { value: number; value_as_string?: string; };} }` |
| filteredDistribution   | the distribution of all filtered ranges, keyed by field name           | `{[<names of range fields>]: Array<{ key: number; doc_count: number; }>}`                                                                 |
| unfilteredDistribution | the distribution of all filtered ranges, keyed by field name           | `{[<names of range fields>]: Array<{ key: number; doc_count: number; }>}`                                                                 |

### Exists Specific

#### Initialization

The exists constructor has the signature `(defaultConfig, specificConfig) => ExistsFilterInstance`

##### defaultConfig

The configuration that each field will acquire if an override is not specifically set in `specificConfig`

```typescript
type DefaultConfig = {
    defaultFilterKind: 'should' or 'must';
    getCount: boolean;
    aggsEnabled: boolean;
};
```

##### specificConfig

The explicit configuration set on a per field level. If a config isn't specified or only partially specified for a field, the defaultConfig will be used to fill in the gaps.

```typescript
type SpecificConfig = Record<string, ExistsConfig>;

type ExistsConfig = {
    field: string;
    defaultFilterKind?: 'should' or 'must';
    getCount?: boolean;
    aggsEnabled?: boolean;
};
```

#### Methods

| method    | description                 | type                                                                     |
| --------- | --------------------------- | ------------------------------------------------------------------------ |
| setFilter | sets the filter for a field | `(field: <name of exists field>, filter: {exists: true or false}): void` |

#### Attributes

| attribute       | description                                                                 | type                                                                      |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| filteredCount   | the count of exists values of all filtered documents, keyed by field name   | `{ [<names of exists fields>]: { exists: number; doesntExist: number;} }` |
| unfilteredCount | the count of exists values of all unfiltered documents, keyed by field name | `{ [<names of exists fields>]: { exists: number; doesntExist: number;} }` |

### Multi-Select Specific

#### Initialization

The multiselect constructor has the signature `(defaultConfig, specificConfig) => MultiSelectFilterInstance`

##### defaultConfig

The configuration that each field will acquire if an override is not specifically set in `specificConfig`

```typescript
type DefaultConfig = {
    defaultFilterKind: 'should' or 'must';
    defaultFilterInclusion?: 'include' | 'exclude';
    getCount: boolean;
    aggsEnabled: boolean;
};
```

##### specificConfig

The explicit configuration set on a per field level. If a config isn't specified or only partially specified for a field, the defaultConfig will be used to fill in the gaps.

```typescript
type SpecificConfig = Record<string, MultiSelectConfig>;

type MultiSelectConfig = {
    field: string;
    defaultFilterKind?: 'should' or 'must';
    defaultFilterInclusion?: 'include' | 'exclude';
    getCount?: boolean;
    aggsEnabled?: boolean;
};
```

#### Methods

A filter selection has the type:

```typescript
{
  inclusion: 'include' | 'exclude';
  kind?: 'should' | 'must';
}
```

| method           | description                              | type                                                                                                                                    |
| ---------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| setFilter        | sets the filter for a field              | `(field: <name of multiselect field>, filter: {[selectionName]: {inclusion: 'include' or 'exclude', kind?: 'should' or 'must'}}): void` |
| addToFilter      | adds a single selection to a filter      | `addToFilter(field: <name of multiselect field>, selectionName: string, selectionFilter: {inclusion: 'include' or 'exclude', kind?: 'should' or 'must'}): void`          |
| removeFromFilter | removes a single selection from a filter | `removeFromFilter(field: <name of multiselect field>, selectionName: string): void`                                                     |

#### Attributes

| attribute       | description                                                                      | type                                                                                |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| filteredCount   | the count of multiselect values of all filtered documents, keyed by field name   | `{ [<names of multiselect fields>]: { [<names of selectons>]: number } }` |
| unfilteredCount | the count of multiselect values of all unfiltered documents, keyed by field name | `{ [<names of multiselect fields>]: { [<names of selectons>]: number } }` |

### Common Among All Suggestions

The suggestions that ship with this package all have the same public interface (for the moment). Thus, you can rely on this section for API documentation on each suggestion type.

#### Initialization

All filter constructors have the signature `(defaultConfig, specificConfig) => SuggestionTypeInstance`

`defaultConfig` and `specificConfig` are specific to each suggestion class type.

#### Methods

| method            | description                                                | type                                                   |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| setSearch         | sets the search term for a field to get suggestions for    | `(field: <name of field>, searchTerm: string): void`   |
| clearSearch       | clears the search for a field                              | `(field: <name of field>): void`                       |
| setKind           | sets the kind for a field                                  | `(field: <name of field>, kind: should or must): void` |
| setEnabledToTrue  | enables fetching of suggestions for this suggestion field  | `(field: <name of field>): void`                       |
| setEnabledToFalse | disables fetching of suggestions for this suggestion field | `(field: <name of field>): void`                       |

#### Attributes

| attribute        | description                                                  | type                                                                  |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| fieldConfigs     | the config for a field, keyed by field name                  | `{ [<names of fields>]: <config specific to filter class type> }`     |
| fieldSuggestions | the suggestions for a field, keyed by field name             | `{ [<names of fields>]: Array<{suggestion: string; count: number}> }` |
| fieldSearches    | the searches for a field, keyed by field name                | `{ [<names of fields>]: string }`                                     |
| fieldKinds       | the kind (`should or must`) for a field, keyed by field name | `{ [<names of fields>]: 'should' or 'must' }`                         |

## Verbose Examples

See [./dev/app/](./dev/app/) for examples used in the development environment.

### Usage with React

```typescript
import {AxiosESClient, Manager} from '@social-native/snpkg-client-elasticsearch';

const client = new AxiosESClient(process.env.ELASTIC_SEARCH_ENDPOINT);
const creatorCRM = new Manager(client);

creatorCRM.getFieldNamesAndTypes().then(() => {
    creatorCRM.runStartQuery();
});

export default {
    exampleForm: React.createContext(exampleFormInstance),
    creatorCRM: React.createContext(creatorCRM)
};
```

## Extending Filters and Suggestions

TODO
