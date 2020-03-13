import {setUp} from '../../utils';

describe('Filters', () => {
    describe('Boolean Filter', () => {
        describe('setFilter', () => {
            it('calls client search with all filters', async () => {
                const {manager, client} = setUp();
                await manager.getFieldNamesAndTypes();
                manager.filters.boolean.setFilter('boolean_field', {state: true});

                expect(client.search).toHaveBeenCalledWith({
                    _source: {},
                    aggs: {},
                    query: {bool: {should: [{term: {boolean_field: true}}]}},
                    size: 10,
                    sort: ['_score', '_doc'],
                    track_scores: true
                });
            });
        });
    });
});
