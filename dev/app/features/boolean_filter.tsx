import React, {useContext} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import {VictoryChart, VictoryGroup, VictoryBar, VictoryAxis} from 'victory';
import Dropdown from 'react-dropdown-now';
import 'react-dropdown-now/style.css';

import 'rc-slider/assets/index.css';

import Context from '../context';

import {FilterKind} from '../../../src';

const RangeContainer = styled.div`
    height: 300px;
    width: 250px;
    margin: 5px;
    border-radius: 3px;
`;

const DropdownKindContainer = styled.div`
    width: 80px;
    border: 1px solid rgba(0, 0, 0, 0.25);
    margin: 5px;
    border-radius: 3px;
    font-size: 12px;
`;

const DropdownFilterContainer = styled.div`
    width: 80px;
    border: 1px solid rgba(0, 0, 0, 0.25);
    margin: 5px;
    border-radius: 3px;
    font-size: 12px;
`;

const TopMenu = styled.div`
    display: flex;
`;

const ClearFilterButton = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 3px;
    height: 32px;
    width: 80px;
    border: 1px solid rgba(0, 0, 0, 0.25);
    margin: 4px;
    font-size: 12px;
`;

const FilterContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
`;

// tslint:disable-next-line
export default observer(({filterName, maxRange}) => {
    const creatorCRM = useContext(Context.creatorCRM);
    if (!filterName) {
        return null;
    }
    const {
        filters: {boolean: booleanFilter}
    } = creatorCRM;
    const filteredCount = booleanFilter.filteredCount[filterName];
    const unfilteredCount = booleanFilter.unfilteredCount[filterName];

    const filter = booleanFilter.fieldFilters[filterName];
    const filterConfig = booleanFilter.fieldConfigs[filterName];
    const barWidth = 30

    return (
        <RangeContainer>
            <TopMenu>
                <ClearFilterButton onClick={() => booleanFilter.clearFilter(filterName)}>
                    clear filter
                </ClearFilterButton>
                {filterConfig && (
                    <DropdownKindContainer>
                        <Dropdown
                            options={['should', 'must']}
                            onChange={option => {
                                booleanFilter.setKind(
                                    filterName,
                                    ((option as any).value as unknown) as FilterKind
                                );
                            }}
                            value={filterConfig.defaultFilterKind}
                            placeholder={'Select a filter kind'}
                        />
                    </DropdownKindContainer>
                )}
            </TopMenu>
            <FilterContainer>
                <DropdownFilterContainer>
                    <Dropdown
                        options={['true', 'false']}
                        onChange={option => {
                            booleanFilter.setFilter(filterName, {
                                state: option.value === 'true' ? true : false
                            });
                        }}
                        value={filter && filter.state === true ? 'true' : 'false'}
                        placeholder={'Select a filter'}
                    />
                </DropdownFilterContainer>
            </FilterContainer>
            <VictoryChart height={150}>
                <VictoryAxis tickValues={[0, 1]} tickFormat={['true', 'false']} width={2} height={2}/>
                <VictoryGroup offset={0}>
                    <VictoryBar
                        horizontal
                        labels={({datum}) => datum.y}
                        style={{data: {fill: 'blue', width: barWidth, opacity: 0.5}}}
                        data={
                            unfilteredCount
                                ? [unfilteredCount['true'], unfilteredCount['false']]
                                : [0, 0]
                        }
                    />
                    <VictoryBar
                        horizontal
                        labels={({datum}) => datum.y}
                        style={{data: {fill: 'red', width: barWidth, opacity: 0.5}}}
                        data={
                            filteredCount ? [filteredCount['true'], filteredCount['false']] : [0, 0]
                        }
                    />
                </VictoryGroup>
            </VictoryChart>
        </RangeContainer>
    );
});
