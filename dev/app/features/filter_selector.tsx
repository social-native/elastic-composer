import React, {useContext, useState, ReactElement} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import Dropdown from 'react-dropdown-now';
import Context from '../context';

const FilterSelectorContainer = styled.div`
    height: 350px;
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
    defaultFilterName: string
    children(filterName: string): ReactElement;
  }
// tslint:disable-next-line
const FilterSelector: React.FunctionComponent<IProps> = observer(({children, defaultFilterName}) => {
    const creatorCRM = useContext(Context.creatorCRM);

    const [filterName, setFilterName] = useState(defaultFilterName);
    return (
        <FilterSelectorContainer>
            <DropDownFilterSelect>
                <Dropdown
                    options={creatorCRM.filters.range.fields}
                    onChange={({value}) => setFilterName(value)}
                    value={filterName}
                    placeholder={'Select a field to filter'}
                />
            </DropDownFilterSelect>
            {children(filterName)}
        </FilterSelectorContainer>
    );
});

export default FilterSelector