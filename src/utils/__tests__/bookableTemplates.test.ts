import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyBookableTemplateToForm,
  assertBookableTemplateCatalog,
  bookableHoldExpiresAtMs,
  bookableHoldStateAt,
  bookableTierCandidates,
  bookableTierFloorCents,
  bookableTemplateToClipLocalService,
  canActorExecute,
  canStaffExecute,
  discoverCategoriesForDomain,
  discoverCategoryForTemplate,
  getDiscoverCategory,
  listDiscoverCategories,
  templatesForDiscoverCategory,
  entityCanExecute,
  getBookableSeller,
  getBookableStaffRole,
  listBookableStaffRoles,
  staffRoleCan,
  canRunSeatOperation,
  canRunSellerOperation,
  effectiveSeatCapabilities,
  grantableStaffRoles,
  sellerStateAllows,
  unmetSellerRequirements,
  getBookableDerivedObject,
  listBookableEntityCapabilities,
  bookableTemplateToDiscoverProjection,
  bookableTemplateToFormSeed,
  bookableTemplateToServiceFormFields,
  canExecuteSkuCapability,
  canTransitionSku,
  getBookableTemplate,
  getBookableTemplateCatalog,
  listBookableDomains,
  listBookableTemplates,
  resolveBookableTier,
} from '../bookableTemplates.ts';

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), '../../../contracts/bookable-templates.json');

test('bookable template catalog stays a SKU printer, not a new noun set', () => {
  const errors = assertBookableTemplateCatalog();
  assert.deepEqual(errors, []);
  const catalog = getBookableTemplateCatalog();
  assert.equal(catalog.native.swiftType, 'BookableTemplateCatalog');
  assert.equal(catalog.native.kotlinType, 'BookableTemplateCatalog');
  assert.equal(catalog.native.decodeKeyStrategy, 'useDefaultKeys');
  assert.equal(catalog.version, 8);
  assert.ok(catalog.coreNouns.includes('SKU'));
  assert.ok(catalog.coreNouns.includes('STALL'));
  assert.ok(catalog.coreNouns.includes('STAY'));
  assert.equal(listBookableDomains().length, catalog.domains.length);
  assert.ok(listBookableTemplates().length >= 12);
});

test('webpage, Swift, and Kotlin share camelCase keys from the same JSON file', () => {
  const raw = JSON.parse(readFileSync(catalogPath, 'utf8')) as { templates: Array<Record<string, unknown>> };
  const first = raw.templates[0];
  for (const key of ['priceCents', 'durationMins', 'maxGuests', 'patchRequired', 'includedHighlights', 'clipCategory', 'discoverType', 'timing']) {
    assert.ok(key in first, `missing camelCase key ${key}`);
  }
  assert.equal('price_cents' in first, false);
  assert.equal('etaLabel' in first, false);
  assert.deepEqual(Object.keys(first.timing as object), ['etaKind', 'etaLabel', 'holdSecs']);
  const canonical = readFileSync(catalogPath);
  const appCopy = readFileSync(join(dirname(catalogPath), '../ios/App/App/bookable-templates.json'));
  const clipCopy = readFileSync(join(dirname(catalogPath), '../ios/App/Clip/bookable-templates.json'));
  const androidCopy = readFileSync(join(dirname(catalogPath), '../android/bookable-templates.json'));
  assert.equal(canonical.equals(appCopy), true);
  assert.equal(canonical.equals(clipCopy), true);
  assert.equal(canonical.equals(androidCopy), true);
});

test('table-for-4 seeds the webpage create form without inventing a TABLE_OBJECT', () => {
  const template = getBookableTemplate('dining.table-for-4');
  assert.ok(template);
  assert.equal(template.noun, 'SKU');
  assert.equal(template.schema, 'table');
  assert.deepEqual(template.capabilities.slice(0, 3), ['RESERVE', 'BOOK', 'PAY']);
  const seed = bookableTemplateToFormSeed(template);
  assert.equal(seed.title, 'Table for 4');
  assert.equal(seed.category, 'Catering');
  assert.equal(seed.tier, 'platinum');
  assert.equal(seed.priceDollars, '65.00');
  assert.equal(seed.durationMins, '90');
  assert.equal(seed.maxGuests, '4');
  assert.equal(seed.status, 'draft');
  const form = applyBookableTemplateToForm({ highlightDraft: 'keep-me', extra: true }, template);
  assert.equal(form.title, 'Table for 4');
  assert.equal(form.highlightDraft, '');
  assert.equal(form.extra, true);
  assert.deepEqual(bookableTemplateToServiceFormFields(template).includedHighlights, ['Party of 4', 'Hold 15 min', 'Invite Circle']);
});

test('green local service never dispatches an ETA and still books as a SKU', () => {
  const template = getBookableTemplate('green.local-service');
  assert.ok(template);
  assert.equal(template.tier, 'green');
  assert.equal(template.timing.etaKind, 'none');
  assert.equal(template.timing.etaLabel, '');
  assert.equal(template.timing.holdSecs, 0);
  assert.equal(bookableTemplateToFormSeed(template).etaLabel, '');
  assert.ok(template.capabilities.includes('BOOK'));
});

