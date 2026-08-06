import assert from 'node:assert/strict';
import test from 'node:test';
import { partyIDFromURL, partyPassCopy, shouldRenderWebPartyPass } from '../partyPassRoute.ts';

test('renders normal Party URLs as web passes while preserving explicit App Clip handoffs', () => {
  assert.equal(partyIDFromURL('https://bytspot.app/party/party-1'), 'party-1');
  assert.equal(shouldRenderWebPartyPass('https://bytspot.app/party/party-1'), true);
  assert.equal(shouldRenderWebPartyPass('https://bytspot.app/party/party-1?handoff=1'), false);
});

test('keeps each Party access mode distinct and formats cash cents exactly', () => {
  assert.deepEqual(partyPassCopy('open-entry', 'view-pass'), { admission: 'Open entry · no payment', detail: 'Walk in—no reservation or payment is needed.', primary: 'Party Pass confirmed' });
  assert.equal(partyPassCopy('cash-at-door', 'reserve-cash', 2550).admission, 'Cash at door · $25.50');
  assert.equal(partyPassCopy('cash-at-door', 'reserve-cash', 2550).primary, 'Reserve · pay cash at door');
  assert.equal(partyPassCopy('paid-ticket', 'ticket').primary, 'Choose a ticket');
  assert.equal(partyPassCopy('private-approval', 'request-approval').primary, 'Request host approval');
});