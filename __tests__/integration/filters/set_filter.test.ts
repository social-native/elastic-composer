import {setUp} from '../utils';
import waitForExpect from 'wait-for-expect';

describe('Filters', () => {
    describe('setFilter', () => {
        it('calls client search with filter that was set', async () => {
            const {manager, client} = setUp();
            await manager.getFieldNamesAndTypes();

            manager.filters.boolean.setFilter('boolean_field', {state: true});

            await waitForExpect(() => {
                expect(manager._sideEffectQueue.length).toEqual(0);
            });

            expect(client.search).toHaveBeenCalledWith({
                _source: {},
                aggs: {},
                query: {bool: {should: [{term: {boolean_field: true}}]}},
                size: 10,
                sort: ['_score', '_doc'],
                track_scores: true,
                track_total_hits: true
            });
        });

        it('adds existing filters to the search request when set', async () => {
            const {manager, client} = setUp();

            await manager.getFieldNamesAndTypes();

            manager.filters.boolean.setFilter('boolean_field', {state: true});
            manager.filters.range.setFilter('double_field', {greaterThan: 0, lessThanEqual: 10});

            await waitForExpect(() => {
                expect(manager._sideEffectQueue.length).toEqual(0);
            });

            expect(client.search).toHaveBeenCalledWith({
                query: {
                    bool: {
                        should: [
                            {term: {boolean_field: true}},
                            {range: {double_field: {gt: 0, lte: 10}}}
                        ]
                    }
                },
                aggs: {},
                _source: {},
                size: 0,
                track_scores: false,
                sort: ['_score', '_doc']
            });
        });
    });
});
