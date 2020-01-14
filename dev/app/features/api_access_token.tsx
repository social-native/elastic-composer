import React, {useContext} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';

import Context from '../context';

const AccessTokenInput = styled.input`
    height: 30px;
    width: 300px;
    border: 1px solid black;
    margin: 5px;
    margin-left: 10px;
`;

export default observer(() => {
    const {accessToken, setAccessToken} = useContext(Context.gqlClient);

    return (
        <AccessTokenInput
            type="text"
            value={accessToken}
            onChange={c => setAccessToken(c.target.value)}
        />
    );
});
