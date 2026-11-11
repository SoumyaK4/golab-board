import { create_layout } from './layout.mjs';
import { estimatePosition, OwnershipBoard } from './ownership.mjs';
import { scoreRules, scorePosition } from './scoring.mjs';
import { render_score } from './score-view.mjs';

// STYLE, HOME, HEADER and FOOTER are embedded by build.mjs.
const sessions = new WeakMap();
const editable = () => document.activeElement?.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
const ready = () => document.readyState !== 'loading' ? Promise.resolve() : new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once: true}));

function sessionFor(state) {
    if (!sessions.has(state)) sessions.set(state, {attached: false, fields: {}, captures: [0, 0], job: 0, local: null});
    return sessions.get(state);
}

function wrap(prototype, name, handler) {
    const original = prototype[name];
    if (typeof original === 'function') prototype[name] = function (...args) { return handler.call(this, original, ...args); };
}

function addStyle() {
    if (document.getElementById('golab-enhancements-style')) return;
    const style = document.createElement('style');
    style.id = 'golab-enhancements-style';
    style.textContent = STYLE;
    document.head.append(style);
    if (!document.querySelector('link[href="/static/icons.css"]')) {
        const icons = document.createElement('link');
        icons.rel = 'stylesheet'; icons.href = '/static/icons.css';
        document.head.append(icons);
    }
    document.documentElement.lang ||= 'en';
}

function fragment(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
}

function enhanceHome() {
    const form = document.querySelector('form[action="/new"]');
    if (!form || document.querySelector('.home-main')) return;
    // Keep the live form and any server-supplied hidden fields/validation.
    const home = fragment(HOME);
    const replacement = home.querySelector('form');
    const input = form.querySelector('[name="board_id"]');
    const newInput = replacement.querySelector('[name="board_id"]');
    for (const name of ['placeholder', 'autocomplete', 'autocapitalize', 'spellcheck', 'aria-describedby']) input.setAttribute(name, newInput.getAttribute(name));
    newInput.replaceWith(input);
    for (const hidden of form.querySelectorAll('input[type="hidden"]')) replacement.append(hidden);
    form.replaceChildren(...replacement.childNodes);
    form.className = 'create-board';
    replacement.replaceWith(form);
    document.body.replaceChildren(fragment(HEADER), home, fragment(FOOTER));
    document.body.classList.add('home-page');
    document.title = 'Go Lab · A shared space for Go';
}

function enhanceChrome() {
    const brand = document.querySelector('a[href="/"] .icon-circle-logo');
    brand?.closest('.container')?.replaceWith(fragment(HEADER));
    document.querySelector('body > .bg-dark.mt-5')?.replaceWith(fragment(FOOTER));
}

function enhanceHelp() {
    if (location.pathname !== '/about') return;
    const scoreHelp = document.querySelector('.bi-calculator')?.closest('p');
    if (scoreHelp) {
        const button = scoreHelp.querySelector('button');
        scoreHelp.replaceChildren(button, document.createTextNode(' Toggle the local score estimate (Ctrl+Enter / Cmd+Enter). Click a stone to toggle its group dead/alive, or an empty point to cycle Black, White, neutral. Smaller ownership squares indicate less certainty. Open the score breakdown for territory, captures, stones, komi and handicap adjustments. Estimates and corrections stay in your browser.'));
    }
    const heading = document.createElement('p');
    heading.className = 'h5'; heading.textContent = 'Mouse navigation';
    const help = document.createElement('p');
    help.textContent = 'Scroll over the board or game tree to move forward (down) or backward (up). Hold Shift to jump ten moves, or Ctrl to jump to the start/end. Disable mouse-wheel navigation in Settings → Behavior. Alt+click a stone to jump to its move in any tool mode. Ctrl+O / Cmd+O opens SGF upload.';
    const anchor = document.getElementById('input-buffer');
    anchor?.before(heading, help);
}

