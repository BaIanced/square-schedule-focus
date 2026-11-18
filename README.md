# Square Schedule – Focus View

A Tampermonkey userscript for the **Square Dashboard → Staff → Scheduling** page (Week and Day views). It changes only how the page looks in your own browser and never saves anything to Square by itself.

## Install
1. Install [Tampermonkey](https://www.tampermonkey.net/) in Chrome. On newer Chrome versions, also turn on **Allow User Scripts** in Tampermonkey's extension details page.
2. Open the [script file](https://raw.githubusercontent.com/BaIanced/square-schedule-focus/main/square-schedule-focus.user.js). Tampermonkey shows an install page; click **Install**.
3. Updates install automatically when the version number goes up.

## What it does
A button bar at the bottom right of the schedule:
- **Day buttons** (Week view): hide any days, e.g. show only Mon–Wed. **All** brings every day back.
- **Menu**: show or hide Square's sidebar.
- **Fit** (Week view): shrinks rows so every team member fits on screen.
- **Read**: Atkinson Hyperlegible font, extra letter spacing, row stripes and a highlight on the row under your mouse.
- **Colors**: themes (Square, Dark, Dim, Midnight, Warm, Contrast, Custom), six color pickers, shift style (Fill, Outline or Mix with a fill-opacity slider), and an option to use one color for all shifts instead of Square's job colors.

It also:
- shows shift **times first and bold**, with the job name smaller after them;
- hides labor cost (set `SHOW_COST = true` at the top of the script to show it);
- hides the grid of "+" icons on empty slots; only the slot under your mouse shows one;
- fixes Square's shift editor time box, where typing a time like 5:30 can drop digits.

Settings are saved in your browser (localStorage), per computer.

## Testing without touching Square
`test_snapshot.py` loads a saved copy of the schedule page in headless Chrome, runs the script with given settings, and prints what changed. It needs Python, `pip install playwright`, and Chrome. Snapshots contain real staff data, so they live **outside** this repo (default `../private/square-snapshots`, or set `SQ_SNAPSHOT_DIR`).

```
python test_snapshot.py week "{\"theme\":\"warm\",\"shape\":\"mix\",\"fillPct\":25}" --shot test.png
```

## Notes
- Built against Square's page as of November 2026. If Square redesigns the page, parts of the script stop applying; the page itself keeps working.
- Not affiliated with Square or Block, Inc.
