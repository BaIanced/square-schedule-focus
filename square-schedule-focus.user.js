// ==UserScript==
// @name         Square Schedule – Focus View
// @namespace    vince.square.schedule
// @version      2.4.0
// @description  Week + Day view: hide days, collapse sidebar, fit staff on screen, hide labor $, readability, color themes with custom picker, time-first shift labels, quiet "+" slots, unpublished-shift highlight, time-entry fix.
// @match        https://app.squareup.com/dashboard/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/BaIanced/square-schedule-focus
// @supportURL   https://github.com/BaIanced/square-schedule-focus/issues
// @updateURL    https://raw.githubusercontent.com/BaIanced/square-schedule-focus/main/square-schedule-focus.user.js
// @downloadURL  https://raw.githubusercontent.com/BaIanced/square-schedule-focus/main/square-schedule-focus.user.js
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings -----------------------------------------------------------
  const SHOW_COST = false;          // labor $ stays hidden (Week + Day); set true to show it again
  const MIN_ROW = 30;               // px, smallest Week row height when fitting
  const MAX_ROW = 72;               // px, Square's normal Week row height
  const KEY = 'sqFocusViewV2';      // same key as v2.0, so saved day/menu/fit/read choices carry over
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Theme presets: bg = page, surface = header/cells, text, grid = lines, accent = buttons/highlights, shift = shift blocks
  const PRESETS = {
    dark:     { bg: '#121417', surface: '#1a1d22', text: '#e6e8eb', grid: '#2b3038', accent: '#4c8dff', shift: '#2e9e7a' },
    dim:      { bg: '#22272e', surface: '#2a3038', text: '#d6dbe1', grid: '#3a414b', accent: '#6aa3ff', shift: '#3fa58a' },
    midnight: { bg: '#0d1324', surface: '#141c33', text: '#e3e8f5', grid: '#24304f', accent: '#7aa2ff', shift: '#4b7bec' },
    warm:     { bg: '#1d1a16', surface: '#26221c', text: '#f1e6cf', grid: '#3a3328', accent: '#e0a85a', shift: '#c98b3c' },
    contrast: { bg: '#000000', surface: '#0a0a0a', text: '#ffffff', grid: '#5a5a5a', accent: '#ffd400', shift: '#0091ea' },
  };
  const PRESET_NAMES = { off: 'Square', dark: 'Dark', dim: 'Dim', midnight: 'Midnight', warm: 'Warm', contrast: 'Contrast', custom: 'Custom' };
  const COLOR_FIELDS = [['bg', 'Background'], ['surface', 'Headers / cells'], ['text', 'Text'], ['grid', 'Grid lines'], ['accent', 'Accent'], ['shift', 'Shift blocks'],
    ['publish', 'Publish button'], ['controls', 'Filter-bar controls'], ['today', 'Today highlight'], ['warn', 'Warning icons'], ['unpub', 'Unpublished highlight']];

  const SHAPES = { fill: 'Fill', outline: 'Outline', mix: 'Mix' };
  const DEFAULTS = { hidden: [], nav: false, fit: true, read: true, theme: 'dark', custom: Object.assign({}, PRESETS.dark), squareShift: true, shape: 'fill', fillPct: 30, site: true, unpubHL: true };
  const load = () => {
    try {
      const s = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
      s.custom = Object.assign({}, PRESETS.dark, s.custom || {});
      return s;
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  };
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const onPage = () => location.pathname.includes('/shifts/schedule');

  // ---- Color helpers ------------------------------------------------------
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const readableOn = hex => (luminance(hex) > 0.4 ? '#111111' : '#ffffff');
  // Fields added in v2.2 fall back to existing ones, so presets and older saved Custom themes need no migration
  const fullColors = c => c && Object.assign({ publish: c.accent, controls: c.surface, today: c.accent, warn: '#f5b942', unpub: '#f59e0b' }, c);
  const themeColors = () => fullColors((S.theme === 'custom' ? S.custom : PRESETS[S.theme]) || null);

  // ---- Readable font (Square's CSP allows fonts.googleapis.com) -----------
  function ensureFont() {
    if (document.getElementById('tm-sq-font')) return;
    const l = document.createElement('link');
    l.id = 'tm-sq-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap';
    document.head.appendChild(l);
  }

  // ---- Static CSS (all scoped to html.tm-sq-on) ---------------------------
  const BASE_CSS = `
html.tm-sq-on .banner-static,
html.tm-sq-on .shifts-page__heading,
html.tm-sq-on .feedback-survey { display:none !important; }
html.tm-sq-on .filter-bar { padding-top:4px !important; padding-bottom:4px !important; margin:0 !important; }

/* Labor cost (Week + Day) */
html.tm-sq-on.tm-nocost .schedule-table__row__cell--header__summary__labor-cost,
html.tm-sq-on.tm-nocost .schedule-table__footer__labor-cost,
html.tm-sq-on.tm-nocost .timeline-table__column--left__content--schedule__summary__labor-cost,
html.tm-sq-on.tm-nocost .timeline-table__footer__labor-cost { display:none !important; }

/* Sidebar collapsed: remove the gutter */
html.tm-sq-on.tm-nav-off {
  --ecosystem-header-shared-offset-left:0px !important;
  --ecosystem-header-fixed-left-nav-offset-left:0px !important;
  --ecosystem-header-shared-secondary-offset-left:0px !important;
}
html.tm-sq-on.tm-nav-off .ecosystem-header-fixed-left-nav-spacer { width:0 !important; min-width:0 !important; }

/* Week name cell: hours moved to the right of the name */
html.tm-sq-on .schedule-table thead th:first-child { width:var(--tm-namecol,230px) !important; }
html.tm-sq-on .schedule-table thead th:not(:first-child) { width:var(--tm-daycol,auto) !important; }
html.tm-sq-on .schedule-table table { table-layout:fixed; width:var(--tm-tablew,100%) !important; }
html.tm-sq-on .schedule-table tbody th.schedule-table__row__cell--header { position:relative; padding:4px 80px 4px 8px !important; vertical-align:middle; }
html.tm-sq-on .schedule-table tbody .schedule-table__row__cell--header__title,
html.tm-sq-on .schedule-table tbody .timecards__text-and-icon__text { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; min-width:0; }
html.tm-sq-on .schedule-table tbody .schedule-table__row__collapsible-caret { display:none !important; }
html.tm-sq-on .schedule-table tbody tr:hover .schedule-table__row__collapsible-caret { display:inline-block !important; }
html.tm-sq-on .schedule-table__row__cell--header__summary { position:absolute; right:8px; top:50%; transform:translateY(-50%); margin:0 !important; }
html.tm-sq-on .schedule-table__row__cell--header__summary__duration { font-weight:700; font-size:14px; font-variant-numeric:tabular-nums; }
html.tm-sq-on .schedule-table tfoot td { padding:4px 8px !important; vertical-align:middle; }
html.tm-sq-on .schedule-table tfoot time { font-weight:700; font-size:14px; font-variant-numeric:tabular-nums; }

/* Time-first shift labels: times big and bold, job name smaller after them */
html.tm-sq-on .schedule-table .schedule-cell-button--existing { display:flex !important; flex-wrap:wrap; align-content:center; align-items:baseline; column-gap:.3em; text-align:left; }
html.tm-sq-on .schedule-table .schedule-cell-button--existing > time { order:0; font-weight:700 !important; font-size:var(--tm-tfs,13px) !important; font-variant-numeric:tabular-nums; white-space:nowrap; }
html.tm-sq-on .schedule-table .schedule-cell-button--existing > .schedule-cell-button__title { order:2; flex-basis:100%; font-size:min(11px, var(--tm-tfs,11px)) !important; opacity:.85; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
/* Shrink the time with the cell (narrow columns when the menu is open) so "10:30 am – 7:30 pm" stays on one line.
   cqi = 1% of the button's content width; the factor is ~100 / (time width in em), a little slack for wider fonts. */
html.tm-sq-on .schedule-table .schedule-cell-button--existing { container-type:inline-size; --tm-tfs:clamp(9px, 10.5cqi, 13px); }
html.tm-sq-on.tm-read .schedule-table .schedule-cell-button--existing { --tm-tfs:clamp(9px, 9.6cqi, 13px); }
html.tm-sq-on .schedule-table .schedule-cell-button--existing > .schedule-cell-button__title strong { font-weight:500 !important; }
html.tm-sq-on .timeline-schedule-cell-button__shift__label { display:flex !important; flex-direction:column; }
html.tm-sq-on .timeline-schedule-cell-button__shift__label [data-test-shift-info-time] { order:-1; }
html.tm-sq-on .timeline-schedule-cell-button__shift__label [data-test-shift-info-time] time { font-size:14px !important; font-weight:700 !important; font-variant-numeric:tabular-nums; }
html.tm-sq-on .timeline-schedule-cell-button__shift__label [data-test-shift-info-first-row] { font-size:11px !important; opacity:.85; }
html.tm-sq-on .timeline-schedule-cell-button__shift__label [data-test-shift-info-first-row] strong { font-weight:500 !important; }

/* Quiet "+" slots: icon hidden until you hover or tab to an empty slot */
html.tm-sq-on .timeline-empty-cell-button svg,
html.tm-sq-on .schedule-cell-button--create:not(.schedule-cell-button--availability) svg { opacity:0 !important; transition:opacity .12s; }
html.tm-sq-on .timeline-empty-cell-button:hover,
html.tm-sq-on .timeline-empty-cell-button:focus-visible,
html.tm-sq-on .schedule-cell-button--create:not(.schedule-cell-button--availability):not([disabled]):hover,
html.tm-sq-on .schedule-cell-button--create:not(.schedule-cell-button--availability):not([disabled]):focus-visible {
  background:color-mix(in srgb, var(--tm-accent, #3d7be0) 16%, transparent) !important;
  outline:1px dashed var(--tm-accent, #3d7be0) !important; outline-offset:-3px; border-radius:6px;
}
html.tm-sq-on .timeline-empty-cell-button:hover svg,
html.tm-sq-on .timeline-empty-cell-button:focus-visible svg,
html.tm-sq-on .schedule-cell-button--create:not([disabled]):hover svg,
html.tm-sq-on .schedule-cell-button--create:not([disabled]):focus-visible svg { opacity:1 !important; }
html.tm-sq-on .timeline-empty-cell-button svg path,
html.tm-sq-on .schedule-cell-button--create svg path { stroke:var(--tm-accent, #3d7be0) !important; }

/* Fit mode (Week): row height driven by --tm-row */
html.tm-sq-on.tm-week.tm-fit .schedule-table tbody tr > * { height:var(--tm-row,72px) !important; padding-top:2px !important; padding-bottom:2px !important; }
html.tm-sq-on.tm-week.tm-fit .schedule-table tbody td { padding-left:3px !important; padding-right:3px !important; vertical-align:middle; }
html.tm-sq-on.tm-week.tm-fit .schedule-table .schedule-cell-button { height:calc(var(--tm-row,72px) - 6px) !important; min-height:0 !important; overflow:hidden; line-height:15px !important; padding:1px 5px !important; }
html.tm-sq-on.tm-week.tm-fit.tm-one .schedule-table .schedule-cell-button--existing { flex-wrap:nowrap; white-space:nowrap; }
html.tm-sq-on.tm-week.tm-fit.tm-one .schedule-table .schedule-cell-button--existing > .schedule-cell-button__title { flex:1 1 0; flex-basis:auto; }
html.tm-sq-on.tm-week.tm-fit .schedule-table thead th { height:34px !important; }

/* Readability mode */
html.tm-sq-on.tm-read .schedule-table,
html.tm-sq-on.tm-read .timeline-table__wrapper,
html.tm-sq-on.tm-read #tm-sq-bar,
html.tm-sq-on.tm-read #tm-sq-theme { font-family:"Atkinson Hyperlegible", "Square Sans Text", Arial, sans-serif !important; }
html.tm-sq-on.tm-read .schedule-table *,
html.tm-sq-on.tm-read .timeline-table__wrapper * { font-family:inherit !important; letter-spacing:.02em; word-spacing:.1em; font-style:normal !important; }
html.tm-sq-on.tm-read .schedule-table__row__cell--header__title { font-size:15px !important; font-weight:700 !important; }
html.tm-sq-on.tm-read .schedule-table thead th { font-size:15px !important; font-weight:700 !important; }
html.tm-sq-on.tm-read .schedule-table tbody tr:nth-child(even) > *,
html.tm-sq-on.tm-read .timeline-table__wrapper tbody tr.timeline-table__row:nth-child(even) > * { background-color:rgba(127,127,127,.10) !important; }
html.tm-sq-on.tm-read .schedule-table tbody tr.tm-hover-row > *,
html.tm-sq-on.tm-read .timeline-table__wrapper tbody tr.tm-hover-row > * { background-color:color-mix(in srgb, var(--tm-accent, #4696ff) 22%, transparent) !important; }

/* Control bar + theme panel */
#tm-sq-bar { position:fixed; right:10px; bottom:8px; z-index:2147483000; display:flex; gap:4px; flex-wrap:wrap;
  background:#1b1d21; border:1px solid #3a3f47; border-radius:10px; padding:5px; box-shadow:0 4px 16px rgba(0,0,0,.5); }
#tm-sq-bar button, #tm-sq-theme button { all:unset; cursor:pointer; font:600 14px/1 Arial, sans-serif; color:#e6e6e6; background:#2b2f36;
  padding:8px 10px; border-radius:7px; min-width:22px; text-align:center; letter-spacing:.03em; }
#tm-sq-bar button.on, #tm-sq-theme button.on { background:#3d7be0; color:#fff; }
#tm-sq-bar button.off { background:#2b2f36; color:#7c828c; text-decoration:line-through; }
#tm-sq-bar button:focus-visible, #tm-sq-theme button:focus-visible { outline:2px solid #8ab4ff; outline-offset:1px; }
#tm-sq-bar .sep { width:1px; background:#3a3f47; margin:2px 3px; }
#tm-sq-theme { position:fixed; right:10px; z-index:2147483001; width:300px; display:none; flex-direction:column; gap:10px;
  background:#1b1d21; color:#e6e6e6; border:1px solid #3a3f47; border-radius:10px; padding:12px; box-shadow:0 8px 24px rgba(0,0,0,.6);
  font:500 14px/1.3 Arial, sans-serif; max-height:calc(100vh - 80px); overflow-y:auto; box-sizing:border-box; }
#tm-sq-theme.open { display:flex; }
#tm-sq-theme .tm-presets { display:flex; flex-wrap:wrap; gap:4px; }
#tm-sq-theme label { display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; }
#tm-sq-theme input[type=color] { width:44px; height:28px; border:1px solid #3a3f47; border-radius:6px; background:none; padding:0; cursor:pointer; }
#tm-sq-theme input[type=checkbox] { width:18px; height:18px; cursor:pointer; }
#tm-sq-theme .tm-head { font-weight:700; font-size:13px; color:#9aa1ab; text-transform:uppercase; letter-spacing:.06em; }
html:not(.tm-sq-on) #tm-sq-bar, html:not(.tm-sq-on) #tm-sq-theme { display:none !important; }
`;

  // Square pop-ups that stay light on dark themes (Ember classes plus Market web components)
  const POPUPS = '.popover, .dialog--modal, .modal, .modal-dialog, .sheet, .blade, market-modal-full, market-modal-partial, market-dialog, market-blade, market-sheet, market-popover, [role="dialog"]:not(#tm-sq-theme)';
  // ---- Theme CSS (uses --tm-* variables set on <html>) ----------------------
  const THEME_CSS = `
html.tm-sq-on.tm-theme, html.tm-sq-on.tm-theme body,
html.tm-sq-on.tm-theme div:has(> .ember-application) { background:var(--tm-bg) !important; }
html.tm-sq-on.tm-theme .app-layout__content { color:var(--tm-text) !important; }

/* Week table */
html.tm-sq-on.tm-theme .schedule-table thead,
html.tm-sq-on.tm-theme .schedule-table th,
html.tm-sq-on.tm-theme .schedule-table tfoot td { background-color:var(--tm-surface) !important; color:var(--tm-text) !important; }
html.tm-sq-on.tm-theme .schedule-table td { background-color:transparent; color:var(--tm-text) !important; }
html.tm-sq-on.tm-theme .schedule-table th,
html.tm-sq-on.tm-theme .schedule-table td,
html.tm-sq-on.tm-theme .schedule-table tr { border-color:var(--tm-grid) !important; }
html.tm-sq-on.tm-theme .schedule-table [class*="summary"],
html.tm-sq-on.tm-theme .schedule-table tfoot time { color:var(--tm-muted) !important; }

/* Day timeline */
/* Empty "+" slots are white boxes in Square (invisible on white); make them see-through */
html.tm-sq-on.tm-theme .schedule-cell-button--create:not(.schedule-cell-button--availability) { background-color:transparent !important; border-color:transparent !important; }
/* Past shifts: Square fades the whole block (text too) to 40%; mute the color instead so times stay sharp */
html.tm-sq-on.tm-theme .schedule-cell-button--existing.schedule-cell-button--in-past { opacity:1 !important; filter:saturate(.4) brightness(.7); }

html.tm-sq-on.tm-theme .timeline-table__wrapper,
html.tm-sq-on.tm-theme .timeline-table__wrapper td,
html.tm-sq-on.tm-theme .timeline-table__wrapper th { background-color:transparent; color:var(--tm-text) !important; border-color:var(--tm-grid) !important; }
html.tm-sq-on.tm-theme .timeline-table__wrapper thead th,
html.tm-sq-on.tm-theme .timeline-table__column--left,
html.tm-sq-on.tm-theme .timeline-table__footer,
html.tm-sq-on.tm-theme .timeline-table__footer td { background-color:var(--tm-surface) !important; }
html.tm-sq-on.tm-theme .timeline-table__wrapper thead,
html.tm-sq-on.tm-theme .timeline-table__hour-cell { background-color:var(--tm-surface) !important; }
html.tm-sq-on.tm-theme .timeline-table__hour-cell:not(:first-child):not(:last-child) { background-color:transparent !important; }
html.tm-sq-on.tm-theme .timeline-table__hour-cell,
html.tm-sq-on.tm-theme .timeline-table__row,
html.tm-sq-on.tm-theme .timeline-table__column { border-color:var(--tm-grid) !important; }
html.tm-sq-on.tm-theme .timeline-table__hour-label,
html.tm-sq-on.tm-theme .timeline-table__wrapper [class*="summary"] { color:var(--tm-muted) !important; }

/* Filter bar controls */
html.tm-sq-on.tm-theme .filter-bar .button,
html.tm-sq-on.tm-theme .filter-bar .dropdown__trigger,
html.tm-sq-on.tm-theme .filter-bar .segmented-control__segment { background-color:var(--tm-ctrl) !important; color:var(--tm-ctrl-text) !important; border-color:var(--tm-grid) !important; }
html.tm-sq-on.tm-theme .filter-bar .button--primary { background-color:var(--tm-publish) !important; color:var(--tm-publish-text) !important; }
html.tm-sq-on.tm-theme .filter-bar svg { color:var(--tm-ctrl-text) !important; }
html.tm-sq-on.tm-theme .filter-bar .button--primary svg { color:var(--tm-publish-text) !important; }

/* Warning icons (alert triangles on shifts) */
html.tm-sq-on.tm-theme .svg-icon--alert-triangle { color:var(--tm-warn) !important; fill:var(--tm-warn) !important; }
html.tm-sq-on.tm-theme .svg-icon--alert-triangle path { fill:var(--tm-warn) !important; }
html.tm-sq-on.tm-theme .filter-bar svg .svg-icon__stroke { stroke:currentColor !important; }
html.tm-sq-on.tm-theme .filter-bar svg .svg-icon__fill { fill:currentColor !important; }

/* Sidebar gutter: Square paints the spacer behind the nav light (#fafafa) */
html.tm-sq-on.tm-theme .ecosystem-header-fixed-left-nav-spacer { background:var(--tm-bg) !important; }

/* Pop-ups, dialogs and date picker: Square-styled, darkened by inversion on dark themes */
/* (add/edit shift sheet included; outermost pop-up only, since nested inversions cancel out) */
html.tm-sq-on.tm-theme.tm-dark :is(${POPUPS}):not(:is(${POPUPS}) *) { filter:invert(.92) hue-rotate(180deg); }
html.tm-sq-on.tm-theme.tm-dark :is(${POPUPS}) :is(img, video) { filter:invert(1) hue-rotate(180deg); }
`;

  // Optional: one color for every shift block instead of Square's job colors
  const SHIFT_CSS = `
html.tm-sq-on.tm-theme.tm-myshift:not(.tm-shape-outline):not(.tm-shape-mix) .schedule-table .schedule-cell-button--existing { background-color:var(--tm-shift) !important; color:var(--tm-shift-text) !important; border-color:var(--tm-shift) !important; }
html.tm-sq-on.tm-theme.tm-myshift:not(.tm-shape-outline):not(.tm-shape-mix) .timeline-schedule-cell-button__time-entry { background-color:var(--tm-shift) !important; }
html.tm-sq-on.tm-theme.tm-myshift:not(.tm-shape-outline):not(.tm-shape-mix) .timeline-schedule-cell-button__shift__label { color:var(--tm-shift-text) !important; }
html.tm-sq-on.tm-theme.tm-myshift:not(.tm-shape-outline):not(.tm-shape-mix) .schedule-cell-button--existing:not(.schedule-cell-button--published),
html.tm-sq-on.tm-theme.tm-myshift:not(.tm-shape-outline):not(.tm-shape-mix) .timeline-schedule-cell-button--existing:not(.timeline-schedule-cell-button--published) .timeline-schedule-cell-button__time-entry { opacity:.65; outline:2px dashed var(--tm-unpub); outline-offset:-3px; }

/* Shift style: Outline / Mix. --tm-c is each block's own color (captured from Square, or your custom shift color). */
html.tm-sq-on.tm-myshift [data-tm-c] { --tm-c:var(--tm-shift) !important; }
html.tm-sq-on.tm-shape-outline .schedule-cell-button--existing[data-tm-c],
html.tm-sq-on.tm-shape-outline .timeline-schedule-cell-button__time-entry[data-tm-c] { background-color:transparent !important; box-shadow:inset 0 0 0 2px var(--tm-c) !important; }
html.tm-sq-on.tm-shape-mix .schedule-cell-button--existing[data-tm-c],
html.tm-sq-on.tm-shape-mix .timeline-schedule-cell-button__time-entry[data-tm-c] { background-color:color-mix(in srgb, var(--tm-c) var(--tm-fillpct, 30%), transparent) !important; box-shadow:inset 0 0 0 2px var(--tm-c) !important; }
html.tm-sq-on.tm-shape-outline .schedule-cell-button--existing[data-tm-c],
html.tm-sq-on.tm-shape-mix .schedule-cell-button--existing[data-tm-c],
html.tm-sq-on.tm-shape-outline .timeline-schedule-cell-button__shift__label,
html.tm-sq-on.tm-shape-mix .timeline-schedule-cell-button__shift__label { color:var(--tm-text, #1a1a1a) !important; }
html.tm-sq-on.tm-shape-outline .schedule-cell-button--existing[data-tm-c] > .schedule-cell-button__title,
html.tm-sq-on.tm-shape-outline .timeline-schedule-cell-button__shift__label [data-test-shift-info-first-row] { color:color-mix(in srgb, var(--tm-c) 45%, var(--tm-text, #1a1a1a)) !important; opacity:1; }
html.tm-sq-on.tm-shape-outline .schedule-cell-button--existing[data-tm-c]:not(.schedule-cell-button--published),
html.tm-sq-on.tm-shape-mix .schedule-cell-button--existing[data-tm-c]:not(.schedule-cell-button--published) { box-shadow:none !important; outline:2px dashed var(--tm-unpub, var(--tm-c)) !important; outline-offset:-2px; opacity:1 !important; }
html.tm-sq-on.tm-shape-outline .schedule-cell-button--existing.schedule-cell-button--in-past,
html.tm-sq-on.tm-shape-mix .schedule-cell-button--existing.schedule-cell-button--in-past { opacity:1 !important; filter:saturate(.35) !important; }

/* Unpublished highlight (any theme, any shift style): solid border + tint over the shift's own color.
   :not(#tm-none) only raises specificity so this wins over the dashed-outline rules above. */
html.tm-sq-on.tm-unpub-hl :is(.schedule-cell-button--staged, .schedule-cell-button--existing:not(.schedule-cell-button--published)):not(#tm-none),
html.tm-sq-on.tm-unpub-hl .timeline-schedule-cell-button--existing:not(.timeline-schedule-cell-button--published) .timeline-schedule-cell-button__time-entry:not(#tm-none) {
  outline:2px solid var(--tm-unpub, #f59e0b) !important; outline-offset:-2px; opacity:1 !important;
  background-image:linear-gradient(color-mix(in srgb, var(--tm-unpub, #f59e0b) 22%, transparent), color-mix(in srgb, var(--tm-unpub, #f59e0b) 22%, transparent)) !important; }

/* Dark scrollbars on the schedule */
html.tm-sq-on.tm-theme .app-layout__content, html.tm-sq-on.tm-theme .app-layout__content * { scrollbar-color:var(--tm-grid) var(--tm-bg); }
`;

  function styleEl(id) {
    let s = document.getElementById(id);
    if (!s) { s = document.createElement('style'); s.id = id; document.head.appendChild(s); }
    return s;
  }
  const setText = (el, txt) => { if (el.textContent !== txt) el.textContent = txt; };

  // Record each shift block's own color in --tm-c so Outline/Mix can reuse it.
  // Read while the block is still unstyled by us (no data-tm-c), and re-read if Square changes its classes.
  function captureColors() {
    if (S.shape === 'fill') return;
    document.querySelectorAll('.schedule-table .schedule-cell-button--existing, .timeline-schedule-cell-button__time-entry').forEach(el => {
      const owner = el.classList.contains('timeline-schedule-cell-button__time-entry') ? el.parentElement : el;
      const k = owner ? owner.className : '';
      if (el.hasAttribute('data-tm-c') && el.dataset.tmK === k) return;
      el.removeAttribute('data-tm-c');
      const bg = getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)') return;
      el.style.setProperty('--tm-c', bg);
      el.dataset.tmK = k;
      el.setAttribute('data-tm-c', '');
    });
  }

  function applyTheme() {
    const html = document.documentElement;
    html.classList.toggle('tm-shape-outline', S.shape === 'outline');
    html.classList.toggle('tm-shape-mix', S.shape === 'mix');
    html.classList.toggle('tm-unpub-hl', !!S.unpubHL);
    const fp = Math.max(0, Math.min(100, +S.fillPct || 0)) + '%';
    if (html.style.getPropertyValue('--tm-fillpct') !== fp) html.style.setProperty('--tm-fillpct', fp);
    const c = themeColors();
    html.classList.toggle('tm-theme', !!c);
    html.classList.toggle('tm-myshift', !!c && !S.squareShift);
    if (!c) { html.classList.remove('tm-dark'); ['--tm-unpub', '--tm-today'].forEach(k => html.style.removeProperty(k)); return; }
    html.classList.toggle('tm-dark', luminance(c.bg) < 0.4);
    const vars = {
      '--tm-bg': c.bg, '--tm-surface': c.surface, '--tm-text': c.text, '--tm-grid': c.grid,
      '--tm-accent': c.accent, '--tm-accent-text': readableOn(c.accent),
      '--tm-shift': c.shift, '--tm-shift-text': readableOn(c.shift),
      '--tm-publish': c.publish, '--tm-publish-text': readableOn(c.publish),
      '--tm-ctrl': c.controls, '--tm-ctrl-text': c.controls === c.surface ? c.text : readableOn(c.controls),
      '--tm-today': c.today, '--tm-warn': c.warn, '--tm-unpub': c.unpub,
      '--tm-muted': `color-mix(in srgb, ${c.text} 65%, ${c.bg})`,
    };
    for (const k in vars) if (html.style.getPropertyValue(k) !== vars[k]) html.style.setProperty(k, vars[k]);
  }

  // ---- Dark site: every other Dashboard page gets a generic invert (look only, nothing is written) ----
  const SITE_CSS = `
html.tm-site { background:#fff; filter:invert(.92) hue-rotate(180deg); }
html.tm-site :is(img, video, canvas, picture, iframe, [style*="background-image"]) { filter:invert(1) hue-rotate(180deg); }
html.tm-site :is(img, video, canvas, picture, [style*="background-image"]) :is(img, video, canvas) { filter:none; }`;
  function applySite() {
    const html = document.documentElement;
    const c = themeColors();
    const want = !!(S.site && c && luminance(c.bg) < 0.4 && !onPage());
    if (want) setText(styleEl('tm-sq-site'), SITE_CSS);
    html.classList.toggle('tm-site', want);
  }

  // ---- Sidebar (lives in an open shadow root on #messenger-host) ----------
  // The page MutationObserver can't see inside this shadow root, and the header renders
  // (and may re-render, dropping foreign nodes) after we run. So watch the root itself and
  // retry until it exists.
  let navRoot = null, navFrame = 0, navRetry = 0;
  const navObs = new MutationObserver(() => {
    if (!navFrame) navFrame = requestAnimationFrame(() => { navFrame = 0; applyNav(); });
  });
  const NAV_INV = 'filter:invert(.92) hue-rotate(180deg) !important;';
  function applyNav() {
    const host = document.getElementById('messenger-host');
    const root = host && host.shadowRoot;
    if (!root) {
      if (navRetry++ < 40) setTimeout(applyNav, 250);
      return;
    }
    if (root !== navRoot) { navObs.disconnect(); navObs.observe(root, { childList: true, subtree: true }); navRoot = root; }
    const dark = onPage() && document.documentElement.classList.contains('tm-dark');
    // Invert the nav's boxes: a display:contents wrapper ignores filter, so use its children.
    const want = new Set();
    const nav = root.querySelector('.fixed-left-nav');
    if (dark && S.nav && nav) {
      const walk = (el, d) => {
        if (d < 4 && getComputedStyle(el).display === 'contents') [...el.children].forEach(c => walk(c, d + 1));
        else want.add(el);
      };
      walk(nav, 0);
    }
    root.querySelectorAll('[data-tm-inv]').forEach(el => { if (!want.has(el)) el.removeAttribute('data-tm-inv'); });
    want.forEach(el => { if (!el.hasAttribute('data-tm-inv')) el.setAttribute('data-tm-inv', ''); });
    let s = root.getElementById('tm-sq-nav');
    if (!s) { s = document.createElement('style'); s.id = 'tm-sq-nav'; root.appendChild(s); }
    let css = onPage() && !S.nav ? '.fixed-left-nav{display:none !important;}\n' : '';
    if (dark)
      // Transparent nav background would invert to nothing and show the light page behind: give it white
      // (inverts to near-black). Flyouts/pop-ups rendered in this root get the same treatment, outermost only.
      css += `[data-tm-inv]{${NAV_INV} background-color:#fff;}
[data-tm-inv] img, [data-tm-inv] video{filter:invert(1) hue-rotate(180deg) !important;}
:is(${POPUPS}):not([data-tm-inv] *):not(:is(${POPUPS}) *){${NAV_INV}}
:is(${POPUPS}):not([data-tm-inv] *) :is(img, video){filter:invert(1) hue-rotate(180deg) !important;}`;
    setText(s, css);
  }

  // ---- Week grid helpers ----------------------------------------------------
  function headerDays(table) {
    return [...table.querySelectorAll('thead th.schedule-table__date-header')].map((th, i) => {
      const m = th.textContent.trim().match(/^(\w{3})\w*\s+(\d{1,2}\/\d{1,2})/);
      return m ? { idx: i + 2, day: m[1], date: m[2] } : null;
    }).filter(Boolean);
  }

  function dayCss(table) {
    if (!table) return '';
    const cols = headerDays(table);
    if (cols.length !== 7) return '';
    // Today's column (Square doesn't mark it in Week view); themed only, compared as numbers so 11/05 = 11/5
    const now = new Date(), md = d => d.split('/').map(Number).join('/');
    const today = cols.find(c => md(c.date) === (now.getMonth() + 1) + '/' + now.getDate());
    const todayCss = today ?
      `html.tm-sq-on.tm-theme .schedule-table thead tr > :nth-child(${today.idx}){background-color:color-mix(in srgb, var(--tm-today) 28%, var(--tm-surface)) !important;box-shadow:inset 0 -3px 0 var(--tm-today) !important;}` +
      `html.tm-sq-on.tm-theme .schedule-table tbody td[data-test-weekday-column="${today.date}"]{background-color:color-mix(in srgb, var(--tm-today) 9%, transparent) !important;}
` : '';
    return todayCss + cols.filter(c => S.hidden.includes(c.day)).map(c =>
      `html.tm-sq-on .schedule-table thead tr > :nth-child(${c.idx}),` +
      `html.tm-sq-on .schedule-table tfoot tr > :nth-child(${c.idx}),` +
      `html.tm-sq-on .schedule-table tbody td[data-test-weekday-column="${c.date}"]{display:none !important;}`
    ).join('\n');
  }

  // ---- Even grid lines -------------------------------------------------------
  // At fractional display scaling (125%, 150%) a 1px line is antialiased across two device pixels,
  // and how it splits depends on where the line lands, so lines with fractional positions shade
  // unevenly. Make every Week day column (and row) a whole number of device pixels so all lines
  // share the same phase. The name column absorbs the remainder.
  // Step = smallest whole CSS px that is also whole device px (1 at 100%, 4 at 125%, 2 at 150%).
  const devSnap = px => {
    // Smallest step (CSS px) that is also a whole number of device px. Chromebook scales
    // (1.6, 1.777…) and browser zoom (110% → x1.1) need steps up to 10+; else take the closest.
    const r = devicePixelRatio, err = u => Math.abs(u * r - Math.round(u * r));
    let u = 1, best = 1;
    for (; u <= 20; u++) { if (err(u) < err(best)) best = u; if (err(u) < 2e-3) break; }
    u = u <= 20 ? u : best;
    return Math.floor(px / u) * u;
  };
  function snapCols(table) {
    const html = document.documentElement, t = table && table.querySelector('table');
    const head = t && t.tHead && t.tHead.rows[0];
    if (!head) return;
    const days = [...head.cells].slice(1).filter(c => getComputedStyle(c).display !== 'none').length;
    if (!days) return;
    const W = t.parentElement.getBoundingClientRect().width;
    const name = 230, d = devSnap((W - name) / days);
    const set = (k, v) => { if (html.style.getPropertyValue(k) !== v) html.style.setProperty(k, v); };
    set('--tm-daycol', d + 'px');
    // Name column snapped too, so its divider shades like the rest; the table is sized to the exact
    // total (a sub-step strip may be left at the right) or table-layout would spread the remainder.
    const n = devSnap(W - d * days);
    set('--tm-namecol', n + 'px');
    set('--tm-tablew', (n + d * days) + 'px');
  }

  // ---- Fit all Week rows into the viewport ----------------------------------
  function fit(table) {
    const html = document.documentElement;
    if (!S.fit || !table) { html.classList.remove('tm-fit', 'tm-one'); return; }
    html.classList.add('tm-fit');
    const rows = table.querySelectorAll('tbody tr').length || 1;
    const bar = document.getElementById('tm-sq-bar');
    const barH = bar ? bar.getBoundingClientRect().height + 12 : 0;
    const top = table.getBoundingClientRect().top + window.scrollY;
    const head = (table.querySelector('thead')?.getBoundingClientRect().height) || 34;
    const foot = (table.querySelector('tfoot')?.getBoundingClientRect().height) || 40;
    const avail = window.innerHeight - top - head - foot - barH - 4;
    const h = devSnap(Math.max(MIN_ROW, Math.min(MAX_ROW, Math.floor(avail / rows))));
    const hv = h + 'px';
    if (html.style.getPropertyValue('--tm-row') !== hv) html.style.setProperty('--tm-row', hv);
    html.classList.toggle('tm-one', h < 40);
  }

  // ---- Theme panel -------------------------------------------------------------
  function buildPanel() {
    let p = document.getElementById('tm-sq-theme');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'tm-sq-theme';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Schedule colors');
    document.body.appendChild(p);
    return p;
  }

  let pickFrame = 0;
  function refreshPanel() {
    const p = buildPanel();
    const sig = S.theme + '|' + JSON.stringify(S.custom) + '|' + S.squareShift + '|' + S.shape + '|' + S.site + '|' + S.unpubHL;
    if (p.dataset.sig === sig) return;
    p.dataset.sig = sig;
    p.textContent = '';
    const head = t => { const d = document.createElement('div'); d.className = 'tm-head'; d.textContent = t; p.appendChild(d); };

    head('Theme');
    const row = document.createElement('div'); row.className = 'tm-presets'; p.appendChild(row);
    Object.keys(PRESET_NAMES).forEach(k => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = PRESET_NAMES[k]; b.className = S.theme === k ? 'on' : '';
      b.addEventListener('click', e => {
        e.preventDefault();
        if (k === 'custom' && S.theme !== 'custom' && PRESETS[S.theme]) S.custom = fullColors(PRESETS[S.theme]); // start Custom from the current preset
        S.theme = k; save(); applyTheme(); applyNav(); refreshPanel(); buildBarSafe();
      });
      row.appendChild(b);
    });

    head('Shift style');
    const srow = document.createElement('div'); srow.className = 'tm-presets'; p.appendChild(srow);
    Object.keys(SHAPES).forEach(k => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = SHAPES[k]; b.className = S.shape === k ? 'on' : '';
      b.addEventListener('click', e => { e.preventDefault(); S.shape = k; save(); applyTheme(); captureColors(); refreshPanel(); });
      srow.appendChild(b);
    });
    const fl = document.createElement('label');
    const ft = document.createElement('span');
    ft.textContent = 'Fill opacity ' + S.fillPct + '%';
    const fr = document.createElement('input');
    fr.type = 'range'; fr.min = '0'; fr.max = '100'; fr.step = '5'; fr.value = String(S.fillPct);
    fr.style.cssText = 'flex:1;max-width:150px;accent-color:#3d7be0;cursor:pointer;';
    fr.setAttribute('aria-label', 'Fill opacity');
    fr.addEventListener('input', () => {
      S.fillPct = +fr.value;
      ft.textContent = 'Fill opacity ' + S.fillPct + '%';
      if (S.shape !== 'mix') {
        S.shape = 'mix';
        srow.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent === SHAPES.mix));
      }
      if (!pickFrame) pickFrame = requestAnimationFrame(() => { pickFrame = 0; applyTheme(); captureColors(); });
    });
    fr.addEventListener('change', () => { save(); applyTheme(); captureColors(); refreshPanel(); });
    fl.appendChild(ft); fl.appendChild(fr);
    p.appendChild(fl);

    head('Colors');
    const cur = themeColors() || fullColors(S.custom);
    COLOR_FIELDS.forEach(([key, label]) => {
      const l = document.createElement('label');
      l.textContent = label;
      const inp = document.createElement('input');
      inp.type = 'color'; inp.value = cur[key];
      // Dragging in the picker fires input many times per frame and each restyles the whole page,
      // so apply at most once per frame and save only when the picker is released.
      inp.addEventListener('input', () => {
        if (S.theme !== 'custom') {
          S.custom = Object.assign({}, themeColors() || fullColors(S.custom)); S.theme = 'custom';
          p.querySelectorAll('.tm-presets button').forEach(b => b.classList.toggle('on', b.textContent === PRESET_NAMES.custom));
        }
        S.custom[key] = inp.value;
        if (!pickFrame) pickFrame = requestAnimationFrame(() => { pickFrame = 0; applyTheme(); applyNav(); });
      });
      inp.addEventListener('change', () => { S.custom[key] = inp.value; save(); applyTheme(); applyNav(); refreshPanel(); buildBarSafe(); });
      l.appendChild(inp);
      p.appendChild(l);
    });

    const cl = document.createElement('label');
    cl.textContent = "Use Square's job colors for shifts";
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = S.squareShift;
    cb.addEventListener('change', () => { S.squareShift = cb.checked; save(); applyTheme(); refreshPanel(); });
    cl.appendChild(cb);
    p.appendChild(cl);

    const ul = document.createElement('label');
    ul.textContent = 'Highlight unpublished shifts';
    const ub = document.createElement('input');
    ub.type = 'checkbox'; ub.checked = S.unpubHL;
    ub.addEventListener('change', () => { S.unpubHL = ub.checked; save(); applyTheme(); refreshPanel(); });
    ul.appendChild(ub);
    p.appendChild(ul);

    const sl = document.createElement('label');
    sl.textContent = 'Dark theme on all other Dashboard pages';
    const sb = document.createElement('input');
    sb.type = 'checkbox'; sb.checked = S.site;
    sb.addEventListener('change', () => { S.site = sb.checked; save(); applySite(); refreshPanel(); });
    sl.appendChild(sb);
    p.appendChild(sl);

    const done = document.createElement('button');
    done.type = 'button'; done.textContent = 'Done'; done.className = 'on';
    done.addEventListener('click', e => { e.preventDefault(); togglePanel(false); });
    p.appendChild(done);
  }

  function togglePanel(open) {
    const p = buildPanel();
    const bar = document.getElementById('tm-sq-bar');
    const want = open === undefined ? !p.classList.contains('open') : open;
    if (want) {
      refreshPanel();
      const bh = bar ? bar.getBoundingClientRect().height : 44;
      p.style.bottom = (bh + 16) + 'px';
    }
    p.classList.toggle('open', want);
    if (bar) bar.dataset.sig = '';
    buildBarSafe();
  }

  // ---- Control bar ------------------------------------------------------------
  let lastTable = null;
  function buildBarSafe() { buildBar(lastTable); }

  function buildBar(table) {
    let bar = document.getElementById('tm-sq-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'tm-sq-bar'; document.body.appendChild(bar); }
    const week = !!table;
    const cols = week ? headerDays(table) : [];
    const order = cols.length === 7 ? cols.map(c => c.day) : DAYS;
    const panelOpen = document.getElementById('tm-sq-theme')?.classList.contains('open');
    const sig = [week, order.join(), S.hidden.join(), S.nav, S.fit, S.read, S.theme, panelOpen].join('|');
    if (bar.dataset.sig === sig) return;
    bar.dataset.sig = sig;
    bar.textContent = '';
    const mk = (label, cls, fn, title) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.className = cls; if (title) b.title = title;
      b.setAttribute('aria-pressed', cls === 'on' ? 'true' : 'false');
      b.addEventListener('click', e => { e.preventDefault(); fn(); save(); apply(); });
      bar.appendChild(b);
    };
    const sep = () => { const d = document.createElement('div'); d.className = 'sep'; bar.appendChild(d); };
    if (week) {
      order.forEach(d => mk(d, S.hidden.includes(d) ? 'off' : 'on',
        () => { S.hidden = S.hidden.includes(d) ? S.hidden.filter(x => x !== d) : S.hidden.concat(d); }, 'Show/hide ' + d));
      mk('All', '', () => { S.hidden = []; }, 'Show all days');
      sep();
    }
    mk('Menu', S.nav ? 'on' : '', () => { S.nav = !S.nav; }, 'Show/hide Square sidebar');
    if (week) mk('Fit', S.fit ? 'on' : '', () => { S.fit = !S.fit; }, 'Fit every team member on screen');
    mk('Read', S.read ? 'on' : '', () => { S.read = !S.read; }, 'Readability: font, spacing, row stripes, row highlight');
    mk('Colors', panelOpen ? 'on' : '', () => { togglePanel(); }, 'Theme and custom colors');
  }

  // ---- Hover row highlight (Week + Day) -------------------------------------------
  let lastRow = null;
  document.addEventListener('mouseover', e => {
    const tr = e.target.closest && e.target.closest('.schedule-table tbody tr, .timeline-table__wrapper tbody tr');
    if (tr === lastRow) return;
    if (lastRow) lastRow.classList.remove('tm-hover-row');
    lastRow = tr;
    if (tr) tr.classList.add('tm-hover-row');
  }, true);

  // ---- Shift editor time-box fix ---------------------------------------------------
  // Square's Start/End Time box reformats as you type (e.g. "5" -> " 5:") but can leave the
  // cursor before the colon or the digit, so the next digits are dropped. Clicking in selects
  // the whole time so typing replaces it, and every typed digit goes to the end.
  const isTimeBox = t => t instanceof HTMLInputElement && t.classList.contains('field-input-time__hour-input');
  document.addEventListener('focusin', e => { if (isTimeBox(e.target)) setTimeout(() => { if (document.activeElement === e.target) e.target.select(); }, 0); }, true);
  document.addEventListener('mouseup', e => {
    const t = e.target;
    if (isTimeBox(t) && document.activeElement === t && t.selectionStart === t.selectionEnd && !t.dataset.tmSel) { t.dataset.tmSel = '1'; t.select(); }
  }, true);
  document.addEventListener('focusout', e => { if (isTimeBox(e.target)) delete e.target.dataset.tmSel; }, true);
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (!isTimeBox(t) || !/^\d$/.test(e.key) || t.selectionStart !== t.selectionEnd) return;
    const end = t.value.length;
    if (t.selectionStart !== end) t.setSelectionRange(end, end);
  }, true);

  // ---- Main ------------------------------------------------------------------------
  let busy = false;
  function apply() {
    if (busy) return;
    busy = true;
    try {
      const html = document.documentElement;
      const table = document.querySelector('.schedule-table');
      const timeline = document.querySelector('.timeline-table__wrapper');
      const on = onPage() && !!(table || timeline);
      html.classList.toggle('tm-sq-on', on);
      applySite();
      html.classList.toggle('tm-week', on && !!table);
      html.classList.toggle('tm-day', on && !table && !!timeline);
      applyTheme();
      applyNav();
      if (!on) { document.getElementById('tm-sq-theme')?.classList.remove('open'); return; }
      ensureFont();
      setText(styleEl('tm-sq-base'), BASE_CSS);
      setText(styleEl('tm-sq-themecss'), THEME_CSS + SHIFT_CSS);
      html.classList.toggle('tm-nocost', !SHOW_COST);
      html.classList.toggle('tm-nav-off', !S.nav);
      html.classList.toggle('tm-read', S.read);
      setText(styleEl('tm-sq-days'), dayCss(table));
      lastTable = table;
      captureColors();
      buildBar(table);
      snapCols(table);
      fit(table);
      watchLayout();
    } finally { busy = false; }
  }

  // Square's filter bar re-wraps after the sidebar/width changes, which moves the
  // table down after fit() already measured it. Re-fit whenever it resizes.
  let watched = null;
  const ro = new ResizeObserver(() => {
    const t = document.querySelector('.schedule-table');
    if (t && document.documentElement.classList.contains('tm-sq-on')) { snapCols(t); fit(t); }
  });
  function watchLayout() {
    const fb = document.querySelector('.filter-bar');
    if (fb && fb !== watched) { if (watched) ro.unobserve(watched); ro.observe(fb); watched = fb; }
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(apply, 120); };
  new MutationObserver(muts => {
    // ignore changes inside our own bar and panel
    if (muts.every(m => m.target.closest && m.target.closest('#tm-sq-bar, #tm-sq-theme'))) return;
    schedule();
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('popstate', schedule);
  apply();
})();
