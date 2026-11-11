// Run against a disposable memory-backed Go Lab server. Requires Playwright;
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can point at an existing installation.
import {readFile, mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const script = await readFile(new URL('../golab-enhancements.user.js', import.meta.url), 'utf8');
const origin = process.env.GOLAB_TEST_URL || 'http://localhost:8080';
const browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})});
const errors = [];

async function captureState(page) {
    await page.evaluate(async () => {
        const {State} = await import('/js/state.js');
        const resize = State.prototype.resize;
        State.prototype.resize = function (...args) { window.testState = this; return resize.apply(this, args); };
        window.dispatchEvent(new Event('resize'));
    });
    await page.waitForFunction(() => window.testState?.network_handler.socket.readyState === WebSocket.OPEN);
}

try {
    const context = await browser.newContext();
    await context.addInitScript(`document.addEventListener('DOMContentLoaded', () => {${script}\n}, {once: true});`);
    const page = await context.newPage();
    page.on('pageerror', error => { errors.push(error.message); console.error('Page error:', error.message); });
    page.on('console', message => { if (message.type() === 'error' && message.text().includes('[Go Lab enhancements]')) { errors.push(message.text()); console.error(message.text()); } });
    const id = `userscript-smoke-${Date.now()}`;
    await page.goto(origin);
    await page.waitForSelector('.home-main');
    await page.locator('#board_id').fill(id);
    await page.locator('form[action="/new"] button').click();
    await page.waitForURL(`**/b/${id}`);
    await page.waitForSelector('.workspace');
    await captureState(page);
    await page.waitForFunction(() => window.testState.tree_graphics.nodes != null);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.workspace .icon-circle-logo'), '::before').content !== 'none');

    for (const [width, height, layout] of [[1920, 1080, 'wide'], [1280, 900, 'compact'], [800, 900, 'stacked'], [390, 844, 'stacked'], [320, 700, 'stacked']]) {
        await page.setViewportSize({width, height});
        await page.waitForFunction(expected => document.querySelector('.workspace').dataset.layout === expected, layout);
        await page.waitForTimeout(150);
        const metrics = await page.evaluate(() => {
            const review = document.getElementById('review').getBoundingClientRect();
            return {overflow: document.documentElement.scrollWidth - innerWidth, width: review.width, height: review.height,
                labels: [...document.querySelectorAll('.board-tools button')].every(button => button.getAttribute('aria-label'))};
        });
        assert.ok(metrics.overflow <= 1, `${width}px: horizontal overflow ${metrics.overflow}`);
        assert.ok(Math.abs(metrics.width - metrics.height) < 2, `${width}px: board is not square`);
        assert.ok(metrics.labels, 'Icon buttons need accessible names');
    }
    await page.setViewportSize({width: 1280, height: 900});
    console.log('Home submission and five responsive layouts passed.');
    const uploadShown = page.locator('#upload-modal').evaluate(element => new Promise(resolve => element.addEventListener('shown.bs.modal', () => resolve(), {once: true})));
    await page.keyboard.press('Control+o');
    await uploadShown;
    await page.locator('#upload-textarea').fill('(;GM[1]FF[4]SZ[9]KM[6.5]RU[Japanese]AB[aa][ba][ca][ab][cb][ac][bc][cc]AW[bb];B[ee];W[ef];B[fe];W[ff];B[ge];W[gf];B[he];W[hf];B[ie];W[if];B[dd];W[dh])');
    await page.evaluate(() => { testState.paste(); testState.modals.hide_modal('upload-modal'); });
    await page.waitForFunction(() => window.testState.size === 9);
    await page.waitForFunction(() => !window.testState.modals.modals_up.size);
    await page.locator('#share-board').focus();

    // Record every outbound payload. Local estimates and corrections must not
    // send score, markdead, estimate, estimate_mark, or board-edit events.
    await page.evaluate(() => {
        window.sentEvents = [];
        const handler = testState.network_handler, prepare = handler.prepare;
        handler.prepare = function (payload) { sentEvents.push(payload); return prepare.call(this, payload); };
    });
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('#score-estimate .score-lead', {timeout: 60000});
    assert.match(await page.locator('#score-estimate').innerText(), /Territory estimate/);
    assert.equal(await page.evaluate(() => sentEvents.length), 0);
    const before = await page.locator('#score-estimate .score-lead').innerText();
    await page.evaluate(() => {
        const graphics = testState.board_graphics;
        const [x, y] = graphics.real_coord(1, 1), rect = document.getElementById('review').getBoundingClientRect();
        document.getElementById('review').dispatchEvent(new MouseEvent('click', {bubbles: true, clientX: rect.left + x, clientY: rect.top + y}));
    });
    await page.waitForSelector('#score-estimate .score-lead', {timeout: 60000});
    assert.notEqual(await page.locator('#score-estimate .score-lead').innerText(), before);
    assert.equal(await page.evaluate(() => sentEvents.length), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#score-estimate').isVisible(), false);
    assert.equal(await page.locator('#golab-score-overlay').count(), 0);

    // Preserve upstream selected-tool highlighting and drag placement.
    await page.getByRole('button', {name: 'Place triangles (5)', exact: true}).click();
    assert.equal(await page.getByRole('button', {name: 'Place triangles (5)', exact: true}).getAttribute('aria-pressed'), 'true');
    const positions = await page.evaluate(() => {
        const rect = document.getElementById('review').getBoundingClientRect();
        return [2, 3, 4].map(x => { const [px, py] = testState.board_graphics.real_coord(x, 7); return [rect.left + px, rect.top + py]; });
    });
    await page.mouse.move(...positions[0]); await page.mouse.down();
    await page.mouse.move(...positions[1]); await page.mouse.move(...positions[2]); await page.mouse.up();
    await page.waitForFunction(() => sentEvents.filter(event => event.event === 'triangle').length >= 2);
    await page.evaluate(() => { window.sentEvents = []; });
    await page.keyboard.down('Alt');
    const stone = await page.evaluate(() => { const rect = document.getElementById('review').getBoundingClientRect(); const [x,y] = testState.board_graphics.real_coord(0,0); return [rect.left+x, rect.top+y]; });
    await page.mouse.click(...stone); await page.keyboard.up('Alt');
    assert.ok(await page.evaluate(() => sentEvents.some(event => event.event === 'goto_coord')));
    assert.equal(await page.evaluate(() => sentEvents.filter(event => event.event === 'triangle').length), 0);

    // Wheel modifiers follow the preferred variation and honor the preference.
    await page.evaluate(() => { window.sentEvents = []; document.getElementById('review').dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: 100})); });
    await page.waitForFunction(() => sentEvents.some(event => event.event === 'right'));
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.sentEvents = []; document.getElementById('review').dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: -100, shiftKey: true})); });
    assert.ok(await page.evaluate(() => sentEvents.some(event => event.event === 'goto_grid')));
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.sentEvents = []; document.getElementById('review').dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true})); });
    assert.ok(await page.evaluate(() => sentEvents.some(event => event.event === 'rewind')));
    await page.evaluate(() => { const input = document.getElementById('wheel-navigation-switch'); input.checked = false; input.dispatchEvent(new Event('change')); window.sentEvents = []; document.getElementById('review').dispatchEvent(new WheelEvent('wheel', {bubbles:true, cancelable:true, deltaY:100})); });
    assert.equal(await page.evaluate(() => sentEvents.length), 0);
    await page.reload(); await page.waitForSelector('.workspace'); await captureState(page);
    assert.equal(await page.evaluate(() => testState.wheel_navigation), false);
    console.log('Local scoring, group corrections, upstream drag marks and navigation passed.');

    // A remote move invalidates any local estimate, including a pending job.
    const lateContext = await browser.newContext();
    const late = await lateContext.newPage();
    late.on('pageerror', error => errors.push(error.message));
    await late.goto(`${origin}/b/${id}`);
    await captureState(late);
    await late.waitForFunction(() => testState.tree_graphics.nodes != null);
    await page.keyboard.press('Control+Enter');
    await late.evaluate(() => testState.network_handler.prepare_right());
    await page.waitForFunction(() => document.getElementById('score-estimate').hidden);

    // Late injection finds the existing instance, including capture totals.
    await late.evaluate(script);
    await late.waitForSelector('.workspace'); await captureState(late);
    assert.equal(await late.locator('.workspace').count(), 1);
    await late.evaluate(script);
    assert.equal(await late.locator('.workspace').count(), 1);
    await lateContext.close();

    await mkdir('/tmp/golab-userscript-checks', {recursive: true});
    await page.screenshot({path: '/tmp/golab-userscript-checks/desktop.png', fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: '/tmp/golab-userscript-checks/mobile.png', fullPage: true});
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: home form, responsive layouts, local scoring, corrections, drag marks, tool highlighting, shortcuts, wheel preferences, remote invalidation, late and duplicate injection.');
} finally { await browser.close(); }
