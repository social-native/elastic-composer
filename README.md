# snpkg-client-elasticsearch

A high-level Elasticsearch query manager and executor. Filter fields, find search suggestions, paginate query results for your indicies. Comes with addons for persisting and rehydrationg filter state from localStorage and the URL. Batteries included for optionally initializing via index introspection. Fully configurable. Very delightful. Try a slice 🍰!

Example:

```typescript
const client = new AxiosESClient('my_url/my_index');
const crm = new Manager(client);

// set filters on the elasticsearch index fields 'age', 'isMarried', 'id', and 'tags'
crm.filter.rangeFilter.setFilter('age', {greaterThan: 20, lessThanEqual: 60})
crm.filter.booleanFilter.setFilter('isMarried', {state: true})
crm.filter.exists.setFilter('id')
crm.filter.multiSelect.setFilter('tags', { isHuman: { inclusion: 'include' }, hasBlueHair: { inclusion: 'exclude' }})
crm.filters.geoFilter.addToFilter('user_profile.location', 'my_third_loc', {
    inclusion: 'include',
    kind: 'should',
    points : [
        {"lat" : 40, "lon" : -70},
        {"lat" : 30, "lon" : -80},
        {"lat" : 20, "lon" : -90}
    ]
})

autorun(() => {
  console.log(crm.results) // results of the above compound query
})
```

> Note: Internally all filter changes create `sideEffectRequests` that are put onto a processing queue. The above example will create 4 requests - one for each `setFilter` action. However, because there is built in debouncing, if these actions occur within the debounce window, only the last request (fully compounded with all filters applied) will be executed.

Example with React:

```typescript
export default observer(() => {
    const crm = useContext(Context.crm);
    return (
      <div>
        <div onClick={() => crm.filter.exists.setFilter('id')}/>
        <div onClick={() => crm.filter.exists.clearFilter('id')}/>
        <div>
          {crm.results}
        </div>
      </div>
    )
})
```

