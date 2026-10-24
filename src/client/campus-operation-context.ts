import { AsyncLocalStorage } from 'node:async_hooks';

const operationSignal = new AsyncLocalStorage<AbortSignal>();

export function withCampusOperationSignal<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  return operationSignal.run(signal, operation);
}

export function getCampusOperationSignal(): AbortSignal | undefined {
  return operationSignal.getStore();
}
