import React, {useContext, useState, ReactElement} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import Dropdown from 'react-dropdown-now';
import Context from '../context';
import { toJS } from 'mobx';
const FilterSelectorContainer = styled.div`
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
    defaultFilterName: string;
    filterType: 'range' | 'boolean' | 'exists';
    children(filterName: string): ReactElement;
}
// tslint:disable-next-line
const FilterSelector: React.FunctionComponent<IProps> = observer(
    ({children, filterType, defaultFilterName}) => {
        const creatorCRM = useContext(Context.creatorCRM);

        const [filterName, setFilterName] = useState(defaultFilterName);
        const filter = creatorCRM.filters[filterType];
        const filterConfig = creatorCRM.filters[filterType].fieldConfigs[filterName]

        return (
            <FilterSelectorContainer>
                <DropDownFilterSelect>
                    {filter && (
                        <Dropdown
                            options={filter.fields}
                            onChange={({value}) => setFilterName(value)}
                            value={filterName}
                            placeholder={'Select a field to filter'}
                        />
                    )}
                </DropDownFilterSelect>
                <DropDownFilterSelect>
                    {filter && filterConfig && (
                        <Dropdown
                            options={['Aggs ON', 'Aggs OFF']}
                            onChange={({value}) => {
                                if (value === 'Aggs ON') {
                                    filter.setAggsEnabledToTrue(filterName);
                                } else {
                                    filter.setAggsEnabledToFalse(filterName);
                                }
                            }}
                            value={
                                filterConfig
                                    .aggsEnabled
                                    ? 'Aggs ON'
                                    : 'Aggs OFF'
                            }
                            placeholder={'Select a field to filter'}
                        />
                    )}
                </DropDownFilterSelect>
                {children(filterName)}
            </FilterSelectorContainer>
        );
    }
);

export default FilterSelector;
