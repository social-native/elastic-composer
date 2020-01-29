import React from 'react';

import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {ExampleForm} from './state';
const gqlClient = new GqlClient({enablePersistance: true, headers: {testme: 'ethan'}});
import {RangeFilterClass, Manager, RangeConfigs, Axios, ESRequest} from '../../src';

const exampleFormInstance = new ExampleForm();

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

const rangeFilter = new RangeFilterClass<RF>(
    {
        aggsEnabled: true,
        defaultFilterKind: 'should',
        getDistribution: true,
        getRangeBounds: true,
        rangeInterval: 1
    },
    defaultRangeConfig
);

const mapping = new Axios(process.env.ELASTIC_SEARCH_ENDPOINT);
mapping.mapping().then(d => console.log(d));

const client = new Axios(process.env.ELASTIC_SEARCH_ENDPOINT);
const creatorCRM = new Manager<typeof rangeFilter>(
    client,
    {range: rangeFilter},
    {pageSize: 10, queryDebounceInMS: 350}
);

creatorCRM.runStartQuery();
creatorCRM.getFieldNamesAndTypes();

setTimeout(() => {
    console.log('fields found', creatorCRM.filters.range.fields);
}, 4000);

export default {
    gqlClient: React.createContext(gqlClient),
    exampleForm: React.createContext(exampleFormInstance),
    creatorCRM: React.createContext(creatorCRM)
};
