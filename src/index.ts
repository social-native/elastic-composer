import {configure} from 'mobx';

export {default as Manager} from './manager';
// export {BaseFilter} from './filters';
export * from './types';
export * from './filters';
export * from './clients';
export * from './suggestions';

configure({
    computedRequiresReaction: true,
    reactionRequiresObservable: true,
    enforceActions: 'always',
    isolateGlobalState: false
});
