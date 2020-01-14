import React, {useContext} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';

import Context from '../context';

const UriInput = styled.input`
    height: 30px;
    width: 300px;
    border: 1px solid black;
    margin: 5px;
    margin-left: 10px;
`;

export default observer(() => {
    const {uri, setUri} = useContext(Context.gqlClient);

    return <UriInput type="text" value={uri} onChange={c => setUri(c.target.value)} />;
});
