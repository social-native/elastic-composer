export {default as RangeFilter} from './range_filter';
export {default as BooleanFilter} from './boolean_filter';
export {default as BaseFilter} from './base';
export {default as ExistsFilter} from './exists_filter';
export {default as MultiSelectFilter} from './multi_select_filter';
export {default as DateRangeFilter} from './date_range_filter';
export {default as GeoFilter} from './geo_filter';
export {default as TermsFilter} from './terms_filter';
export {default as QueryStringFilter} from './query_string_filter';
export {default as filterUtils} from './utils';

import {
    isGreaterThanFilter,
    isGreaterThanEqualFilter,
    isLessThanFilter,
    isLessThanEqualFilter
} from './range_filter';

export const filterTypeGuards = {
    isGreaterThanFilter,
    isGreaterThanEqualFilter,
    isLessThanFilter,
    isLessThanEqualFilter
};
