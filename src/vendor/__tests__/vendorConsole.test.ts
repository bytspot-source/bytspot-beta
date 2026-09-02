import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertVendorConsoleContract,
  blankOnlyVariants,
  bookableTypesForDiscoverCategory,
  discoverCategoriesForBookableType,
  canManagePayouts,
  canSeeFinancials,
  getVendorBookableType,
  listVendorBookableTypes,
  templatesForBookableType,
  vendorAuthContract,
  vendorAuthMessage,
  vendorLandingView,
  vendorPrimaryNav,
  vendorSecondaryNav,
  vendorWebhookUiContract,
  VENDOR_CONSOLE,
  type VendorViewer,
} from '../vendorConsole.ts';
import { openSession, type Seat, type Seller, type VendorSession } from '../seller.ts';
import {
  canStaffExecute,
  getBookableStaffRole,
  listBookableDomains,
  listBookableStaffRoles,
  listDiscoverCategories,
  staffRoleCan,
} from '../../utils/bookableTemplates.ts';

const ids = (items: { id: string }[]) => items.map((item) => item.id);

test('the vendor console contract holds', () => {
  assert.deepEqual(assertVendorConsoleContract(), []);
});

test('a Bookable is the printer and a SKU is what it prints', () => {
  // The spec put Bookable above, below and level with SKU. Only one can be true.
  assert.equal(VENDOR_CONSOLE.model.printer.config, 'BOOKABLE');
  assert.equal(VENDOR_CONSOLE.model.printer.multiplier, 'AVAILABILITY');
  assert.equal(VENDOR_CONSOLE.model.printer.prints, 'SKU');

  // Fulfillment is not a new object: it is the PASS reaching ADMITTED.
  assert.equal(VENDOR_CONSOLE.model.fulfillmentIsPassState, 'ADMITTED');

  assert.ok(VENDOR_CONSOLE.model.vendorFacingNouns.includes('Bookable'));
  assert.equal(VENDOR_CONSOLE.model.vendorFacingNouns.includes('SKU'), false);
});

test('every bookable type resolves to a domain that already exists', () => {
  const domains = new Map(listBookableDomains().map((domain) => [domain.id, domain]));

  for (const type of listVendorBookableTypes()) {
    const domain = domains.get(type.domain);
    assert.ok(domain, `${type.id} points at unknown domain ${type.domain}`);
    for (const variant of type.variants) {
      assert.ok(domain.variants.includes(variant), `${type.id} offers unknown variant ${variant}`);
    }
    // Either a preset prints it or the vendor starts blank. Never a dead end.
    assert.ok(templatesForBookableType(type.id).length + blankOnlyVariants(type.id).length > 0);
  }

  assert.deepEqual(ids(templatesForBookableType('parking')), ['stall.reserved-parking']);
  assert.deepEqual(blankOnlyVariants('parking'), ['valet']);
  assert.deepEqual(blankOnlyVariants('table'), []);
});

test('a gap is recorded rather than faked onto the wrong domain', () => {
  const supported = new Set(listVendorBookableTypes().map((type) => type.id));
  for (const type of VENDOR_CONSOLE.unsupportedTypes) {
    assert.equal(supported.has(type.id), false, `${type.id} cannot be both`);
    // Each gap closes with a new variant on an existing domain, never a new noun.
    const domain = listBookableDomains().find((item) => item.id === type.wouldNeed.domain);
    assert.ok(domain, `${type.id} would need unknown domain ${type.wouldNeed.domain}`);
  }

  // Class and Space were the two open gaps; both now land on real variants.
  const variantsFor = (id: string) => getVendorBookableType(id)?.variants ?? [];
  assert.ok(variantsFor('fitness').includes('class'));
  assert.ok(variantsFor('events').includes('class'));
  assert.ok(variantsFor('coffee').includes('workspace'));
});

test('supply and demand are two lenses on one catalog', () => {
  // Every consumer rail must be fillable from the vendor console, or it stays
  // an empty tab no vendor can stock.
  for (const category of listDiscoverCategories({ includeVendorGated: true })) {
    const types = bookableTypesForDiscoverCategory(category.id);
    assert.ok(types.length > 0, `nobody can publish into ${category.id}`);
    for (const type of types) {
      assert.ok(category.domains.includes(type.domain));
    }
  }

  // Every vendor answer must reach a rail, or it is inventory nobody can find.
  for (const type of listVendorBookableTypes()) {
    assert.ok(discoverCategoriesForBookableType(type.id).length > 0, `${type.id} reaches no rail`);
  }

  // Services is the one rail two different vendor answers feed.
  assert.deepEqual(bookableTypesForDiscoverCategory('service').map((type) => type.id), ['service', 'local']);
  assert.deepEqual(discoverCategoriesForBookableType('local').map((category) => category.id), ['service']);

  // One vendor answer can reach two rails when the domain genuinely spans them.
  assert.deepEqual(discoverCategoriesForBookableType('ride').map((category) => category.id), ['mobility', 'valet']);
});

