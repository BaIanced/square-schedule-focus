// ==UserScript==
// @name         Square Schedule – Unpublished Shift Style
// @namespace    vince.square.schedule
// @version      1.0.0
// @description  Restyles unpublished (staged) shifts in the Square schedule so they stand out.
// @match        https://app.squareup.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @homepageURL  https://github.com/BaIanced/square-schedule-focus
// @supportURL   https://github.com/BaIanced/square-schedule-focus/issues
// @updateURL    https://raw.githubusercontent.com/BaIanced/square-schedule-focus/main/square-unpublished-shifts.user.js
// @downloadURL  https://raw.githubusercontent.com/BaIanced/square-schedule-focus/main/square-unpublished-shifts.user.js
// @license      MIT
// ==/UserScript==
// Change these two values to taste.
const COLOR = "#f59e0b";   // border and tint (amber)
const TEXT  = "#7a4a00";   // text color
GM_addStyle(`
  .schedule-cell-button--staged {
    border: 2px solid ${COLOR} !important;
    background: ${COLOR}33 !important;
    color: ${TEXT} !important;
  }
  .schedule-cell-button--staged * { color: ${TEXT} !important; }
`);
