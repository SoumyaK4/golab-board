export function scoreRules(fields = {}) {
    const rules = String(fields.RU || '').toLowerCase();
    const handicap = Math.max(0, Number.parseInt(fields.HA, 10) || 0);
    let scoring = 'territory', adjustment = 0;
    if (rules.includes('chinese')) { scoring = 'area'; adjustment = handicap; }
    else if (rules.includes('aga')) { scoring = 'area'; adjustment = Math.max(0, handicap - 1); }
    else if (rules.includes('new zealand') || rules.includes('tromp') || rules === 'nz') scoring = 'area';
    else if (rules.includes('stone')) scoring = 'stone';
    let komi = Number.parseFloat(fields.KM);
    if (!Number.isFinite(komi)) komi = 0;
    if (komi === 375) komi = 7.5;
    return {scoring, handicap: adjustment, komi};
}

export function scorePosition(points, estimate, fields, captures = [0, 0], overrides = new Map()) {
    const score = {...scoreRules(fields), confidence: [...estimate.confidence],
        black_territory: 0, white_territory: 0, black_captures: 0, white_captures: 0,
        black_stones: 0, white_stones: 0, black_total: 0, white_total: 0};
    if (score.scoring === 'territory') [score.black_captures, score.white_captures] = captures;
    const owners = [...estimate.owners];
    for (let p = 0; p < points.length; p++) {
        const stone = points[p];
        if (stone && !estimate.dead.has(p)) {
            if (score.scoring !== 'territory') score[stone === 1 ? 'black_stones' : 'white_stones']++;
            continue;
        }
        if (!stone && overrides.has(p)) {
            owners[p] = overrides.get(p);
            score.confidence[p] = owners[p];
        }
        if (stone && score.scoring === 'territory') score[stone === 1 ? 'white_captures' : 'black_captures']++;
        if (owners[p] && score.scoring !== 'stone') score[owners[p] === 1 ? 'black_territory' : 'white_territory']++;
    }
    score.black_total = score.black_territory + score.black_captures + score.black_stones;
    score.white_total = score.white_territory + score.white_captures + score.white_stones + score.komi + score.handicap;
    return {score, owners};
}
