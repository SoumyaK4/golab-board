export function render_score(score) {
    const panel = document.getElementById("score-estimate");
    panel.hidden = !score;
    if (!score) return;
    const expanded = panel.querySelector("details")?.open ?? false;
    panel.replaceChildren();
    const number = value => Number(value.toFixed(2)).toString();
    const lead = score.black_total - score.white_total;
    const result = document.createElement("p");
    result.className = "score-lead";
    result.setAttribute("role", "status");
    result.textContent = lead === 0 ? "Estimated even game" : `${lead > 0 ? "Black" : "White"} ahead by ${number(Math.abs(lead))}`;
    const details = document.createElement("details");
    details.open = expanded;
    const summary = document.createElement("summary");
    summary.textContent = `${score.scoring === "area" ? "Area" : score.scoring === "stone" ? "Stone" : "Territory"} estimate · breakdown`;
    const table = document.createElement("table");
    const header = table.createTHead().insertRow();
    for (const label of ["Points", "Black", "White"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        header.append(cell);
    }
    const rows = [];
    if (score.scoring !== "stone") rows.push(["Territory", score.black_territory, score.white_territory]);
    if (score.scoring === "territory") rows.push(["Captures + dead", score.black_captures, score.white_captures]);
    else rows.push(["Living stones", score.black_stones, score.white_stones]);
    rows.push(["Komi", 0, score.komi]);
    if (score.handicap) rows.push(["Handicap", 0, score.handicap]);
    rows.push(["Total", score.black_total, score.white_total]);
    const body = table.createTBody();
    for (const [label, black, white] of rows) {
        const row = body.insertRow();
        const cell = document.createElement("th");
        cell.scope = "row";
        cell.textContent = label;
        row.append(cell);
        row.insertCell().textContent = number(black);
        row.insertCell().textContent = number(white);
    }
    const hint = document.createElement("p");
    hint.textContent = "Click stones to toggle a dead group. Click empty points to cycle Black, White, neutral. Smaller squares are less certain. Complex fights may need correction.";
    details.append(summary, table, hint);
    panel.append(result, details);
}
