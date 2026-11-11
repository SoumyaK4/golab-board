import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OwnershipBoard, estimatePosition} from '../src/ownership.mjs';
import {scoreRules, scorePosition} from '../src/scoring.mjs';

test('rules, komi normalization, and handicap compensation match the branch', () => {
    assert.deepEqual(scoreRules({RU: 'Japanese', KM: '6.5', HA: '4'}), {scoring: 'territory', komi: 6.5, handicap: 0});
    assert.deepEqual(scoreRules({RU: 'Chinese', KM: '375', HA: '4'}), {scoring: 'area', komi: 7.5, handicap: 4});
    assert.equal(scoreRules({RU: 'AGA', HA: '4'}).handicap, 3);
    assert.equal(scoreRules({RU: 'AGA', HA: '-1'}).handicap, 0);
    for (const RU of ['NZ', 'New Zealand', 'Tromp-Taylor']) assert.equal(scoreRules({RU}).scoring, 'area');
    assert.equal(scoreRules({RU: 'stone scoring'}).scoring, 'stone');
    for (const KM of ['Infinity', 'NaN', '']) assert.equal(scoreRules({KM}).komi, 0);
});

test('dead stones, captures, area, stone and manual neutral overrides are counted once', () => {
    const points = [1, -1, 0, 0];
    const estimate = {owners: [1, 1, 1, -1], confidence: [1, 0.5, 0.8, -0.7], dead: new Set([1])};
    let {score} = scorePosition(points, estimate, {KM: '6.5'}, [3, 2]);
    assert.equal(score.black_territory, 2);
    assert.equal(score.black_captures, 4);
    assert.equal(score.black_total, 6);
    assert.equal(score.white_total, 9.5);
    ({score} = scorePosition(points, estimate, {RU: 'Chinese', KM: '7.5', HA: '2'}, [3, 2]));
    assert.equal(score.black_stones, 1);
    assert.equal(score.black_captures, 0);
    assert.equal(score.black_total, 3);
    assert.equal(score.white_total, 10.5);
    const {score: overridden, owners} = scorePosition(points, estimate, {}, [0, 0], new Map([[2, 0], [3, 1]]));
    assert.equal(overridden.white_territory, 0);
    assert.equal(overridden.confidence[2], 0);
    assert.deepEqual(owners, [1, 1, 0, 1]);
    ({score} = scorePosition(points, estimate, {RU: 'stone', KM: '0'}, [99, 99]));
    assert.equal(score.black_total, 1);
    assert.equal(score.white_total, 0);
    assert.deepEqual(estimate.owners, [1, 1, 1, -1]);
});

test('empty and one-stone boards have no invented territory at every supported size', async () => {
    for (const size of [7, 9, 13, 19]) {
        const points = Array(size * size).fill(0);
        let result = await estimatePosition(points, size);
        assert.ok(result.owners.every(v => v === 0));
        points[0] = 1;
        result = await estimatePosition(points, size);
        assert.equal(result.owners[0], 1);
        assert.equal(result.owners.filter(Boolean).length, 1);
        assert.deepEqual(points, [1, ...Array(size * size - 1).fill(0)]);
    }
});

test('group traversal and capture work at board edges without transposing coordinates', () => {
    const board = new OwnershipBoard([0, 1, 0, 1, -1, 1, 0, 0, 0], 3);
    const [group, border] = board.region(board.points, 4);
    assert.deepEqual(group, [4]);
    assert.deepEqual(new Set(border), new Set([1, 3, 5, 7]));
    assert.equal(board.place(7, 1, []), true);
    assert.equal(board.points[4], 0);
});

test('manual dead marking expands to the whole chain and is reversible', async () => {
    const points = [1, 1, 1, 1, -1, -1, 1, 1, 1];
    const result = await estimatePosition(points, 3, 1, new Set([4, -1, 40]));
    assert.deepEqual(result.dead, new Set([4, 5]));
    assert.equal(result.owners[4], 1);
    const alive = await estimatePosition(points, 3, 1, new Set());
    assert.equal(alive.dead.size, 0);
    assert.equal(alive.owners[4], -1);
    assert.deepEqual(points, [1, 1, 1, 1, -1, -1, 1, 1, 1]);
});

test('automatic estimation is deterministic, yields and can be cancelled', async () => {
    const points = [1, 0, 0, 0, 0, 0, 0, 0, -1];
    let yields = 0;
    const first = await estimatePosition(points, 3, 1, null, true, async () => { yields++; });
    const second = await estimatePosition(points, 3);
    assert.deepEqual(first, second);
    assert.ok(yields > 10);
    assert.ok(first.confidence.every(v => v >= -1 && v <= 1));
    await assert.rejects(estimatePosition(points, 3, 1, null, true, async () => { throw new Error('cancel'); }), /cancel/);
});

test('ownership and confidence match reference outputs from the original Go estimator', async () => {
    // Generated from d29b2f0's estimateOwnership, using points[i] = 1 when
    // i%7==0 and -1 when i%11==0, for both players and scoring modes.
    const fixtures = JSON.parse(await readFile(new URL('ownership-fixtures.json', import.meta.url), 'utf8'));
    for (const fixture of fixtures) {
        const board = new OwnershipBoard(fixture.points, fixture.size);
        const result = await board.analyze(fixture.player, async () => {});
        board.correctSeki(fixture.points, result.owners, result.confidence, fixture.territory);
        assert.deepEqual(result.owners, fixture.owners);
        assert.deepEqual(result.confidence, fixture.confidence);
    }
});
