import React, {useContext} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import Context, {PF} from '../context';

const SuggestionContainer = styled.div`
    height: 300px;
    width: 220px;
    margin: 5px;
    margin-left: 0px;
    border-radius: 3px;
`;

const Search = styled.input`
    height: 30px;
    width: 220px;
    border: 1px solid black;
    margin: 5px;
    margin-left: 10px;
`;

const SuggestionResults = styled.div`
    display: flex;
    width: 200px;
    flex-wrap: wrap;
    margin: 5px;
`;

const Result = styled.div`
    padding: 3px;
    border: 1px solid black;
    margin: 5px;
    border-radius: 3px;
`;
export default observer(({fieldName}) => {
    const creatorCRM = useContext(Context.creatorCRM);
    const suggester = creatorCRM.suggestions.prefix;

    if (!suggester) {
        return null;
    }

    const search = suggester.fieldSearches[fieldName as PF];

    return (
        <SuggestionContainer>
            <Search
                type="text"
                value={search}
                onChange={c => suggester.setSearch(fieldName, c.target.value)}
            />
            <SuggestionResults>
                {(suggester.fieldSuggestions[fieldName as PF] || []).map((n, i) => (
                    <Result key={`${n}-${i}`}>{n.suggestion}</Result>
                ))}
            </SuggestionResults>
        </SuggestionContainer>
    );
});
