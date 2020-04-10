# Geo Filters

Geo filters support all of the Elasticsearch input shapes.

Below is the correspondence of various `setFilter` or `addToFilter` actions to the valid ES queries that are created.

## Should & Must variation examples with single filters

### Geo Distance Input - MUST & INCLUDE

```typescript
crm.filters.geoFilter.setFilter('user_profile.location', {
    my_first_loc: {
        kind: 'must',
        inclusion: 'include',
        distance: '100mi',
        lat: 34.7850143,
        lon: -92.3912103
    }
});
```

Result:

```json
{
    "query": {
        "bool": {
            "must": [
                {
                    "geo_distance": {
                        "distance": "100mi",
                        "user_profile.location": {
                            "lat": 34.7850143,
                            "lon": -92.3912103
                        }
                    }
                }
            ]
        }
    }
}
```

### Geo Distance Input - MUST & EXCLUDE

```typescript
crm.filters.geoFilter.setFilter('user_profile.location', {
    my_first_loc: {
        kind: 'must',
        inclusion: 'exclude',
        distance: '100mi',
        lat: 34.7850143,
        lon: -92.3912103
    }
});
```

Result:

```json
{
    "query": {
        "bool": {
            "must": [
                {
                    "bool": {
                        "must_not": {
                            "geo_distance": {
                                "distance": "100mi",
                                "user_profile.location": {
                                    "lat": 34.7850143,
                                    "lon": -92.3912103
                                }
                            }
                        }
                    }
                }
            ]
        }
    }
}
```

### Geo Distance Input - SHOULD & INCLUDE

```typescript
crm.filters.geoFilter.setFilter('user_profile.location', {
    my_first_loc: {
        kind: 'should',
        inclusion: 'include',
        distance: '100mi',
        lat: 34.7850143,
        lon: -92.3912103
    }
});
```

Result:

```json
{
    "query": {
        "bool": {
            "should": [
                {
                    "geo_distance": {
                        "distance": "100mi",
                        "user_profile.location": {
                            "lat": 34.7850143,
                            "lon": -92.3912103
                        }
                    }
                }
            ]
        }
    }
}
```

### Geo Distance Input - SHOULD & EXCLUDE

```typescript
crm.filters.geoFilter.setFilter('user_profile.location', {
    my_first_loc: {
        kind: 'should',
        inclusion: 'exclude',
        distance: '100mi',
        lat: 34.7850143,
        lon: -92.3912103
    }
});
```

Result:

```json
{
    "query": {
        "bool": {
            "should": [
                {
                    "bool": {
                        "must_not": {
                            "geo_distance": {
                                "distance": "100mi",
                                "user_profile.location": {
                                    "lat": 34.7850143,
                                    "lon": -92.3912103
                                }
                            }
                        }
                    }
                }
            ]
        }
    }
}
```

## Multiple input shapes in multiple geo filters

### Geo Distance, Geo Bounding Box, and Geo Polygon Input

```typescript
crm.filters.geoFilter.setFilter('user_profile.location', {
    my_first_loc: {
        kind: 'should',
        inclusion: 'exclude',
        distance: '100mi',
        lat: 34.7850143,
        lon: -92.3912103
    },
    my_second_loc: {
        kind: 'must',
        inclusion: 'include',
        top_left: {
            lat: 40.73,
            lon: -74.1
        },
        bottom_right: {
            lat: 40.01,
            lon: -71.12
        }
    },
    my_third_loc: {
        points: [
            {lat: 40, lon: -70},
            {lat: 30, lon: -80},
            {lat: 20, lon: -90}
        ]
    }
});
```

Or you can use the `addToFilter` method:

```typescript
crm.filters.geoFilter.addToFilter('user_profile.location', 'my_first_loc', {
    kind: 'should',
    inclusion: 'exclude',
    distance: '100mi',
    lat: 34.7850143,
    lon: -92.3912103
});

crm.filters.geoFilter.addToFilter('user_profile.location', 'my_second_loc', {
    kind: 'must',
    inclusion: 'include',
    top_left: {
        lat: 40.73,
        lon: -74.1
    },
    bottom_right: {
        lat: 40.01,
        lon: -71.12
    }
});

crm.filters.geoFilter.addToFilter('user_profile.location', 'my_third_loc', {
    points: [
        {lat: 40, lon: -70},
        {lat: 30, lon: -80},
        {lat: 20, lon: -90}
    ]
});
```

Result:

```json
{
    "query": {
        "bool": {
            "must": [
                {
                    "geo_bounding_box": {
                        "user_profile.location": {
                            "top_left": {
                                "lat": 40.73,
                                "lon": -74.1
                            },
                            "bottom_right": {
                                "lat": 40.01,
                                "lon": -71.12
                            }
                        }
                    }
                }
            ],
            "should": [
                {
                    "bool": {
                        "must_not": {
                            "geo_distance": {
                                "distance": "100mi",
                                "user_profile.location": {
                                    "lat": 34.7850143,
                                    "lon": -92.3912103
                                }
                            }
                        }
                    }
                },
                {
                    "bool": {
                        "must_not": {
                            "geo_polygon": {
                                "user_profile.location": {
                                    "points": [
                                        {
                                            "lat": 40,
                                            "lon": -70
                                        },
                                        {
                                            "lat": 30,
                                            "lon": -80
                                        },
                                        {
                                            "lat": 20,
                                            "lon": -90
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            ]
        }
    }
}``
```
