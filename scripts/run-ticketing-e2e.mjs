import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'test-results', 'ticketing-e2e');
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const MOCK_VENUES = [
  { id: 'test-venue-1', name: 'The Rooftop Bar', slug: 'the-rooftop-bar', address: '123 Peachtree St NE', lat: 33.789, lng: -84.384, category: 'bar', imageUrl: null, entryType: 'paid', entryPrice: '$22', crowd: { level: 3, label: 'Lively', waitMins: 10, recordedAt: new Date().toISOString() }, parking: { totalAvailable: 5, spots: [] } },
  { id: 'test-venue-2', name: 'Midtown Grill', slug: 'midtown-grill', address: '456 Spring St NW', lat: 33.785, lng: -84.388, category: 'restaurant', imageUrl: null, crowd: { level: 2, label: 'Moderate', waitMins: 5, recordedAt: new Date().toISOString() }, parking: { totalAvailable: 3, spots: [] } },
];

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon' };

function createStaticServer() {
  return createServer(async (req, res) => {
    try {
      const reqPath = (req.url || '/').split('?')[0] || '/';
      const filePath = path.join(DIST, reqPath === '/' ? 'index.html' : reqPath.replace(/^\//, ''));
      let resolvedPath = filePath;
      let data;
      try {
        data = await readFile(filePath);
      } catch {
        resolvedPath = path.join(DIST, 'index.html');
        data = await readFile(resolvedPath);
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(resolvedPath)] || 'text/html' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

async function mockApis(page) {
  await page.addInitScript((mockVenues) => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input, init);

      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const results = procedures.map((procedure) => {
        if (procedure.includes('venues.list')) return { result: { data: { venues: mockVenues } } };
        if (procedure.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (procedure.includes('subscription.status')) return { result: { data: { isPremium: false } } };
        if (procedure.includes('social.venueCheckins')) return { result: { data: { items: [] } } };
        if (procedure.includes('venues.getBySlug')) return { result: { data: { crowd: { history: [] } } } };
        if (procedure.includes('venues.getSimilar')) return { result: { data: { similar: [] } } };
        return { result: { data: null } };
      });
      const payload = procedures.length === 1 ? results[0] : results;
      console.warn(`[mock-trpc] ${url}`);

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    class MockEventSource {
      constructor(url) {
        this.url = url;
        this.onmessage = null;
        this.onerror = null;
        console.warn(`[mock-sse] ${url}`);
        window.setTimeout(() => {
          this.onmessage?.({ data: JSON.stringify({ type: 'snapshot', venues: [] }) });
        }, 0);
      }
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }

    window.EventSource = MockEventSource;
  }, MOCK_VENUES);
}

async function waitForVisible(locator, timeout = 10000) {
  await locator.waitFor({ state: 'visible', timeout });
}

async function robustClick(locator) {
  await locator.waitFor({ state: 'attached', timeout: 10000 });
  await locator.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  });
  try {
    await locator.click({ force: true, timeout: 5000 });
  } catch {
    await locator.evaluate((el) => {
      if (el instanceof HTMLElement) el.click();
    });
  }
}

async function main() {
  await access(DIST);
  await mkdir(OUT, { recursive: true });

  const logs = [`Ticketing E2E started: ${new Date().toISOString()}`];
  const progressPath = path.join(OUT, 'progress.txt');
  await writeFile(progressPath, `${logs[0]}\n`, 'utf8');
  const log = (message) => {
    logs.push(message);
    console.log(message);
    appendFile(progressPath, `${message}\n`, 'utf8').catch(() => {});
  };
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  log(`Serving ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') log(`console:${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => log(`pageerror: ${error.message}`));
  page.on('crash', () => log('page crashed'));

  try {
    await mockApis(page);
    log('API mocks registered');
    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.setItem('bytspot_onboarding_seen', 'true'));
    await page.goto(BASE_URL);
    log('App loaded twice with onboarding bypass');

    await waitForVisible(page.getByText("Let's Go"), 15000);
    await page.getByText("Let's Go").click();
    await waitForVisible(page.getByText('Continue as Guest'));
    await page.getByText('Continue as Guest').click();
    await waitForVisible(page.getByRole('tab', { name: 'Discover tab' }), 15000);
    log('Entered main app as guest');

    await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });
    await page.getByTestId('discover-entry-filter-paid').click({ force: true });
    await page.waitForTimeout(1500);
    await waitForVisible(page.getByText('The Rooftop Bar').first());
    await waitForVisible(page.locator('[data-testid^="discover-swipe-card-"]').first());
    log('Discover paid filter rendered mock paid venue');

    const card = page.locator('[data-testid^="discover-swipe-card-"]').first();
    const box = await card.boundingBox();
    if (!box) throw new Error('Unable to get swipe card bounds');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 0; i <= 10; i++) await page.mouse.move(startX + (i * 14), startY, { steps: 1 });
    await page.mouse.up();

    await waitForVisible(page.getByText('Entry Access'));
    await robustClick(page.getByTestId('venue-ticket-cta').first());
    await waitForVisible(page.getByTestId('ticket-flow-continue'));
    await robustClick(page.getByTestId('ticket-flow-continue'));
    await waitForVisible(page.getByTestId('ticket-flow-confirm'));
    await robustClick(page.getByTestId('ticket-flow-confirm'));
    await waitForVisible(page.getByTestId('ticket-flow-confirmed'));
    log('Ticket flow reached confirmed state');

    const wallet = await page.evaluate(() => JSON.parse(localStorage.getItem('bytspot_access_pass_wallet') || '[]'));
    if (!Array.isArray(wallet) || wallet[0]?.title !== 'The Rooftop Bar') throw new Error('Access wallet did not persist expected venue');
    log(`Wallet persisted ${wallet[0].title} (${wallet[0].orderNumber})`);

    await page.screenshot({ path: path.join(OUT, 'paid-ticket-confirmed.png'), fullPage: true });
    await writeFile(path.join(OUT, 'results.txt'), `${logs.join('\n')}\nPASS\n`, 'utf8');
    console.log('PASS: paid ticket Playwright flow completed locally');
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

main().catch(async (error) => {
  await mkdir(OUT, { recursive: true }).catch(() => {});
  await writeFile(path.join(OUT, 'results.txt'), `FAIL\n${String(error?.stack || error)}\n`, 'utf8').catch(() => {});
  console.error(error);
  process.exit(1);
});