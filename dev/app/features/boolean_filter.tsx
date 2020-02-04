import React, {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import {VictoryChart, VictoryBar} from 'victory';
import Slider from 'rc-slider';
import Dropdown from 'react-dropdown-now';
import 'react-dropdown-now/style.css';

import 'rc-slider/assets/index.css';

import Context from '../context';
// import {
//     isLessThanEqualFilter,
//     isGreaterThanEqualFilter,
//     isGreaterThanFilter,
//     isLessThanFilter
// } from '../../../src';
import {FilterKind} from '../../../src';
// import {toJS} from 'mobx';

const RangeContainer = styled.div`
    height: 300px;
    width: 250px;
    // padding: 25px;
    // border: 1px solid rgba(0, 0, 0, 0.75);
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

// const BoundsContainer = styled.div`
//     display: flex;
//     justify-content: flex-start;
//     margin: 4px;
//     padding: 5px;
//     font-size: 12px;
//     border-radius: 3px;
// `;

// const SliderContainer = styled.div`
//     height: 40px;
//     display: flex;
//     justify-content: center;
//     align-items: center;
// `;

const createSliderWithTooltip = Slider.createSliderWithTooltip;
// const Range = createSliderWithTooltip(Slider.Range);

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

    // const filteredData = filteredDistribution
    //     ? filteredDistribution.map(d => ({x: d.key, y: d.doc_count})).filter(d => d.x && d.y)
    //     : [];
    // const unfilteredDistribution = range.unfilteredDistribution[filterName];
    // const unfilteredData = unfilteredDistribution
    //     ? unfilteredDistribution.map(d => ({x: d.key, y: d.doc_count})).filter(d => d.x && d.y)
    //     : [];
    // const unfilteredBounds = range.unfilteredRangeBounds[filterName] || {min: 0, max: 100};
    // const filteredBounds = range.filteredRangeBounds[filterName] || unfilteredBounds;

    const filter = booleanFilter.fieldFilters[filterName];

    // const lowerValue =
    //     filter && isGreaterThanEqualFilter(filter)
    //         ? filter.greaterThanEqual
    //         : filter && isGreaterThanFilter(filter)
    //         ? filter.greaterThan
    //         : unfilteredBounds.min;

    // const upperValue =
    //     filter && isLessThanEqualFilter(filter)
    //         ? filter.lessThanEqual
    //         : filter && isLessThanFilter(filter)
    //         ? filter.lessThan
    //         : unfilteredBounds.max;

    const filterConfig = booleanFilter.fieldConfigs[filterName];

    // // console.log('filteredData', filterName, filteredData);
    // // console.log('unfilteredData', filterName, unfilteredData);
    // const maxSliderRange = maxRange
    //     ? maxRange
    //     : unfilteredBounds.max > upperValue
    //     ? unfilteredBounds.max
    //     : upperValue;

    // const minSliderRange = unfilteredBounds.min < lowerValue ? unfilteredBounds.min : lowerValue;
    // console.log('Slider range', filterName, minSliderRange, maxSliderRange, [lowerValue, upperValue]);
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
            <VictoryChart>
                <VictoryBar
                    labels={({datum}) => datum.y}
                    categories={{
                        x: [
                            'true - unfiltered',
                            'false - unfiltered',
                            'true - filtered',
                            'false - filtered'
                        ]
                    }}
                    style={{
                        data: {fill: '#c43a31'}
                    }}
                    data={[
                        {x: 'true - unfiltered', y: unfilteredCount ? unfilteredCount['true'] : 0},
                        {x: 'false - unfiltered', y: unfilteredCount ? unfilteredCount['false'] : 0},
                        {x: 'true - filtered', y: filteredCount ? filteredCount['true'] : 0}
                        {x: 'false - filtered', y: filteredCount ? filteredCount['false'] : 0}

                    ]}
                />
            </VictoryChart>
        </RangeContainer>
    );
});