test('PASS is a derived object, not an invented core noun', () => {
  const catalog = getBookableTemplateCatalog();
  assert.equal(catalog.coreNouns.length, 10);
  assert.deepEqual(catalog.coreNouns, ['PIN', 'HANG', 'HOST', 'ROOM', 'STAY', 'STALL', 'SELLER', 'SKU', 'PERSON', 'CIRCLE']);
  assert.equal(catalog.coreNouns.includes('PASS' as never), false);

  const pass = getBookableDerivedObject('PASS');
  assert.ok(pass);
  assert.deepEqual(pass.states, ['ISSUED', 'VERIFIED', 'ADMITTED', 'EXPIRED', 'REVOKED']);
  assert.deepEqual(pass.consumedBy, ['VERIFY', 'CHECK_IN']);
  assert.ok(pass.issuedBy.includes('RSVP'));
  for (const noun of pass.issuedFrom) {
    assert.ok(catalog.coreNouns.includes(noun), `${noun} must be a core noun`);
  }
  for (const template of listBookableTemplates()) {
    assert.ok(catalog.coreNouns.includes(template.noun), `${template.id} noun must be a core noun`);
  }
});

test('an entity declares what it can do, so a guest can never publish inventory', () => {
  const catalog = getBookableTemplateCatalog();
  assert.deepEqual(listBookableEntityCapabilities('HOST'), ['CREATE_HANG', 'INVITE', 'BOOK', 'VERIFY', 'PUBLISH', 'SHARE', 'CANCEL']);
  assert.ok(listBookableEntityCapabilities('SELLER').includes('SELL'));
  assert.ok(entityCanExecute('HOST', 'CREATE_HANG'));
  assert.equal(entityCanExecute('PERSON', 'CREATE_HANG'), false);
  assert.equal(entityCanExecute('PERSON', 'PUBLISH'), false);
  assert.equal(entityCanExecute('SELLER', 'RSVP'), false);
  assert.equal(entityCanExecute('PIN', 'BOOK'), false);

  const table = getBookableTemplate('dining.table-for-4');
  assert.ok(table);
  const declared = [...table.capabilities];
  assert.equal(canActorExecute('PERSON', 'RESERVE', 'PUBLISHED', declared), true);
  assert.equal(canActorExecute('PERSON', 'PUBLISH', 'DRAFT', declared), false);
  assert.equal(canActorExecute('SELLER', 'RSVP', 'PUBLISHED', declared), false);
  assert.equal(canActorExecute('SELLER', 'CANCEL', 'RESERVED', declared), true);
  assert.equal(canActorExecute('PERSON', 'RESERVE', 'CANCELLED', declared), false);

  const claimed = new Set(catalog.entityCapabilities.flatMap((row) => row.capabilities));
  for (const capability of catalog.capabilities) {
    assert.ok(claimed.has(capability.id), `${capability.id} is unreachable: no entity declares it`);
  }
  assert.ok(catalog.capabilities.some((item) => item.id === 'CREATE_HANG'));
  assert.equal(catalog.actorRoles.length, 9);
});

test('a staff seat is a subset of the business, never a superset', () => {
  const catalog = getBookableTemplateCatalog();
  const seller = new Set(
    catalog.entityCapabilities.find((row) => row.entity === 'SELLER')?.capabilities ?? [],
  );

  assert.deepEqual(
    listBookableStaffRoles().map((role) => role.id),
    ['owner', 'manager', 'staff', 'door', 'serviceProvider'],
  );

  for (const role of listBookableStaffRoles()) {
    for (const capability of role.capabilities) {
      assert.ok(seller.has(capability), `${role.id} claims ${capability}, which SELLER cannot do`);
    }
  }
  // The owner is the business, so it must hold everything the business holds.
  const owner = getBookableStaffRole('owner');
  for (const capability of seller) {
    assert.ok(owner?.capabilities.includes(capability), `owner is missing ${capability}`);
  }

  // Only the owner moves money back out.
  assert.equal(staffRoleCan('owner', 'REFUND'), true);
  assert.equal(staffRoleCan('manager', 'REFUND'), false);
  assert.equal(staffRoleCan('door', 'REFUND'), false);

  // The door exists to verify passes and to do nothing else.
  assert.deepEqual(getBookableStaffRole('door')?.capabilities, ['CHECK_IN', 'VERIFY']);
  assert.equal(getBookableStaffRole('serviceProvider')?.scope, 'assigned');
  assert.equal(getBookableStaffRole('owner')?.scope, 'all');

  const table = getBookableTemplate('dining.table-for-4');
  assert.ok(table);
  const declared = [...table.capabilities];
  assert.equal(canStaffExecute('staff', 'CANCEL', 'RESERVED', declared), true);
  assert.equal(canStaffExecute('door', 'CANCEL', 'RESERVED', declared), false);
  // The SKU state machine still decides after the seat is allowed through.
  assert.equal(canStaffExecute('owner', 'CANCEL', 'CANCELLED', declared), false);
});

