import MappingParser from '../mapping_parser';
import { ESMappingProperties } from '../types';

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
                    // This should be flattened to just { "instagram.bio": "text" }
                    instagram: {
                        properties: {
                            bio: {
                                type: 'text',
                                fields: {
                                    keyword: {
                                        type: 'keyword'
                                    }
                                }
                            }
                        } as ESMappingProperties
                    },
                    // key_value_tags should be its own key, with type "nested", e.g. { "key_value_tags": "nested" }
                    key_value_tags: {
                        type: 'nested' as 'nested',
                        // Each of the properties of key_value_tags should be flattened into their own fields,
                        // e.g. { "key_value_tags.tag_id": "long", "key_value_tags.tag_name": "text" }
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
        'instagram.bio': 'text'
    };
    expect(actualFlattenedMappings).toMatchObject(expectedFlattenedMapping);
});