function labelControls() {
    for (const button of document.querySelectorAll('.workspace button, #modals button')) {
        button.type = 'button';
        const title = button.getAttribute('data-bs-original-title') || button.getAttribute('data-bs-title') || button.title;
        if (title) {
            const text = document.createElement('span');
            text.innerHTML = title;
            button.setAttribute('aria-label', text.textContent);
        }
        for (const icon of button.querySelectorAll('i')) icon.setAttribute('aria-hidden', 'true');
    }
    const number = document.getElementById('move-number');
    number?.setAttribute('aria-label', 'Current move number');
}

function refreshToolSelection(state) {
    for (const button of document.querySelectorAll('.board-tools button')) {
        if (button.dataset.golabTool) button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    }
}

function attach(state) {
    const session = sessionFor(state);
    if (session.attached || !state.network_handler || !state.modals || !document.getElementById('review')) return;
    session.attached = true;
    session.captures = ['black-caps', 'white-caps'].map(id => Number(document.getElementById(id)?.textContent.replace(/^\s*-\s*/, '')) || 0);
    const ids = ['review', 'arrows', 'buttons-row1', 'buttons-row2', 'buttons-row3', 'black-namecard-container', 'white-namecard-container', 'explorer_container', 'comments'];
    const nodes = ids.map(id => document.getElementById(id));
    // Move the application's actual nodes so event listeners, SVG layers and
    // the upstream drag/optimistic-mark implementation stay intact.
    document.getElementById('content').replaceChildren();
    session.layout = create_layout();
    for (const node of nodes) document.getElementById(node.id).replaceWith(node);
    document.body.classList.add('board-page');
    document.getElementById('content').setAttribute('aria-label', 'Shared Go board');
    for (const id of ['black-namecard-container', 'white-namecard-container']) document.getElementById(id).className = '';
    for (const id of ['review', 'arrows', 'buttons-row1', 'buttons-row2', 'buttons-row3', 'explorer_container', 'comments']) {
        const node = document.getElementById(id);
        node.style.removeProperty('width');
        node.style.removeProperty('margin');
    }
    document.getElementById('arrows').className = 'navigation-buttons';
    document.getElementById('buttons-row3').className = 'board-actions';
    document.getElementById('explorer_container').setAttribute('aria-label', 'Game variations');
    document.getElementById('explorer_container').tabIndex = 0;
    for (const id of ['buttons-row1', 'buttons-row2']) document.getElementById(id).className = 'tool-buttons';
    const dropdown = document.getElementById('dropdown-div');
    for (const button of dropdown?.querySelectorAll('.dropdown-item > button') || []) document.getElementById('buttons-row3').append(button);
    dropdown?.remove();
    state.buttons.resize = () => {};
    const highlight = state.buttons.highlight_tool;
    state.buttons.highlight_tool = name => { highlight(name); refreshToolSelection(state); };
    const toolNames = [['toggle', 'black', 'white', null, 'triangle', 'square', 'letter', 'number'], [null, 'pen', null, null, null, null, 'score']];
    for (let row = 0; row < 2; row++) {
        const buttons = document.querySelectorAll(`#buttons-row${row + 1} > button`);
        buttons.forEach((button, i) => { if (toolNames[row][i]) button.dataset.golabTool = toolNames[row][i]; });
    }
    refreshToolSelection(state);
    const input = document.querySelector('#comments input');
    if (input) {
        input.classList.add('form-control');
        input.placeholder = 'Add a comment…';
        input.setAttribute('aria-label', 'Add a comment to this move; press Enter to send');
        input.addEventListener('keypress', event => {
            if (event.key === 'Enter' && (event.isComposing || !input.value.trim())) event.stopImmediatePropagation();
        }, true);
    }
    document.getElementById('comments').style.width = '100%';
    for (const node of document.getElementById('comments').children) node.style.width = '100%';
    state.comments.resize = () => {};
    const behavior = document.getElementById('behavior-collapse');
    const setting = document.createElement('div');
    setting.className = 'mb-3';
    setting.innerHTML = '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="wheel-navigation-switch" aria-describedby="wheel-navigation-help"><label class="form-check-label" for="wheel-navigation-switch">Mouse-wheel navigation</label></div><p class="small text-body-secondary mb-0" id="wheel-navigation-help">Scroll over the board or game tree to navigate. Shift jumps 10 moves; Ctrl jumps to the start/end. Alt+click a stone to jump to its move.</p>';
    const wheel = setting.querySelector('input');
    try { wheel.checked = localStorage.getItem('wheel_navigation') !== 'false'; } catch { wheel.checked = true; }
    state.wheel_navigation = wheel.checked;
    wheel.addEventListener('change', () => {
        state.wheel_navigation = wheel.checked;
        try { localStorage.setItem('wheel_navigation', String(wheel.checked)); } catch { /* Session preference still works. */ }
    });
    behavior?.prepend(setting);
    document.addEventListener('wheel', event => navigateWheel(state, event), {passive: false});
    labelControls();
    session.layout.resize();
    state.resize();
}

