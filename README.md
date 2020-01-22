# snpkg-client-elasticsearch



- [snpkg-client-elasticsearch](#snpkg-client-elasticsearch)
  - [Install](#install)
  - [About](#about)
  - [API](#api)
    - [Range](#range)
      - [Methods](#methods)
      - [Attributes](#attributes)
  - [Example Usage](#example-usage)
    - [Set the context](#set-the-context)
    - [Use a filter in a pure component](#use-a-filter-in-a-pure-component)

## Install

```
npm install --save @social-native/snpkg-client-elasticsearch
```

## About

This package aids in querying an Elasticsearch index. You define `filters` for each field in the index that you want to query, and the specific filter API allows you to generate an valid query across many fields.

The currently available filters are:

- `range`: Filter records by specifying a LT (<), LTE(<=), GT(>), GTE(>=) range

## API

### Range

#### Methods 
| method | description | type |
| - | - | - |
| setFilter | sets the filter for a field | `(field: RangeFields, filter: Filter): void` |
| clearFilter | clears the filter for a field | `(field: RangeFields): void` |
| setKind | sets the kind for a field | `should | must` |

#### Attributes

| attribute | description | type |
| - | - | - |
| rangeConfigs | the config for a field, keyed by field name | `RangeConfigs<RangeFields>` |
| rangeFilters | the filters for a field, keyed by field name | `RangeFilterKinds<RangeFields>` |
| rangeKinds | the kind (`should | must`) for a field, keyed by field name | `RangeFilterKinds<RangeFields>` |
| filteredRangeBounds | the bounds of all filtered ranges (ex: 20 - 75), keyed by field name  | `RangeBoundResults<RangeFields>` |
| unfilteredRangeBounds | the bounds of all unfiltered ranges (ex: 0 - 100), keyed by field name  | `RangeBoundResults<RangeFields>` |
| filteredDistribution | the distribution of all filtered ranges, keyed by field name | `RangeDistributionResults<RangeFields>` |
| unfilteredDistribution | the distribution of all filtered ranges, keyed by field name | `RangeDistributionResults<RangeFields>` |


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