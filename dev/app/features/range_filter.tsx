import React, {useContext, useState, useEffect} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import {VictoryChart, VictoryLine} from 'victory';
import Slider from 'rc-slider';
import Dropdown from 'react-dropdown-now';
import 'react-dropdown-now/style.css';

import 'rc-slider/assets/index.css';

import Context from '../context';
import {FilterKind, filterTypeGuards} from '../../../src/';
import {toJS} from 'mobx';

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

const AllBoundsContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
`;

const BoundsContainer = styled.div`
    display: flex;
    justify-content: flex-start;
    margin: 4px;
    padding: 5px;
    font-size: 12px;
    border-radius: 3px;
`;

const SliderContainer = styled.div`
    height: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
`;

const createSliderWithTooltip = Slider.createSliderWithTooltip;
const Range = createSliderWithTooltip(Slider.Range);

// tslint:disable-next-line
export default observer(({filterName, maxRange}) => {
    const creatorCRM = useContext(Context.creatorCRM);

    console.log('activeFilters', toJS(creatorCRM.activeFilters))
    console.log('activeSuggestions', toJS(creatorCRM.activeSuggestions))
    // useEffect(() => {

    //     setInterval(() => {
    
    //         creatorCRM.clearAllFilters()
    //         creatorCRM.clearAllSuggestions()
    //     }, 10000)
    // },[])
    // console.log('total available',creatorCRM.rawESResponse ? toJS(creatorCRM.rawESResponse.hits.total) : 0)
    // console.log('has next page', creatorCRM.hasNextPage)

    if (!filterName) {
        return null;
    }
    const {
        filters: {range}
    } = creatorCRM;
    const filteredDistribution = range.filteredDistribution[filterName];
    const filteredData = filteredDistribution
        ? filteredDistribution.map(d => ({x: d.key, y: d.doc_count})).filter(d => d.x && d.y)
        : [];
    const unfilteredDistribution = range.unfilteredDistribution[filterName];
    const unfilteredData = unfilteredDistribution
        ? unfilteredDistribution.map(d => ({x: d.key, y: d.doc_count})).filter(d => d.x && d.y)
        : [];
    const unfilteredBounds = range.unfilteredRangeBounds[filterName] || {
        min: 0,
        max: 100,
    };
    const filteredBounds = range.filteredRangeBounds[filterName] || unfilteredBounds;

    const filter = range.fieldFilters[filterName];

    const lowerValue =
        filter && filterTypeGuards.isGreaterThanEqualFilter(filter)
            ? filter.greaterThanEqual
            : filter && filterTypeGuards.isGreaterThanFilter(filter)
            ? filter.greaterThan
            : unfilteredBounds.min || 0;

    const upperValue =
        filter && filterTypeGuards.isLessThanEqualFilter(filter)
            ? filter.lessThanEqual
            : filter && filterTypeGuards.isLessThanFilter(filter)
            ? filter.lessThan
            : unfilteredBounds.max || 100;

    const filterConfig = range.fieldConfigs[filterName];

    const unfilteredBoundsMinValue = unfilteredBounds.min;
    const unfilteredBoundsMaxValue = unfilteredBounds.max;
    const filteredBoundsMinValue = filteredBounds.min;
    const filteredBoundsMaxValue = filteredBounds.max;

    const maxSliderRange = maxRange
        ? maxRange
        : unfilteredBoundsMaxValue > upperValue
        ? unfilteredBoundsMaxValue
        : upperValue;

    const minSliderRange =
        unfilteredBounds.min < lowerValue ? unfilteredBounds.min : lowerValue;

    const unfilteredRangeDomain = [
        unfilteredBoundsMinValue,
        unfilteredBoundsMaxValue > maxRange ? maxRange : unfilteredBoundsMaxValue
    ];
    const filteredRangeDomain = [
        filteredBoundsMinValue,
        filteredBoundsMaxValue > maxRange ? maxRange : filteredBoundsMaxValue
    ];

    return (
        <RangeContainer>
            <TopMenu>
                <ClearFilterButton onClick={() => range.clearFilter(filterName)}>
                    clear filter
                </ClearFilterButton>
                {filterConfig && (
                    <DropdownKindContainer>
                        <Dropdown
                            options={['should', 'must']}
                            onChange={option => {
                                range.setKind(
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
            <AllBoundsContainer>
                <BoundsContainer>
                    Filtered: {lowerValue} ↔️ {upperValue}
                </BoundsContainer>
                <BoundsContainer>
                    Unfiltered: {Math.round(unfilteredBoundsMinValue)} ↔️{' '}
                    {Math.round(unfilteredBoundsMaxValue)}
                </BoundsContainer>
            </AllBoundsContainer>

            <SliderContainer>
                <Range
                    defaultValue={[minSliderRange, maxSliderRange]}
                    value={[lowerValue, upperValue]}
                    onChange={(v: number[]) => {
                        if (v[0] === minSliderRange && v[1] === maxSliderRange) {
                            return;
                        }
                        range.setFilter(filterName, {
                            lessThan: Math.round(v[1]),
                            greaterThan: Math.round(v[0])
                        });
                    }}
                />
            </SliderContainer>
            <VictoryChart>
                <VictoryLine
                    data={unfilteredData}
                    domain={{
                        x: unfilteredRangeDomain
                    }}
                />
                <VictoryLine
                    data={filteredData}
                    domain={{
                        x: filteredRangeDomain
                    }}
                    style={{data: {stroke: '#0000ff', strokeWidth: 4, strokeLinecap: 'round'}}}
                />
            </VictoryChart>
        </RangeContainer>
    );
});