test('a Discover category is a lens over SKUs, not a product of its own', () => {
  const catalog = getBookableTemplateCatalog();

  // The rail the consumer app already ships. These ids are CardType values, so
  // the contract describes the live rail rather than a second one.
  assert.deepEqual(
    listDiscoverCategories().map((category) => category.id),
    ['boutique_apartment', 'mobility', 'nightlife', 'dining', 'coffee', 'shopping', 'entertainment', 'service', 'fitness', 'parking'],
  );
  // Valet is vendor-gated, so a consumer-only build must not see it.
  assert.equal(getDiscoverCategory('valet')?.vendorGated, true);
  assert.equal(listDiscoverCategories({ includeVendorGated: true }).length, 11);

  // No dead rail: tapping any category must reach something bookable.
  for (const category of listDiscoverCategories({ includeVendorGated: true })) {
    const templates = templatesForDiscoverCategory(category.id);
    assert.ok(templates.length > 0, `${category.id} resolves to nothing`);
    for (const template of templates) {
      // The category is the lens; the SKU underneath is the product.
      assert.equal(template.noun === 'SKU' || template.noun === 'STAY' || template.noun === 'STALL', true);
      assert.ok(category.domains.includes(template.domain), `${template.id} is shown by a rail that disowns it`);
    }
  }

  // No invisible supply: a vendor must never publish into a domain no rail shows.
  for (const domain of catalog.domains) {
    assert.ok(discoverCategoriesForDomain(domain.id).length > 0, `${domain.id} is unreachable`);
  }
});

test('cottage sits under Services, alongside wellness and not beside it', () => {
  const services = getDiscoverCategory('service');
  assert.ok(services);
  assert.equal(services.label, 'Services');
  assert.deepEqual(services.domains, ['wellness', 'green']);

  // A home baker and a spa land on the same consumer rail.
  assert.deepEqual(discoverCategoriesForDomain('green').map((category) => category.id), ['service']);
  assert.equal(discoverCategoryForTemplate('green.local-service')?.id, 'service');
  assert.equal(discoverCategoryForTemplate('wellness.massage-60')?.id, 'service');

  // Parking and Valet are different rails even though one domain feeds both.
  assert.deepEqual(discoverCategoriesForDomain('automotive').map((c) => c.id), ['mobility', 'valet']);
  assert.equal(discoverCategoryForTemplate('stall.valet')?.id, 'valet');
  assert.equal(discoverCategoryForTemplate('stall.reserved-parking')?.id, 'parking');
});

test('the five rails that used to resolve to nothing now carry inventory', () => {
  const filled: Record<string, string[]> = {
    mobility: ['automotive.private-transfer', 'automotive.car-rental'],
    coffee: ['coffee.private-room', 'coffee.reserved-table'],
    shopping: ['shopping.personal-shopping'],
    entertainment: ['events.general-admission', 'events.vip-package'],
    fitness: ['fitness.personal-training', 'fitness.group-class'],
  };
  for (const [category, ids] of Object.entries(filled)) {
    assert.deepEqual(templatesForDiscoverCategory(category).map((template) => template.id), ids);
  }

  // A ticket ends in a PASS rather than a new ticket object.
  const ga = getBookableTemplate('events.general-admission');
  assert.ok(ga?.capabilities.includes('CHECK_IN'));
  assert.ok(ga?.capabilities.includes('VERIFY'));
  assert.equal(ga?.patchRequired, true);

  // A rented car is still a STALL, not a new vehicle noun.
  assert.equal(getBookableTemplate('automotive.car-rental')?.noun, 'STALL');

  // Only a real dispatch may claim a moving ETA.
  assert.equal(getBookableTemplate('automotive.private-transfer')?.timing.etaKind, 'dispatch');
  assert.equal(getBookableTemplate('automotive.car-rental')?.timing.etaKind, 'readiness');
  assert.equal(getBookableTemplate('fitness.group-class')?.timing.etaKind, 'none');
});

test('the native Discover feed reads its rail from the contract, not its own list', () => {
  const clientPath = join(dirname(fileURLToPath(import.meta.url)), '../../../ios/App/App/BytspotAPIClient.swift');
  const swift = readFileSync(clientPath, 'utf8');

  // The rail and its minimum counts were hand-kept here and drifted: Services
  // lost its feed while Cottage vendors were publishing into it.
  assert.equal(swift.includes('minimumCategoryFeedCounts'), false, 'the hardcoded feed count list is back');
  assert.match(swift, /discoverFeedCategories/);
  assert.match(swift, /visibleDiscoverCategories\(\)\.map \{ \(\$0\.id, \$0\.minimumFeedCount\) \}/);
  assert.match(swift, /for \(type, target\) in discoverFeedCategories/);

  // Services is the rail that went missing, so it must carry a real count.
  assert.equal(getDiscoverCategory('service')?.minimumFeedCount, 3);
  for (const category of listDiscoverCategories({ includeVendorGated: true })) {
    assert.ok(category.minimumFeedCount >= 1, `${category.id} has no minimum feed count`);
  }
});