test('a home baker gets the same core loop as a hotel', () => {
  const hotel: VendorViewer = { role: 'owner', businessMode: 'standard' };
  const baker: VendorViewer = { role: 'owner', businessMode: 'cottage' };

  // Primary tabs are the business, not the business size.
  assert.deepEqual(ids(vendorPrimaryNav(hotel)), ids(vendorPrimaryNav(baker)));
  assert.deepEqual(ids(vendorPrimaryNav(baker)), ['home', 'bookables', 'demand', 'bookings', 'earnings']);

  // Cottage collapses configuration instead.
  const bakerMore = ids(vendorSecondaryNav(baker));
  for (const hidden of ['locations', 'staff', 'business', 'partnerships']) {
    assert.equal(bakerMore.includes(hidden), false, `cottage must not show ${hidden}`);
  }
  assert.ok(bakerMore.includes('payouts'));
  assert.ok(bakerMore.includes('scanner'));

  // And the trade a cottage vendor actually has comes first.
  assert.equal(listVendorBookableTypes('cottage')[0].id, 'local');
  assert.equal(listVendorBookableTypes('standard')[0].id, 'table');

  // And the rail a cottage vendor publishes into is the same Services rail a
  // spa uses, so a home baker is not filed somewhere consumers never look.
  assert.deepEqual(discoverCategoriesForBookableType('local').map((category) => category.label), ['Services']);
});

test('the door can verify a pass and reach nothing else', () => {
  const door: VendorViewer = { role: 'door', businessMode: 'standard' };
  assert.deepEqual(ids(vendorPrimaryNav(door)), ['home', 'bookings']);
  assert.deepEqual(ids(vendorSecondaryNav(door)), ['scanner', 'settings']);

  assert.equal(canSeeFinancials('door'), false);
  assert.equal(canManagePayouts('door'), false);
  assert.equal(staffRoleCan('door', 'VERIFY'), true);
  assert.equal(staffRoleCan('door', 'REFUND'), false);
  assert.equal(staffRoleCan('door', 'PUBLISH'), false);
});

test('navigation is derived from the same roles the ontology enforces', () => {
  const manager: VendorViewer = { role: 'manager', businessMode: 'standard' };
  const managerMore = ids(vendorSecondaryNav(manager));

  // A manager runs the business without being able to move its money.
  assert.ok(managerMore.includes('staff'));
  assert.equal(managerMore.includes('payouts'), false);
  assert.equal(managerMore.includes('partnerships'), false);
  assert.equal(canSeeFinancials('manager'), true);
  assert.equal(canManagePayouts('manager'), false);
  assert.equal(staffRoleCan('manager', 'REFUND'), false);

  const provider: VendorViewer = { role: 'serviceProvider', businessMode: 'cottage' };
  assert.equal(getBookableStaffRole('serviceProvider')?.scope, 'assigned');
  assert.ok(ids(vendorSecondaryNav(provider)).includes('availability'));
  assert.equal(ids(vendorPrimaryNav(provider)).includes('bookables'), false);
});

test('navigation follows the session, so suspending the business removes the tab', () => {
  const seller: Seller = {
    id: 'sel_1',
    legalName: 'Midtown Table',
    state: 'ACTIVE',
    businessMode: 'standard',
    satisfied: ['legalName', 'contactEmail', 'activeLocation', 'payoutAccount'],
  };
  const seat: Seat = {
    id: 'seat_1',
    sellerId: 'sel_1',
    personId: 'per_1',
    role: 'owner',
    state: 'ACTIVE',
    locationIds: [],
    bookableIds: [],
  };
  const viewerFor = (state: Seller['state']): VendorViewer => {
    const opened = openSession({ ...seller, state }, seat);
    assert.equal(opened.ok, true);
    const session = (opened as { ok: true; session: VendorSession }).session;
    return { role: seat.role, businessMode: 'standard', capabilities: session.capabilities };
  };

  const live = viewerFor('ACTIVE');
  assert.ok(ids(vendorSecondaryNav(live)).includes('locations'));
  assert.ok(ids(vendorPrimaryNav(live)).includes('bookables'));

  // A suspended business keeps the owner seat but withdraws what it can do, so
  // the tabs behind those capabilities disappear rather than refusing on tap.
  const suspended = viewerFor('SUSPENDED');
  const suspendedIds = [...ids(vendorPrimaryNav(suspended)), ...ids(vendorSecondaryNav(suspended))];
  assert.equal(suspendedIds.includes('bookables'), false);
  assert.equal(suspendedIds.includes('locations'), false);
  assert.equal(suspendedIds.includes('demand'), false);
  assert.equal(suspendedIds.includes('availability'), false);
  // The pass scanner survives, because a suspended business still honours passes.
  assert.ok(suspendedIds.includes('scanner'));

  // A business still in setup can build a calendar and nothing else.
  const draft = viewerFor('DRAFT');
  const draftIds = [...ids(vendorPrimaryNav(draft)), ...ids(vendorSecondaryNav(draft))];
  assert.ok(draftIds.includes('availability'));
  assert.equal(draftIds.includes('bookables'), false);
  assert.equal(draftIds.includes('staff'), false);

  // Without a session the role's own list is used, which is the widest it gets.
  const roleOnly: VendorViewer = { role: 'owner', businessMode: 'standard' };
  assert.deepEqual(ids(vendorPrimaryNav(roleOnly)), ids(vendorPrimaryNav(live)));
  assert.ok(vendorLandingView(suspended).length > 0);
});

