import assert from 'node:assert/strict';
import test from 'node:test';
import { pitchMessage } from '../../admin/pitchMessage.ts';
import { pitchCodeFromPath } from '../../pitch/pitchPath.ts';

const zero = { total: 0, last30: 0 };
const link = (over = {}) => ({ url: 'https://bytspot.app/for-business/abc.def', expiresAt: '2027-01-15T00:00:00Z',
  numbers: { checkIns: zero, bookingTaps: zero, planAdds: zero, bookedByGuests: zero, ...over } });

test('the pitch message names only counts above zero, and always the link', () => {
  const busy = pitchMessage('Rumi\u2019s Kitchen', link({ bookingTaps: { total: 40, last30: 23 }, planAdds: { total: 11, last30: 11 } }));
  assert.equal(busy, 'Hi Rumi\u2019s Kitchen. In the last 30 days, Bytspot guests 23 tapped to book, 11 added you to a Plan. '
    + 'Take their bookings directly in Bytspot. See the details and join here: https://bytspot.app/for-business/abc.def');
  const quiet = pitchMessage('Summerland', link({ checkIns: { total: 3, last30: 0 } }));
  assert.match(quiet, /can already find you/);
  assert.doesNotMatch(quiet, /last 30 days/);
});

test('only a well-formed pitch path opens the page', () => {
  assert.equal(pitchCodeFromPath('/for-business/eyJ2Ijo.ab_c-1'), 'eyJ2Ijo.ab_c-1');
  assert.equal(pitchCodeFromPath('/for-business/eyJ2Ijo.ab_c-1/'), 'eyJ2Ijo.ab_c-1');
  for (const bad of ['/for-business/', '/for-business/nodot', '/for-business/a.b/c', '/for-business/a.b?x', '/plan/a.b']) {
    assert.equal(pitchCodeFromPath(bad), null, bad);
  }
});
