import {configure} from 'mobx';

export {default as Manager} from './manager';
export * from './types';
export {RangeFilterClass, RangeConfigs} from './filters';

configure({
    computedRequiresReaction: true,
    reactionRequiresObservable: true,
    enforceActions: 'always',
    isolateGlobalState: true
});
