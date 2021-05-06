import MappingParser from '../mapping_parser';

test('it should work when mappings have a "dynamic" field', () => {
    const fakeMapping = {
        crm_index: {
            mappings: {
                dynamic: 'false',
                properties: {
                    agg_average_image_submission_score: {
                        type: 'long' as 'long'
                    },
                    agg_historic_percent_approved_invite_to_submitted: {
                        properties: {
                            all_time: {
                                type: 'double' as 'double'
                            }
                        }
                    }
                }
            }
        }
    };
    const actual = MappingParser.flattenMappings710(fakeMapping);

    expect(actual).toEqual({
        agg_average_image_submission_score: 'long',
        'agg_historic_percent_approved_invite_to_submitted.all_time': 'double'
    });
});
