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

test('it should work when mappings is empty', () => {
    const fakeMapping = {'creator-crm-testing': {mappings: {}}};
    const actual = MappingParser.flattenMappings710(fakeMapping);
    expect(actual).toEqual({});
});

test('it should have subfields of a nested field', () => {
    const fakeMapping = {
        'creator-crm-v2': {
            mappings: {
                dynamic: 'false',
                properties: {
                    key_value_tags: {
                        type: 'nested',
                        properties: {
                            tag_id: {
                                type: 'long'
                            },
                            tag_name: {
                                type: 'text',
                                fields: {
                                    keyword: {
                                        type: 'keyword'
                                    }
                                }
                            },
                            tag_value: {
                                type: 'text',
                                fields: {
                                    keyword: {
                                        type: 'keyword'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
    const actualFlattenedMappings = MappingParser.flattenMappings710(fakeMapping);
    const expectedFlattenedMapping = {
        key_value_tags: 'nested',
        'key_value_tags.tag_id': 'long',
        'key_value_tags.tag_name': 'text',
        'key_value_tags.tag_value': 'text',
    }
    expect(actualFlattenedMappings).toMatchObject(expectedFlattenedMapping)

});
