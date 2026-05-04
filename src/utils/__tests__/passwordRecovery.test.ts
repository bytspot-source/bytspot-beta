import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getPasswordRecoveryRoute,
  getPasswordResetTokenFromLocation,
} from '../passwordRecovery.ts';

describe('passwordRecovery route parsing', () => {
  it('detects direct forgot/reset paths', () => {
    assert.equal(getPasswordRecoveryRoute({ pathname: '/forgot-password', hash: '' }), 'forgot');
    assert.equal(getPasswordRecoveryRoute({ pathname: '/reset-password', hash: '' }), 'reset');
  });

  it('detects hash routes emitted by reset emails', () => {
    assert.equal(getPasswordRecoveryRoute({ pathname: '/', hash: '#/forgot-password' }), 'forgot');
    assert.equal(getPasswordRecoveryRoute({ pathname: '/', hash: '#/reset-password?token=abc' }), 'reset');
  });

  it('returns null for normal app routes', () => {
    assert.equal(getPasswordRecoveryRoute({ pathname: '/', hash: '' }), null);
    assert.equal(getPasswordRecoveryRoute({ pathname: '/provider', hash: '' }), null);
  });
});

describe('password reset token parsing', () => {
  it('reads token from normal search params', () => {
    assert.equal(getPasswordResetTokenFromLocation({ search: '?token=normal-token', hash: '' }), 'normal-token');
  });

  it('reads token from hash-route query params', () => {
    assert.equal(getPasswordResetTokenFromLocation({ search: '', hash: '#/reset-password?token=hash-token' }), 'hash-token');
  });

  it('prefers search token over hash token', () => {
    assert.equal(
      getPasswordResetTokenFromLocation({ search: '?token=search-token', hash: '#/reset-password?token=hash-token' }),
      'search-token',
    );
  });
});
