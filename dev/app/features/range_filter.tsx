import React, {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import {VictoryChart, VictoryLine} from 'victory';
import Slider from 'rc-slider';
import Dropdown from 'react-dropdown-now';
import 'react-dropdown-now/style.css';

import 'rc-slider/assets/index.css';

import Context from '../context';
import {
    isLessThenEqualFilter,
    isGreaterThenEqualFilter,
    isGreaterThenFilter,
    isLessThenFilter
} from '../../../src';
import {FilterKind, Filter} from '../../../src/filters/range_filter';
import { toJS } from 'mobx';

const RangeContainer = styled.div`
    height: 300px;
    width: 250px;
    padding: 25px;
    border: 1px solid rgba(0, 0, 0, 0.75);
    margin: 5px;
    border-radius: 3px;
    box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.25);
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
    const {
        filters: {range}
    } = creatorCRM
    const filteredDistribution = range.filteredDistribution[filterName];
    const filteredData = filteredDistribution
        ? filteredDistribution.map(d => ({x: d.key, y: d.doc_count})).filter(d => d.x && d.y)
        : [];
    const unfilteredDistribution = range.unfilteredDistribution[filterName];
    const unfilteredData = unfilteredDistribution
        ? unfilteredDistribution.map(d => ({x: d.key, y: d.doc_count})).filter(d => d.x && d.y)
        : [];
    const unfilteredBounds = range.unfilteredRangeBounds[filterName] || {min: 0, max: 100};
    const filteredBounds = range.filteredRangeBounds[filterName] || unfilteredBounds;

    const filter = range.rangeFilters[filterName];

    const lowerValue =
        filter && isGreaterThenEqualFilter(filter)
            ? filter.greaterThenEqual
            : filter && isGreaterThenFilter(filter)
            ? filter.greaterThen
            : unfilteredBounds.min;

    const upperValue =
        filter && isLessThenEqualFilter(filter)
            ? filter.lessThenEqual
            : filter && isLessThenFilter(filter)
            ? filter.lessThen
            : unfilteredBounds.max;

    const filterConfig = range.rangeConfigs[filterName];

    return (
        <RangeContainer>
            <TopMenu>
                <ClearFilterButton onClick={() => range.clearFilter(filterName)}>
                    clear filter
                </ClearFilterButton>
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
            </TopMenu>
            <AllBoundsContainer>
                <BoundsContainer>
                    Filtered: {lowerValue} ↔️ {upperValue}
                </BoundsContainer>
                <BoundsContainer>
                    Unfiltered: {Math.round(unfilteredBounds.min)} ↔️ {Math.round(unfilteredBounds.max)}
                </BoundsContainer>
            </AllBoundsContainer>

            <SliderContainer>
                <Range
                    max={
                        maxRange
                            ? maxRange
                            : unfilteredBounds.max > upperValue
                            ? unfilteredBounds.max
                            : upperValue
                    }
                    min={unfilteredBounds.min < lowerValue ? unfilteredBounds.min : lowerValue}
                    value={[lowerValue, upperValue]}
                    onChange={(v: number[]) => {
                        range.setFilter(filterName, {
                            lessThen: Math.round(v[1]),
                            greaterThen: Math.round(v[0])
                        });
                    }}
                />
            </SliderContainer>
            <VictoryChart>
                <VictoryLine
                    data={unfilteredData}
                    domain={{x: [unfilteredBounds.min, maxRange ? maxRange : unfilteredBounds.max]}}
                />
                <VictoryLine
                    data={filteredData}
                    domain={{
                        x: [
                            filteredBounds.min,
                            filteredBounds.max > maxRange ? maxRange : filteredBounds.max
                        ]
                    }}
                    style={{data: {stroke: '#0000ff', strokeWidth: 4, strokeLinecap: 'round'}}}
                />
            </VictoryChart>
        </RangeContainer>
    );
});