test('no seat can outrank the business it works for', () => {
  const seller = new Set(
    listBookableStaffRoles().find((role) => role.id === 'owner')?.capabilities ?? [],
  );
  for (const role of listBookableStaffRoles()) {
    for (const capability of role.capabilities) {
      assert.ok(seller.has(capability), `${role.id} claims ${capability}, which the owner does not hold`);
    }
  }

  // The state machine still has the final say after the role check passes.
  const declared = ['RESERVE', 'BOOK', 'PAY', 'CANCEL', 'INVITE'] as const;
  assert.equal(canStaffExecute('staff', 'CANCEL', 'RESERVED', [...declared]), true);
  assert.equal(canStaffExecute('staff', 'CANCEL', 'CANCELLED', [...declared]), false);
  assert.equal(canStaffExecute('door', 'CANCEL', 'RESERVED', [...declared]), false);
});

test('the auth contract refuses to store a credential where a script can read it', () => {
  const auth = vendorAuthContract();

  assert.equal(auth.token.accessStorage, 'memory');
  assert.equal(auth.token.refreshStorage, 'httponly-cookie');
  assert.equal(auth.token.cookieSameSite, 'Strict');
  assert.equal(auth.token.cookieSecure, true);
  // The allowlist is only worth having if something fails when it grows a token.
  assert.deepEqual(auth.persistableKeys, ['lastSellerId']);

  const withToken = {
    ...VENDOR_CONSOLE,
    auth: { ...auth, persistableKeys: [...auth.persistableKeys, 'accessToken'] },
  };
  assert.ok(
    assertVendorConsoleContract(withToken).some((error) => error.includes('reads like a credential')),
    'a token-shaped persistable key must fail the contract',
  );

  const inLocalStorage = { ...VENDOR_CONSOLE, auth: { ...auth, token: { ...auth.token, accessStorage: 'local' } } };
  assert.ok(
    assertVendorConsoleContract(inLocalStorage as never).some((error) => error.includes('never leave memory')),
  );

  const readableCookie = {
    ...VENDOR_CONSOLE,
    auth: { ...auth, token: { ...auth.token, refreshStorage: 'cookie' } },
  };
  assert.ok(assertVendorConsoleContract(readableCookie as never).some((error) => error.includes('httpOnly')));

  // A refresh margin longer than the token it guards would refresh forever.
  const eager = {
    ...VENDOR_CONSOLE,
    auth: { ...auth, token: { ...auth.token, refreshBeforeExpirySecs: auth.token.accessTtlSecs } },
  };
  assert.ok(assertVendorConsoleContract(eager).some((error) => error.includes('refresh margin')));

  // A refusal that names the account is an enumeration oracle.
  const leaky = {
    ...VENDOR_CONSOLE,
    auth: { ...auth, refusals: [...auth.refusals, { id: 'invalid-code' as const, message: 'No such account.' }] },
  };
  assert.ok(assertVendorConsoleContract(leaky).some((error) => error.includes('reveals whether an account exists')));

  assert.equal(vendorAuthMessage('invalid-code'), 'That code did not work. Check it and try again.');
  assert.equal(vendorAuthMessage('nonsense' as never), 'Sign-in failed.');
});

