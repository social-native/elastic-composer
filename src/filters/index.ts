export {default as RangeFilter} from './range_filter';
export {default as BooleanFilter} from './boolean_filter';
export {default as BaseFilter} from './base';
export {default as filterUtils} from './utils';

import {
    // IRangeConfigs,
    isGreaterThanFilter,
    isGreaterThanEqualFilter,
    isLessThanFilter,
    isLessThanEqualFilter
} from './range_filter';

export const typeGuards = {
    isGreaterThanFilter,
    isGreaterThanEqualFilter,
    isLessThanFilter,
    isLessThanEqualFilter
};

// export IRangeConfigs