function navigateWheel(state, event) {
    if (!state.wheel_navigation || state.modals.modals_up.size || editable() || event.altKey || event.metaKey ||
        !event.target.closest?.('#review, #explorer_container')) return;
    const delta = event.deltaY || (event.shiftKey ? event.deltaX : 0);
    if (!delta || (!event.shiftKey && Math.abs(event.deltaX) > Math.abs(event.deltaY))) return;
    event.preventDefault();
    const session = sessionFor(state), now = performance.now();
    if (now - (session.lastWheel ?? -Infinity) < 120) return;
    session.lastWheel = now;
    const handler = state.network_handler, forward = delta > 0;
    if (event.ctrlKey) forward ? handler.prepare_fastforward() : handler.prepare_rewind();
    else if (event.shiftKey) {
        const tree = state.tree_graphics, path = session.preferred || preferredPath(tree);
        const current = session.current ?? tree.grid.get(tree.current[1])?.get(tree.current[0])?.index;
        const index = path.indexOf(current);
        if (index < 0) return;
        const target = path[Math.max(0, Math.min(path.length - 1, index + (forward ? 10 : -10)))];
        if (target != null && target !== current) handler.prepare({event: 'goto_grid', value: target});
    } else forward ? handler.prepare_right() : handler.prepare_left();
}

function preferredPath(tree) {
    return [...tree.preferred_grid.values()].flatMap(row => [...row.values()]).sort((a, b) => a.depth - b.depth).map(node => node.index);
}

function stopScore(state) {
    const session = sessionFor(state);
    session.job++;
    if (!session.local) return;
    state.mark = session.local.previousMark;
    session.local = null;
    document.getElementById('golab-score-overlay')?.remove();
    const panel = document.getElementById('score-estimate');
    if (panel) panel.hidden = true;
    const tool = state.mark || (state.toggling ? 'toggle' : state.color === 1 ? 'black' : 'white');
    state.buttons.highlight_tool(tool);
}

function drawScore(state) {
    const session = sessionFor(state), local = session.local;
    document.getElementById('golab-score-overlay')?.remove();
    if (!local?.estimate) return;
    const {score, owners} = scorePosition(local.points, local.estimate, local.fields, local.captures, local.overrides);
    render_score(score);
    const graphics = state.board_graphics;
    const overlay = document.createElementNS(graphics.svgns, 'svg');
    overlay.id = 'golab-score-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const width = document.getElementById('review').offsetHeight;
    overlay.setAttribute('width', width);
    overlay.setAttribute('height', width);
    for (let p = 0; p < local.points.length; p++) {
        if (!owners[p] || (local.points[p] && !local.estimate.dead.has(p))) continue;
        const [x, y] = graphics.real_coord(p % state.size, Math.floor(p / state.size));
        const side = graphics.side * 0.4 * Math.max(0.1, Math.min(1, Math.abs(score.confidence[p])));
        const square = document.createElementNS(graphics.svgns, 'rect');
        square.setAttribute('x', x - side / 2); square.setAttribute('y', y - side / 2);
        square.setAttribute('width', side); square.setAttribute('height', side);
        const color = owners[p] === 1 ? state.black_stone_color : state.white_stone_color;
        square.setAttribute('fill', color?.startsWith('#') ? color : owners[p] === 1 ? '#000' : '#fff');
        overlay.append(square);
    }
    document.getElementById('review').append(overlay);
}

