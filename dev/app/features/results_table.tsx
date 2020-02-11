import React, {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';

import Context from '../context';

import {
    Grid,
    DragDropProvider,
    Table,
    TableHeaderRow,
    TableColumnReordering
} from '@devexpress/dx-react-grid-material-ui';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid black;
    margin: 20px;
    border-radius: 3px;
    box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.25);
`;

const Header = styled.div`
    height: 50px;
    display: flex;
    justify-content center;
    align-items: center;
    margin: 5px;
    max-width: 500px;
`;

const Paginate = styled.div`
    height: 30px;
    width: 100px;
    border: 1px solid black;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    margin: 3px;
`;

const flattenSourceResult = (source: object, parentFieldName: string | undefined = undefined) => {
    const sourceFields = Object.keys(source);
    // tslint:disable-next-line
    return sourceFields.reduce((acc, sourceField) => {
        const sourceFieldResult = source[sourceField];

        const name = parentFieldName ? `${parentFieldName}.${sourceField}` : sourceField;
        if (!sourceFieldResult) {
            return acc;
        }
        if (!Array.isArray(sourceFieldResult) && typeof sourceFieldResult === 'object') {
            const flattened = flattenSourceResult(sourceFieldResult, name);
            return {...acc, ...flattened};
        } else {
            return {...acc, [name]: sourceFieldResult};
        }
    }, {});
};

export default observer(() => {
    const creatorCRM = useContext(Context.creatorCRM);

    const fields = Object.keys(creatorCRM.fieldsToFilterType).filter(
        f =>
            !f.startsWith('snapchat') &&
            !f.startsWith('post') &&
            !f.startsWith('invites') &&
            !f.startsWith('twitter') &&
            !f.startsWith('insta') &&
            !f.startsWith('youtube')
    );
    const columns = fields.map(name => ({name, title: name}));

    const [tableColumnExtensions] = useState([{columnName: 'gender', width: 100}]);

    const results = (creatorCRM.results || []).map(r => ({
        score: r._score,
        source: flattenSourceResult(r._source)
    }));
    return (
        <Container>
            <Header>
                <Paginate onClick={creatorCRM.prevPage}>Previous</Paginate>
                <Paginate onClick={creatorCRM.nextPage}>Next</Paginate>
            </Header>
            <Grid
                rows={results || []}
                columns={columns}
                getCellValue={(a, v) => {
                    return v === 'score' ? a._score : a.source[v] || '';
                }}
            >
                <DragDropProvider />
                <Table columnExtensions={tableColumnExtensions} />
                <TableColumnReordering
                // defaultOrder={ ["avg_comments_per_post", "avg_comment_rate", "avg_likes_per_post", "avg_like_rate", "avg_engagements_per_post", "avg_engagement_rate", "follows", "followed_by", "publisher_rank", "reference_payout", "total_posts", "comment_engagement_percentage", "id", "bio", "social_id", "age_range", "publisher_type", "min_compensation", "tags", "super_caption", "likelihood_to_post", "engagement_score", "social_handle"]}
                />
                <TableHeaderRow />
            </Grid>
        </Container>
    );
});
