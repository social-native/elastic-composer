import React from 'react';
import gql from 'graphql-tag';

import {GqlClient} from '@social-native/snpkg-client-graphql-client';
import {ExampleForm} from './state';
const gqlClient = new GqlClient({enablePersistance: true});
import {
    Manager,
    AxiosESClient,
    IClient,
    ESRequest,
    ESResponse,
    ESMappingType,
    FuzzySuggestion
} from '../../src';
import {toJS} from 'mobx';

const exampleFormInstance = new ExampleForm();

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

const customFuzzySuggestion = new FuzzySuggestion({
    defaultSuggestionKind: 'should',
    enabled: false,
    fieldNameModifierQuery: (fieldName: string) => fieldName,
    fieldNameModifierAggs: (fieldName: string) => `${fieldName}.keyword`
});

const client = new AxiosESClient(process.env.ELASTIC_SEARCH_ENDPOINT);
// const client = new CreatorIndexGQLClient(gqlClient);
const creatorCRM = new Manager(client, {
    pageSize: 10,
    queryThrottleInMS: 350,
    fieldBlackList: ['youtube', 'twitter', 'snapchat'],
    suggestions: {
        fuzzy: customFuzzySuggestion
    }
});

gqlClient.createClient().then(() => {
    creatorCRM.getFieldNamesAndTypes().then(() => {
        creatorCRM.runStartQuery();
    });
    // setTimeout(() => console.log('hur', toJS(creatorCRM.fieldsWithFiltersAndSuggestions)), 3000);
});

export default {
    gqlClient: React.createContext(gqlClient),
    exampleForm: React.createContext(exampleFormInstance),
    creatorCRM: React.createContext(creatorCRM)
};
