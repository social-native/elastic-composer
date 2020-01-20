import React, {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import {VictoryChart, VictoryLine} from 'victory';
import Slider from 'rc-slider';

import 'rc-slider/assets/index.css';

import Context from '../context';

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

export default observer(() => {
    const {filters: {range}} = useContext(Context.creatorCRM);
    const filteredDistribution = range.filteredDistribution['instagram_avg_like_rate']
    const data = filteredDistribution ? filteredDistribution.map(d => ({ x: d.key, y: d.doc_count})).filter(d => d.x && d.y) : []
    console.log('filtered distribution dataaaa', data)
    const [sliderValue, changeSliderValue] = useState([0, 10])
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

            <Range
                max={20}
                    min={0}
                    value={sliderValue}
                    onChange={changeSliderValue}

/>
 <VictoryChart>
                <VictoryLine
                    data={data}
                />
                </VictoryChart>
        </RangeContainer>
    )

});
