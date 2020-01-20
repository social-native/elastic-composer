import React from 'react';
import styled from 'styled-components';

import {ApiUri, ApiAccessToken, InstagramAvgLike} from './features';

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

export default () => (
    <Main>
        <ApiUri />
        <ApiAccessToken />
        <InstagramAvgLike />
    </Main>
);
