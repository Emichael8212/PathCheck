import { describe, expect, it, vi } from 'vitest';
import { createAccountPorts } from './createAccountPorts';

describe('real account composition', () => {
  it.each([undefined, '', 'sb_secret_forbidden', 'unrecognized'])('rejects missing or unsafe browser configuration without egress: %s', publishableKey => {
    const send = vi.fn();
    expect(createAccountPorts({ url: 'http://127.0.0.1:55431', publishableKey }, { session: null, local: null }, send)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it('composes actual auth/storage/recovery and refuses guest cloud access before any request', async () => {
    const send = vi.fn();
    const ports = createAccountPorts({ url: 'http://127.0.0.1:55431', publishableKey: 'sb_publishable_synthetic' }, { session: null, local: null }, send)!;
    expect(Object.isFrozen(ports)).toBe(true);
    expect(await ports.auth.currentUser()).toEqual({ ok: true, value: null });
    expect(await ports.storage.listOwnedPlans()).toMatchObject({ ok: false, reasonCode: 'not_authenticated' });
    expect(ports.recovery.recover('2026-11-13T00:00:00Z')).toEqual({ ok: true, value: null });
    expect(send).not.toHaveBeenCalled();
  });
});
