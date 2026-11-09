const SLACK = 16;

async function check(failures, label, run) {
  try {
    await run();
  } catch (error) {
    failures.push(`${label}: ${error.message.split('\n')[0]}`);
  }
}

export async function verify(page) {
  const charts = await page.evaluate(() =>
    JSON.parse(document.getElementById('dashboard-data').textContent).charts.map(c => ({
      id: c.id,
      title: c.title,
      drawn: c.mmd !== null,
      states: c.states,
      edges: c.edges,
    })),
  );
  const results = [];
  for (const c of charts) {
    const failures = [];
    const button = await page.evaluateHandle(id => [...document.querySelectorAll('nav [data-open]')].find(b => b.dataset.open === id), c.id);
    if (!(await button.evaluate(b => b instanceof HTMLElement))) {
      results.push({ id: c.id, failures: ['no navigation button'] });
      continue;
    }
    await button.click();
    await page.waitForFunction(title => document.querySelector('main h1')?.textContent === title, { timeout: 5000 }, c.title);

    if (c.drawn) {
      await page.click('[data-zoom="fit"]');
      failures.push(...(await page.evaluate((chart, slack) => {
        const out = [];
        const flat = s => s.replace(/\s/g, '');
        const box = id => document.querySelector(`#diagram g.pele-node.pele-state[data-id="${id}"], #diagram g.pele-cluster[data-id="${id}"]`);
        for (const [id, s] of Object.entries(chart.states)) {
          const el = s.parent
            ? document.querySelector(`#diagram g.pele-cluster[data-id="${id}"] .pele-cluster-label`)
            : document.querySelector(`#diagram g.pele-node.pele-state[data-id="${id}"]`);
          if (!el) out.push(`state ${id} "${s.label}" is not drawn`);
          else if (flat(el.textContent) !== flat(s.label)) out.push(`state ${id} shows "${el.textContent}", not "${s.label}"`);
        }
        for (const e of chart.edges) {
          const text = document.querySelector(`#diagram g.pele-edge-label[data-id="${e.id}"]`)?.textContent ?? '';
          if (flat(text) !== flat(e.label)) out.push(`arrow ${e.id} shows "${text}", not "${e.label}"`);
          const path = document.querySelector(`#diagram g.pele-edge[data-id="${e.id}"] path:not(.pele-marker)`);
          if (!path) {
            out.push(`arrow ${e.id} "${e.label}" is not drawn`);
            continue;
          }
          for (const [length, end] of [[0, e.from], [path.getTotalLength(), e.to]]) {
            const p = path.getPointAtLength(length);
            const pt = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM());
            const r = box(end)?.getBoundingClientRect();
            if (!r || pt.x < r.left - slack || pt.x > r.right + slack || pt.y < r.top - slack || pt.y > r.bottom + slack)
              out.push(`arrow ${e.id} "${e.label}" does not touch state ${end}`);
          }
        }
        const svg = document.querySelector('#diagram svg').getBoundingClientRect();
        const scroll = document.querySelector('#diagram-scroll');
        if (svg.width > scroll.clientWidth || svg.height > scroll.clientHeight) out.push('Fit does not fit the whole chart');
        return out;
      }, { states: c.states, edges: c.edges }, SLACK)));

      const state = Object.keys(c.states).find(id => !c.states[id].parent);
      if (state) {
        await check(failures, 'state inspector', async () => {
          await page.click(`#diagram g.pele-node.pele-state[data-id="${state}"]`);
          await page.waitForSelector('#inspector [data-inspected="state"]', { timeout: 3000 });
          await page.click('#inspector [data-path]');
          await page.waitForSelector('#inspector .pathlist', { timeout: 3000 });
        });
      }
      const edge = c.edges.find(e => e.label);
      if (edge) {
        await check(failures, 'arrow inspector', async () => {
          await page.click(`#diagram g.pele-edge-label[data-id="${edge.id}"]`);
          await page.waitForSelector('#inspector [data-inspected="arrow"]', { timeout: 3000 });
        });
      }
    }

    const tabs = await page.$$eval('[data-tab]', els => els.map(el => el.dataset.tab));
    for (const tab of tabs) {
      await page.click(`[data-tab="${tab}"]`);
      const shown = await page.$eval(`[data-panel="${tab}"]`, el => !el.hidden && el.textContent.trim().length > 0);
      if (!shown) failures.push(`tab ${tab} is empty`);
    }
    results.push({ id: c.id, states: Object.keys(c.states).length, arrows: c.edges.length, tabs: tabs.length, failures });
  }
  const failures = results.flatMap(r => r.failures.map(f => `${r.id}: ${f}`));
  if (failures.length) throw new Error(failures.join('\n'));
  return results;
}
