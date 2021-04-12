import {setUp} from '../utils';
import waitForExpect from 'wait-for-expect';
import {HistoryLocation} from '../../../src';

describe('Manager', () => {
    describe('setUserState', () => {
        const {manager, client} = setUp();
        it('calls client search with filter that was set', async () => {
            // Arrange
            await manager.getFieldNamesAndTypes();
            const fakeField = 'boolean_field';
            const userState: HistoryLocation = {
                filters: {
                    exists: {
                        fieldKinds: {[fakeField]: 'should'},
                        fieldFilters: {[fakeField]: {exists: true}}
                    }
                }
            };

            // Act
            manager.setUserState(userState);

            // Assert
            // Expect that setting the state results in a query that matches the state that
            // was just set
            await waitForExpect(() => {
                expect(client.search).toHaveBeenCalledWith({
                    _source: {},
                    aggs: {},
                    query: {bool: {should: [{exists: {field: fakeField}}]}},
                    size: 10,
                    sort: ['_score', '_doc'],
                    track_scores: true
                });
            });
        });
        it('clears any previous state', async () => {
            // Arrange
            await manager.getFieldNamesAndTypes();
            const fakeBooleanField = 'boolean_field';
            const fakeRangeField = 'integer_field';
            const firstFakeState: HistoryLocation = {
                filters: {
                    exists: {
                        fieldKinds: {[fakeBooleanField]: 'should'},
                        fieldFilters: {[fakeBooleanField]: {exists: true}}
                    }
                }
            };
            const secondFakeState: HistoryLocation = {
                filters: {
                    range: {
                        fieldKinds: {[fakeRangeField]: 'must'},
                        fieldFilters: {[fakeRangeField]: {greaterThan: 0, lessThan: 100}}
                    }
                }
            };

            manager.setUserState(firstFakeState);
            await waitForExpect(() => {
                expect(client.search).toHaveBeenCalledWith({
                    _source: {},
                    aggs: {},
                    query: {bool: {should: [{exists: {field: fakeBooleanField}}]}},
                    size: 10,
                    sort: ['_score', '_doc'],
                    track_scores: true
                });
            });

            manager.setUserState(secondFakeState);
            // Check that the setting the first state does not affect the query that's run
            // after setting the second state. I.e. check that there is only a range filter and no boolean filter set.
            await waitForExpect(() => {
                expect(client.search).toHaveBeenCalledWith({
                    _source: {},
                    aggs: {},
                    query: {bool: {must: [{range: {[fakeRangeField]: {gt: 0, lt: 100}}}]}},
                    size: 10,
                    sort: ['_score', '_doc'],
                    track_scores: true
                });
            });
        });
    });
});
