import {setUp} from '../../utils';
import {ESRequest} from 'types';

describe('Filters', () => {
    describe('Boolean Filter', () => {
        describe('setFilter', () => {
            it.skip('calls client search with all filters', () => {
                const {manager, client} = setUp();
                manager.filters.boolean.setFilter('test_filed', {state: true});

                client.search({} as ESRequest);
                // console.log((client.search as jest.Mock).mock.calls);
                expect(client.search).toHaveBeenCalledWith();
            });
        });
    });
});
