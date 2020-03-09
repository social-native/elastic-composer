import React from 'react';
import styled from 'styled-components';

import {
    ApiUri,
    ApiAccessToken,
    RangeFilter,
    ResultsTable,
    FilterSelector,
    BooleanFilter,
    CustomQuery,
    SuggestionSelector,
    Suggestion,
    ExistsFilter,
    MultiSelectFilter,
    HistoryNav
} from './features';

const Main = styled.div`
    height: 100vh;
    width: 100vw;
    background-color: white;
    display: flex;
    justify-content: top;
    align-items: center;
    flex-direction: column;
    font-size: 14px;
    font-family: 'Roboto';
`;

const HorizontalLayout = styled.div`
    display: flex;
`;

export default () => (
    <Main>
        <ApiUri />
        <ApiAccessToken />
        <HistoryNav />
        <CustomQuery />
        <HorizontalLayout>
            <SuggestionSelector suggestionType={'prefix'} defaultFieldName={'tags'}>
                {fieldName => (
                    <Suggestion fieldName={fieldName} suggestionType={'prefix'}>
                        {(multiSelectFieldFilters, removeSubFieldValueFromFilter) => (
                            <MultiSelectFilter
                                fieldName={fieldName}
                                removeSubFieldValueFromFilter={removeSubFieldValueFromFilter}
                                multiSelectFieldFilters={multiSelectFieldFilters}
                            />
                        )}
                    </Suggestion>
                )}
            </SuggestionSelector>
            {/* <FilterSelector filterType={'range'} defaultFilterName={'instagram.total_posts'}>
                {filterName => <RangeFilter filterName={filterName} maxRange={50} />}
            </FilterSelector> */}
            <FilterSelector filterType={'exists'} defaultFilterName={'tags'}>
                {filterName => <ExistsFilter filterName={filterName} maxRange={100} />}
            </FilterSelector>
            <FilterSelector filterType={'range'} defaultFilterName={'user_profile.age'}>
                {filterName => <RangeFilter filterName={filterName} maxRange={100} />}
            </FilterSelector>
            {/* <FilterSelector filterType={'boolean'} defaultFilterName={'instagram.is_business'}>
                {filterName => <BooleanFilter filterName={filterName}/>}
            </FilterSelector> */}
        </HorizontalLayout>
        <ResultsTable />
    </Main>
);
