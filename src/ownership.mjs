// Browser port of this branch's Go ownership estimator. Points are row-major:
// 0 = empty, 1 = black, -1 = white. No server commands or board mutations.
const TRIALS = 1000;
const TOLERANCE = 0.30;

export class OwnershipBoard {
    constructor(points, size) {
        this.points = [...points];
        this.neighbors = points.map(() => []);
        this.corners = points.map(() => []);
        this.visited = new Int32Array(points.length);
        this.queue = new Int32Array(points.length);
        this.generation = 0;
        this.random = 0x811c9dc5;
        this.ko = -1;
        for (let p = 0; p < points.length; p++) {
            this.random = Math.imul(this.random ^ (points[p] + 2), 0x01000193) & 0x7fffffff;
            const x = p % size, y = Math.floor(p / size);
            if (x > 0) this.neighbors[p].push(p - 1);
            if (x + 1 < size) this.neighbors[p].push(p + 1);
            if (y > 0) this.neighbors[p].push(p - size);
            if (y + 1 < size) this.neighbors[p].push(p + size);
            for (const dy of [-1, 1]) for (const dx of [-1, 1]) {
                if (x + dx >= 0 && x + dx < size && y + dy >= 0 && y + dy < size) {
                    this.corners[p].push(p + dy * size + dx);
                }
            }
        }
        this.random ||= 1;
    }

    region(source, start) {
        const group = [], border = [];
        this.generation++;
        this.queue[0] = start;
        this.visited[start] = this.generation;
        let length = 1;
        for (let i = 0; i < length; i++) {
            const p = this.queue[i];
            if (source[p] !== source[start]) { border.push(p); continue; }
            group.push(p);
            for (const q of this.neighbors[p]) {
                if (this.visited[q] !== this.generation) {
                    this.visited[q] = this.generation;
                    this.queue[length++] = q;
                }
            }
        }
        return [group, border];
    }

    liberties(start, stopAtFirst = false) {
        this.generation++;
        this.queue[0] = start;
        this.visited[start] = this.generation;
        let length = 1, liberties = 0;
        for (let i = 0; i < length; i++) for (const q of this.neighbors[this.queue[i]]) {
            if (this.visited[q] === this.generation) continue;
            this.visited[q] = this.generation;
            if (this.points[q] === this.points[start]) this.queue[length++] = q;
            else if (this.points[q] === 0) {
                liberties++;
                if (stopAtFirst) return liberties;
            }
        }
        return liberties;
    }

    minLiberties(p) {
        return Math.min(...this.neighbors[p].map(q => this.liberties(q)));
    }

    eye(p, player, horseshoe = false) {
        let friendly = 0, opposing = 0, hostile = 0;
        for (const q of this.neighbors[p]) {
            if (this.points[q] === player) friendly++;
            if (this.points[q] === -player) opposing++;
        }
        if (friendly < this.neighbors[p].length - Number(horseshoe) || opposing) return false;
        for (const q of this.corners[p]) if (this.points[q] === -player) hostile++;
        return !(hostile >= Math.floor(this.corners[p].length / 2) && this.minLiberties(p) <= 1);
    }

    place(p, player, possible) {
        if (p === this.ko) return false;
        this.points[p] = player;
        let captured = false, ko = -1;
        for (const q of this.neighbors[p]) {
            if (this.points[q] !== -player || this.liberties(q, true)) continue;
            const [group] = this.region(this.points, q);
            for (const member of group) { this.points[member] = 0; possible.push(member); }
            if (group.length === 1) ko = group[0];
            captured = true;
        }
        if (!captured && !this.liberties(p, true)) { this.points[p] = 0; return false; }
        this.ko = ko;
        return true;
    }

    fillFalseEyes() {
        const eyes = [];
        for (let p = 0; p < this.points.length; p++) {
            if (this.points[p] || this.minLiberties(p) > 1) continue;
            for (const player of [1, -1]) {
                if (this.neighbors[p].every(q => this.points[q] === player) &&
                    this.corners[p].filter(q => this.points[q] === -player).length >= Math.floor(this.corners[p].length / 2)) {
                    eyes.push(p); break;
                }
            }
        }
        for (const p of eyes) this.place(p, this.points[this.neighbors[p][0]], []);
    }

