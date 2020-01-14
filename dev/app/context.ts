import React from 'react';

import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {ExampleForm} from './state';
const gqlClient = new GqlClient({enablePersistance: true, headers: {testme: 'ethan'}});

gqlClient.createClient();

const exampleFormInstance = new ExampleForm();

export default {
    gqlClient: React.createContext(gqlClient),
    exampleForm: React.createContext(exampleFormInstance)
};
