import React, {useContext, useEffect} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';
import Context from '../context';
import {MultiSelectSubFieldFilterValue, MultiSelectFieldFilter} from '../../../src';

const MultiSelectContainer = styled.div`
    height: 300px;
    width: 220px;
    margin: 5px;
    margin-left: 0px;
    border-radius: 3px;
`;

const Search = styled.input`
    height: 30px;
    width: 220px;
    border: 1px solid black;
    margin: 5px;
    margin-left: 10px;
`;

const MultiSelectResults = styled.div`
    display: flex;
    width: 200px;
    flex-wrap: wrap;
    margin: 5px;
`;

const Result = styled.div`
    padding: 3px;
    border: 1px solid black;
    margin: 5px;
    border-radius: 3px;
`;

interface IProps {
    fieldName: string;
    multiSelectFieldFilters: MultiSelectFieldFilter;
    removeSubFieldValueFromFilter: (value: string)=> void;
}

const MultiSelect: React.FunctionComponent<IProps> = observer(
    ({children, fieldName, multiSelectFieldFilters, removeSubFieldValueFromFilter}) => {
        const creatorCRM = useContext(Context.creatorCRM);
        const multiselect = creatorCRM.filters.multiselect;
        useEffect(() => {
            if (Object.keys(multiSelectFieldFilters).length > 0) {
                multiselect.setFilter(fieldName, multiSelectFieldFilters);
            }
        }, [JSON.stringify(multiSelectFieldFilters)]);

        const filters = multiselect.fieldFilters[fieldName] || {};
        
        return (
            <MultiSelectContainer>
                <MultiSelectResults>
                    {Object.keys(filters).map((n, i) => {  // tslint:disable-line

                        const filteredCount = multiselect.filteredCount[fieldName] || {}
                        const unfilteredCount = multiselect.unfilteredCount[fieldName] || {}
                        const filter = multiselect.fieldFilters[fieldName][n]
                        const config = multiselect.fieldConfigs[fieldName]

                        return (
                            <Result
                                key={`${n}-${i}`}
                                onClick={() => {
                                    removeSubFieldValueFromFilter(n)
                                    multiselect.removeFromFilter(fieldName, n);
                                }}
                            >
                                {n} {filteredCount[n] || 0} of {' '}
                                {unfilteredCount[n] || 0} -- {filter.inclusion} {filter.kind || config.defaultFilterKind}
                            </Result>
                        );
                    })}
                </MultiSelectResults>
            </MultiSelectContainer>
        );
    }
);

export default MultiSelect;
