import Manager from '../manager';

describe('Manager', () => {
    describe('#_saveQueryResults', () => {
        it('saves ES 7.10 query results', () => {
            const fakeES710QueryResults = {
                took: 2,
                timed_out: false,
                _shards: {total: 1, successful: 1, skipped: 0, failed: 0},
                hits: {
                    total: {value: 10, relation: 'eq'},
                    max_score: 1,
                    hits: [
                        {
                            _index: 'crm_index',
                            _type: '_doc',
                            _id: '_aLNPnkBrs-zuIFb2nyl',
                            _score: 1,
                            _source: {id: 234},
                            sort: [1, 0]
                        },
                        {
                            _index: 'crm_index',
                            _type: '_doc',
                            _id: '_qKLP3kBrs-zuIFbcXxC',
                            _score: 1,
                            _source: {id: 2344, 'user_profile.birth_date': 712652400000},
                            sort: [1, 1]
                        }
                    ]
                }
            };
            // @ts-ignore
            const manager = new Manager();
            manager._saveQueryResults(fakeES710QueryResults);
            expect(manager.results).toEqual(fakeES710QueryResults.hits.hits)
        });
    });
});
