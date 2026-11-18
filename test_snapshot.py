"""Local test harness: serve a Square snapshot at its real URL in headless Chrome, inject the userscript,
apply settings, run checks, optionally screenshot. Usage:
  python3 run.py week|day '<settings json>' [--shot out.png] [--js 'extra expression']
"""
import json, sys, pathlib, argparse
from playwright.sync_api import sync_playwright

import os
HERE = pathlib.Path(__file__).resolve().parent
# Snapshots contain real staff names and hours: keep them OUTSIDE this repo (default: ../private/square-snapshots).
SNAP_DIR = pathlib.Path(os.environ.get('SQ_SNAPSHOT_DIR', HERE.parent / 'private' / 'square-snapshots'))
SNAPS = {'week': SNAP_DIR / 'square-week-snapshot.html', 'day': SNAP_DIR / 'square-day-snapshot.html'}
URL = 'https://app.squareup.com/dashboard/shifts/schedule/shifts'
SCRIPT = HERE / 'square-schedule-focus.user.js'

CHECKS = r"""
() => {
  const h = document.documentElement, q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const vis = e => e && getComputedStyle(e).display !== 'none';
  const out = { cls: h.className, bar: qa('#tm-sq-bar button').map(b => b.textContent + (b.className ? '[' + b.className + ']' : '')) };
  const t = q('.schedule-table table');
  if (t) {
    out.visibleHeaders = [...t.tHead.rows[0].cells].filter(vis).map(c => c.textContent.trim().replace(/\s+/g, ' '));
    out.cellsPerRow = [...new Set([...t.tBodies[0].rows].map(r => [...r.cells].filter(vis).length))];
    out.rowH = getComputedStyle(h).getPropertyValue('--tm-row');
  }
  const shift = q('.schedule-cell-button--existing:not(.schedule-cell-button--in-past)') || q('.timeline-schedule-cell-button__time-entry');
  if (shift) { const cs = getComputedStyle(shift); out.shift = { bg: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow.slice(0, 50), op: cs.opacity, filter: cs.filter }; }
  const plus = q('.timeline-empty-cell-button svg') || q('.schedule-cell-button--create svg');
  if (plus) out.plusOpacity = getComputedStyle(plus).opacity;
  out.labor = qa('[class*="labor-cost"]').filter(vis).length;
  out.pageBg = getComputedStyle(q('div:has(> .ember-application)') || document.body).backgroundColor;
  return out;
}
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('view'); ap.add_argument('settings', nargs='?', default='{}')
    ap.add_argument('--shot'); ap.add_argument('--js'); ap.add_argument('--w', type=int, default=1600); ap.add_argument('--h', type=int, default=900); ap.add_argument('--dpr', type=float, default=1)
    a = ap.parse_args()
    html = pathlib.Path(SNAPS[a.view]).read_text(encoding='utf-8', errors='replace')
    src = SCRIPT.read_text()
    errors = []
    with sync_playwright() as p:
        # installed Chrome, else Brave, else Edge, else Playwright's own Chromium (`playwright install chromium`)
        brave = pathlib.Path(os.environ.get('SQ_BRAVE', r'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'))
        tries = [{'channel': 'chrome'}] + ([{'executable_path': str(brave)}] if brave.exists() else []) + [{'channel': 'msedge'}, {}]
        for i, kw in enumerate(tries):
            try:
                b = p.chromium.launch(**kw)
                break
            except Exception:
                if i == len(tries) - 1: raise
        pg = b.new_page(viewport={'width': a.w, 'height': a.h}, device_scale_factor=a.dpr)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.route('**/*', lambda r: r.fulfill(status=200, content_type='text/html', body=html) if r.request.url == URL else r.abort())
        pg.goto(URL, wait_until='domcontentloaded')
        pg.evaluate("s => localStorage.setItem('sqFocusViewV2', s)", a.settings)
        pg.add_script_tag(content=src)
        pg.wait_for_timeout(600)
        res = pg.evaluate(CHECKS)
        if a.js:
            res['js'] = pg.evaluate(a.js)
        if a.shot:
            pg.screenshot(path=a.shot)
            res['shot'] = a.shot
        res['pageErrors'] = errors
        b.close()
    print(json.dumps(res, indent=1))

if __name__ == '__main__':
    main()