    playOut(player, life, seki) {
        this.ko = -1;
        let possible = [], illegal = [], passed = false;
        for (let p = 0; p < this.points.length; p++) {
            if (!this.points[p] && !life[p] && !seki[p]) possible.push(p);
        }
        for (let sanity = 999; possible.length && sanity > 0; sanity--) {
            this.random = (Math.imul(this.random, 1103515245) + 12345) & 0x7fffffff;
            const i = this.random % possible.length, p = possible[i];
            const legal = !this.eye(p, player) && this.place(p, player, possible);
            possible.splice(i, 1);
            if (legal) {
                passed = false; player = -player;
                possible.push(...illegal); illegal = [];
            } else {
                illegal.push(p);
                if (!possible.length) {
                    if (passed) break;
                    passed = true; player = -player;
                    possible.push(...illegal); illegal = [];
                }
            }
        }
    }

    async rollout(player, pullUpLife, life, bias, seki, pause) {
        const n = this.points.length;
        life ||= new Int32Array(n);
        seki ||= new Int32Array(n);
        const result = bias ? [...bias] : Array(n).fill(0);
        const played = new OwnershipBoard(this.points, Math.sqrt(n));
        played.random = this.random;
        for (let trial = 0; trial < TRIALS; trial++) {
            // Cooperatively yield: works with Go Lab's CSP, which disallows blob workers.
            if (trial % 16 === 0) await pause();
            played.points = [...this.points];
            played.playOut(player, life, seki);
            for (let p = 0; p < n; p++) {
                if (played.points[p] === 0) {
                    const [group, border] = played.region(played.points, p);
                    let owner = border.length ? played.points[border[0]] : 0;
                    if (border.some(q => played.points[q] !== owner)) owner = 0;
                    if (owner) for (const q of group) played.points[q] = owner;
                }
                result[p] += played.points[p];
            }
        }
        this.random = played.random;
        const visited = new Set();
        for (let p = 0; p < n; p++) {
            if (!this.points[p] || visited.has(p)) continue;
            const [group, border] = this.region(this.points, p);
            let selected = result[group[0]];
            for (const q of group) {
                visited.add(q);
                if (Math.abs(result[q]) > Math.abs(selected)) selected = result[q];
            }
            if (pullUpLife) for (const q of border) {
                if (selected < 0) selected = Math.min(selected, result[q]);
                else if (selected > 0) selected = Math.max(selected, result[q]);
            }
            for (const q of group) result[q] = selected;
        }
        return result;
    }

    scanSeki(rollout) {
        const seki = Array(this.points.length).fill(0), visited = new Set();
        const threshold = TRIALS / 5;
        for (let p = 0; p < this.points.length; p++) {
            if (visited.has(p)) continue;
            const [group, border] = this.region(this.points, p);
            for (const q of group) visited.add(q);
            if (!this.points[p] || group.some(q => Math.abs(rollout[q]) > threshold)) continue;
            const opponents = border.filter(q => this.points[q] === -this.points[p]);
            const libs = border.filter(q => !this.points[q]).length;
            if (!opponents.some(q => Math.abs(rollout[q]) <= threshold)) continue;
            if (opponents.some(q => Math.abs(rollout[q]) < threshold && this.liberties(q) !== libs)) continue;
            for (const q of [...group, ...border.filter(q => !this.points[q])]) seki[q] = 1;
        }
        return seki;
    }

    strongLife() {
        const n = this.points.length, territory = Array(n).fill(0);
        const unified = [...this.points], result = Array(n).fill(0);
        for (let p = 0; p < n; p++) {
            if (this.points[p] || territory[p]) continue;
            const [group, border] = this.region(this.points, p);
            let owner = border.length ? this.points[border[0]] : 0;
            if (border.some(q => this.points[q] !== owner)) owner = 0;
            for (const q of group) { territory[q] = group.length * owner; unified[q] = owner; }
        }
        const visited = new Set();
        for (let p = 0; p < n; p++) {
            if (visited.has(p)) continue;
            const [group] = this.region(unified, p);
            let eyes = 0, count = 0;
            for (const q of group) {
                if (visited.has(q) || !territory[q]) continue;
                const [eye] = this.region(this.points, q);
                for (const r of eye) visited.add(r);
                eyes++; count += eye.length;
            }
            for (const q of group) { visited.add(q); if (eyes >= 2 || count >= 5) result[q] = count; }
        }
        return result;
    }

