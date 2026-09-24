import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const shell = readFileSync('ios/App/App/NativeShellView.swift', 'utf8');
const detail = readFileSync('ios/App/App/NativePartyInvitationDetail.swift', 'utf8');
const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');

function section(source: string, from: string, to: string) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `Missing section: ${from}`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `Missing end: ${to}`);
  return source.slice(start, end);
}

test('Discover party details route to the invitation, never the personal pass', () => {
  const sheet = section(shell, '.sheet(item: $offeringDetail)', 'private var filterSystem');
  assert.match(sheet, /NativePartyInvitationDetail\(partyID: route.partyID, openAuth: openNativeAuth\)/);
  assert.doesNotMatch(sheet, /NativePartyPassPreview|PartyPassClipView|ClipInviteView/);
  assert.match(sheet, /navigationViewStyle\(\.stack\)/);
});

test('Invitation has its own main-app design and no private pass payload or Clip UI', () => {
  for (const heading of ['THE INVITATION', 'At a glance', 'Your host', 'The plan for the night', 'Tables & sessions']) {
    assert.ok(detail.includes(`"${heading}"`));
  }
  assert.doesNotMatch(detail, /ClipInviteView\(|PartyPassClipView\(|NativePartyPassPreview\(|recapBlock\(|CIFilter|personalQR/);
  assert.match(detail, /native-party-invitation-detail/);
  assert.match(detail, /Scheduled by the host/);
  assert.match(detail, /NativePartyCommerceControls\(partyID: party.id, openAuth: openAuth\)/);
  assert.match(detail, /NativePartyLineup\(partyID: party.id\)/);
  assert.match(detail, /session.priceLabel/);
  assert.match(detail, /discloseLocation: !party.isLocationWithheld/);
  assert.match(detail, /if discloseLocation, let venue/);
});

test('Bookings links to the separate Wallet even with an empty arrival ledger', () => {
  const ledger = section(shell, 'private struct NativeArrivalLedgerPanel:', 'private var arrivalSummaryStrip');
  assert.match(ledger, /Button\(action: openAccess\)/);
  assert.ok(ledger.indexOf('native-bookings-open-wallet') < ledger.indexOf('if items.isEmpty'));
  assert.match(shell, /NativeArrivalLedgerPanel\(openAccess: openPanel.map \{ open in \{ open\(\.access\) \} \}\)/);
  assert.match(shell, /\("WALLET", "Wallet", "Passes, points & access"/);
  assert.match(ledger, /Label\("Open Wallet"/);
  assert.doesNotMatch(detail, /Find your pass in Profile/);
});

test('Invitation refresh is account scoped and stale/cancelled results cannot repopulate it', () => {
  assert.match(detail, /\.task\(id: loadKey\)/);
  assert.match(detail, /userID: sessionStore.authenticatedUserID/);
  assert.match(detail, /guard !Task.isCancelled, loadKey == key else/);
  assert.match(detail, /guard generation == self.generation else/);
  assert.match(detail, /\.onDisappear \{ state.invalidate\(\) \}/);
  assert.match(detail, /\.onChange\(of: sessionStore.token\) \{ _ in refresh\(\) \}/);
});

test('Commerce, authoring and performer surfaces are reachable and compiled', () => {
  const wallet = section(shell, 'private struct NativeWalletLedgerPreferenceSections:', 'private struct NativeManualCheckInWalletSection:');
  const bookings = section(shell, 'private struct NativeArrivalLedgerPanel:', 'private var arrivalSummaryStrip');
  assert.match(wallet, /NativePartyWalletSection\(\)/);
  assert.match(bookings, /NativePartyWalletSection\(\)/);
  assert.match(wallet, /NativePerformerInboxEntry\(\)/);
  for (const path of ['NativeHostStudioView', 'NativePartyControlView']) {
    const view = readFileSync(`ios/App/App/${path}.swift`, 'utf8');
    assert.match(view, /NativePartySessionAuthoringView\(partyID:/);
    assert.match(view, /NativePartyLineupHostSheet\(partyID:/);
  }
  for (const name of ['NativePartyCommerce', 'NativePartyLineup', 'NativePartySessionAuthoring']) {
    assert.equal(project.split(`${name}.swift in Sources`).length - 1, 2);
    assert.equal(project.split(`${name}Tests.swift in Sources`).length - 1, 2);
  }
  const commerce = readFileSync('ios/App/App/NativePartyCommerce.swift', 'utf8');
  assert.match(commerce, /NativePartyPersonalPassView\(partyID:/);
  assert.match(commerce, /events.pass.attendeeCredential/);
  assert.match(commerce, /NativePartyLineup\(partyID: partyID\)/);
  const authoring = readFileSync('ios/App/App/NativePartySessionAuthoring.swift', 'utf8');
  assert.match(authoring, /events.sessionAuthoring.access/);
  assert.doesNotMatch(authoring, /events.sessions.access/);
});

test('Performer review and removal buttons opt out of List row-wide automatic activation', () => {
  const lineup = readFileSync('ios/App/App/NativePartyLineup.swift', 'utf8');
  const privateContent = section(lineup, '@ViewBuilder private var privateContent:', 'private var retryBlock:');
  for (const action of ['editEntry', 'removal']) {
    assert.match(privateContent, new RegExp(String.raw`\{ ${action} = entry \}\s*\.buttonStyle\(\.borderless\)`),
      `${action} must remain independently tappable inside its List row`);
  }
});

test('The new screen is registered in the main app build, not copied into the Clip', () => {
  assert.equal(project.match(/NativePartyInvitationDetail.swift in Sources/g)?.length, 2);
  assert.equal(project.match(/path = NativePartyInvitationDetail.swift/g)?.length, 1);
  assert.equal(project.match(/D92400022026092400000001 \/\* NativePartyInvitationDetail.swift \*\//g)?.length, 3);
});
