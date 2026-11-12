// permissions.test.ts — RBAC matrix + account transition guards (no DB).
import { describe, it, expect } from 'vitest';
import { roleHas } from '../../config/permissions';
import { canTransitionAccount } from '../../shared/constants/account-status';
import { canTransitionCustomer } from '../../shared/constants/customer-status';

describe('RBAC matrix', () => {
  it('USER has no admin permissions', () => {
    expect(roleHas('USER', 'users:approve')).toBe(false);
    expect(roleHas('USER', 'wallet:adjust')).toBe(false);
  });

  it('ADMIN can approve users and adjust wallets but SUPPORT cannot adjust', () => {
    expect(roleHas('ADMIN', 'users:approve')).toBe(true);
    expect(roleHas('ADMIN', 'wallet:adjust')).toBe(true);
    expect(roleHas('SUPPORT', 'wallet:adjust')).toBe(false);
    expect(roleHas('SUPPORT', 'audit:read')).toBe(true);
  });

  it('SUPER_ADMIN has settings:manage; ADMIN does not', () => {
    expect(roleHas('SUPER_ADMIN', 'settings:manage')).toBe(true);
    expect(roleHas('ADMIN', 'settings:manage')).toBe(false);
  });
});

describe('account status transitions', () => {
  it('allows PENDING_APPROVAL → ACTIVE / REJECTED only', () => {
    expect(canTransitionAccount('PENDING_APPROVAL', 'ACTIVE')).toBe(true);
    expect(canTransitionAccount('PENDING_APPROVAL', 'REJECTED')).toBe(true);
    expect(canTransitionAccount('PENDING_APPROVAL', 'SUSPENDED')).toBe(false);
  });
  it('rejected is terminal', () => {
    expect(canTransitionAccount('REJECTED', 'ACTIVE')).toBe(false);
  });
  it('active ↔ suspended', () => {
    expect(canTransitionAccount('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionAccount('SUSPENDED', 'ACTIVE')).toBe(true);
  });
});

describe('customer status transitions', () => {
  it('forward flow only', () => {
    expect(canTransitionCustomer('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionCustomer('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransitionCustomer('COMPLETED', 'PENDING')).toBe(false);
    expect(canTransitionCustomer('CANCELLED', 'IN_PROGRESS')).toBe(false);
  });
});
