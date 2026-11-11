# Go Lab enhancements for Tampermonkey

This userscript carries the UI and behavior improvements from this branch onto
an unmodified Go Lab installation. The application files are synchronized with
`test` at `5841409` (highlight tool). No server changes are needed.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open its dashboard and choose **Create a new script**.
3. Replace the template with the entire contents of
   [golab-enhancements.user.js](golab-enhancements.user.js) and save.
4. Reload Go Lab. The script matches `https://golab.gg/`, its subdomains, and
   HTTP `localhost` / `127.0.0.1` on any port. For a self-hosted instance, add its
   origin as another `@match` in the userscript header.

Use the generated `.user.js` file; the files in `src/` are build inputs. The
userscript has no bundled library dependencies or Tampermonkey grants. It uses
the site's own assets and imports its existing JavaScript modules to
extend the running app. Disabling it and reloading restores the stock UI.

## Included improvements

- Redesigned home page, navigation, footer, light/dark colors, and responsive
  board workspace with wide, compact, and mobile layouts.
- Copy invite link, accessible icon buttons, visible keyboard focus, selected
  tool states, and improved comment input. Upstream highlighting, drag-to-mark,
  automatic move numbering, and server fixes remain available.
- Mouse-wheel navigation over the board or game tree. Scroll down/up to go
  forward/back; **Shift** jumps ten moves along the selected variation;
  **Ctrl** jumps to the start/end. Turn this off in **Settings → Behavior**;
  the preference is saved in your browser. Navigation follows the site's usual
  shared-room behavior.
- **Alt+click** a stone to jump to its move in any tool mode. The existing
  **Shift+click** move jump with alternating stones still works.
- **Ctrl+O / Cmd+O** opens SGF upload. Board shortcuts pause while typing or
  while a modal is open.
- **Score** or **Ctrl+Enter / Cmd+Enter** toggles a local score estimate, with
  automatic dead-group detection, confidence-sized ownership squares, and a
  breakdown for territory, area, or stone scoring based on the SGF rules.
  Komi and the original estimator's handicap adjustments are included.
  Click a stone to toggle its whole group dead/alive, or an empty point to
  cycle Black → White → neutral. Press **Escape** to close the estimate.

Estimates and corrections stay in your browser; they do not edit the SGF or
send scoring commands to other players. A new room frame, move navigation,
reconnection, reset, or tool change dismisses the estimate and cancels pending
work. Estimates use the branch's heuristic estimator, so complex fights may
need manual correction. Computation yields to the browser between batches;
there is no worker or CSP exception required.

Compatibility is tied to Go Lab's current `/js/state.js`, `/js/network_handler.js`,
`/js/treegraphics.js`, and DOM structure. Future upstream changes to those
interfaces may require an update. Browser checks exercise the script in the
page context under the server's CSP; extension installation itself is manual.

## Build and check

Requires Node.js 20 or newer. From the repository root:

```sh
node userscripts/build.mjs
node --check userscripts/golab-enhancements.user.js
node userscripts/build.mjs --check
node --test userscripts/test/scoring.test.mjs
```

The build embeds CSS, markup, and source modules into one installable file. No
package installation is required. Keep the generated file in the same commit
as source changes. Estimator tests include fixed reference outputs from the
original Go implementation.

For browser checks, run a disposable server with
`go run ./cmd -f config/config-memory.yaml`, make Playwright available, and run:

```sh
node userscripts/test/browser.mjs
```

The browser test creates a temporary room in that server. It checks home-page
submission, five viewport sizes, accessibility labels, local scoring without
outbound commands, group corrections, highlighting and drag marks, navigation,
saved preferences, remote-move invalidation, and late/duplicate injection.
`GOLAB_TEST_URL`, `PLAYWRIGHT_MODULE`, and `CHROMIUM_PATH` optionally select a
different local server, installed Playwright module, or Chromium executable.
