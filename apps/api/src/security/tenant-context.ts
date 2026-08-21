import { AsyncLocalStorage } from "async_hooks";

export type TenantStore = {
  organizationId?: string;
  userId?: string;
  rlsBypass?: boolean;
};

export const tenantAls = new AsyncLocalStorage<TenantStore>();

export function getTenantContext(): TenantStore {
  return tenantAls.getStore() ?? {};
}

export function runWithTenant<T>(store: TenantStore, fn: () => T): T {
  return tenantAls.run(store, fn);
}
