import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ORDERING_RPC_CONTRACT,
  createOrderViaRpc,
  getMenuViaRpc,
  listMenusViaRpc,
  normalizeMenus,
  normalizeOrderQuotes,
  normalizeTableReservations,
  normalizeTableSlots,
  quoteOrderViaRpc,
  searchTablesViaRpc,
} from '../orderingRpc.ts';

test('ordering adapter contract locks menu order and table route names', () => {
  assert.equal(ORDERING_RPC_CONTRACT.routes.menusList, 'menus.list');
  assert.equal(ORDERING_RPC_CONTRACT.routes.menusGet, 'menus.get');
  assert.equal(ORDERING_RPC_CONTRACT.routes.ordersQuote, 'orders.quote');
  assert.equal(ORDERING_RPC_CONTRACT.routes.ordersCreate, 'orders.create');
  assert.equal(ORDERING_RPC_CONTRACT.routes.tablesSearch, 'tables.search');
  assert.deepEqual(ORDERING_RPC_CONTRACT.menuProviders, ['toast', 'square', 'clover', 'bytspot_vendor']);
  assert.deepEqual(ORDERING_RPC_CONTRACT.tableProviders, ['opentable', 'resy', 'sevenrooms', 'bytspot_vendor']);
});

test('normalizeMenus accepts Toast Square Clover style grouped menus', () => {
  const menus = normalizeMenus({ menus: [{ menuId: 'm1', restaurantId: 'v1', restaurantName: 'Broni Home Taste', name: 'Dinner', provider: 'toast', groups: [{ name: 'Mains', items: [{ guid: 'i1', name: 'Jollof Bowl', priceCents: 1800 }] }] }] });
  assert.equal(menus[0].venueName, 'Broni Home Taste');
  assert.equal(menus[0].sections[0].items[0].priceLabel, '$18');
});

test('listMenusViaRpc locks providers and fails closed with no fabricated supply', async () => {
  let inputSeen: unknown;
  const backend = await listMenusViaRpc({
    menus: { list: { query: async (input) => { inputSeen = input; return { menus: [{ id: 'm2', venueId: 'v2', venueName: 'Cafe', title: 'Lunch', sections: [] }] }; } } },
  }, { venueId: 'v2', providers: ['bytspot_vendor'] });

  assert.equal(backend.source, 'backend');
  assert.deepEqual((inputSeen as { providers: string[] }).providers, ['toast', 'square', 'clover', 'bytspot_vendor']);

  // A missing procedure or a throwing backend never invents dishes for a named
  // business: the adapter reports supply is unavailable with no provider claim.
  const missing = await listMenusViaRpc({}, {});
  assert.equal(missing.source, 'unavailable');
  assert.equal(missing.provider, null);
  assert.deepEqual(missing.menus, []);

  const threw = await listMenusViaRpc({ menus: { list: { query: async () => { throw new Error('backend down'); } } } }, {});
  assert.equal(threw.source, 'unavailable');
  assert.deepEqual(threw.menus, []);

  // An empty backend response is unavailable, not a silent fabrication.
  const empty = await getMenuViaRpc({ menus: { get: { query: async () => ({ menus: [] }) } } }, { menuId: 'm9' });
  assert.equal(empty.source, 'unavailable');
  assert.equal(empty.menu, null);
});

test('order and table normalizers support quote create and reservations', async () => {
  assert.equal(normalizeOrderQuotes({ quoteId: 'oq1', provider: 'square', totalCents: 2400 })[0].totalLabel, '$24');
  assert.equal(normalizeTableSlots({ slots: [{ slotId: 'slot1', time: '7:30 PM', covers: 4, provider: 'resy' }] })[0].partySize, 4);
  assert.equal(normalizeTableReservations({ reservationId: 'tab1', status: 'confirmed', code: 'R7' })[0].confirmationCode, 'R7');

  const quote = await quoteOrderViaRpc({ orders: { quote: { query: async () => ({ quoteId: 'oq2', totalLabel: '$30' }) } } }, { venueId: 'v1', menuId: 'm1', items: [{ itemId: 'i1', quantity: 1 }] });
  const order = await createOrderViaRpc({ orders: { create: { mutate: async () => ({ orderId: 'ord1', status: 'confirmed' }) } } }, { venueId: 'v1', menuId: 'm1', quoteId: 'oq2', idempotencyKey: 'idem', items: [] });
  const tables = await searchTablesViaRpc({ tables: { search: { query: async () => ({ slots: [{ id: 's2', timeLabel: '8:00 PM', partySize: 2 }] }) } } }, { venueId: 'v1', partySize: 2, date: '2026-08-01' });

  assert.equal(quote.quotes[0].id, 'oq2');
  assert.equal(order.orders[0].id, 'ord1');
  assert.equal(tables.slots[0].id, 's2');
});