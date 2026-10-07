/*
Copyright (c) 2026 Jared Nishikawa

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

export function create_comments(_state) {
    let state = _state;
    let container = document.getElementById("comments");
    let comments = document.createElement("div");
    comments.style.textAlign = "left";
    //comments.style.background = "#FEFEFE";
    let input_bar = document.createElement("input");
    input_bar.placeholder = "Add a comment…";
    input_bar.className = "form-control";
    input_bar.setAttribute("aria-label", "Add a comment to this move; press Enter to send");

    input_bar.addEventListener("keypress", (event) => {
        if (event.key == "Enter" && !event.isComposing && input_bar.value.trim()) {
            let v = input_bar.value;
            input_bar.value = "";
            state.network_handler.prepare_comment(v);
        }
    });

    container.appendChild(comments);
    container.appendChild(input_bar);
    container.hidden = true;
    let _hidden = true;

    function update(text) {
        let temp = document.createElement("div");
        temp.textContent = text;
        comments.innerHTML += temp.innerHTML + "<br>";
        temp.remove();
    }

    function store(text) {
        //state.board.tree.current.add_field("C", text);
    }

    function clear() {
        comments.innerHTML = "";
    }

    function hidden() {
        return _hidden;
    }

    function show() {
        container.hidden = false;
        _hidden = false;
    }

    function hide() {
        container.hidden = true;
        _hidden = true;
    }

    return {
        update,
        store,
        clear,
        hidden,
        hide,
        show,
    };
}
