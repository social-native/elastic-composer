import React, {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';

import Context from '../context';

const CustomQueryContainer = styled.div`
    height: 300px;
    width: 250px;
    margin: 5px;
    border-radius: 3px;
`;
const FieldList = styled.input`
    height: 30px;
    width: 300px;
    border: 1px solid black;
    margin: 5px;
    margin-left: 10px;
`;

const PageSize = styled.input`
    height: 30px;
    width: 300px;
    border: 1px solid black;
    margin: 5px;
    margin-left: 10px;
`;

const SubmitCustomQuery = styled.div`
    height: 50px;
    width: 100px;
    border: 1px solid black;
`;

export default () => {
    const creatorCRM = useContext(Context.creatorCRM);

    const [whiteList, setWhiteList] = useState([]);
    const [blackList, setBlackList] = useState([]);
    const [pageSize, setPageSize] = useState(10);

    return (
        <CustomQueryContainer>
            <FieldList
                type="text"
                value={whiteList.join(' ')}
                onChange={c => {
                    const rawVal = c.target.value.split(' ');
                    rawVal[0] === '' ? setWhiteList([]) : setWhiteList(rawVal);
                }}
            />

            <FieldList
                type="text"
                value={blackList.join(' ')}
                onChange={c => {
                    const rawVal = c.target.value.split(' ');
                    rawVal[0] === '' ? setBlackList([]) : setBlackList(rawVal);
                }}
            />
            <PageSize
                type="text"
                value={pageSize.toString()}
                onChange={c => setPageSize(+c.target.value)}
            />
            <SubmitCustomQuery
                onClick={() => {
                    creatorCRM.runCustomFilterQuery({
                        fieldWhiteList: whiteList,
                        fieldBlackList: blackList,
                        pageSize
                    });
                }}
            />
        </CustomQueryContainer>
    );
};
