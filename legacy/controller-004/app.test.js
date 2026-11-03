import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTROLLER_BUTTONS, BUTTON_LABELS, BUTTON_KEYS } from '../public/controller-program.js';

test('controller.html: #edit and module editor are removed, 10 gamepad buttons with event log exist', () => {
  const html = readFileSync(new URL('../public/controller.html', import.meta.url), 'utf8');

  // Verify removed elements
  assert.ok(!html.includes('id="edit"'), '#edit button must be removed');
  assert.ok(!html.includes('id="editor"'), '#editor aside must be removed');
  assert.ok(!html.includes('id="modulePicker"'), '#modulePicker dialog must be removed');
  assert.ok(!html.includes('id="editActions"'), '#editActions must be removed');
  assert.ok(!html.includes('id="moduleCanvas"'), '#moduleCanvas must be removed');
  assert.ok(!html.includes('Настроить'), 'Text "Настроить" must not exist');

  // Verify topbar elements
  assert.ok(html.includes('id="project"'), '#project select must exist');
  assert.ok(html.includes('id="reload"'), '#reload button must exist');
  assert.ok(html.includes('id="editInEditor"'), '#editInEditor link must exist');
  assert.ok(html.includes('id="modeBadge"'), '#modeBadge element must exist');
  assert.ok(html.includes('id="status"'), '#status element must exist');
  assert.ok(html.includes('id="connect"'), '#connect button must exist');
  assert.ok(html.includes('id="start"'), '#start button must exist');
  assert.ok(html.includes('id="stop"'), '#stop button must exist');
  assert.ok(html.includes('id="download"'), '#download button must exist');
  assert.ok(html.includes('id="programErrors"'), '#programErrors alert container must exist');

  // Verify gamepad container
  assert.ok(html.includes('id="gamepad"'), '#gamepad container must exist');

  // Verify all 10 gamepad buttons
  for (const btn of CONTROLLER_BUTTONS) {
    assert.ok(
      html.includes(`id="btn-${btn}"`),
      `Button #btn-${btn} must exist in controller.html`
    );
    assert.ok(
      html.includes(`data-button="${btn}"`),
      `Button data-button="${btn}" must exist in controller.html`
    );
  }

  // Verify keyboard indicators (<kbd>)
  assert.ok(html.includes('<kbd class="key-hint">↑</kbd>'), 'Up arrow kbd indicator must exist');
  assert.ok(html.includes('<kbd class="key-hint">Q</kbd>'), 'Q kbd indicator must exist');
  assert.ok(html.includes('<kbd class="key-hint">E</kbd>'), 'E kbd indicator must exist');
  assert.ok(html.includes('<kbd class="key-hint">J</kbd>'), 'J kbd indicator must exist');

  // Verify event log container and list
  assert.ok(html.includes('id="eventLog"'), '#eventLog must exist');
  assert.ok(html.includes('role="log"'), 'role="log" must be set on #eventLog');
  assert.ok(html.includes('aria-live="polite"'), 'aria-live="polite" must be set on #eventLog');
  assert.ok(html.includes('id="clearLog"'), '#clearLog button must exist');
});