test('etaKind separates the four meanings the single ETA string used to carry', () => {
  const kinds = Object.fromEntries(listBookableTemplates().map((t) => [t.id, t.timing.etaKind]));
  assert.equal(kinds['stall.valet'], 'dispatch');
  assert.equal(kinds['stall.reserved-parking'], 'hold');
  assert.equal(kinds['stay.hotel-room'], 'policy');
  assert.equal(kinds['wellness.massage-60'], 'nextSlot');
  assert.equal(kinds['dining.table-for-2'], 'readiness');
  assert.equal(kinds['green.local-service'], 'none');
  const catalog = getBookableTemplateCatalog();
  for (const template of listBookableTemplates()) {
    assert.ok(catalog.etaKinds.includes(template.timing.etaKind), `${template.id} unknown etaKind`);
    assert.equal(template.timing.etaKind === 'none', template.tier === 'green');
  }
});

test('an expired hold returns the SKU to PUBLISHED instead of stranding inventory', () => {
  assert.equal(canTransitionSku('RESERVED', 'PUBLISHED'), true);
  assert.equal(canTransitionSku('RESERVED', 'CONFIRMED'), true);
  assert.equal(canTransitionSku('PUBLISHED', 'CONFIRMED'), false);

  const table = getBookableTemplate('dining.table-for-4');
  assert.ok(table);
  assert.equal(table.timing.holdSecs, 900);
  assert.equal(bookableHoldExpiresAtMs(table, 1_000), 901_000);
  assert.equal(bookableHoldStateAt(table, 0, 899_999), 'RESERVED');
  assert.equal(bookableHoldStateAt(table, 0, 900_000), 'PUBLISHED');

  const valet = getBookableTemplate('stall.valet');
  assert.ok(valet);
  assert.equal(bookableHoldExpiresAtMs(valet, 0), null);
  assert.equal(bookableHoldStateAt(valet, 0, 9_999_999), 'RESERVED');

  for (const template of listBookableTemplates()) {
    if (template.capabilities.includes('RESERVE')) {
      assert.ok(template.timing.holdSecs > 0, `${template.id} reserves without a hold window`);
    }
    if (template.timing.etaKind === 'hold') {
      assert.ok(template.timing.holdSecs > 0, `${template.id} labels a hold it does not model`);
    }
  }
});

test('a cheap Platinum SKU is never demoted to Green by price alone', () => {
  assert.equal(bookableTierFloorCents('black'), 45000);
  assert.equal(bookableTierFloorCents('platinum'), 5000);
  assert.equal(bookableTierFloorCents('green'), 500);

  assert.deepEqual(bookableTierCandidates('Parking'), ['platinum']);
  assert.deepEqual(bookableTierCandidates('Events'), ['black', 'platinum']);
  assert.deepEqual(bookableTierCandidates('Local Services'), ['green']);
  assert.deepEqual(bookableTierCandidates('Wellness'), ['black', 'platinum', 'green']);

  assert.equal(resolveBookableTier({ priceCents: 1200, category: 'Parking' }), 'platinum');
  assert.equal(resolveBookableTier({ priceCents: 2500, category: 'Events' }), 'platinum');
  assert.equal(resolveBookableTier({ priceCents: 4500, category: 'Catering' }), 'platinum');
  assert.equal(resolveBookableTier({ priceCents: 350000, category: 'Events' }), 'black');
  assert.equal(resolveBookableTier({ priceCents: 85000, category: 'Wellness' }), 'black');
  assert.equal(resolveBookableTier({ priceCents: 13500, category: 'Wellness' }), 'platinum');
  assert.equal(resolveBookableTier({ priceCents: 2500, category: 'Local Services' }), 'green');

  assert.equal(resolveBookableTier({ tier: 'green', priceCents: 350000, category: 'Events' }), 'green');
  assert.equal(resolveBookableTier({ priceCents: 1200, category: null }), 'green');
  assert.equal(resolveBookableTier({ priceCents: 1200, category: 'Unlisted Category' }), 'green');

  for (const template of listBookableTemplates()) {
    assert.equal(
      resolveBookableTier({ priceCents: template.priceCents, category: template.category }),
      template.tier,
      `${template.id} does not round-trip to its declared tier`,
    );
  }
});

