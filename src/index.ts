import {configure} from 'mobx';

export {default as Manager} from './manager';
export * from './types';
export * from './filters';

configure({
    computedRequiresReaction: true,
    reactionRequiresObservable: true,
    enforceActions: 'always',
    isolateGlobalState: true
});