test('minting a webhook credential is owner-only and its secret is shown once', () => {
  const ui = vendorWebhookUiContract();

  assert.equal(ui.urlScheme, 'https');
  assert.equal(ui.secretRevealedOnce, true);

  // The tab mints a credential, so it is owner-only even though every scope on
  // it is capability-gated as well.
  const owner: VendorViewer = { role: 'owner', businessMode: 'standard' };
  assert.ok(ids(vendorSecondaryNav(owner)).includes('webhooks'));
  for (const role of ['manager', 'staff', 'door', 'serviceProvider'] as const) {
    const viewer: VendorViewer = { role, businessMode: 'standard' };
    assert.equal(ids(vendorSecondaryNav(viewer)).includes('webhooks'), false, role);
  }

  // REGISTER creates the row, so it alone has no prior state.
  const register = ui.operations.find((operation) => operation.id === 'REGISTER');
  assert.deepEqual(register?.from, []);
  for (const operation of ui.operations.filter((item) => item.id !== 'REGISTER')) {
    assert.ok(operation.from.length > 0, operation.id);
  }

  // Rotating a disabled endpoint reactivates it, so dropping RESUME alone still
  // leaves a way back. Recoverability is a property of the set, not one row.
  const withoutResume = {
    ...VENDOR_CONSOLE,
    webhookUi: { ...ui, operations: ui.operations.filter((operation) => operation.id !== 'RESUME') },
  };
  assert.deepEqual(
    assertVendorConsoleContract(withoutResume).filter((error) => error.includes('recoverable')),
    [],
  );

  const stuck = {
    ...VENDOR_CONSOLE,
    webhookUi: {
      ...ui,
      operations: ui.operations.filter(
        (operation) => !(operation.from.includes('DISABLED') && operation.to === 'ACTIVE'),
      ),
    },
  };
  assert.ok(assertVendorConsoleContract(stuck).some((error) => error.includes('must be recoverable')));

  const http = { ...VENDOR_CONSOLE, webhookUi: { ...ui, urlScheme: 'http' } };
  assert.ok(assertVendorConsoleContract(http).some((error) => error.includes('must be https')));
});

test('the create wizard starts by asking what is sold and ends at publish', () => {
  const steps = ids(VENDOR_CONSOLE.createBookableSteps);
  assert.equal(steps[0], 'type');
  assert.equal(steps[steps.length - 1], 'publish');
  assert.equal(steps.length, 8);
  assert.ok(getVendorBookableType('table'));
  assert.equal(getVendorBookableType('nope'), undefined);
});

test('the onboarding guards reject the shapes that stranded a business', () => {
  const onboarding = VENDOR_CONSOLE.onboarding;

  // A requirement with no step is the dead rail itself: the business is told
  // what is missing and given nowhere to supply it.
  const orphaned = {
    ...VENDOR_CONSOLE,
    onboarding: { ...onboarding, steps: onboarding.steps.filter((step) => step.requirement !== 'payoutAccount') },
  };
  assert.ok(
    assertVendorConsoleContract(orphaned).some((error) => error.includes('payoutAccount blocks ACTIVE with no step')),
    'a requirement with no step must fail the contract',
  );

  // The cottage half of the same bug: a step whose only home is a tab that
  // cottage businesses cannot open, with nothing named for them instead.
  const strandedInTab = {
    ...VENDOR_CONSOLE,
    onboarding: {
      ...onboarding,
      steps: onboarding.steps.map((step) =>
        step.requirement === 'activeLocation' ? { ...step, cottageKind: undefined } : step,
      ),
    },
  };
  assert.ok(
    assertVendorConsoleContract(strandedInTab).some((error) => error.includes('names no cottage default')),
    'a standard-only step with no cottage default must fail the contract',
  );

  const unknownKind = {
    ...VENDOR_CONSOLE,
    onboarding: {
      ...onboarding,
      steps: onboarding.steps.map((step) =>
        step.requirement === 'activeLocation' ? { ...step, cottageKind: 'teleport' } : step,
      ),
    },
  };
  assert.ok(
    assertVendorConsoleContract(unknownKind as never).some((error) => error.includes('unknown location kind')),
  );

  const invented = {
    ...VENDOR_CONSOLE,
    onboarding: {
      ...onboarding,
      steps: [...onboarding.steps, { ...onboarding.steps[0], requirement: 'vibes' }],
    },
  };
  assert.ok(assertVendorConsoleContract(invented).some((error) => error.includes('closes no requirement')));

  // PENDING is the platform's turn, so offering a checklist there would invite a
  // vendor to fix something that is not what is holding them up.
  const busywork = {
    ...VENDOR_CONSOLE,
    onboarding: {
      ...onboarding,
      states: onboarding.states.map((item) => (item.state === 'PENDING' ? { ...item, checklist: true } : item)),
    },
  };
  assert.ok(assertVendorConsoleContract(busywork).some((error) => error.includes('nothing to tick off')));

  const silent = {
    ...VENDOR_CONSOLE,
    onboarding: { ...onboarding, states: onboarding.states.filter((item) => item.state !== 'SUSPENDED') },
  };
  assert.ok(assertVendorConsoleContract(silent).some((error) => error.includes('no onboarding copy for a SUSPENDED')));
});
