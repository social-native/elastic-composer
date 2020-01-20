import React from 'react';

import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {ExampleForm} from './state';
const gqlClient = new GqlClient({enablePersistance: true, headers: {testme: 'ethan'}});
import {RangeFilterClass, Manager, RangeConfigs} from '../../src';

// gqlClient.createClient();

const exampleFormInstance = new ExampleForm();

type RF = 'instagram_avg_like_rate';
const defaultRangeConfig: RangeConfigs<RF> = {
    instagram_avg_like_rate: {
        field: 'instagram.avg_like_rate',
        defaultFilterKind: 'should',
        getDistribution: true,
        getRangeBounds: true,
        rangeInterval: 1
    }
    // age: {
    //     field: 'age',
    //     defaultFilterType: 'should',
    //     getDistribution: false,
    //     getRangeBounds: true,
    //     rangeInterval: 1
    // }
};

const rangeFilter = new RangeFilterClass<RF>({rangeConfig: defaultRangeConfig});
const creatorCRM = new Manager<typeof rangeFilter>({range: rangeFilter});

creatorCRM.runStartQuery();

// creatorCRM.range;
export default {
    gqlClient: React.createContext(gqlClient),
    exampleForm: React.createContext(exampleFormInstance),
    creatorCRM: React.createContext(creatorCRM)
};
