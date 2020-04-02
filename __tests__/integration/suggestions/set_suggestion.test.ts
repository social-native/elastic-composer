import {setUp} from '../utils';
import waitForExpect from 'wait-for-expect';

describe('Suggestion', () => {
    describe('Prefix', () => {
        describe('setSuggestion', () => {
            it('doest not call client search with all search info if disabled', async () => {
                const {manager, client} = setUp();
                await manager.getFieldNamesAndTypes();

                expect(manager.suggestions.prefix.fieldConfigs.text_field.enabled).toBeFalsy();

                manager.suggestions.prefix.setSearch('text_field', 'test_prefix_search');

                await waitForExpect(() => {
                    expect(manager._sideEffectQueue.length).toEqual(0);
                });

                expect(client.search).not.toHaveBeenCalled();
            });

            it.skip('calls client search with all search info if enabled', async () => {
                const {manager, client} = setUp();
                await manager.getFieldNamesAndTypes();

                manager.suggestions.prefix.setEnabledToTrue('text_field');
                expect(manager.suggestions.prefix.fieldConfigs.text_field.enabled).toBeTruthy();

                manager.suggestions.prefix.setSearch('text_field', 'test_prefix_search');

                await waitForExpect(() => {
                    expect(manager._sideEffectQueue.length).toEqual(0);
                });

                expect((client.search as jest.Mock).mock.calls).toHaveLength(2);

                // called once without the prefix filter on query
                expect(client.search).toHaveBeenNthCalledWith(1, {
                    _source: {},
                    aggs: {
                        text_field__prefix_suggestion: {
                            terms: {field: 'text_field', size: 20}
                        }
                    },
                    query: {bool: {}},
                    size: 0,
                    sort: ['_score', '_doc'],
                    track_scores: false
                });

                // called once WITH the prefix filter on query
                expect(client.search).toHaveBeenNthCalledWith(2, {
                    _source: {},
                    aggs: {
                        text_field__prefix_suggestion: {
                            terms: {field: 'text_field', size: 20}
                        }
                    },
                    query: {
                        bool: {
                            should: [{prefix: {text_field: {value: 'test_prefix_search'}}}]
                        }
                    },
                    size: 0,
                    sort: ['_score', '_doc'],
                    track_scores: false
                });
            });
        });
    });
});
