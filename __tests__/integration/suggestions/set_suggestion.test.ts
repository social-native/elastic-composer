import {setUp} from '../utils';

describe('Suggestion', () => {
    describe('Prefix', () => {
        describe('setSuggestion', () => {
            it.skip('calls client search with all search info', async () => {
                const {manager, client} = setUp();
                await manager.getFieldNamesAndTypes();
                manager.suggestions.prefix.setSearch('text_field', 'test_prefix_search');

                expect(client.search).toHaveBeenCalledWith();
            });
        });
    });
});
