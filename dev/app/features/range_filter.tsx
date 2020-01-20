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

const RangeContainer = styled.div`
    height: 600px;
    width: 300px;
    border: 1px solid black;
    margin: 5px;
`;
const RangeChangeButton = styled.div`
    height: 30px;
    width: 100px;
    border: 1px solid black;
    margin: 5px;
`;

const ClearFilterButton = styled.div`
    height: 30px;
    width: 100px;
    border: 1px solid black;
    margin: 5px;
`;

const KindContainer = styled.div`
    height: 30px;
    width: 100px;
    border: 1px solid black;
    margin: 5px;
`;

const createSliderWithTooltip = Slider.createSliderWithTooltip;
const Range = createSliderWithTooltip(Slider.Range);

// tslint:disable-next-line
export default observer(({filterName, maxRange}) => {
    const {
        filters: {range}
    } = useContext(Context.creatorCRM);
    const filteredDistribution = range.filteredDistribution[filterName];
    const filteredData = filteredDistribution
        ? filteredDistribution.map(d => ({x: d.key, y: d.doc_count})).filter(d => d.x && d.y)
        : [];
    const unfilteredDistribution = range.unfilteredDistribution[filterName];
    const unfilteredData = unfilteredDistribution
        ? unfilteredDistribution.map(d => ({x: d.key, y: d.doc_count})).filter(d => d.x && d.y)
        : [];
    const bounds = range.unfilteredRangeBounds[filterName] || {min: 0, max: 20};
    const filter = range.rangeFilters[filterName];
    const lowerValue =
        filter && isGreaterThenEqualFilter(filter)
            ? filter.greaterThenEqual
            : filter && isGreaterThenFilter(filter)
            ? filter.greaterThen
            : 0;
    const upperValue =
        filter && isLessThenEqualFilter(filter)
            ? filter.lessThenEqual
            : filter && isLessThenFilter(filter)
            ? filter.lessThen
            : 100;

    const filterConfig = range.rangeConfigs[filterName];

    return (
        <RangeContainer>
            <RangeChangeButton
                onClick={() =>
                    range.setFilter(filterName, {lessThen: 50, greaterThen: 2})
                }
            />
            <RangeChangeButton
                onClick={() =>
                    range.setFilter(filterName, {lessThen: 10, greaterThen: 2})
                }
            />
            <ClearFilterButton onClick={() => range.clearFilter(filterName)}>
                clear filter
            </ClearFilterButton>
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
            <KindContainer>{range.rangeKinds[filterName]}</KindContainer>
            {lowerValue} ↔️ {upperValue}
            <div />
            {Math.round(bounds.min)} ↔️ {Math.round(bounds.max)}
            <Range
                max={maxRange ? maxRange : bounds.max > upperValue ? bounds.max : upperValue}
                min={bounds.min < lowerValue ? bounds.min : lowerValue}
                value={[lowerValue, upperValue]}
                onChange={(v: number[]) => {
                    range.setFilter(filterName, {
                        lessThen: Math.round(v[1]),
                        greaterThen: Math.round(v[0])
                    });
                }}
            />
            <VictoryChart>
                <VictoryLine
                    data={unfilteredData}
                    domain={{x: [bounds.min, maxRange ? maxRange : bounds.max]}}
                />
                <VictoryLine
                    data={filteredData}
                    domain={{x: [bounds.min, maxRange ? maxRange : bounds.max]}}
                    style={{data: {stroke: '#0000ff', strokeWidth: 4, strokeLinecap: 'round'}}}
                />
            </VictoryChart>
        </RangeContainer>
    );
});