- [snpkg-client-elasticsearch](#snpkg-client-elasticsearch)
  - [Install](#install)
  - [Peer dependencies](#peer-dependencies)
  - [About](#about)
    - [Paradigm](#paradigm)
    - [Available filters and suggestions](#available-filters-and-suggestions)
    - [Enabling filters and suggestions](#enabling-filters-and-suggestions)
    - [How filters and suggestions affect one another](#how-filters-and-suggestions-affect-one-another)
    - [Extending and customizing filters](#extending-and-customizing-filters)
  - [Quick Examples](#quick-examples)
    - [Instantiate a manager](#instantiate-a-manager)
    - [Instantiate a manager with specific config options for a range filter](#instantiate-a-manager-with-specific-config-options-for-a-range-filter)
    - [Setting the fieldNameModifier for all fields in a filter](#setting-the-fieldnamemodifier-for-all-fields-in-a-filter)
    - [Add a custom filter during manager instantiation](#add-a-custom-filter-during-manager-instantiation)
    - [Add a custom suggestion during manager instantiation](#add-a-custom-suggestion-during-manager-instantiation)
    - [Adding a custom client to the manager](#adding-a-custom-client-to-the-manager)
    - [Set middleware](#set-middleware)
    - [Get the initial results for a manager](#get-the-initial-results-for-a-manager)
    - [Run a custom elasticsearch query using the current filters](#run-a-custom-elasticsearch-query-using-the-current-filters)
    - [Setting a range filter](#setting-a-range-filter)
    - [Setting a boolean filter](#setting-a-boolean-filter)
    - [Setting a exists filter](#setting-a-exists-filter)
    - [Setting a multi-select filter](#setting-a-multi-select-filter)
    - [Setting a geo filter](#setting-a-geo-filter)
    - [Clearing a single selection from a multi-select filter](#clearing-a-single-selection-from-a-multi-select-filter)
    - [Clearing a filter](#clearing-a-filter)
    - [Setting a prefix suggestion](#setting-a-prefix-suggestion)
    - [Setting a fuzzy suggestion](#setting-a-fuzzy-suggestion)
    - [Access suggestion results](#access-suggestion-results)
    - [Access the results of a query](#access-the-results-of-a-query)
    - [Access the raw response object of the current query](#access-the-raw-response-object-of-the-current-query)
    - [Paginating through the results set](#paginating-through-the-results-set)
    - [Checking if there is another page to paginate to](#checking-if-there-is-another-page-to-paginate-to)
    - [Enabling aggregation data for a filter](#enabling-aggregation-data-for-a-filter)
    - [Disabling aggregation data for a filter](#disabling-aggregation-data-for-a-filter)
    - [Enabling suggestions](#enabling-suggestions)
    - [Disabling suggestions](#disabling-suggestions)
    - [Setting filter 'should' or 'must' kind](#setting-filter-should-or-must-kind)
    - [Clearing all filters](#clearing-all-filters)
    - [Clearing all suggestions](#clearing-all-suggestions)
    - [Looking at all active suggestions](#looking-at-all-active-suggestions)
    - [Looking at all active filters](#looking-at-all-active-filters)
    - [Looking at all the Filter and Suggestion instances available for a filed](#looking-at-all-the-filter-and-suggestion-instances-available-for-a-filed)
    - [Using the history API](#using-the-history-api)
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
    - [Geo Specific](#geo-specific)
      - [Initialization](#initialization-6)
        - [defaultConfig](#defaultconfig-4)
        - [specificConfig](#specificconfig-4)
      - [Methods](#methods-5)
      - [Attributes](#attributes-5)
    - [Common Among All Suggestions](#common-among-all-suggestions)
      - [Initialization](#initialization-7)
      - [Methods](#methods-6)
      - [Attributes](#attributes-6)
    - [History API](#history-api)
      - [Initialization](#initialization-8)
      - [Methods](#methods-7)
      - [Attributes](#attributes-7)
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
        "axios": "^0.19.1", <------- only needed if using the AxiosESClient
        "lodash.chunk": "^4.2.0",
        "mobx": "^5.14.2"
        "lodash.debounce": "^4.0.8", <------- only needed if using the History API
        "query-string": "^6.11.1", <------- only needed if using the History API
        "query-params-data": "^0.1.1", <------- only needed if using the History API
}
```

## About

This library is a high level aid in querying an Elasticsearch index and building applications ontop of indexes. It is designed to bind directly to the view layer (React, Vue, Vanilla, etc..) of your app, and it handles the vast majority of associated business logic internally.

This library is written in MobX, which makes it reactive. If you don't want to use MobX, you can convert any attribute ([see all attributes in the API](#api)) to an observable stream (RxJS, 😎) using the [mobx-utils tool](https://github.com/mobxjs/mobx-utils#tostream).

### Paradigm

**TL;DR**: You describe how you want to filer each field via a `Filter API` customized to your index and the manager handles querying, state, and pagination.

The general paradigm is as follows:

There are 4 API's:

 - Filter API
 - Suggestion API
 - History API
 - Manager API

The flow is:

1. You define all the fields of an ES index that you want to use via (A) configuration objects in either the Filter or Suggestion API or (B) introspection abilities in the Manager API. 
2. Once you have fields set that you can filter or find suggestions on, you use the Filter API to filter results and the Suggestion API to get suggestions (for parameters to use in filters - such as fuzzy or prefix search of values). 
3. The Manager API gives you access to results and allows you to paginate over the results. 
4. The History API records Filters and Suggestions that have been set, persists this state to the URL in a persistent store (like localStorage), and rehydrates from persisted state.

Everything in this library is reactive. So once you set a filter, the manager will react to the change, and submit a new query to Elasticsearch using all the filters that have been set across all the fields. The manager handles debouncing, throttling and batching queries. 

In addition to simply running new queries, Filters and Suggestions provide opinionated aggregates that help inform how well the filter is doing. For example, the Range Filter gives you aggregates that show you a histogram of documents with the filter applied and without it applied. By default, aggregates are turned off by default. The paradigm with aggregates is to turn them on when a user is accessing a UI element that allows seeing aggregate data and turn them off when the UI element is no long visible. Because aggregates will respond to all filter changes, if you don't turn them off when not in use, you will submit meaningless queries to Elasticsearch.

### Available filters and suggestions

The currently available Filters are:

-   `range`: Filter documents by fields that fit within a LT (<), LTE(<=), GT(>), GTE(>=) range
-   `boolean`: Filter documents by fields that have a value of either `true` or `false`
-   `exists`: Filter documents by fields that have any value existing for that field
-   `multiselect`: Filter documents that have fields matching certain values (includes or excludes)
-   `geo`: Filter documents that have fields with `geo_point` data in them

The currently available suggestions are:

-   `prefix`: Get suggestions for fields based on matches with the same prefix
-   `fuzzy`: Get suggestions for fields based on [fuzzy matching](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-fuzzy-query.html)

### Enabling filters and suggestions

All Filters affect both the `query` and `aggs` part of an Elasticsearch request object. The `query` part is how the Filter impacts which documents match the filters. The `aggs` part provides information about how successful the filter is - showing things like histogram of range results, count of exists and not exists, etc... By default, the `aggs` part is disabled for every Filter. You should use `setAggsEnabledToTrue` and `setAggsEnabledToFalse` to toggle `aggs` for a Filter. The idea is to only run `aggs` queries when you want to show this data to the user.

Similarly, `Suggestions` are disabled by default. For the same reason above, suggestions shouldn't run unless you explicitly are showing suggestion data to a user. To toggle Suggestion enabled state use the methods `setEnabledToTrue` and `setEnabledToFalse`.

### How filters and suggestions affect one another

The interplay between `Suggestions` and `Filters` is such:

- `Suggestions` don't affect Filters, but they will react to every Filter change
- `Filters` affect Suggestions and don't react to Suggestion changes

### Extending and customizing filters

Extending and overriding the set of usable Filters or Suggestions is both possible, and easy. See [Extending Filters and Suggestions](#extending-filters-and-suggestions) for a complete guide. The basic idea is that you extend a `base` Filter or `base` Suggestion and fill out methods that tell: (A) when the manager should react to changes, (B) how to mutate a Elasticsearch request object to add Filter or Suggestion specific `query` and `aggs`, (C) how to parse an Elasticsearch response object to extract `aggs`.

## Quick Examples

Various use cases are described below. Be sure to check out the API for the full range of attributes and methods available on the Manager, Filters, and Suggestions.

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

### Setting the fieldNameModifier for all fields in a filter

The `fieldNameModifier` can be used to modify what the field name sent to Elasticsearch looks like. This is useful if you want to take a field name such as `tags` and turn it into `tags.keyword` for matching purposes.

The modifier is a function with the signature `(fieldName: string) => string`

```typescript
import {AxiosESClient, Manager, MultiSelectFilter} from '@social-native/snpkg-client-elasticsearch';

// set the default config all filters will have if not explicitly set
// by default we don't want aggs enabled unless we know the filter is being shown in the UI. So,
// we use lifecycle methods in react to toggle this config attribute and set the default to `false`.

const defaultMultiSelectFilterConfig = {
    defaultFilterKind: 'should',
    defaultFilterInclusion: 'include',
    getCount: true,
    aggsEnabled: false,
    fieldNameModifierQuery: (fieldName: string) => `${fieldName}`
    fieldNameModifierAggs: (fieldName: string) => `${fieldName}.keyword`
};


// instantiate a range filter
const multiselectFilter = new MultiSelectFilter(defaultMultiSelectFilterConfig);

const options = {
    pageSize: 100,
    queryThrottleInMS: 350,
    fieldBlackList: ['id'],
    filters: {multiselect: multiselectFilter}
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

### Adding a custom client to the manager

If you don't have permissions set up on your Elasticsearch cluster, you will most likely want to create a custom client that uses your backend as a pass through layer for making Elasticsearch calls.

An example could look like this: 

```typescript
import {Manager, IClient, ESRequest, ESResponse, ESMappingType} from '@social-native/snpkg-client-elasticsearch';

/**
 * Create a custom client that works on a specific through backend graphql nodes
 * In this case, the client uses the nodes 'creatorCRMSearch' and 'creatorCRMFields'
 */
class CreatorIndexGQLClient<Source extends object = object> implements IClient {
    public graphqlClient: GqlClient;

    constructor(graphqlClient: GqlClient) {
        if (graphqlClient === undefined) {
            throw new Error(
                'GraphqlQL client is undefined. Please instantiate this class with a GqlClient instance'
            );
        }
        this.graphqlClient = graphqlClient;
    }

    public search = async (search: ESRequest): Promise<ESResponse<Source>> => {
        const {data} = await this.graphqlClient.client.query({
            query: gql`
                query CreatorCRMSearch($search: JSON) {
                    creatorCRMSearch(search: $search)
                }
            `,
            fetchPolicy: 'no-cache',
            variables: {search: JSON.stringify(search)}
        });
        return JSON.parse(data.creatorCRMSearch);
    };

    public mapping = async (): Promise<Record<string, ESMappingType>> => {
        const {data} = (await this.graphqlClient.client.query({
            query: gql`
                query CreatorCRMFields {
                    creatorCRMFields
                }
            `,
            fetchPolicy: 'no-cache'
        })) as any;
        return JSON.parse(data.creatorCRMFields);
    };
}

const customClient = new CreatorIndexGQLClient(gqlClient);
const creatorCRM = new Manager(customClient);
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

### Setting a geo filter

Geo filters implement [geo bounding box, geo distance, and geo polygon](https://www.elastic.co/guide/en/elasticsearch/reference/current/geo-queries.html) queries.

Like a multiselect filter, you can add all filters at once for a field using `setFilter` or add them one by one using `addFilter`.

```typescript
crm.filters.geoFilter.addToFilter('user_profile.location', 'my_first_loc', {
    'kind': 'should',
    'inclusion': 'exclude',
    'distance': '100mi',
    'lat': 34.7850143,
    'lon': -92.3912103
})

crm.filters.geoFilter.addToFilter('user_profile.location', 'my_second_loc', {
    'kind': 'must',
    'inclusion': 'include',
    "top_left" : {
        "lat" : 40.73,
        "lon" : -74.1
    },
    "bottom_right" : {
        "lat" : 40.01,
        "lon" : -71.12
    }
})

crm.filters.geoFilter.addToFilter('user_profile.location', 'my_third_loc', {
    "points" : [
        {"lat" : 40, "lon" : -70},
        {"lat" : 30, "lon" : -80},
        {"lat" : 20, "lon" : -90}
    ]
})
```

### Clearing a single selection from a multi-select filter

```typescript
manager.filters.multiselect.removeFromFilter('tags', 'has_green_hair');
```

### Clearing a filter

For example, to clear the `isActive` field on a boolean filter, we would do:

```typescript
manager.filters.boolean.clearFilter('tags');
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

### Access the raw response object of the current query

```typescript
manager.rawESResponse

// => 
// {"took":1,"timed_out":false,"_shards":{"total":5,"successful":5,"skipped":0,"failed":0},"hits":{"total":2178389,"max_score":0.0,"hits":[]}}
//
```

### Paginating through the results set

```typescript
manager.nextPage();
manager.prevPage();

manager.currentPage; // number
// # => 0 when no results exist
// # => 1 for the first page of results
```

### Checking if there is another page to paginate to

```typescript
manager.hasNextPage
```

### Enabling aggregation data for a filter

By default, aggregation data is turned off for all filter. This data shows things like count of exists field, histogram of range data, etc..

```typescript
manager.filters.boolean.setAggsEnabledToTrue('tags');
```

> The idea with enabling and disabling aggregation data is that these aggregations only need to run when a filter is visible to the user in the UI. Thus, enabling and disabling should mirror filter visibility in the UI.

### Disabling aggregation data for a filter

```typescript
manager.filters.boolean.setAggsEnabledToFalse('tags');
```

### Enabling suggestions

Similar to `filters`, suggestions are disabled by default because they rely on elasticsearch aggregations to run, and there is no point in collecting the data unless the user cares about it.

```typescript
manager.suggestions.fuzzy.setEnabledToTrue('tags');
```

### Disabling suggestions

```typescript
manager.suggestions.fuzzy.setEnabledToFalse('tags');
```

### Setting filter 'should' or 'must' kind

All filters can be use in `should` or `must` mode. By default, all filters are `should` filters unless explicitly changed to `must` filters. [Read this for more info on the difference between should and must](https://stackoverflow.com/questions/28768277/elasticsearch-difference-between-must-and-should-bool-query)

```typescript
manager.filters.boolean.setKind('facebook.id', 'must');

// or to go back to should:

manager.filters.boolean.setKind('facebook.id', 'should');
```

### Clearing all filters

```typescript
manager.clearAllFilters()
```

### Clearing all suggestions

```typescript
manager.clearAllSuggestions()
```

### Looking at all active suggestions

```typescript
manager.activeSuggestions

// => 
// { tags: [PrefixSuggestion, FuzzySuggestion], location: [PrefixSuggestion]}
```

### Looking at all active filters

```typescript
manager.activeFilters

// => 
// { tags: [MultiSelectFilter, ExistsFilter], location: [RangeFilter, ExistsFilter]}
```

### Looking at all the Filter and Suggestion instances available for a filed

```typescript
manager.fieldsWithFiltersAndSuggestions

// =>
// { tags: { filters: [MultiSelectFilter, ExistsFilter] suggestions: [PrefixSuggestion, FuzzySuggestion]} }
```

### Using the history API

```typescript
const userHistory = new History(manager, 'user', { // set the url's query param key to `user`
    historyPersister: localStorageHistoryPersister('user'), // set the local storage suffix key to `user`
    historySize: 4
});
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
| clearAllFilters | clears all active filters | `(): void` | 
| clearAllSuggestions | clears all active suggestions | `(): void` |
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
| results | the results of the most recent query | The `results` type is Array<ESHit>. See [the `results` quick example doc for the type](https://github.com/social-native/snpkg-client-elasticsearch#access-the-results-of-a-query) |
| rawESResponse | The response object from the client from the query | `ESResponse` |
| activeSuggestions | the object of fields with active suggestions | `{ fieldName: SuggestionInstance[] }`  |
| activeFilters | the object of fields with active filters | `{ fieldName: FilterInstance[] }`  |
| fieldsWithFiltersAndSuggestions | the object of fields and the filters and suggestions that are available for them | `{ fieldName: { suggestions: SuggestionInstance[], filters: FilterInstance[] } }`  |
| hasNextPage | Whether another page is available via the `nextPage` method | `boolean` |
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
    defaultFilterKind: 'should',
    getCount: true,
    aggsEnabled: false
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
    defaultFilterKind: 'should',
    getDistribution: true,
    getRangeBounds: true,
    rangeInterval: 1,
    aggsEnabled: false
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
   defaultFilterKind: 'should',
   getCount: true,
   aggsEnabled: false
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
    defaultFilterKind: 'should',
    defaultFilterInclusion: 'include',
    getCount: true,
    aggsEnabled: false,
    fieldNameModifierQuery: (fieldName: string) => fieldName
    fieldNameModifierAggs: (fieldName: string) => fieldName
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
    fieldNameModifierQuery?: (fieldName: string) => string
    fieldNameModifierAggs?: (fieldName: string) => string
};
```

### Geo Specific

> NOTE: Go filters do not have any aggs enabled! Do not try to use aggs with geo filters.

Examples of GeoFilter actions and the queries they generate can be found at [src/filters/geo_filter_README.md](src/filters/geo_filter_README.md)

#### Initialization

The geoFilter constructor has the signature `(defaultConfig, specificConfig) => GeoFilterInstance`

##### defaultConfig

The configuration that each field will acquire if an override is not specifically set in `specificConfig`

```typescript
type DefaultConfig = {
    defaultFilterKind: 'should',
    defaultFilterInclusion: 'include',
    getCount: true,
    aggsEnabled: false,
    fieldNameModifierQuery: (fieldName: string) => fieldName
    fieldNameModifierAggs: (fieldName: string) => fieldName
};
```

##### specificConfig

The explicit configuration set on a per field level. If a config isn't specified or only partially specified for a field, the defaultConfig will be used to fill in the gaps.

```typescript
type SpecificConfig = Record<string, GeoConfig>;

type GeoConfig = {
    field: string;
    defaultFilterKind?: 'should' or 'must';
    defaultFilterInclusion?: 'include' | 'exclude';
    getCount?: boolean;
    aggsEnabled?: boolean;
    fieldNameModifierQuery?: (fieldName: string) => string
    fieldNameModifierAggs?: (fieldName: string) => string
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
| setFilter        | sets the filter for a field              | `(field: <name of geo field>, filter: {[geoSubFilterReferenceName]: {inclusion: 'include' or 'exclude', kind?: 'should' or 'must'}}): void` |
| addToFilter      | adds a single selection to a filter      | `addToFilter(field: <name of geo field>, geoSubFilterReferenceName: string, selectionFilter: {inclusion: 'include' or 'exclude', kind?: 'should' or 'must'}): void`          |
| removeFromFilter | removes a single selection from a filter | `removeFromFilter(field: <name of geo field>, geoSubFilterReferenceName: string): void`                                                     |

#### Attributes

| attribute       | description                                                                      | type                                                                                |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |

> Note: No aggregates are implemented, thus there are no attributes specific to this filter type.

### Common Among All Suggestions

The suggestions that ship with this package all have the same public interface (for the moment). Thus, you can rely on this section for API documentation on each suggestion type.

#### Initialization

All filter constructors have the signature `(defaultConfig, specificConfig) => SuggestionTypeInstance`

`defaultConfig` and `specificConfig` are specific to each suggestion class type.

The `defaultConfig` looks like:

```typescript
{
    defaultSuggestionKind: 'should',
    enabled: false,
    fieldNameModifierQuery: (fieldName: string) => fieldName,
    fieldNameModifierAggs: (fieldName: string) => fieldName
}
```

The typings for the specific config object looks like:

```typescript
{
    field: string;
    defaultSuggestionKind?: 'should' | 'must';
    enabled?: boolean;
    fieldNameModifierQuery?: FieldNameModifier;
    fieldNameModifierAggs?: FieldNameModifier;
}
```

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

### History API

The history API allows you to:

- record history of user interactions with filters and suggestions
- allow you to serialize the current state to a URL query param
- allow you to save the history to local storage and rehydrate from this storage.


#### Initialization

All filter constructors have the signature `(manager: Manager, queryParamKey: string, options?: IHistoryOptions<HistoryLocation>) => SuggestionTypeInstance`


The `options` looks like:

```typescript
{
    historySize?: number;
    currentLocationStore?: UrlStore<State>;
    historyPersister?: IHistoryPersister;
    rehydrateOnStart?: boolean; // whether to run the `rehydrate` method in the constructor
}
```

In turn, the historyPersister has the type:

```typescript
IHistoryPersister {
    setHistory: (location: Array<HistoryLocation | undefined>) => void;
    getHistory: () => HistoryLocation[];
}

```

#### Methods

| method            | description                                                | type                                                   |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| setCurrentState         | sets the current state of filters and suggestgions    | `(location: HistoryLocation): void`   |
| back       | goes back in the history                              | `(): void`                       |
| forward           | goes forward in the history                                | `(): void` |
| rehydrate | rehydrates from URL or persistent storage | `(): void` |

#### Attributes

| attribute        | description                                                  | type                                                                  |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| history     | the recorded history                  | `Array<HistoryLocation | undefined>`     |
| currentLocationInHistoryCursor | the location in history, changed by going 'back' or 'forward'             | `number` |
| hasRehydratedLocation | flag to tell if any location was rehydrated from when the `rehydrate` method was called |

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