    async analyze(player, pause) {
        this.fillFalseEyes();
        const seki = this.scanSeki(await this.rollout(player, false, null, null, null, pause));
        const bias = Array(this.points.length).fill(0);
        for (let p = 0; p < this.points.length; p++) {
            if (this.points[p] || !(this.eye(p, 1, true) || this.eye(p, -1, true))) continue;
            for (const q of this.neighbors[p]) {
                const [group] = this.region(this.points, q);
                for (const r of group) bias[r]++;
            }
        }
        for (let p = 0; p < bias.length; p++) bias[p] *= this.points[p] * Math.trunc(TRIALS * TOLERANCE / 4);
        const pass = await this.rollout(player, true, this.strongLife(), bias, seki, pause);
        const owners = Array(pass.length).fill(0), confidence = pass.map(v => Math.max(-1, Math.min(1, v / TRIALS)));
        const threshold = TRIALS * TOLERANCE;
        for (let p = 0; p < pass.length; p++) {
            if (pass[p] > threshold) owners[p] = 1;
            else if (pass[p] < -threshold) owners[p] = -1;
            else if (this.points[p] && Math.abs(pass[p]) >= threshold / 3) owners[p] = Math.sign(pass[p]);
        }
        const visited = new Set();
        for (let p = 0; p < owners.length; p++) {
            if (owners[p] || visited.has(p)) continue;
            const [group, border] = this.region(this.points, p);
            const black = !border.some(q => owners[q] === -1), white = !border.some(q => owners[q] === 1);
            for (const q of group) { visited.add(q); if (black) owners[q] = 1; else if (white) owners[q] = -1; }
        }
        return {owners, confidence};
    }

    correctSeki(points, owners, confidence, territory) {
        const chains = [], chainAt = Array(points.length).fill(-1);
        for (let p = 0; p < points.length; p++) {
            if (!points[p] || chainAt[p] >= 0) continue;
            const [group, border] = this.region(points, p);
            for (const q of group) chainAt[q] = chains.length;
            chains.push({points: group, libs: border.filter(q => !points[q]), color: points[p]});
        }
        const setOwner = (p, owner) => { owners[p] = owner; confidence[p] = owner; };
        for (let a = 0; a < chains.length; a++) {
            const first = chains[a];
            if (first.libs.length !== 2) continue;
            for (let b = a + 1; b < chains.length; b++) {
                const second = chains[b];
                if (first.color === second.color || second.libs.length !== 2) continue;
                const shared = first.libs.filter(p => second.libs.includes(p));
                if (!shared.length) continue;
                const privateFirst = first.libs.filter(p => !second.libs.includes(p));
                const privateSecond = second.libs.filter(p => !first.libs.includes(p));
                const closed = [...first.libs, ...second.libs].every(p => this.neighbors[p].every(q => chainAt[q] === a || chainAt[q] === b));
                const trueEye = (p, id) => [...this.neighbors[p], ...this.corners[p]].every(q => chainAt[q] === id);
                if (!closed || (shared.length === 1 && (!trueEye(privateFirst[0], a) || !trueEye(privateSecond[0], b)))) continue;
                for (const p of first.points) setOwner(p, first.color);
                for (const p of second.points) setOwner(p, second.color);
                for (const p of shared) setOwner(p, 0);
                for (const p of privateFirst) setOwner(p, territory ? 0 : first.color);
                for (const p of privateSecond) setOwner(p, territory ? 0 : second.color);
            }
        }
    }
}

async function estimateOwnership(points, size, player, territory, pause) {
    if (points.filter(Boolean).length <= 1) return {owners: [...points], confidence: [...points]};
    const board = new OwnershipBoard(points, size);
    const result = await board.analyze(player, pause);
    board.correctSeki(points, result.owners, result.confidence, territory);
    return result;
}

export async function estimatePosition(points, size, next = 1, dead = null, territory = true, pause = async () => {}) {
    const board = new OwnershipBoard(points, size);
    if (dead === null) {
        dead = new Set();
        if (points.filter(Boolean).length > 1) {
            const black = await estimateOwnership(points, size, 1, territory, pause);
            const white = await estimateOwnership(points, size, -1, territory, pause);
            const seen = new Set();
            for (let p = 0; p < points.length; p++) {
                if (!points[p] || seen.has(p)) continue;
                const [group] = board.region(points, p);
                let influence = 0;
                for (const q of group) { seen.add(q); influence += (black.confidence[q] + white.confidence[q]) / 2; }
                if (influence / group.length * points[p] < -TOLERANCE) for (const q of group) dead.add(q);
            }
        }
    }
    const effectiveDead = new Set();
    for (const p of dead) {
        if (p < 0 || p >= points.length || !points[p] || effectiveDead.has(p)) continue;
        const [group] = board.region(points, p);
        for (const q of group) effectiveDead.add(q);
    }
    const retained = points.map((v, p) => effectiveDead.has(p) ? 0 : v);
    const result = await estimateOwnership(retained, size, next, territory, pause);
    for (let p = 0; p < points.length; p++) {
        if (points[p]) result.owners[p] = points[p] * (effectiveDead.has(p) ? -1 : 1);
    }
    return {...result, dead: effectiveDead};
}
