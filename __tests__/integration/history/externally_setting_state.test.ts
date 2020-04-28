import {HistoryLocation} from '../../../src/index';
import {setUp} from '../utils';

describe('Integration', () => {
    describe('History', () => {
        describe('externally setting state', () => {
            it('updates activeFilters', () => {
                const newState = {
                    filters: {
                        range: {
                            fieldKinds: {'user_profile.age': 'should'},
                            fieldFilters: {'user_profile.age': {lessThan: 83, greaterThan: 18}}
                        }
                    },
                    suggestions: {
                        prefix: {fieldKinds: {tags: 'should'}, fieldSearches: {tags: 'cat'}}
                    }
                } as HistoryLocation;
                const {manager, history} = setUp();
                history.setCurrentState(newState);

                expect(manager.activeFilters).toMatchInlineSnapshot(`
                    Object {
                      "user_profile.age": Array [
                        RangeFilterClass {
                          "_addBoundsAggsToEsRequest": [Function],
                          "_addConfigForField": [Function],
                          "_addDistributionsAggsToEsRequest": [Function],
                          "_addFilteredAggsToRequest": [Function],
                          "_addFilteredQueryAndAggsToRequest": [Function],
                          "_addFilteredQueryToRequest": [Function],
                          "_addQueriesToESRequest": [Function],
                          "_addUnfilteredAggsToRequest": [Function],
                          "_addUnfilteredQueryAndAggsToRequest": [Function],
                          "_extractFilteredAggsStateFromResponse": [Function],
                          "_extractUnfilteredAggsStateFromResponse": [Function],
                          "_fieldsThatHaveUnfilteredStateFetched": Object {},
                          "_findConfigForField": [Function],
                          "_parseBoundsFromResponse": [Function],
                          "_parseDistributionFromResponse": [Function],
                          "_setConfigs": [Function],
                          "_shouldUpdateFilteredAggsSubscribers": Array [
                            [Function],
                          ],
                          "_shouldUpdateUnfilteredAggsSubscribers": Array [
                            [Function],
                          ],
                          "_shouldUseField": [Function],
                          "_subscribeToShouldUpdateFilteredAggs": [Function],
                          "_subscribeToShouldUpdateUnfilteredAggs": [Function],
                          "clearAllFieldFilters": [Function],
                          "clearFilter": [Function],
                          "fieldConfigDefault": Object {
                            "aggsEnabled": false,
                            "defaultFilterKind": "should",
                            "getDistribution": true,
                            "getRangeBounds": true,
                            "rangeInterval": 1,
                          },
                          "fieldConfigs": Object {},
                          "fieldFilters": Object {
                            "user_profile.age": Object {
                              "greaterThan": 18,
                              "lessThan": 83,
                            },
                          },
                          "fieldKinds": Object {
                            "user_profile.age": "should",
                          },
                          "filterKind": "range",
                          "filteredDistribution": Object {},
                          "filteredRangeBounds": Object {},
                          "kindForField": [Function],
                          "setAggsEnabledToFalse": [Function],
                          "setAggsEnabledToTrue": [Function],
                          "setFilter": [Function],
                          "setKind": [Function],
                          "unfilteredDistribution": Object {},
                          "unfilteredRangeBounds": Object {},
                        },
                      ],
                    }
                `);
            });

            it('updates activeSuggestions', () => {
                const newState = {
                    filters: {
                        range: {
                            fieldKinds: {'user_profile.age': 'should'},
                            fieldFilters: {'user_profile.age': {lessThan: 83, greaterThan: 18}}
                        }
                    },
                    suggestions: {
                        prefix: {fieldKinds: {tags: 'should'}, fieldSearches: {tags: 'cat'}}
                    }
                } as HistoryLocation;
                const {manager, history} = setUp();
                history.setCurrentState(newState);

                expect(manager.activeSuggestions).toMatchInlineSnapshot(`
                    Object {
                      "tags": Array [
                        PrefixSuggestion {
                          "_addAggsToESRequest": [Function],
                          "_addConfigForField": [Function],
                          "_addQueriesToESRequest": [Function],
                          "_addSuggestionQueryAndAggsToRequest": [Function],
                          "_extractSuggestionFromResponse": [Function],
                          "_findConfigForField": [Function],
                          "_parseAggsFromESResponse": [Function],
                          "_setConfigs": [Function],
                          "_shouldRunQuery": [Function],
                          "_shouldRunSuggestionSearchSubscribers": Array [
                            [Function],
                            [Function],
                            [Function],
                            [Function],
                          ],
                          "_shouldUseField": [Function],
                          "_subscribeToShouldRunSuggestionSearch": [Function],
                          "clearAllFieldSuggestions": [Function],
                          "clearSearch": [Function],
                          "fieldConfigDefault": Object {
                            "defaultSuggestionKind": "should",
                            "enabled": false,
                            "fieldNameModifierAggs": [Function],
                            "fieldNameModifierQuery": [Function],
                          },
                          "fieldConfigs": Object {},
                          "fieldKinds": Object {
                            "tags": "should",
                          },
                          "fieldSearches": Object {
                            "tags": "cat",
                          },
                          "fieldSuggestions": Object {},
                          "kindForField": [Function],
                          "setEnabledToFalse": [Function],
                          "setEnabledToTrue": [Function],
                          "setKind": [Function],
                          "setSearch": [Function],
                          "suggestionKind": "prefix",
                        },
                      ],
                    }
                `);
            });

            it.skip('kicks off new filter search', () => {
                const newState = {
                    filters: {
                        range: {
                            fieldKinds: {'user_profile.age': 'should'},
                            fieldFilters: {'user_profile.age': {lessThan: 83, greaterThan: 18}}
                        }
                    },
                    suggestions: {
                        prefix: {fieldKinds: {tags: 'should'}, fieldSearches: {tags: 'cat'}}
                    }
                } as HistoryLocation;
                const {history, client} = setUp();
                history.setCurrentState(newState);

                expect(client.search).toHaveBeenCalledWith();
            });
        });
    });
});
