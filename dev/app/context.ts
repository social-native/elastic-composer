import React from 'react';

import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {ExampleForm} from './state';
const gqlClient = new GqlClient({enablePersistance: true, headers: {testme: 'ethan'}});
import {
    // RangeFilter,
    Manager,
    // IRangeConfigs,
    // PrefixSuggestion,
    AxiosESClient
    // ESRequest,
    // BooleanFilter
} from '../../src';

const exampleFormInstance = new ExampleForm();

// export type RF = 'instagram_avg_like_rate' | 'invites_pending' | 'user_profile_age';
// const rangeFieldsConfig: IRangeConfigs<RF> = {
//     instagram_avg_like_rate: {
//         field: 'instagram.avg_like_rate',
//         defaultFilterKind: 'should',
//         getDistribution: true,
//         getRangeBounds: true,
//         rangeInterval: 1
//     },
//     invites_pending: {
//         field: 'invites.pending',
//         defaultFilterKind: 'should',
//         getDistribution: true,
//         getRangeBounds: true,
//         rangeInterval: 1
//     },
//     user_profile_age: {
//         field: 'user_profile.age',
//         rangeInterval: 2
//     },
//     'best_city.population': {
//         field: 'best_city.population',
//         rangeInterval: 1000
//     }
// };

// const rangeFilter = new RangeFilter<RF>(
//     {
//         aggsEnabled: false,
//         defaultFilterKind: 'should',
//         getDistribution: true,
//         getRangeBounds: true,
//         rangeInterval: 1
//     },
//     rangeFieldsConfig
// );

// const booleanFilter = new BooleanFilter<string>({
//     aggsEnabled: true,
//     defaultFilterKind: 'should',
//     getCount: true
// });

// const mapping = new Axios(process.env.ELASTIC_SEARCH_ENDPOINT);

// export type PF = 'tags' | 'city' | 'country';

// const prefixSuggester = new PrefixSuggestion<PF>();
// mapping.mapping().then(d => console.log(d));

const client = new AxiosESClient(process.env.ELASTIC_SEARCH_ENDPOINT);
const creatorCRM = new Manager(client, {pageSize: 10, queryThrottleInMS: 350});

creatorCRM.getFieldNamesAndTypes().then(() => {
    creatorCRM.runStartQuery();
});
// setTimeout(() => {}, 3000);

// setTimeout(() => {
//     console.log('ma map', creatorCRM.fieldsToFilterType);
//     // console.log('fields found', creatorCRM.filters.range.fields);
// }, 4000);

export default {
    gqlClient: React.createContext(gqlClient),
    exampleForm: React.createContext(exampleFormInstance),
    creatorCRM: React.createContext(creatorCRM)
};