test('reserved parking stays a STALL SKU and projects to ClipLocalService + Discover', () => {
  const template = getBookableTemplate('stall.reserved-parking');
  assert.ok(template);
  assert.equal(template.noun, 'STALL');
  const clip = bookableTemplateToClipLocalService(template);
  assert.equal(clip.id, 'stall.reserved-parking');
  assert.equal(clip.action, 'Reserve Spot');
  assert.equal(clip.iconName, 'car.side.lock.fill');
  assert.equal(clip.category, 'parking');
  assert.equal(clip.amountCents, 1200);
  assert.equal(clip.source, 'curated');
  const discover = bookableTemplateToDiscoverProjection(template);
  assert.equal(discover.type, 'parking');
  assert.equal(discover.ctaText, 'Reserve Spot');
  assert.equal(discover.availableSpots, 1);
});

test('the contract guards actually fire when the catalog regresses', () => {
  type Catalog = ReturnType<typeof getBookableTemplateCatalog>;
  const failsWith = (mutate: (draft: Catalog) => void, needle: string) => {
    const draft = JSON.parse(JSON.stringify(getBookableTemplateCatalog())) as Catalog;
    mutate(draft);
    const errors = assertBookableTemplateCatalog(draft);
    assert.ok(
      errors.some((error) => error.includes(needle)),
      `expected an error containing ${needle}, got ${JSON.stringify(errors)}`,
    );
  };

  failsWith((draft) => {
    const reserved = draft.skuTransitions.find((row) => row.from === 'RESERVED');
    if (reserved) reserved.to = reserved.to.filter((state) => state !== 'PUBLISHED');
  }, 'RESERVED -> PUBLISHED');

  failsWith((draft) => {
    const table = draft.templates.find((item) => item.id === 'dining.table-for-4');
    if (table) table.timing.holdSecs = 0;
  }, 'declares RESERVE so it must set holdSecs');

  failsWith((draft) => {
    const parking = draft.templates.find((item) => item.id === 'stall.reserved-parking');
    if (parking) parking.timing.holdSecs = 0;
  }, 'etaKind hold requires holdSecs');

  failsWith((draft) => {
    const green = draft.templates.find((item) => item.id === 'green.local-service');
    if (green) green.timing = { etaKind: 'dispatch', etaLabel: 'ETA 5 min', holdSecs: 0 };
  }, 'Green templates must not dispatch an ETA');

  failsWith((draft) => {
    const hotel = draft.templates.find((item) => item.id === 'stay.hotel-room');
    if (hotel) hotel.timing.etaKind = 'whenever' as never;
  }, 'unknown etaKind');

  failsWith((draft) => {
    const parking = draft.templates.find((item) => item.id === 'stall.reserved-parking');
    if (parking) parking.tier = 'green';
  }, 'resolves to');

  failsWith((draft) => {
    draft.tierFloors = { platinum: 5000, green: 500 } as never;
  }, 'tierFloors is missing black');

  failsWith((draft) => {
    draft.coreNouns = [...draft.coreNouns, 'PASS' as never];
  }, 'PASS is issued by an action');

  failsWith((draft) => {
    draft.entityCapabilities = draft.entityCapabilities.filter((row) => row.entity !== 'HOST');
  }, 'CREATE_HANG is unreachable');

  failsWith((draft) => {
    const person = draft.entityCapabilities.find((row) => row.entity === 'PERSON');
    if (person) person.capabilities = [...person.capabilities, 'PUBLISH'];
  }, 'PERSON must not be able to PUBLISH');

  failsWith((draft) => {
    const seller = draft.entityCapabilities.find((row) => row.entity === 'SELLER');
    if (seller) seller.capabilities = seller.capabilities.filter((item) => item !== 'PUBLISH');
  }, 'SELLER must be able to PUBLISH');

  failsWith((draft) => {
    draft.entityCapabilities = [...draft.entityCapabilities, { entity: 'PIN', capabilities: ['TELEPORT' as never] }];
  }, 'unknown capability TELEPORT');

  failsWith((draft) => {
    const pass = draft.derivedObjects.find((item) => item.id === 'PASS');
    if (pass) pass.issuedFrom = ['PASS' as never];
  }, 'issued from unknown noun');

  failsWith((draft) => {
    const book = draft.capabilities.find((item) => item.id === 'BOOK');
    if (book) book.appliesTo = ['TABLE_OBJECT' as never];
  }, 'applies to unknown object TABLE_OBJECT');

  failsWith((draft) => {
    const door = draft.staffRoles.find((role) => role.id === 'door');
    if (door) door.capabilities = [...door.capabilities, 'REFUND'];
  }, 'door must never be able to REFUND');

  failsWith((draft) => {
    const door = draft.staffRoles.find((role) => role.id === 'door');
    if (door) door.capabilities = ['CHECK_IN'];
  }, 'door must be able to VERIFY');

  failsWith((draft) => {
    const staff = draft.staffRoles.find((role) => role.id === 'staff');
    if (staff) staff.capabilities = [...staff.capabilities, 'RSVP'];
  }, 'which SELLER cannot do');

  failsWith((draft) => {
    const owner = draft.staffRoles.find((role) => role.id === 'owner');
    if (owner) owner.capabilities = owner.capabilities.filter((item) => item !== 'REFUND');
  }, 'owner must hold every SELLER capability');

  failsWith((draft) => {
    draft.staffRoles = draft.staffRoles.filter((role) => role.id !== 'owner');
  }, 'staffRoles must include owner');

  failsWith((draft) => {
    draft.templates = draft.templates.filter((template) => template.discoverType !== 'coffee');
  }, 'discover category coffee resolves to no bookable inventory');

  failsWith((draft) => {
    draft.discoverCategories = draft.discoverCategories.filter((category) => category.id !== 'fitness');
  }, 'domain fitness is not reachable from any discover category');

  failsWith((draft) => {
    const services = draft.discoverCategories.find((category) => category.id === 'service');
    if (services) services.domains = ['wellness'];
  }, 'domain green is not reachable');

  failsWith((draft) => {
    const template = draft.templates.find((item) => item.id === 'coffee.private-room');
    if (template) template.discoverType = 'dining';
  }, 'does not claim domain coffee');

  failsWith((draft) => {
    const services = draft.discoverCategories.find((category) => category.id === 'service');
    if (services) services.minimumFeedCount = 0;
  }, 'needs a minimumFeedCount of at least 1');

  failsWith((draft) => {
    const passed = draft.availability.slotTransitions.find((transition) => transition.from === 'PASSED');
    if (passed) passed.to = ['OPEN'];
  }, 'PASSED must be terminal');

  failsWith((draft) => {
    const release = draft.availability.operations.find((operation) => operation.id === 'RELEASE');
    if (release) release.from = ['OPEN'];
  }, 'moves OPEN to OPEN, which is not a slot transition');

  failsWith((draft) => {
    const block = draft.availability.operations.find((operation) => operation.id === 'BLOCK_SLOT');
    if (block) block.requiresCapability = 'RSVP';
  }, 'requires RSVP, which SELLER cannot do');

  failsWith((draft) => {
    const stay = draft.availability.domainDefaults.find((item) => item.domain === 'stay');
    if (stay) stay.slotMinutes = 60;
  }, 'is daily so slotMinutes must be 1440');

  // The TypeScript domain union silently drifted from the JSON once, because the
  // catalog is cast rather than inferred. Both directions are now guarded.
  failsWith((draft) => {
    draft.domains = draft.domains.filter((domain) => domain.id !== 'fitness');
  }, 'BookableDomainId declares fitness, which the catalog does not define');

  failsWith((draft) => {
    draft.domains = [...draft.domains, { id: 'aviation' as never, label: 'Aviation', noun: 'SKU', variants: ['charter'] }];
  }, 'domain aviation is missing from BookableDomainId');

  // A Location that stops being a PIN stops being the thing a guest is sent to.
  failsWith((draft) => {
    draft.locations.derivesFrom = 'ROOM';
  }, 'locations must derive from PIN');

  failsWith((draft) => {
    draft.locations.publishableStates = ['ACTIVE', 'DRAFT'];
  }, 'a draft or closed location must not be able to back published inventory');

  failsWith((draft) => {
    const visiting = draft.locations.kinds.find((kind) => kind.id === 'visiting');
    if (visiting) visiting.requiresRadius = false;
  }, 'travels to the guest so it must require a radius');

  failsWith((draft) => {
    draft.locations.domainKinds = draft.locations.domainKinds.filter((row) => row.domain !== 'dining');
  }, 'domain dining has no location kind and so cannot say where it is');

  failsWith((draft) => {
    draft.locations.etaKindFulfillment = draft.locations.etaKindFulfillment.filter((row) => row.etaKind !== 'dispatch');
  }, 'etaKind dispatch has no declared fulfillment');

  // Demand resolving to anything but a SKU would be a second booking path.
  failsWith((draft) => {
    draft.demand.resolvesTo = 'STAY';
  }, 'demand must resolve to a SKU');

  failsWith((draft) => {
    draft.demand.matchRules = draft.demand.matchRules.filter((rule) => rule.id !== 'capacity');
  }, 'demand matching must include the capacity rule');

  failsWith((draft) => {
    draft.demand.matchRules = [...draft.demand.matchRules].reverse();
  }, 'the capacity rule must be evaluated last');

  failsWith((draft) => {
    const rule = draft.demand.matchRules.find((item) => item.id === 'location');
    if (rule) rule.missReason = '';
  }, 'match rule location needs a reason a vendor can act on');

  failsWith((draft) => {
    draft.demand.actionableStates = ['OPEN', 'BOOKED'];
  }, 'demand state BOOKED cannot be both terminal and actionable');

  failsWith((draft) => {
    const offer = draft.demand.operations.find((operation) => operation.id === 'OFFER');
    if (offer) offer.requiresCapability = 'RSVP';
  }, 'demand operation OFFER requires RSVP, which SELLER cannot do');

  failsWith((draft) => {
    const booked = draft.demand.transitions.find((row) => row.from === 'BOOKED');
    if (booked) booked.to = ['OPEN'];
  }, 'demand state BOOKED must be terminal');

  // SELLER gaining a lifecycle must not turn it into a second noun.
  failsWith((draft) => {
    draft.seller.noun = 'HOST';
  }, 'seller must be the SELLER noun, not a new one');

  failsWith((draft) => {
    draft.seller.identity.publishableStates = ['ACTIVE', 'PENDING'];
  }, 'only an ACTIVE seller may back published inventory');

  failsWith((draft) => {
    draft.seller.identity.consoleStates.push('CLOSED');
  }, 'closed seller CLOSED must not keep console access');

  // The ceiling is what makes a seat a subset of the business, so it has to bite.
  failsWith((draft) => {
    const suspended = draft.seller.identity.stateCapabilities.find((row) => row.state === 'SUSPENDED');
    if (suspended) suspended.allows = [...suspended.allows, 'SELL'];
  }, 'a SUSPENDED seller must not be able to SELL');

  failsWith((draft) => {
    const suspended = draft.seller.identity.stateCapabilities.find((row) => row.state === 'SUSPENDED');
    if (suspended) suspended.allows = ['CHECK_IN'];
  }, 'a SUSPENDED seller must still be able to REFUND');

  failsWith((draft) => {
    const closed = draft.seller.identity.stateCapabilities.find((row) => row.state === 'CLOSED');
    if (closed) closed.allows = ['VERIFY'];
  }, 'a CLOSED seller must allow nothing');

  failsWith((draft) => {
    const draftState = draft.seller.identity.stateCapabilities.find((row) => row.state === 'DRAFT');
    if (draftState) draftState.allows = ['SELL'];
  }, 'a DRAFT seller must not be able to SELL');

  failsWith((draft) => {
    draft.seller.identity.stateCapabilities = draft.seller.identity.stateCapabilities.filter(
      (row) => row.state !== 'PENDING',
    );
  }, 'seller state PENDING declares no capability ceiling');

  // A vendor seat must never be able to approve or reinstate its own business.
  failsWith((draft) => {
    const approve = draft.seller.identity.operations.find((item) => item.id === 'APPROVE_SELLER');
    if (approve) approve.actor = 'seller';
  }, 'makes a business live without the platform');

  failsWith((draft) => {
    const submit = draft.seller.identity.operations.find((item) => item.id === 'SUBMIT_SELLER');
    if (submit) submit.requiresRole = 'manager';
  }, 'seller operation SUBMIT_SELLER must be owner-only');

  failsWith((draft) => {
    const submit = draft.seller.identity.operations.find((item) => item.id === 'SUBMIT_SELLER');
    if (submit) submit.to = 'SUSPENDED';
  }, 'which is not a transition');

  failsWith((draft) => {
    draft.seller.identity.requirements = draft.seller.identity.requirements.filter(
      (item) => item.blocks !== 'ACTIVE',
    );
  }, 'going live must require something, or approval means nothing');

  // A seat that is not ACTIVE must carry nothing at all.
  failsWith((draft) => {
    draft.seller.seats.grantingStates = ['ACTIVE', 'INVITED'];
  }, 'only an ACTIVE seat may grant capability');

  failsWith((draft) => {
    draft.seller.seats.unrevocableRole = 'manager';
  }, 'the owner seat is the one that must not be revocable');

  failsWith((draft) => {
    draft.seller.seats.grantsFrom = 'vendorRoles';
  }, 'seats must grant from staffRoles, not a parallel role list');

  failsWith((draft) => {
    draft.seller.seats.inviteExpiryHours = 0;
  }, 'an invite must expire');

  failsWith((draft) => {
    const invite = draft.seller.seats.operations.find((item) => item.id === 'INVITE_SEAT');
    if (invite) invite.to = 'ACTIVE';
  }, 'INVITE_SEAT must produce an INVITED seat, not an active one');

  failsWith((draft) => {
    const accept = draft.seller.seats.operations.find((item) => item.id === 'ACCEPT_SEAT');
    if (accept) accept.from = ['REVOKED'];
  }, 'seat operation ACCEPT_SEAT moves REVOKED -> ACTIVE, which is not a transition');

  // Escalation must be impossible by construction, not by convention. Shrinking
  // the owner is what makes it possible, which is why owner holding everything
  // is load-bearing rather than cosmetic.
  failsWith((draft) => {
    const owner = draft.staffRoles.find((role) => role.id === 'owner');
    if (owner) owner.capabilities = owner.capabilities.filter((item) => item !== 'REFUND' && item !== 'CANCEL');
  }, 'staff role manager can grant owner, which escalates');

  // A business that cannot hire anyone can never grow past its founder.
  failsWith((draft) => {
    const owner = draft.staffRoles.find((role) => role.id === 'owner');
    const door = draft.staffRoles.find((role) => role.id === 'door');
    if (owner && door) owner.capabilities = [...door.capabilities];
  }, 'owner must be able to grant at least one seat');
});

