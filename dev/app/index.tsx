import React from 'react';
import styled from 'styled-components';

import {ApiUri, ApiAccessToken, RangeFilter, ResultsTable, FilterSelector} from './features';

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
        <HorizontalLayout>
            <FilterSelector defaultFilterName={'instagram_avg_like_rate'}>
                {filterName => <RangeFilter filterName={filterName} maxRange={50} />}
            </FilterSelector>
            <FilterSelector defaultFilterName={'invites_pending'}>
                {filterName => <RangeFilter filterName={filterName} maxRange={50} />}
            </FilterSelector>
            <FilterSelector defaultFilterName={'user_profile_age'}>
                {filterName => <RangeFilter filterName={filterName} maxRange={50} />}
            </FilterSelector>
        </HorizontalLayout>
        <ResultsTable />
    </Main>
);
