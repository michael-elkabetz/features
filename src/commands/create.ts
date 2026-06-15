import { createFeatureFlow, type CreateFlowDeps, type CreateFlowOptions } from './create-flow.js';

export function makeCreateCommand(deps: CreateFlowDeps) {
  return async function createCommand(topic: string | undefined, options: CreateFlowOptions): Promise<void> {
    await createFeatureFlow(deps, topic, options);
  };
}
