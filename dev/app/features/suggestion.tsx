import React, {useContext, useState, ReactElement} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import Context from '../context';
import {MultiSelectSubFieldFilterValue, MultiSelectFieldFilter} from '../../../src';

const SuggestionContainer = styled.div`
    height: 300px;
    width: 270px;
    margin: 5px;
    margin-left: 0px;
    border-radius: 3px;
`;

const Search = styled.input`
    height: 30px;
    width: 270px;
    border: 1px solid black;
    margin: 5px;
    margin-left: 10px;
`;

const SuggestionResults = styled.div`
    display: flex;
    width: 280px;
    flex-wrap: wrap;
    margin: 5px;
    height: 200px;
    overflow-y: scroll;
`;

const Result = styled.div`
    padding: 3px;
    border: 1px solid black;
    margin: 5px;
    border-radius: 3px;
    display: flex;
    justify-content: center;
    align-items: center;
`;

const ButtonContainer = styled.div`
    // width: 100px;
    height: 25px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 3px;
`;

const Button = styled.div`
    // width: 50px;
    height: 25px;
    margin: 1px;
    font-size: 10pxx;
    display: flex;
    justify-content: center;
    align-items: center;
`;

interface IProps {
    fieldName: string;
    suggestionType: 'prefix' | 'suggestion'
    children(
        suggestionsToUse: MultiSelectFieldFilter,
        removeSubFieldValueFromFilter: (value: string) => void
    ): ReactElement;
}

const Suggestion: React.FunctionComponent<IProps> = observer(({children, fieldName, suggestionType}) => {
    const [suggestionsToUse, setSuggestionToUse] = useState<MultiSelectFieldFilter>({});
    const [inclusionForSubField, setInclusionForSubField] = useState({});
    const [kindForSubField, setKindForSubField] = useState({});

    const creatorCRM = useContext(Context.creatorCRM);
    const suggester = creatorCRM.suggestions[suggestionType];

    if (!suggester) {
        return null;
    }

    const removeSubFieldValueFromFilter = (subfieldValue: string) => {
        delete suggestionsToUse[subfieldValue];
        setSuggestionToUse({...suggestionsToUse});
    };
    const search = suggester.fieldSearches[fieldName];

    return (
        <SuggestionContainer>
            <Search
                type="text"
                value={search}
                onChange={c => {
                        suggester.setSearch(fieldName, c.target.value);
                }}
            />
            <SuggestionResults>
                {(suggester.fieldSuggestions[fieldName] || []).map((n, i) => (
                    <Result key={`${n}-${i}`}>
                        {n.suggestion}
                        <ButtonContainer>
                            <Button
                                onClick={() => {
                                    const filters = {
                                        ...suggestionsToUse,
                                        [n.suggestion]: {
                                            inclusion:
                                                inclusionForSubField[n.suggestion] || 'include',
                                            kind: kindForSubField[n.suggestion]
                                        } as MultiSelectSubFieldFilterValue
                                    };
                                    setSuggestionToUse(filters);
                                }}
                            >
                                Add
                            </Button>
                        </ButtonContainer>
                        <ButtonContainer>
                            <Button
                                onClick={() =>
                                    setInclusionForSubField({
                                        ...inclusionForSubField,
                                        [n.suggestion]: 'include'
                                    })
                                }
                            >
                                Include
                            </Button>
                            <Button
                                onClick={() =>
                                    setInclusionForSubField({
                                        ...inclusionForSubField,
                                        [n.suggestion]: 'exclude'
                                    })
                                }
                            >
                                Exclude
                            </Button>
                        </ButtonContainer>
                        <ButtonContainer>
                            <Button
                                onClick={() =>
                                    setKindForSubField({
                                        ...kindForSubField,
                                        [n.suggestion]: 'must'
                                    })
                                }
                            >
                                Must
                            </Button>
                            <Button
                                onClick={() =>
                                    setKindForSubField({
                                        ...kindForSubField,
                                        [n.suggestion]: 'should'
                                    })
                                }
                            >
                                Should
                            </Button>
                        </ButtonContainer>
                    </Result>
                ))}
            </SuggestionResults>
            {children(suggestionsToUse, removeSubFieldValueFromFilter)}
        </SuggestionContainer>
    );
});

export default Suggestion;