async function calculateScore(state, manual = false) {
    const session = sessionFor(state), local = session.local, job = ++session.job;
    const panel = document.getElementById('score-estimate');
    panel.hidden = false;
    const busy = document.createElement('p');
    busy.setAttribute('role', 'status'); busy.textContent = 'Estimating locally… Click Score again to cancel.';
    panel.replaceChildren(busy);
    document.getElementById('golab-score-overlay')?.remove();
    const pause = async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (session.job !== job) throw new DOMException('Estimate cancelled', 'AbortError');
    };
    try {
        const estimate = await estimatePosition(local.points, state.size, local.next, manual ? local.estimate.dead : null,
            scoreRules(local.fields).scoring === 'territory', pause);
        if (session.job !== job) return;
        local.estimate = estimate;
        drawScore(state);
    } catch (error) {
        if (error.name === 'AbortError') return;
        stopScore(state);
        console.error('[Go Lab enhancements] Score estimation failed:', error);
        state.modals.show_toast('The local estimate failed. Try again.');
    }
}

function startScore(state) {
    attach(state);
    const session = sessionFor(state);
    if (session.local) { stopScore(state); return; }
    const points = [];
    for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) {
        const value = state.board.get({x, y});
        points.push(value === 2 ? -1 : value);
    }
    const info = state.gameinfo || {};
    const fields = {RU: info.Ruleset, KM: info.Komi, ...session.fields};
    const tree = state.tree_graphics;
    const current = session.current ?? tree.grid.get(tree.current[1])?.get(tree.current[0])?.index;
    const color = tree.nodes?.[current]?.color;
    const next = color === 1 ? -1 : color === 2 ? 1 : fields.PL === 'B' ? 1 : fields.PL === 'W' || Number(fields.HA) > 0 ? -1 : 1;
    session.local = {points, fields, captures: [...session.captures],
        overrides: new Map(), estimate: null, next, previousMark: state.mark};
    state.mark = 'score';
    state.board_graphics.clear_ghosts();
    state.buttons.highlight_tool('score');
    void calculateScore(state);
}

function markScore(state, coords) {
    const local = sessionFor(state).local;
    if (!local?.estimate) return;
    const p = coords[1] * state.size + coords[0];
    if (!local.points[p]) {
        const owner = local.overrides.get(p) ?? local.estimate.owners[p];
        local.overrides.set(p, owner === 1 ? -1 : owner === -1 ? 0 : 1);
        drawScore(state);
    } else {
        const [group] = new OwnershipBoard(local.points, state.size).region(local.points, p);
        const dead = local.estimate.dead.has(p);
        for (const q of group) dead ? local.estimate.dead.delete(q) : local.estimate.dead.add(q);
        void calculateScore(state, true);
    }
}

