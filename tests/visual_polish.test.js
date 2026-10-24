const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const polish = fs.readFileSync(path.join(__dirname, '../assets/polish.css'), 'utf8');

test('six mobile destinations keep text labels and decorative accessible icons', () => {
  const nav = html.match(/<nav class="mobile-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, 'Mobile navigation should exist');
  const items = [...nav.matchAll(/<button[^>]*data-view="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(items.map(item => item[1]), [
    'home', 'huddle', 'matchups', 'records', 'managers', 'seasons'
  ]);
  for (const [, , body] of items) {
    assert.match(body, /<svg[^>]*aria-hidden="true"[^>]*>/);
    assert.match(body, /<span>[^<]+<\/span>/, 'Visible text label must remain');
  }
});

test('responsive polish loads last and preserves reduced-motion and keyboard styles', () => {
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"\s*\/>/g)].map(match => match[1]);
  assert.deepEqual(sheets.slice(-2), ['assets/polish.css?v=1','assets/home.css?v=1']);
  assert.match(polish, /@media \(max-width: 390px\)/);
  assert.match(polish, /prefers-reduced-motion: reduce/);
  assert.match(polish, /\.mobile-nav button:focus-visible/);
  let depth = 0;
  for (const char of polish) {
    if (char === '{') depth++;
    else if (char === '}') depth--;
    assert.ok(depth >= 0, 'Unexpected closing CSS brace');
  }
  assert.equal(depth, 0, 'Unbalanced CSS rules');
});
