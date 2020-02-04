# snpkg-client-elasticsearch



- [snpkg-client-elasticsearch](#snpkg-client-elasticsearch)
  - [Install](#install)
  - [Peer dependencies](#peer-dependencies)
  - [About](#about)
  - [Quick Examples](#quick-examples)
      - [Setting a range filter](#setting-a-range-filter)
      - [Access the results of a query](#access-the-results-of-a-query)
      - [Paginating through the results set](#paginating-through-the-results-set)
  - [API](#api)
    - [Manager](#manager)
      - [Initialization](#initialization)
        - [Client](#client)
        - [Filters](#filters)
        - [Options](#options)
      - [Methods](#methods)
      - [Attributes](#attributes)
    - [Range](#range)
      - [Methods](#methods-1)
      - [Attributes](#attributes-1)
  - [Example Usage](#example-usage)
    - [Set the context](#set-the-context)
    - [Use a filter in a pure component](#use-a-filter-in-a-pure-component)

## Install

```
npm install --save @social-native/snpkg-client-elasticsearch
```

## Peer dependencies

This package requires that you also install:

```ts
{
        "await-timeout": "^1.1.1",
        "axios": "^0.19.1",
        "lodash.chunk": "^4.2.0",
        "mobx": "^5.14.2"
}
```

## About

This package aids in querying an Elasticsearch index. You define `filters` for each field in the index that you want to query, and the specific filter API allows you to generate a valid query across many fields.

The currently available filters are:

- `range`: Filter records by specifying a LT (<), LTE(<=), GT(>), GTE(>=) range

There also exists a `manager` object which is how you access each filter, get the results of a query, and paginate through the result set.

## Quick Examples

#### Setting a range filter

This triggers a query to rurun with all the existing filters plus the range filter for `age` will be updated
to only include people between the ages of 20-40 (inclusive to exclusive).

```typescript
manager.filters.range.setFilter('age', { greaterThanEqual: 20, lessThan: 40, })
```

#### Access the results of a query

```typescript
manager.results  // Array<ESHit>
```

Results are an array where each object in the array has the type:

```typescript
export type ESHit<Source extends object = object> = {
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
manager.results.map(r => r._source)
```

#### Paginating through the results set

```typescript
manager.nextPage()
manager.prevPage()

manager.currentPage // number
// # => 0 when no results exist
// # => 1 for the first page of results
```

## API

### Manager

#### Initialization

The manager constructor has the signature `(client, filters, options) => ManagerInstance`

##### Client

`client` is an object than handles submitting query responses. It has the signature:

```typescript
interface IClient<Source extends object = object> {
    search: (request: ESRequest) => Promise<ESResponse<Source>>;
    mapping: () => Promise<Record<string, ESMappingType>>;
    // With ESMappingType equal to https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-types.html
}
```

At the moment there only exists an `Axios` client. This can be imported via a named import:
```ts
import {Axios} from '@socil-native/snpkg-client-elasticsearch'

const axiosESClient = new Axios(endpoint);

// endpoint is in the form: blah2lalkdjhgak.us-east-1.es.amazonaws.com/myindex1
```

##### Filters

`filters` is an object of filter instances. Ahead of time, you should have instantiated every filter you want to use. You then pass these filter instances to the manager in this object, like so:

```ts
const filters = {range: rangeFilterInstance}
```

##### Options

`options` are used to configure the manager. There currently exist these options:

```ts
type ManagerOptions = {
    pageSize?: number;
    queryThrottleInMS?: number;
    fieldWhiteList?: string[];
    fieldBlackList?: string[];
};
```

- `pageSize`: the number of results to expect when calling `manager.results`. The default size is 10.
- `queryThrottleInMS`: the amount of time to wait before executing an Elasticsearch query. The default time is 1000.
- `fieldWhiteList`: A list of elasticsearch fields that you only want to allow filtering on. This can't be used with `fieldBlackList`
- `fieldBlackList`: A list of elasticsearch fields that you don't want to allow filtering on. This can't be used with `fieldWhiteList`  

#### Methods 

| method | description | type |
| - | - | - |
| nextPage | paginates forward | `(): void` |
| prevPage | paginates backward | `(): void` |
| getFieldNamesAndTypes | runs an introspection query on the index mapping and generates an object of elasticsearch fields and the filter type they correspond to | `(): void` |
| runStartQuery | runs the initial elasticsearch query that fetches unfiltered data | `(): void` |

#### Attributes

| attribute | description | notes |
| - | - | - |
| isSideEffectRunning | a flag telling if a query is running | `boolean` |
| currentPage | the page number | `0` if there are no results. `1` for the first page. etc... |
| fieldWhiteList | the white list of fields that filters can exist for | |
| fieldBlack- [snpkg-client-elasticsearch](#snpkg-client-elasticsearch)
  - [Install](#install)
  - [Peer dependencies](#peer-dependencies)
  - [About](#about)
  - [Quick Examples](#quick-examples)
      - [Setting a range filter](#setting-a-range-filter)
      - [Access the results of a query](#access-the-results-of-a-query)
      - [Paginating through the results set](#paginating-through-the-results-set)
  - [API](#api)
    - [Manager](#manager)
      - [Initialization](#initialization)
        - [Client](#client)
        - [Filters](#filters)
        - [Options](#options)
      - [Methods](#methods)
      - [Attributes](#attributes)
    - [Range](#range)
      - [Methods](#methods-1)
      - [Attributes](#attributes-1)
  - [Example Usage](#example-usage)
    - [Set the context](#set-the-context)
    - [Use a filter in a pure component](#use-a-filter-in-a-pure-component)List | the black list of fields that filters can not exist for | |
| pageSize | the page size | The default size is 10. This can be changed by setting manager options during init. |
| queryThrottleInMS | the throttle time for queries | The default is 1000 ms. This can be changed by setting manager options during init. |
| filters | the filter instances that the manager controls |
| indexFieldNamesAndTypes | A list of fields that can be filtered over and the filter name that this field uses. This is populated by the method `getFieldNamesAndTypes`.



### Range

#### Methods 

| method | description | type |
| - | - | - |
| setFilter | sets the filter for a field | `(field: <name of range field>, filter: {lessThan?: number, greaterThan?: number, lessThanEqual?: number, greaterThanEqual?: number): void` |
| clearFilter | clears the filter for a field | `(field: <name of range field>): void` |
| setKind | sets the kind for a field | `should or must` |

#### Attributes

| attribute | description | type |
| - | - | - |
| rangeConfigs | the config for a field, keyed by field name | `{ [<names of range fields>]: { field: string; defaultFilterKind?: 'should' or 'must'; getDistribution?: boolean; getRangeBounds?: boolean; rangeInterval?: number;} }` |
| rangeFilters | the filters for a field, keyed by field name | `{ [<names of range fields>]: Filter }` |
| rangeKinds | the kind (`should or must`) for a field, keyed by field name | `{ [<names of range fields>]: 'should' or 'must' }` |
| filteredRangeBounds | the bounds of all filtered ranges (ex: 20 - 75), keyed by field name  | `{ [<names of range fields>]: { min: { value: number; value_as_string?: string; }; max: { value: number; value_as_string?: string; };} }` |
| unfilteredRangeBounds | the bounds of all unfiltered ranges (ex: 0 - 100), keyed by field name  | `{ [<names of range fields>]: { min: { value: number; value_as_string?: string; }; max: { value: number; value_as_string?: string; };} }` |
| filteredDistribution | the distribution of all filtered ranges, keyed by field name | `{[<names of range fields>]: Array<{ key: number; doc_count: number; }>}` |
| unfilteredDistribution | the distribution of all filtered ranges, keyed by field name | `{[<names of range fields>]: Array<{ key: number; doc_count: number; }>}` |


## Example Usage

### Set the context


```typescript
type RF = 'instagram_avg_like_rate' | 'invites_pending' | 'user_profile_age';
const defaultRangeConfig: RangeConfigs<RF> = {
    instagram_avg_like_rate: {
        field: 'instagram.avg_like_rate',
        defaultFilterKind: 'should',
        getDistribution: true,
        getRangeBounds: true,
        rangeInterval: 1
    },
    invites_pending: {
        field: 'invites.pending',
        defaultFilterKind: 'should',
        getDistribution: true,
        getRangeBounds: true,
        rangeInterval: 1
    },
    user_profile_age: {
        field: 'user_profile.age',
        defaultFilterKind: 'should',
        getDistribution: true,
        getRangeBounds: true,
        rangeInterval: 1
    }
};

const rangeFilter = new RangeFilterClass<RF>({rangeConfig: defaultRangeConfig});
const client = new Axios(process.env.ELASTIC_SEARCH_ENDPOINT);
const creatorCRM = new Manager<typeof rangeFilter>(client, {range: rangeFilter});

creatorCRM.runStartQuery();

export default {
    gqlClient: React.createContext(gqlClient),
    exampleForm: React.createContext(exampleFormInstance),
    creatorCRM: React.createContext(creatorCRM)
};
```

### Use a filter in a pure component

Example with incomplete code. See `dev/app/features/range_filter.tsx` for working feature.

```typescript
export default observer(({filterName, maxRange}) => {
    const {
        filters: {range}
    } = useContext(Context.creatorCRM);
    return (
        <RangeContainer>
            <ClearFilterButton onClick={() => range.clearFilter(filterName)}>
                clear filter
            </ClearFilterButton>
            <Dropdown
                options={['should', 'must']}
                onChange={option => {
                    range.setKind(
                        filterName,
                        ((option as any).value as unknown) as FilterKind
                    );
                }}
                value={filterConfig.defaultFilterKind}
                placeholder={'Select a filter kind'}
            />

            <SliderContainer>
                <Range
                    max={
                        maxRange
                            ? maxRange
                            : unfilteredBounds.max > upperValue
                            ? unfilteredBounds.max
                            : upperValue
                    }
                    min={unfilteredBounds.min < lowerValue ? unfilteredBounds.min : lowerValue}
                    value={[lowerValue, upperValue]}
                    onChange={(v: number[]) => {
                        range.setFilter(filterName, {
                            lessThen: Math.round(v[1]),
                            greaterThen: Math.round(v[0])
                        });
                    }}
                />
            </SliderContainer>
            <VictoryChart>
                <VictoryLine
                    data={unfilteredData}
                    domain={{x: [unfilteredBounds.min, maxRange ? maxRange : unfilteredBounds.max]}}
                />
                <VictoryLine
                    data={filteredData}
                    domain={{
                        x: [
                            filteredBounds.min,
                            filteredBounds.max > maxRange ? maxRange : filteredBounds.max
                        ]
                    }}
                    style={{data: {stroke: '#0000ff', strokeWidth: 4, strokeLinecap: 'round'}}}
                />
            </VictoryChart>
        </RangeContainer>
    );
});
```