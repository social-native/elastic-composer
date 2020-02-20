import React, {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import Context from '../context';
import {toJS} from 'mobx';
import {Table, Thead, Tbody, Tr, Th, Td} from 'react-super-responsive-table';
import 'react-super-responsive-table/dist/SuperResponsiveTableStyle.css';


const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid black;
    margin: 20px;
    border-radius: 3px;
    box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.25);
`;

const Header = styled.div`
    height: 50px;
    display: flex;
    justify-content center;
    align-items: center;
    margin: 5px;
    max-width: 500px;
`;

const Paginate = styled.div`
    height: 30px;
    width: 100px;
    border: 1px solid black;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    margin: 3px;
`;

const flattenSourceResult = (source: object, parentFieldName: string | undefined = undefined) => {
    const sourceFields = Object.keys(source);
    // tslint:disable-next-line
    return sourceFields.reduce((acc, sourceField) => {
        const sourceFieldResult = source[sourceField];

        const name = parentFieldName ? `${parentFieldName}.${sourceField}` : sourceField;
        if (!sourceFieldResult) {
            return acc;
        }
        if (!Array.isArray(sourceFieldResult) && typeof sourceFieldResult === 'object') {
            const flattened = flattenSourceResult(sourceFieldResult, name);
            return {...acc, ...flattened};
        } else {
            return {...acc, [name]: sourceFieldResult};
        }
    }, {});
};

export default observer(() => {
    const creatorCRM = useContext(Context.creatorCRM);

    const fields = Object.keys(creatorCRM.fieldsWithFiltersAndSuggestions);
 
    const results = (creatorCRM.results || []).map((r, i) =>
        toJS({
            key: i,
            id: r._id,
            ...flattenSourceResult(r._source)
        })
    );
    const columns = fields.map(title => ({name: title, key: title, width: 100, dataIndex: title}));

    if (columns.length === 0 || results.length === 0) {
        return null;
    }
    const Headers = fields.map((columnName, i) => {
        return <Th key={i}>{columnName}</Th>;
    });

    const getData = (rowData, columnName) => {
        const data = rowData[columnName]
        if (Array.isArray(data)) {
           const le = data.join(' ')
           return le.length > 100 ? 'uh oh' : le
        }
        if (typeof data === 'object' || data === undefined) {
            return ''
        } 
        return data.length > 100 ? 'uh oh' : data

    }

    const data = results.map((result, i) => fields.map((columnName, ii) => getData(result,columnName)))

    const Rows = results.map((result, i) => {
        return (
            <Tr key={`row-${i}`}>
                {fields.map((columnName, ii) => {
                    return <Td key={`row-${i}-header-${ii}`}>{getData(result,columnName)}</Td>;
                })}
            </Tr>
        );
    });
    return (
        <Container>
            <Header>
                <Paginate onClick={creatorCRM.prevPage}>Previous</Paginate>
                <Paginate onClick={creatorCRM.nextPage}>Next</Paginate>
            </Header>
            <Table>
                <Thead>
                    <Tr>{Headers}</Tr>
                </Thead>
            <Tbody>{Rows}</Tbody>
            </Table>
        </Container>
    );
});
