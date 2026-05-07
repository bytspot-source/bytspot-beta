import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAdminApprovalAccessFromToken } from '../adminAccess.ts';

function token(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

describe('admin approval access', () => {
  it('allows BYTSPOT_ADMIN group claims', () => {
    const access = getAdminApprovalAccessFromToken(token({ email: 'admin@test.com', groups: ['BYTSPOT_ADMIN'] }));
    assert.equal(access.allowed, true);
    assert.equal(access.email, 'admin@test.com');
  });

  it('allows INTERNAL_OPS group claims case-insensitively', () => {
    const access = getAdminApprovalAccessFromToken(token({ groups: ['internal_ops'] }));
    assert.equal(access.allowed, true);
  });

  it('rejects non-admin sessions', () => {
    const access = getAdminApprovalAccessFromToken(token({ groups: ['bytspot:user'] }));
    assert.equal(access.allowed, false);
    assert.match(access.reason ?? '', /missing BYTSPOT_ADMIN/);
  });
});