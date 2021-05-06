import MappingParser from '../mapping_parser';

test('it should work when mappings have a "dynamic" tag', () => {
    const fakeMapping = {
        crm_index: {
            mappings: {
                dynamic: 'false',
                properties: {
                    agg_average_image_submission_score: {
                        type: 'long' as 'long'
                    }
                }
            }
        }
    };
    const actual = MappingParser.flattenMappings(fakeMapping);

    expect(actual).toBeDefined();
});
