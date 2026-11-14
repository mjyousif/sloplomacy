#!/usr/bin/env node
/**
 * Compare rendered DOM boxes, scroll sizes, computed styles, active ::before/::after
 * pseudo-elements, and forced pseudo-states (:hover, :active, :focus, :focus-visible)
 * between two built frontend `dist/` directories (e.g., `main` vs refactor branch).
 *
 * Usage:
 *   node scripts/compare_styles.mjs --main <main-dist-dir> [options]
 *
 * Options:
 *   --main <dir>       Path to baseline dist/ directory (required)
 *   --branch <dir>     Path to candidate dist/ directory (default: frontend/dist)
 *   --api-port <port>  Backend API port for /api proxy (default: 8000)
 *   --suite <name>     Built-in suite: tools (default), lobby, core
 *   --scenes <file>    Custom ESM module exporting { forcedSelectors?: string[], includeSvg?: boolean, run(ctx) }
 *                      `includeSvg: true` also records every element inside an <svg> (the map's
 *                      pieces, provinces, labels, arrows), which are skipped by default.
 *   --mobile-only      Run only 390x844 touch (fast sensitivity check)
 *   --desktop-only     Run only 1440x900 mouse
 *   --help             Show this help
 */

import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(REPO_ROOT, 'frontend/node_modules/playwright'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function parseArgs(argv) {
  const args = {
    main: null,
    branch: path.join(REPO_ROOT, 'frontend/dist'),
    apiHost: '127.0.0.1',
    apiPort: 8000,
    suite: 'tools',
    scenes: null,
    mobileOnly: false,
    desktopOnly: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--main') args.main = path.resolve(argv[++i]);
    else if (a === '--branch') args.branch = path.resolve(argv[++i]);
    else if (a === '--api-port') args.apiPort = Number(argv[++i]);
    else if (a === '--suite') args.suite = argv[++i];
    else if (a === '--scenes') args.scenes = path.resolve(argv[++i]);
    else if (a === '--mobile-only') args.mobileOnly = true;
    else if (a === '--desktop-only') args.desktopOnly = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function serveDist(distDir, apiHost, apiPort) {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath.startsWith('/api')) {
      const proxyReq = http.request(
        {
          hostname: apiHost,
          port: apiPort,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: `${apiHost}:${apiPort}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on('error', (err) => {
        res.writeHead(502);
        res.end(String(err));
      });
      req.pipe(proxyReq);
      return;
    }

    let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

// One parsed object per distinct computed style for the whole run, shared by every snapshot.
function shareStyles(pool, cache) {
  return pool.map((key) => {
    let obj = cache.get(key);
    if (!obj) {
      obj = JSON.parse(key);
      cache.set(key, obj);
    }
    return obj;
  });
}

async function captureDOM(page, includeSvg, cache) {
  // Identical computed styles are sent once and shared, so a map with thousands of SVG elements
  // that mostly look alike does not hold thousands of copies of ~350 properties per snapshot.
  const { pool, els } = await page.evaluate((withSvg) => {
    for (const anim of document.getAnimations()) {
      if (anim.effect?.getComputedTiming().iterations === Infinity) {
        anim.currentTime = 0;
        anim.pause();
      } else {
        anim.finish();
      }
    }
    const round = (n) => Math.round(n * 100) / 100;
    const pool = [];
    const ids = new Map();
    const intern = (cs) => {
      const out = {};
      for (let i = 0; i < cs.length; i++) {
        const prop = cs[i];
        if (prop.startsWith('-webkit-')) continue;
        out[prop] = cs.getPropertyValue(prop);
      }
      const key = JSON.stringify(out);
      let id = ids.get(key);
      if (id === undefined) {
        id = pool.length;
        ids.set(key, id);
        pool.push(key);
      }
      return id;
    };
    const pseudoId = (el, pseudo) => {
      const cs = getComputedStyle(el, pseudo);
      const content = cs.getPropertyValue('content');
      if (content === 'none' || content === 'normal') return null;
      return intern(cs);
    };
    const all = Array.from(document.querySelectorAll('*')).filter(
      (el) => withSvg || !el.closest('svg') || el.tagName.toLowerCase() === 'svg',
    );
    const els = all.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        box: [round(r.x), round(r.y), round(r.width), round(r.height)],
        scroll: [el.scrollWidth, el.scrollHeight],
        style: intern(getComputedStyle(el)),
        before: pseudoId(el, '::before'),
        after: pseudoId(el, '::after'),
      };
    });
    return { pool, els };
  }, Boolean(includeSvg));
  const styles = shareStyles(pool, cache);
  return els.map((e) => ({
    ...e,
    style: styles[e.style],
    before: e.before === null ? null : styles[e.before],
    after: e.after === null ? null : styles[e.after],
  }));
}

async function captureForcedStates(page, cdp, selectors, cache) {
  if (!selectors.length) return [];
  const doc = await cdp.send('DOM.getDocument', { depth: 0 });
  const combinedSel = selectors.join(', ');
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: doc.root.nodeId,
    selector: combinedSel,
  });
  const uniqueIds = [...new Set(nodeIds)];
  if (!uniqueIds.length) return [];

  const samples = [];
  for (const pseudo of ['hover', 'active', 'focus', 'focus-visible']) {
    await Promise.all(
      uniqueIds.map((nodeId) =>
        cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [pseudo] }),
      ),
    );
    const raw = await page.evaluate(
      ({ sel, p }) => {
        for (const anim of document.getAnimations()) {
          if (anim.effect?.getComputedTiming().iterations !== Infinity) {
            anim.finish();
          }
        }
        const pool = [];
        const ids = new Map();
        const items = Array.from(document.querySelectorAll(sel)).map((el) => {
          const cs = getComputedStyle(el);
          const out = {};
          for (let i = 0; i < cs.length; i++) {
            const k = cs[i];
            if (k.startsWith('-webkit-')) continue;
            out[k] = cs.getPropertyValue(k);
          }
          const key = JSON.stringify(out);
          let id = ids.get(key);
          if (id === undefined) {
            id = pool.length;
            ids.set(key, id);
            pool.push(key);
          }
          return { tag: el.tagName, pseudo: p, style: id };
        });
        return { pool, items };
      },
      { sel: combinedSel, p: pseudo },
    );
    const styles = shareStyles(raw.pool, cache);
    const batch = raw.items.map((it) => ({ ...it, style: styles[it.style] }));
    samples.push(...batch);
  }
  await Promise.all(
    uniqueIds.map((nodeId) =>
      cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }),
    ),
  );
  return samples;
}

const BUILTIN_SUITES = {
  lobby: {
    forcedSelectors: ['button', 'input', 'select', 'a'],
    async run({ page, baseUrl, snap }) {
      await page.goto(baseUrl);
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      await snap('lobby_initial');
    },
  },
  core: {
    forcedSelectors: ['button', 'select', 'input'],
    async run({ page, baseUrl, snap }) {
      await page.goto(baseUrl);
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      await snap('lobby_initial');
      await page.locator('[data-testid="btn-enter-sandbox"]').click();
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });
      await snap('sandbox_initial');
    },
  },
  tools: {
    forcedSelectors: [
      '[aria-label="Chancellery Tools & Intel"] button',
      '[aria-label="Chancellery Tools & Intel"] [data-testid="power-standing-card"]',
      '[aria-label="Tools Sidebar Collapsed"] button',
      '[data-testid="turn-history"] button',
      '[data-testid="turn-history"] select',
      '[data-testid="turn-history-pill"] button',
      '[data-testid="turn-chronicle-pill"] button',
    ],
    async run({ page, baseUrl, viewport, snap }) {
      await page.goto(baseUrl);
      await page.waitForSelector('[data-testid="btn-enter-sandbox"]', { timeout: 15000 });
      await page.locator('[data-testid="btn-enter-sandbox"]').click();
      await page.waitForSelector('[data-testid="unit-token"]', { timeout: 15000 });

      if (viewport.width >= 1000) {
        await snap('desktop_initial');
        await page.locator('[data-testid="standings-sort-default"]').click();
        await snap('desktop_standings_default');
        await page.locator('[data-testid="power-standing-card"][data-power="ENGLAND"]').click();
        await snap('desktop_england_selected');
        await page.locator('[data-testid="btn-toggle-sandbox"]').click();
        await snap('desktop_hypothetical_active');
        await page.locator('[data-testid="tools-sidebar-collapse-btn"]').click();
        await snap('desktop_tools_collapsed_sandbox');
        await page.locator('[data-testid="tools-sidebar-expand-btn"]').click();
        await page.locator('[data-testid="btn-toggle-sandbox"]').click();
        await snap('desktop_tools_expanded');
        await page.locator('[data-testid="btn-adjudicate-phase"]').click();
        await page.waitForTimeout(400);
        await snap('desktop_turn_chronicle_live');
        await page.locator('[data-testid="turn-history-select"]').click();
        await snap('desktop_turn_chronicle_dropdown_open');
        await page.locator('[data-testid="turn-history-option-0"]').click();
        await snap('desktop_turn_chronicle_past');
        await page.locator('[data-testid="turn-history-filter-toggle"]').click();
        await snap('desktop_turn_chronicle_tray_open');
        await page.locator('[data-testid="turn-history-power"][data-power="GERMANY"]').click();
        await snap('desktop_turn_chronicle_filtered_germany');
      } else {
        await snap('mobile_initial');
        await page.locator('[data-testid="compact-tools-toggle"]').click();
        await snap('mobile_tools_drawer_open');
        await page.locator('[data-testid="tools-drawer-close-btn"]').click();
        await snap('mobile_tools_drawer_closed');
        await page.locator('[data-testid="btn-adjudicate-phase"]').click();
        await page.waitForTimeout(400);
        await page.locator('[data-testid="compact-tools-toggle"]').click();
        await snap('mobile_drawer_with_history');
        await page.locator('[data-testid="turn-history-select"]').selectOption('0');
        await snap('mobile_turn_history_pill');
      }
    },
  },
};

async function runScenes(browser, baseUrl, viewport, hasTouch, suite) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');

  const styleCache = new Map();
  const states = [];
  const forcedStates = [];
  const snap = async (name) => {
    await page.evaluate(() =>
      document.fonts.ready.then(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      ),
    );
    console.log(`  [${viewport.width}x${viewport.height} touch=${hasTouch}] ${name}`);
    states.push({ name, dom: await captureDOM(page, suite.includeSvg, styleCache) });
    forcedStates.push({
      name,
      samples: await captureForcedStates(page, cdp, suite.forcedSelectors || [], styleCache),
    });
  };

  await suite.run({ page, baseUrl, viewport, hasTouch, snap });
  await context.close();
  return { states, forcedStates };
}

function diffRuns(label, mainRun, branchRun) {
  let totalElements = 0;
  let totalValues = 0;
  let diffs = 0;
  const diffDetails = [];

  for (let i = 0; i < mainRun.states.length; i++) {
    const ms = mainRun.states[i];
    const bs = branchRun.states[i];
    if (ms.dom.length !== bs.dom.length) {
      diffs++;
      diffDetails.push(`State ${ms.name}: element count ${ms.dom.length} vs ${bs.dom.length}`);
      continue;
    }
    for (let j = 0; j < ms.dom.length; j++) {
      totalElements++;
      const me = ms.dom[j];
      const be = bs.dom[j];
      totalValues += 6;
      if (me.tag !== be.tag) {
        diffs++;
        if (diffDetails.length < 20) diffDetails.push(`${ms.name}[${j}] tag ${me.tag} vs ${be.tag}`);
      }
      if (JSON.stringify(me.box) !== JSON.stringify(be.box)) {
        diffs++;
        if (diffDetails.length < 20)
          diffDetails.push(`${ms.name}[${j}] ${me.tag} box ${me.box} vs ${be.box}`);
      }
      if (JSON.stringify(me.scroll) !== JSON.stringify(be.scroll)) {
        diffs++;
        if (diffDetails.length < 20)
          diffDetails.push(`${ms.name}[${j}] ${me.tag} scroll ${me.scroll} vs ${be.scroll}`);
      }
      for (const part of ['style', 'before', 'after']) {
        const mp = me[part];
        const bp = be[part];
        if (!mp && !bp) continue;
        if (!mp || !bp) {
          totalValues++;
          diffs++;
          if (diffDetails.length < 20) {
            diffDetails.push(
              `${ms.name}[${j}] ${me.tag} ${part}: ${mp ? 'present' : 'null'} vs ${bp ? 'present' : 'null'}`,
            );
          }
          continue;
        }
        for (const k of Object.keys(mp)) {
          totalValues++;
          if (mp[k] !== bp[k]) {
            diffs++;
            if (diffDetails.length < 20) {
              diffDetails.push(`${ms.name}[${j}] ${me.tag} ${part}.${k}: ${mp[k]} vs ${bp[k]}`);
            }
          }
        }
      }
    }
  }

  let forcedSamples = 0;
  let forcedValues = 0;
  let forcedDiffs = 0;
  const forcedDetails = [];
  for (let i = 0; i < mainRun.forcedStates.length; i++) {
    const mf = mainRun.forcedStates[i];
    const bf = branchRun.forcedStates[i];
    if (mf.samples.length !== bf.samples.length) {
      forcedDiffs++;
      forcedDetails.push(
        `Forced ${mf.name}: sample count ${mf.samples.length} vs ${bf.samples.length}`,
      );
      continue;
    }
    for (let j = 0; j < mf.samples.length; j++) {
      forcedSamples++;
      const ms = mf.samples[j];
      const bs = bf.samples[j];
      for (const k of Object.keys(ms.style)) {
        forcedValues++;
        if (ms.style[k] !== bs.style[k]) {
          forcedDiffs++;
          if (forcedDetails.length < 20) {
            forcedDetails.push(
              `Forced ${mf.name}[${j}] ${ms.tag}:${ms.pseudo} ${k}: ${ms.style[k]} vs ${bs.style[k]}`,
            );
          }
        }
      }
    }
  }

  console.log(`\n=== ${label} ===`);
  console.log(
    `States: ${mainRun.states.length}, Elements: ${totalElements}, Values: ${totalValues}, Differing: ${diffs}`,
  );
  if (diffDetails.length) console.log('Diffs:', diffDetails.join('\n  '));
  console.log(
    `Forced: ${forcedSamples} samples, Values: ${forcedValues}, Differing: ${forcedDiffs}`,
  );
  if (forcedDetails.length) console.log('Forced Diffs:', forcedDetails.join('\n  '));
  return diffs + forcedDiffs;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.main) {
  console.log(
    'Usage: node scripts/compare_styles.mjs --main <main-dist-dir> [--branch <dist-dir>] [--api-port 8000] [--suite tools|lobby|core] [--scenes <file.mjs>] [--mobile-only|--desktop-only]',
  );
  process.exit(args.help ? 0 : 2);
}

const suite = args.scenes
  ? await import(pathToFileURL(args.scenes).href)
  : BUILTIN_SUITES[args.suite];
if (!suite) {
  throw new Error(`Unknown suite: ${args.suite}. Available: ${Object.keys(BUILTIN_SUITES).join(', ')}`);
}

const configs = args.mobileOnly
  ? [{ label: '390x844 touch', viewport: { width: 390, height: 844 }, hasTouch: true }]
  : args.desktopOnly
    ? [{ label: '1440x900 mouse', viewport: { width: 1440, height: 900 }, hasTouch: false }]
    : [
        { label: '1440x900 mouse', viewport: { width: 1440, height: 900 }, hasTouch: false },
        { label: '390x844 touch', viewport: { width: 390, height: 844 }, hasTouch: true },
        { label: '390x844 mouse', viewport: { width: 390, height: 844 }, hasTouch: false },
      ];

const mainSrv = await serveDist(args.main, args.apiHost, args.apiPort);
const branchSrv = await serveDist(args.branch, args.apiHost, args.apiPort);
const browser = await chromium.launch({ headless: true });

try {
  let totalDiffs = 0;
  for (const cfg of configs) {
    const [m, b] = await Promise.all([
      runScenes(browser, mainSrv.url, cfg.viewport, cfg.hasTouch, suite),
      runScenes(browser, branchSrv.url, cfg.viewport, cfg.hasTouch, suite),
    ]);
    totalDiffs += diffRuns(cfg.label, m, b);
  }
  process.exitCode = totalDiffs > 0 ? 1 : 0;
} finally {
  await browser.close();
  mainSrv.server.close();
  branchSrv.server.close();
}
