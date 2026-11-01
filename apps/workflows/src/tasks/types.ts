import { TaskContext } from '@renderinc/sdk/workflows';

export type ExtendedContext = TaskContext & {
  step: <T>(name: string, fn: () => Promise<T> | T) => Promise<T>;
};

export function enhanceContext(ctx: TaskContext): ExtendedContext {
  const eCtx = ctx as ExtendedContext;
  if (typeof eCtx.step !== 'function') {
    eCtx.step = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      console.log(`[Workflow Step] Executing: ${name}`);
      return await fn();
    };
  }
  return eCtx;
}
