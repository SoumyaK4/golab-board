/*
Copyright (c) 2026 Jared Nishikawa

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

function create_div(className, id) {
    const element = document.createElement("div");
    element.className = className;
    if (id) element.id = id;
    return element;
}

export function create_layout() {
    const content = document.getElementById("content");
    const header = document.createElement("header");
    header.className = "workspace-header";
    header.innerHTML = `<a class="brand" href="/" aria-label="Go Lab home"><span class="icon-circle-logo" aria-hidden="true"></span></a>
        <div class="room-actions"><a href="/about" target="_blank" rel="noopener noreferrer" class="help-link">Help <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a><button class="btn btn-primary" id="share-board" type="button" aria-label="Copy invite link"><i class="bi bi-link-45deg" aria-hidden="true"></i> <span class="invite-label">Copy invite link</span><span class="invite-label-short">Invite</span></button></div>`;
    const roomName = decodeURIComponent(window.location.pathname.split("/").pop());
    document.title = `${roomName} · Go Lab`;
    const shareStatus = document.createElement("p");
    shareStatus.className = "share-status";
    shareStatus.setAttribute("role", "status");
    const shareButton = header.querySelector("#share-board");
    let feedbackTimer;
    shareButton.addEventListener("click", async () => {
        clearTimeout(feedbackTimer);
        try {
            await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
            shareStatus.textContent = "Link copied. Send it to a friend to join this board.";
            feedbackTimer = setTimeout(() => { shareStatus.textContent = ""; }, 5000);
        } catch {
            shareStatus.textContent = "Copy the address from your browser to invite someone to this board.";
        }
    });
    content.append(shareStatus);

    const workspace = create_div("workspace");
    const board = create_div("board-main");
    const tools = create_div("board-tools");
    for (const [id, label] of [["buttons-row1", "Stones & markers"], ["buttons-row2", "Drawing & editing"]]) {
        const group = create_div("tool-group", `${id}-container`);
        const caption = document.createElement("p");
        caption.className = "panel-label";
        caption.textContent = label;
        const buttons = create_div("tool-buttons", id);
        buttons.setAttribute("role", "group");
        buttons.setAttribute("aria-label", label);
        group.append(caption, buttons);
        tools.append(group);
    }
    const review = create_div("", "review");
    review.setAttribute("size", "19");
    const arrows = create_div("navigation-buttons", "arrows");
    arrows.setAttribute("role", "group");
    arrows.setAttribute("aria-label", "Move navigation");
    const actions = create_div("board-actions", "buttons-row3");
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", "Game and room options");
    board.append(review);

    const sidebar = document.createElement("aside");
    sidebar.className = "board-sidebar";
    sidebar.setAttribute("aria-label", "Game details");
    const players = create_div("player-cards");
    players.append(create_div("", "black-namecard-container"), create_div("", "white-namecard-container"));
    const heading = document.createElement("h2");
    heading.className = "panel-label tree-heading";
    heading.textContent = "Game tree";
    const explorerContainer = create_div("", "explorer_container");
    explorerContainer.setAttribute("aria-label", "Game variations");
    explorerContainer.tabIndex = 0;
    const explorer = create_div("", "explorer");
    explorer.style.position = "relative";
    explorerContainer.append(explorer);
    const hint = document.createElement("p");
    hint.className = "workspace-hint";
    hint.innerHTML = '<i class="bi bi-lightbulb" aria-hidden="true"></i> Explore a new move to create a variation. Use ← → to step through the game.';
    const score = create_div("score-panel", "score-estimate");
    score.hidden = true;
    score.setAttribute("aria-label", "Local score estimate");
    sidebar.append(score, heading, explorerContainer, hint, create_div("", "comments"));
    const roomInfo = create_div("board-info");
    const controls = create_div("board-controls");
    controls.append(actions, arrows);
    roomInfo.append(header, players, controls);
    workspace.append(roomInfo, tools, board, sidebar);
    content.append(workspace);

    function updateLayout() {
        const contentStyle = getComputedStyle(content);
        const workspaceStyle = getComputedStyle(workspace);
        const availableWidth = content.clientWidth - parseFloat(contentStyle.paddingLeft) - parseFloat(contentStyle.paddingRight);
        const availableHeight = window.innerHeight - parseFloat(contentStyle.paddingTop) - parseFloat(contentStyle.paddingBottom);
        const sideWidth = parseFloat(workspaceStyle.getPropertyValue("--side-min"));
        const gap = parseFloat(workspaceStyle.getPropertyValue("--column-gap"));
        const fullHeightFits = availableWidth >= availableHeight + 2 * (sideWidth + gap);
        const layout = window.innerWidth <= 800 ? "stacked" : fullHeightFits ? "wide" : "compact";
        if (workspace.dataset.layout === layout) return;
        workspace.dataset.layout = layout;
        if (layout === "stacked") {
            board.append(controls);
        } else if (layout === "compact") {
            workspace.insertBefore(controls, sidebar);
        } else {
            roomInfo.append(controls);
        }
    }
    updateLayout();
    return {resize: updateLayout};
}
