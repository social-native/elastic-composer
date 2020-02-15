import React from 'react';

import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {ExampleForm} from './state';
const gqlClient = new GqlClient({enablePersistance: true, headers: {testme: 'ethan'}});
import {Manager, AxiosESClient} from '../../src';

const exampleFormInstance = new ExampleForm();

const client = new AxiosESClient(process.env.ELASTIC_SEARCH_ENDPOINT);
const creatorCRM = new Manager(client, {
    pageSize: 10,
    queryThrottleInMS: 350,
    fieldBlackList: ['instagram.bio']
});

creatorCRM.getFieldNamesAndTypes().then(() => {
    creatorCRM.runStartQuery();
});

export default {
    gqlClient: React.createContext(gqlClient),
    exampleForm: React.createContext(exampleFormInstance),
    creatorCRM: React.createContext(creatorCRM)
};
