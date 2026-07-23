#!/usr/bin/env node

const base = process.env.BYTSPOT_API_BASE_URL || 'https://bytspot-api.onrender.com';
const strict = process.argv.includes('--strict');

const routes = [
  { name: 'venues.list', input: {}, required: true },
  { name: 'vendors.search', input: { limit: 20, tier: 'platinum' }, required: true },
  { name: 'events.list', input: { limit: 8 }, required: true },
  { name: 'places.nearbySearch', input: { lat: 33.7866, lng: -84.3833, type: 'parking', maxResults: 8 }, required: true },
  { name: 'places.textSearch', input: { query: 'coffee', lat: 33.7866, lng: -84.3833, maxResults: 5 }, required: true },
  { name: 'native.bootstrap', input: {}, required: true },
  { name: 'live.bestValue', input: { productType: 'any', lat: 33.7866, lng: -84.3833, durationHours: 2, limit: 4, strict: false }, required: true },
];

function unwrap(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ('result' in value) return unwrap(value.result);
    if ('data' in value) return unwrap(value.data && value.data.json !== undefined ? value.data.json : value.data);
  }
  return value;
}

function countArrays(value, out = {}) {
  if (Array.isArray(value)) {
    out._arrays = (out._arrays || 0) + 1;
    out._items = (out._items || 0) + value.length;
    value.forEach((item) => countArrays(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child)) out[key] = Math.max(out[key] || 0, child.length);
      countArrays(child, out);
    }
  }
  return out;
}

async function probe(route) {
  const query = new URLSearchParams({ input: JSON.stringify(route.input) }).toString();
  const response = await fetch(base + '/trpc/' + route.name + '?' + query, { headers: { accept: 'application/json' } });
  let payload = null;
  try { payload = await response.json(); } catch {}
  const data = unwrap(payload);
  const counts = payload ? countArrays(data) : {};
  const error = payload && payload.error ? payload.error : null;
  return {
    name: route.name,
    required: route.required,
    status: response.status,
    ok: response.ok,
    counts,
    errorCode: error && error.code !== undefined ? String(error.code) : '',
    errorMessage: error && error.message ? String(error.message).slice(0, 140) : '',
  };
}

const results = [];
for (const route of routes) {
  try {
    results.push(await probe(route));
  } catch (error) {
    results.push({ name: route.name, required: route.required, status: 0, ok: false, counts: {}, errorCode: 'NETWORK', errorMessage: error && error.name ? error.name : 'request failed' });
  }
}

for (const result of results) {
  const counts = Object.keys(result.counts).length ? JSON.stringify(result.counts) : '{}';
  const error = result.ok ? '' : ' errorCode=' + result.errorCode + ' message=' + result.errorMessage;
  console.log(result.name + ': status=' + result.status + ' ok=' + result.ok + ' required=' + result.required + ' counts=' + counts + error);
}

const failed = results.filter((result) => result.required && !result.ok);
if (failed.length > 0) {
  console.log('native live adapter smoke: ' + failed.length + ' required feed(s) not returning 200');
  if (strict) process.exitCode = 1;
} else {
  console.log('native live adapter smoke: all required feeds returned 200');
}