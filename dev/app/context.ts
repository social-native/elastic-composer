import React from 'react';
import gql from 'graphql-tag';

// import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {ExampleForm} from './state';
// const gqlClient = new GqlClient({enablePersistance: true});
import {
    Manager,
    AxiosESClient,
    IClient,
    ESRequest,
    ESResponse,
    ESMappingType,
    PrefixSuggestion,
    RangeFilter,
    History,
    localStorageHistoryPersister
} from '../../src';
import {IRangeConfig} from '../../src/filters/range_filter';
// import {toJS} from 'mobx';

const exampleFormInstance = new ExampleForm();

// class CreatorIndexGQLClient<Source extends object = object> implements IClient {
//     public graphqlClient: GqlClient;

//     constructor(graphqlClient: GqlClient) {
//         if (graphqlClient === undefined) {
//             throw new Error(
//                 'GraphqlQL client is undefined. Please instantiate this class with a GqlClient instance'
//             );
//         }
//         this.graphqlClient = graphqlClient;
//     }

//     public search = async (search: ESRequest): Promise<ESResponse<Source>> => {
//         const {data} = await this.graphqlClient.client.query({
//             query: gql`
//                 query CreatorCRMSearch($search: JSON) {
//                     creatorCRMSearch(search: $search)
//                 }
//             `,
//             fetchPolicy: 'no-cache',
//             variables: {search: JSON.stringify(search)}
//         });
//         return JSON.parse(data.creatorCRMSearch);
//     };

//     public mapping = async (): Promise<Record<string, ESMappingType>> => {
//         const {data} = (await this.graphqlClient.client.query({
//             query: gql`
//                 query CreatorCRMFields {
//                     creatorCRMFields
//                 }
//             `,
//             fetchPolicy: 'no-cache'
//         })) as any;
//         return JSON.parse(data.creatorCRMFields);
//     };
// }

const customPrefixSuggestion = new PrefixSuggestion({
    defaultSuggestionKind: 'should',
    enabled: false,
    fieldNameModifierQuery: (fieldName: string) => fieldName,
    fieldNameModifierAggs: (fieldName: string) => `${fieldName}.keyword`
});

const defaultRangeFilterConfig: IRangeConfig = {
    field: '',
    aggsEnabled: false,
    defaultFilterKind: 'should',
    getDistribution: true,
    getRangeBounds: true,
    rangeInterval: 100
};
// explicitly set the config for certain fields
const customRangeFilterConfig = {
    'user.age': {
        field: 'user.age',
        rangeInterval: 10
    },
    'user_profile.age': {
        field: 'user_profile.age',
        rangeInterval: 1
    }
};

const customRangeFilter = new RangeFilter(defaultRangeFilterConfig as any, customRangeFilterConfig);

const client = new AxiosESClient(process.env.ELASTIC_SEARCH_ENDPOINT);
// const client = new CreatorIndexGQLClient(gqlClient);
const creatorCRM = new Manager(client, {
    pageSize: 100,
    queryThrottleInMS: 350,
    // fieldWhiteList: ['user.age', 'user_profile.age'],
    fieldBlackList: ['youtube', 'twitter', 'snapchat'],
    filters: {
        range: customRangeFilter
    },
    suggestions: {
        prefix: customPrefixSuggestion
    }
});

// gqlClient.createClient().then(() => {
creatorCRM.getFieldNamesAndTypes().then(() => {
    creatorCRM.runStartQuery();
});
// setTimeout(() => console.log('hur', toJS(creatorCRM.fieldsWithFiltersAndSuggestions)), 3000);
// });

// setTimeout(() => {
//     creatorCRM.filters.multiselect.setAggsEnabledToTrue('tags');
//     creatorCRM.filters.multiselect.setFilter('tags', {
//         allow_boost: {inclusion: 'include', kind: undefined},
//         auto: {inclusion: 'include', kind: undefined}
//     });
// }, 10000);

// setTimeout(() => {
//     creatorCRM.filters.multiselect.removeFromFilter('tags', 'allow_boost');
// }, 20000);
const creatorCRMHistory = new History(creatorCRM, 'influencer_crm', {
    historyPersister: localStorageHistoryPersister('influencer_crm'),
    historySize: 4
});

// setTimeout(() => {
//     creatorCRMHistory.setCurrentState(
//         JSON.parse(
//             '{"filters":{"multiselect":{"fieldKinds":{"tags":"should"},"fieldFilters":{"tags":{"carolsdaugther":{"inclusion":"include"}}}},"exists":{"fieldKinds":{"instagram.id":"must"},"fieldFilters":{"instagram.id":{"exists":true}}},"range":{"fieldKinds":{"user_profile.age":"must"},"fieldFilters":{"user_profile.age":{"lessThan":68,"greaterThan":35}}}},"suggestions":{"prefix":{"fieldKinds":{"tags":"should"},"fieldSearches":{"tags":"car"}}}}'
//         )
//     );
// }, 5000);
// console.log(history);

export default {
    // gqlClient: React.createContext(gqlClient),
    exampleForm: React.createContext(exampleFormInstance),
    creatorCRM: React.createContext(creatorCRM),
    creatorCRMHistory: React.createContext(creatorCRMHistory)
};