async function installBoardHooks() {
    // Import the exact same URL as init.js: the browser shares these module
    // instances with the app. No replacement client or second WebSocket.
    const [{State}, {NetworkHandler}, {TreeGraphics}, {resize_dropzone}] = await Promise.all([
        import(new URL('/js/state.js', location.origin).href),
        import(new URL('/js/network_handler.js', location.origin).href),
        import(new URL('/js/treegraphics.js', location.origin).href),
        import(new URL('/js/dropzone.js', location.origin).href),
    ]);
    wrap(State.prototype, 'set_network_handler', function (original, handler) {
        const result = original.call(this, handler); attach(this); return result;
    });
    wrap(State.prototype, 'resize', function (original, ...args) {
        attach(this);
        const session = sessionFor(this);
        if (!session.attached) return original.apply(this, args);
        document.getElementById('content').style.removeProperty('width');
        session.layout.resize();
        this.recompute_consts(); this.board_graphics.resize(); this.tree_graphics.resize();
        this.apply_pen(); resize_dropzone(); drawScore(this);
    });
    wrap(TreeGraphics.prototype, 'resize', function (original) {
        if (!sessionFor(this.state).attached) return original.call(this);
        this.container.style.width = '100%';
        this.container.style.height = Math.max(this.saved_height, 220) + 'px';
        this.schedule_render();
    });
    wrap(State.prototype, 'set_gameinfo', function (original, fields) {
        sessionFor(this).fields = Object.fromEntries(fields.map(field => [field.key, field.values?.[0]]));
        return original.call(this, fields);
    });
    wrap(State.prototype, 'handle_frame', function (original, frame) {
        stopScore(this);
        const session = sessionFor(this);
        if (frame.black_caps != null) session.captures[0] = frame.black_caps;
        if (frame.white_caps != null) session.captures[1] = frame.white_caps;
        if (frame.tree?.preferred != null) session.preferred = frame.tree.preferred;
        if (frame.tree?.current != null) session.current = frame.tree.current;
        return original.call(this, frame);
    });
    State.prototype.trigger_score = function () { startScore(this); };
    NetworkHandler.prototype.prepare_score = function () { startScore(this.state); };
    for (const method of ['reset', 'set_toggle', 'set_black', 'set_white', 'set_eraser', 'set_pen', 'set_triangle', 'set_square', 'set_letter', 'set_number']) {
        wrap(State.prototype, method, function (original, ...args) { stopScore(this); return original.apply(this, args); });
    }
    for (const method of ['increment_board_rotation', 'set_board_color', 'set_black_stone_color', 'set_white_stone_color']) {
        wrap(State.prototype, method, function (original, ...args) { const result = original.apply(this, args); drawScore(this); return result; });
    }
    wrap(NetworkHandler.prototype, 'keydown', function (original, event) {
        const ctrl = event.ctrlKey || event.metaKey;
        if (event.isComposing || editable()) return;
        if (ctrl && event.key.toLowerCase() === 'o' && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            if (!event.repeat && !this.state.modals.modals_up.size) this.state.modals.show_modal('upload-modal');
            return;
        }
        if (this.state.modals.modals_up.size) return;
        if (ctrl && event.key === 'Enter' && !event.shiftKey && !event.altKey) {
            event.preventDefault(); if (!event.repeat) this.state.trigger_score(); return;
        }
        if (event.key === 'Escape' && sessionFor(this.state).local) { stopScore(this.state); return; }
        return original.call(this, event);
    });
    wrap(NetworkHandler.prototype, 'pointerdown', function (original, event) {
        if (event.altKey) { this.state.ispointerdown = false; this.drag_mark_coords?.clear(); return; }
        return original.call(this, event);
    });
    wrap(NetworkHandler.prototype, 'pointermove', function (original, event) {
        if (event.altKey) { this.state.ispointerdown = false; this.state.penx = null; this.state.peny = null; }
        return original.call(this, event);
    });
    wrap(NetworkHandler.prototype, 'click', function (original, event) {
        const state = this.state, review = document.getElementById('review');
        if (!review?.contains(event.target) || (!event.altKey && !sessionFor(state).local)) return original.call(this, event);
        const coords = state.board_graphics.pos_to_coord(event.clientX, event.clientY);
        if (coords.some(c => c < 0 || c >= state.size)) return;
        if (event.altKey) {
            if (state.board.get({x: coords[0], y: coords[1]})) this.prepare({event: 'goto_coord', value: coords});
        } else markScore(state, coords);
    });
    // Also attaches after a late userscript/module load: State's existing
    // resize listener looks up this.resize at call time.
    await ready();
    window.dispatchEvent(new Event('resize'));
}

async function start() {
    if (window.__golabEnhancementsInstalled) return;
    window.__golabEnhancementsInstalled = true;
    const isBoard = Boolean(document.querySelector('script[src="/js/init.js"]'));
    const hooks = isBoard ? installBoardHooks() : Promise.resolve();
    await ready();
    addStyle();
    if (!isBoard) {
        enhanceChrome();
        enhanceHelp();
        if (location.pathname === '/') enhanceHome();
    }
    await hooks;
}

start().catch(error => {
    console.error('[Go Lab enhancements] Could not initialize:', error);
    const message = document.createElement('p');
    message.className = 'share-status'; message.setAttribute('role', 'status');
    message.textContent = 'Go Lab enhancements could not load. Check the browser console for details.';
    document.body.append(message);
});
