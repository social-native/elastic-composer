import React from 'react';
import styled from 'styled-components';

import {ApiUri, ApiAccessToken, RangeFilter} from './features';

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
`

export default () => (
    <Main>
        <ApiUri />
        <ApiAccessToken />
        <HorizontalLayout>
        <RangeFilter filterName={'instagram_avg_like_rate'} maxRange={50}/>
        <RangeFilter filterName={'invites_pending'} maxRange={20}/>
        <RangeFilter filterName={'user_profile_age'} maxRange={100}/>

        </HorizontalLayout>

    </Main>
);
