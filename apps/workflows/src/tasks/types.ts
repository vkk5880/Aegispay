import type { TaskContext, FlowContext, FlowOptions, StepOptions, Retry } from '@renderinc/sdk/workflows';

export type { TaskContext, FlowContext, FlowOptions, StepOptions, Retry };

export type ExtendedContext = (TaskContext | FlowContext) & {
  step: <T>(name: string, fn: () => Promise<T> | T, options?: StepOptions) => Promise<T>;
};

/**
 * @deprecated Legacy adapter for @renderinc/sdk < 1.7.0. Native flow() now injects FlowContext with native ctx.step().
 */
export function enhanceContext(ctx: TaskContext | FlowContext | any): ExtendedContext {
  const eCtx = ctx as ExtendedContext;
  if (typeof eCtx.step !== 'function') {
    eCtx.step = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      console.log(`[Workflow Step] Executing: ${name}`);
      return await fn();
    };
  }
  return eCtx;
}
