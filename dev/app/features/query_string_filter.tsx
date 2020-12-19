import React, {useContext} from 'react';
import Context from '../context';

export type QueryStringFilterProps = {
    filterName: string
}
const QueryStringFilter: React.FC<QueryStringFilterProps> = (props) => {
    const { filterName } = props;
    const creatorCRM = useContext(Context.creatorCRM);
    if (!filterName) {
        return null;
    }
    const {
        filters: {queryString: queryStringFilter}
    } = creatorCRM;

    return (
        <>
            <div>Query String Filter</div>
            <label htmlFor={'queryString'}>
                Query String
                <br/>
                <input name={'queryString'} id={'queryString'} />
            </label>
        </>
    );
};
export default QueryStringFilter
