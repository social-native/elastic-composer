import React, {useContext, useState} from 'react';
import Context from '../context';

export type QueryStringFilterProps = {
    field: string
}

// tslint:disable-next-line:variable-name
const QueryStringFilter: React.FC<QueryStringFilterProps> = (props) => {
    const { field } = props;
    const creatorCRM = useContext(Context.creatorCRM);
    const [queryStringInput, setQueryStringInput] = useState<string>('');

    const {
        filters: {queryString: queryStringFilter}
    } = creatorCRM;

    return (
        <div style={{display: 'flex', flexDirection: 'column'}}>
            <div>Query String Filter for {field}</div>
            <br/>
            <label htmlFor={'queryString'}>
                Query String
                <br/>
                <input
                    name={'queryString'}
                    id={'queryString'}
                    value={queryStringInput}
                    onChange={({ target: { value } }) => setQueryStringInput(value)}
                />
            </label>
            <br/>
            <button onClick={() => queryStringFilter.setFilter(field, { query: queryStringInput, inclusion: 'must' })}>Apply</button>
        </div>
    );
};
export default QueryStringFilter
