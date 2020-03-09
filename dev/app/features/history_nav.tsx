import React, {useContext} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';

import Context from '../context';

const Container = styled.div`
    width: 300px;
    display: flex;
    justify-content: center;
`;

const Button = styled.div`
    height: 30px;
    width: 100px;
    border: 1px solid black;
    margin: 5px;
    margin-left: 10px;
`;

export default observer(() => {
    const creatorCRMHistory = useContext(Context.creatorCRMHistory);

    return (
        <Container>
            <Button onClick={() => creatorCRMHistory.back()}>Backward</Button>
            {creatorCRMHistory.currentLocationInHistoryCursor}
            <Button onClick={() => creatorCRMHistory.forward()}>Forward</Button>
        </Container>
    );
});
