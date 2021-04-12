import {setUp} from '../utils';
import waitForExpect from 'wait-for-expect';
import {HistoryLocation} from '../../../src';

describe('Manager', () => {
    describe('setUserState', () => {
        it('calls client search with filter that was set', async () => {
            // Arrange
            const {manager, client} = setUp();
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
    });
});
