import {configure} from 'mobx';

export * from './types';
export * from './filters';

configure({
    computedRequiresReaction: true,
    reactionRequiresObservable: true,
    enforceActions: 'always',
    isolateGlobalState: true
});
