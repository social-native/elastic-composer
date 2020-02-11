import React, {useContext, useState, ReactElement} from 'react';
import {observer} from 'mobx-react';
import {toJS} from 'mobx';
import styled from 'styled-components';
import Dropdown from 'react-dropdown-now';
import Context from '../context';

const SuggestionSelectorContainer = styled.div`
    height: 400px;
    width: 250px;
    padding: 25px;
    border: 1px solid rgba(0, 0, 0, 0.75);
    margin: 5px;
    border-radius: 3px;
    box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
`;

const DropDownFilterSelect = styled.div`
    width: 200px;
    border: 1px solid rgba(0, 0, 0, 0.25);
    margin: 5px;
    border-radius: 3px;
    font-size: 12px;
`;

interface IProps {
    defaultFieldName: string;
    suggestionType: 'fuzzy';
    children(suggestionFieldName: string): ReactElement;
}
// tslint:disable-next-line
const SuggestionSelector: React.FunctionComponent<IProps> = observer(
    // tslint:disable-next-line
    ({children, suggestionType, defaultFieldName}) => {
        const creatorCRM = useContext(Context.creatorCRM);

        const [suggestionFieldName, setSuggestionFieldName] = useState(defaultFieldName);
        const suggestion = creatorCRM.suggestions[suggestionType];
        const suggestionConfig =
            creatorCRM.suggestions[suggestionType].fieldConfigs[suggestionFieldName];

        if (!suggestionConfig) {
            return null;
        }
        return (
            <SuggestionSelectorContainer>
                <DropDownFilterSelect>
                    {suggestion && (
                        <Dropdown
                            options={suggestion.fields}
                            onChange={({value}) => setSuggestionFieldName(value)}
                            value={suggestionFieldName}
                            placeholder={'Select a field to get search selections for'}
                        />
                    )}
                </DropDownFilterSelect>
                <DropDownFilterSelect>
                    {suggestion && suggestionConfig && (
                        <Dropdown
                            options={['Enabled ON', 'Enabled OFF']}
                            onChange={({value}) => {
                                if (value === 'Enabled ON') {
                                    suggestion.setEnabledToTrue(suggestionFieldName);
                                } else {
                                    suggestion.setEnabledToFalse(suggestionFieldName);
                                }
                            }}
                            value={suggestionConfig.enabled ? 'Enabled ON' : 'Enabled OFF'}
                            placeholder={'Select a field to filter'}
                        />
                    )}
                </DropDownFilterSelect>
                {children(suggestionFieldName)}
            </SuggestionSelectorContainer>
        );
    }
);

export default SuggestionSelector;
