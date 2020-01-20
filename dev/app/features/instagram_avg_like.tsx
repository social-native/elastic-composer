import React, {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import {VictoryChart, VictoryLine} from 'victory';
import Slider from 'rc-slider';

import 'rc-slider/assets/index.css';

import Context from '../context';
import { isLessThenEqualFilter, isGreaterThenEqualFilter, isGreaterThenFilter, isLessThenFilter } from '../../../src';

const RangeContainer = styled.div`
    height: 600px;
    width: 300px;
    border: 1px solid black;
    margin: 5px;
`
const RangeChangeButton = styled.div`
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
export default observer(() => {
    const {filters: {range}} = useContext(Context.creatorCRM);
    const filteredDistribution = range.filteredDistribution['instagram_avg_like_rate']
    const data = filteredDistribution ? filteredDistribution.map(d => ({ x: d.key, y: d.doc_count})).filter(d => d.x && d.y) : []
    console.log('filtered distribution dataaaa', data)
    const [sliderValue, changeSliderValue] = useState([0, 10])
    const bounds = range.unfilteredRangeBounds['instagram_avg_like_rate'] || {min: 0, max: 20}
    const filter = range.rangeFilters['instagram_avg_like_rate']
    console.log('$$$$$$', bounds)
    const lowerValue = filter && isGreaterThenEqualFilter(filter) ? filter.greaterThenEqual : filter && isGreaterThenFilter(filter) ? filter.greaterThen : 0
    const upperValue = filter && isLessThenEqualFilter(filter) ? filter.lessThenEqual : filter && isLessThenFilter(filter) ? filter.lessThen : 100

    return (
        <RangeContainer>
            <RangeChangeButton 
                onClick={() => range.setFilter('instagram_avg_like_rate', {lessThen: 50, greaterThen: 2})} 
            />
            <RangeChangeButton 
                onClick={() => range.setFilter('instagram_avg_like_rate', {lessThen: 10, greaterThen: 2})} 
            />
            <KindContainer>
                {range.rangeKinds['instagram_avg_like_rate']}
            </KindContainer>
            {lowerValue} ↔️ {upperValue}
            <div />
            {Math.round(bounds.min)} ↔️ {Math.round(bounds.max)}
            <Range
                    max={bounds.max > upperValue ? bounds.max : upperValue}
                    min={bounds.min < lowerValue ? bounds.min : lowerValue}
                    value={[lowerValue, upperValue]}
                    onChange={(v: number[]) => {
                        console.log('#########',v)
                        if (typeof v[0] === 'number' && typeof v[1] === 'number' && v[0] < v[1]) {
                            range.setFilter('instagram_avg_like_rate', {lessThen: Math.round(v[1]), greaterThen: Math.round(v[0])})
                        }
                    }}

/>
 <VictoryChart>
                <VictoryLine
                    data={data}
                />
                </VictoryChart>
        </RangeContainer>
    )

});
