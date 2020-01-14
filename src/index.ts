import { configure } from "mobx";

export * from "./types";

configure({
  computedRequiresReaction: true,
  reactionRequiresObservable: true,
  enforceActions: "always",
  isolateGlobalState: true
});