test('SELLER gains a lifecycle without gaining a second identity', () => {
  const { identity, seats } = getBookableSeller();

  assert.equal(getBookableSeller().noun, 'SELLER');
  assert.equal(seats.grantsFrom, 'staffRoles');
  assert.deepEqual(identity.publishableStates, ['ACTIVE']);
  assert.deepEqual(seats.grantingStates, ['ACTIVE']);

  // Every seat operation lands on a state the seat machine actually declares.
  const seatStates = new Set(seats.states);
  for (const operation of seats.operations) {
    assert.ok(seatStates.has(operation.to));
  }

  // Approval belongs to the platform; only the owner steers the business itself.
  for (const operation of identity.operations) {
    if (operation.to === 'ACTIVE') assert.equal(operation.actor, 'platform');
    if (operation.actor === 'seller') assert.equal(operation.requiresRole, 'owner');
    assert.equal(canRunSellerOperation('manager', operation.id, 'DRAFT'), false);
  }
  assert.equal(canRunSellerOperation('owner', 'SUBMIT_SELLER', 'DRAFT'), true);
  assert.equal(canRunSellerOperation('owner', 'APPROVE_SELLER', 'PENDING'), false);

  // A suspended business stops selling without abandoning what it already sold.
  assert.equal(sellerStateAllows('SUSPENDED', 'SELL'), false);
  assert.equal(sellerStateAllows('SUSPENDED', 'PUBLISH'), false);
  assert.equal(sellerStateAllows('SUSPENDED', 'REFUND'), true);
  assert.equal(sellerStateAllows('SUSPENDED', 'CHECK_IN'), true);

  // The owner seat holds everything an ACTIVE business can do, and nothing after.
  const owner = getBookableStaffRole('owner');
  for (const capability of owner?.capabilities ?? []) {
    assert.equal(sellerStateAllows('ACTIVE', capability), true);
    assert.equal(sellerStateAllows('CLOSED', capability), false);
  }

  // Only a seat that can act as the business may hand out a seat at all.
  for (const role of listBookableStaffRoles()) {
    const grantable = grantableStaffRoles(role.id);
    assert.equal(grantable.length > 0, role.capabilities.includes('SELL'), `${role.id} hires wrongly`);
    assert.equal(grantable.includes(role.id), false, `${role.id} can clone itself`);
    if (role.id !== 'owner') assert.equal(grantable.includes('owner'), false, `${role.id} escalates`);
  }

  // A seat's effective set is always a subset of both the role and the business.
  for (const role of listBookableStaffRoles()) {
    for (const state of identity.states) {
      const effective = effectiveSeatCapabilities(role.id, 'ACTIVE', state);
      for (const capability of effective) {
        assert.ok(role.capabilities.includes(capability));
        assert.ok(sellerStateAllows(state, capability));
      }
    }
    // A revoked seat carries nothing regardless of how senior it was.
    assert.deepEqual(effectiveSeatCapabilities(role.id, 'REVOKED', 'ACTIVE'), []);
  }

  assert.equal(canRunSeatOperation({ granter: 'owner', target: 'manager', operation: 'REVOKE_SEAT', state: 'ACTIVE' }), true);
  assert.equal(canRunSeatOperation({ granter: 'owner', target: 'owner', operation: 'REVOKE_SEAT', state: 'ACTIVE' }), false);
  assert.equal(canRunSeatOperation({ granter: 'manager', target: 'manager', operation: 'SUSPEND_SEAT', state: 'ACTIVE' }), false);
  // An invite is the only seat operation with no prior state.
  assert.equal(canRunSeatOperation({ granter: 'owner', target: 'door', operation: 'INVITE_SEAT' }), true);
  assert.equal(canRunSeatOperation({ granter: 'owner', target: 'door', operation: 'INVITE_SEAT', state: 'ACTIVE' }), false);

  assert.deepEqual(unmetSellerRequirements('ACTIVE', []).map((item) => item.id), ['activeLocation', 'payoutAccount']);
  assert.deepEqual(unmetSellerRequirements('ACTIVE', ['activeLocation', 'payoutAccount']), []);
});

test('SKU capabilities and transitions stay capability-based', () => {
  const declared = ['RESERVE', 'BOOK', 'PAY', 'CANCEL', 'INVITE'] as const;
  assert.equal(canExecuteSkuCapability('PUBLISHED', 'RESERVE', [...declared]), true);
  assert.equal(canExecuteSkuCapability('PUBLISHED', 'BOOK', [...declared]), true);
  assert.equal(canExecuteSkuCapability('CONFIRMED', 'CHECK_IN', [...declared]), false);
  assert.equal(canExecuteSkuCapability('CANCELLED', 'BOOK', [...declared]), false);
  assert.equal(canTransitionSku('PUBLISHED', 'RESERVED'), true);
  assert.equal(canTransitionSku('COMPLETED', 'PUBLISHED'), false);
});
