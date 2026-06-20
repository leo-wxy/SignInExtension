const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_TASK,
  findByRule,
  isDisabled,
  isElementVisible,
  getTaskStatus,
  runTaskOnDocument,
  applyPickedToTask,
  normalizeDelayMs
} = require('../src/shared/rules.js');
const {
  resolveTaskMenuState
} = require('../src/shared/task-menu.js');

class MiniClassList {
  constructor(value = '') {
    this.values = value.split(/\s+/).filter(Boolean);
  }

  contains(value) {
    return this.values.includes(value);
  }
}

class MiniElement {
  constructor(tagName, attrs = {}, children = []) {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.attributes = attrs;
    this.children = children;
    this.parentElement = null;
    this.classList = new MiniClassList(attrs.class);
    this.className = attrs.class || '';
    this.hidden = Boolean(attrs.hidden);
    this.disabled = Boolean(attrs.disabled);
    this.style = { display: attrs.display || '', visibility: attrs.visibility || '' };
    this.clicked = 0;
    this.listeners = new Map();

    for (const child of children) {
      if (child instanceof MiniElement) {
        child.parentElement = this;
      }
    }
  }

  get textContent() {
    return this.children.map((child) => (
      child instanceof MiniElement ? child.textContent : String(child)
    )).join('');
  }

  get id() {
    return this.attributes.id || '';
  }

  getAttribute(name) {
    if (name === 'class') {
      return this.attributes.class || null;
    }
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? String(this.attributes[name])
      : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  matches(selector) {
    const normalizedSelector = String(selector || '').trim();
    if (normalizedSelector === '*') {
      return true;
    }
    if (normalizedSelector.startsWith('#')) {
      return this.id === cssUnescape(normalizedSelector.slice(1));
    }

    const simpleSelector = normalizedSelector.replace(/:nth-of-type\(\d+\)/g, '');
    const tagMatch = simpleSelector.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
    const tagName = tagMatch ? tagMatch[0].toLowerCase() : '';
    if (tagName && this.tagName.toLowerCase() !== tagName) {
      return false;
    }

    const classMatches = Array.from(simpleSelector.matchAll(/\.((?:\\.|[^\s.#:[>])+)/g))
      .map((match) => cssUnescape(match[1]));

    if (classMatches.length) {
      return classMatches.every((className) => this.classList.contains(className));
    }

    return tagName ? this.tagName.toLowerCase() === tagName : false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];

    const visit = (node) => {
      if (!(node instanceof MiniElement)) {
        return;
      }
      if (node.matches(selector)) {
        result.push(node);
      }
      for (const child of node.children) {
        visit(child);
      }
    };

    for (const child of this.children) {
      visit(child);
    }
    if (selector === '*') {
      return result;
    }
    return result;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  click() {
    this.clicked += 1;
    const handler = this.listeners.get('click');
    if (handler) {
      handler();
    }
  }
}

function text(value) {
  return value;
}

function el(tagName, attrs, children) {
  return new MiniElement(tagName, attrs, children);
}

function cssUnescape(value) {
  return String(value || '').replace(/\\(.)/g, '$1');
}

function createDocument(children) {
  const document = new MiniElement('document', {}, children);
  document.documentElement = document;
  document.body = document;
  return document;
}

test('findByRule matches visible text inside a scoped root', () => {
  const document = createDocument([
    el('section', { class: 'card' }, [
      el('h2', {}, [text('每日签到')]),
      el('button', {}, [text('今日已签到')])
    ]),
    el('button', {}, [text('绑定')])
  ]);

  const root = findByRule(document, { strategy: 'text', value: '每日签到', preferContainer: true });
  const button = findByRule(root, { strategy: 'text', value: '今日已签到' });

  assert.equal(root.tagName, 'SECTION');
  assert.equal(button.tagName, 'BUTTON');
});

test('isDisabled reads disabled, aria-disabled, and disabled classes', () => {
  const document = createDocument([
    el('button', { id: 'native', disabled: true }, [text('签到')]),
    el('button', { id: 'aria', 'aria-disabled': 'true' }, [text('签到')]),
    el('button', { id: 'classed', class: 'is-disabled' }, [text('签到')]),
    el('button', { id: 'enabled' }, [text('签到')])
  ]);

  assert.equal(isDisabled(document.querySelector('#native')), true);
  assert.equal(isDisabled(document.querySelector('#aria')), true);
  assert.equal(isDisabled(document.querySelector('#classed')), true);
  assert.equal(isDisabled(document.querySelector('#enabled')), false);
});

test('isDisabled ignores Tailwind disabled variant classes without real disabled state', () => {
  const document = createDocument([
    el('button', { id: 'variant', class: 'group/button disabled:pointer-events-none disabled:opacity-50' }, [text('立即签到')])
  ]);

  assert.equal(isDisabled(document.querySelector('#variant')), false);
});

test('runTaskOnDocument clicks a Tailwind-styled sign button with disabled variant classes', async () => {
  const document = createDocument([
    el('section', { class: 'card' }, [
      el('h2', {}, [text('每日签到')]),
      el('button', { class: 'group/button inline-flex items-center disabled:pointer-events-none disabled:opacity-50' }, [text('立即签到')])
    ])
  ]);
  let clicked = 0;
  document.querySelector('button').addEventListener('click', () => {
    clicked += 1;
  });

  const result = await runTaskOnDocument(document, {
    name: 'HotaruAPI',
    url: 'https://hotaruapi.com/profile',
    root: null,
    actionSelector: 'button.group\\/button.inline-flex.items-center',
    actionText: '立即签到',
    contextText: '每日签到',
    signedState: {
      textIncludes: ['已签到'],
      disabledMeansSigned: true
    },
    clickDelayMs: 0,
    confirmTimeoutMs: 50,
    confirmPollMs: 10
  });

  assert.equal(result.status, 'clicked');
  assert.equal(clicked, 1);
});

test('getTaskStatus returns signed when signed text appears in component', () => {
  const document = createDocument([
    el('section', { class: 'card' }, [
      el('h2', {}, [text('每日签到')]),
      el('p', {}, [text('今日已签到，累计签到 1 天')]),
      el('button', {}, [text('今日已签到')])
    ])
  ]);

  const status = getTaskStatus(document, DEFAULT_TASK);

  assert.equal(status.status, 'signed');
  assert.match(status.reason, /今日已签到/);
});

test('getTaskStatus returns ready when action button is enabled', () => {
  const document = createDocument([
    el('section', { class: 'card' }, [
      el('h2', {}, [text('每日签到')]),
      el('p', {}, [text('今日未签到')]),
      el('button', {}, [text('签到')])
    ])
  ]);

  const status = getTaskStatus(document, DEFAULT_TASK);

  assert.equal(status.status, 'ready');
  assert.equal(status.actionText, '签到');
});

test('runTaskOnDocument clicks only when ready', async () => {
  const document = createDocument([
    el('section', { class: 'card' }, [
      el('h2', {}, [text('每日签到')]),
      el('button', {}, [text('签到')])
    ])
  ]);
  let clicked = 0;
  document.querySelector('button').addEventListener('click', () => {
    clicked += 1;
  });

  const result = await runTaskOnDocument(document, {
    ...DEFAULT_TASK,
    clickDelayMs: 0,
    confirmTimeoutMs: 50,
    confirmPollMs: 10
  });

  assert.equal(result.status, 'clicked');
  assert.equal(clicked, 1);
});

test('runTaskOnDocument confirms success when signed state appears after click', async () => {
  const button = el('button', {}, [text('签到')]);
  const card = el('section', { class: 'card' }, [
    el('h2', {}, [text('每日签到')]),
    button
  ]);
  const document = createDocument([card]);
  let clicked = 0;
  button.addEventListener('click', () => {
    clicked += 1;
    setTimeout(() => {
      button.children = [text('今日已签到')];
    }, 10);
  });

  const result = await runTaskOnDocument(document, {
    ...DEFAULT_TASK,
    clickDelayMs: 0,
    confirmTimeoutMs: 60,
    confirmPollMs: 10
  });

  assert.equal(result.status, 'success');
  assert.equal(clicked, 1);
  assert.equal(result.actionText, '今日已签到');
});

test('runTaskOnDocument skips clicking signed state', async () => {
  const document = createDocument([
    el('section', { class: 'card' }, [
      el('h2', {}, [text('每日签到')]),
      el('button', { disabled: true }, [text('今日已签到')])
    ])
  ]);
  let clicked = 0;
  document.querySelector('button').addEventListener('click', () => {
    clicked += 1;
  });

  const result = await runTaskOnDocument(document, {
    ...DEFAULT_TASK,
    clickDelayMs: 0
  });

  assert.equal(result.status, 'signed');
  assert.equal(clicked, 0);
});

test('runTaskOnDocument waits configured delay before clicking', async () => {
  const document = createDocument([
    el('section', { class: 'card' }, [
      el('h2', {}, [text('每日签到')]),
      el('button', {}, [text('签到')])
    ])
  ]);
  let clicked = 0;
  document.querySelector('button').addEventListener('click', () => {
    clicked += 1;
  });

  const startedAt = Date.now();
  const result = await runTaskOnDocument(document, {
    ...DEFAULT_TASK,
    clickDelayMs: 30
    ,
    confirmTimeoutMs: 50,
    confirmPollMs: 10
  });

  assert.equal(result.status, 'clicked');
  assert.equal(result.delayMs, 30);
  assert.equal(clicked, 1);
  assert.ok(Date.now() - startedAt >= 25);
});

test('normalizeDelayMs clamps invalid or excessive delay values', () => {
  assert.equal(normalizeDelayMs(-1), 0);
  assert.equal(normalizeDelayMs('abc'), 0);
  assert.equal(normalizeDelayMs(35000), 30000);
  assert.equal(normalizeDelayMs(3000), 3000);
});

test('runTaskOnDocument can click when stored selector contains disabled state class', async () => {
  const document = createDocument([
    el('section', { class: 'card' }, [
      el('h2', {}, [text('每日签到')]),
      el('button', { class: 'semi-button' }, [text('签到')])
    ])
  ]);
  let clicked = 0;
  document.querySelector('button').addEventListener('click', () => {
    clicked += 1;
  });

  const result = await runTaskOnDocument(document, {
    ...DEFAULT_TASK,
    clickDelayMs: 0,
    actionSelector: 'button.semi-button.semi-button-disabled.semi-button-primary-disabled',
    confirmTimeoutMs: 50,
    confirmPollMs: 10
  });

  assert.equal(result.status, 'clicked');
  assert.equal(clicked, 1);
});

test('runTaskOnDocument prefers HotaruAPI sign button by text and card context when selector is generic', async () => {
  const sharedClass = 'group/button inline-flex items-center';
  const outsideButton = el('button', { class: sharedClass }, [text('立即签到')]);
  const checkinButton = el('button', { class: sharedClass }, [text('立即签到')]);
  const tokenButton = el('button', { class: sharedClass }, [text('访问令牌')]);
  const document = createDocument([
    el('section', { class: 'security-card' }, [
      el('h2', {}, [text('安全')]),
      tokenButton
    ]),
    el('section', { class: 'promo-card' }, [
      el('h2', {}, [text('限时活动')]),
      outsideButton
    ]),
    el('section', { class: 'daily-card' }, [
      el('h2', {}, [text('每日签到')]),
      el('p', {}, [text('每日签到可获得随机额度奖励')]),
      checkinButton
    ])
  ]);

  const result = await runTaskOnDocument(document, {
    name: 'HotaruAPI',
    url: 'https://hotaruapi.com/profile',
    root: null,
    actionSelector: 'button.group\\/button.inline-flex.items-center',
    actionText: '立即签到',
    contextText: '每日签到',
    signedState: {
      textIncludes: ['已签到'],
      disabledMeansSigned: true
    },
    clickDelayMs: 0,
    confirmTimeoutMs: 50,
    confirmPollMs: 10
  });

  assert.equal(result.status, 'clicked');
  assert.equal(checkinButton.clicked, 1);
  assert.equal(outsideButton.clicked, 0);
  assert.equal(tokenButton.clicked, 0);
});

test('runTaskOnDocument falls back to action text when selector contains stale state class', async () => {
  const signButton = el('button', { class: 'group/button inline-flex items-center' }, [text('立即签到')]);
  const document = createDocument([
    el('section', { class: 'daily-card' }, [
      el('h2', {}, [text('每日签到')]),
      signButton
    ])
  ]);

  const result = await runTaskOnDocument(document, {
    name: 'HotaruAPI',
    url: 'https://hotaruapi.com/profile',
    root: null,
    actionSelector: 'button.group\\/button.inline-flex.items-center.opacity-50',
    actionText: '立即签到',
    contextText: '每日签到',
    signedState: {
      textIncludes: ['已签到'],
      disabledMeansSigned: true
    },
    clickDelayMs: 0,
    confirmTimeoutMs: 50,
    confirmPollMs: 10
  });

  assert.equal(result.status, 'clicked');
  assert.equal(signButton.clicked, 1);
});


test('runTaskOnDocument skips HotaruAPI task when signed text is visible', async () => {
  const signButton = el('button', { class: 'group/button inline-flex items-center' }, [text('已签到')]);
  const document = createDocument([
    el('section', { class: 'daily-card' }, [
      el('h2', {}, [text('每日签到')]),
      signButton
    ])
  ]);

  const result = await runTaskOnDocument(document, {
    name: 'HotaruAPI',
    url: 'https://hotaruapi.com/profile',
    root: null,
    actionSelector: 'button.group\\/button.inline-flex.items-center',
    actionText: '立即签到',
    contextText: '每日签到',
    signedText: '已签到',
    signedState: {
      textIncludes: ['已签到'],
      disabledMeansSigned: true
    },
    clickDelayMs: 0
  });

  assert.equal(result.status, 'signed');
  assert.equal(signButton.clicked, 0);
});

test('runTaskOnDocument waits before clicking a HotaruAPI sign button', async () => {
  const signButton = el('button', { class: 'group/button inline-flex items-center' }, [text('立即签到')]);
  const document = createDocument([
    el('section', { class: 'daily-card' }, [
      el('h2', {}, [text('每日签到')]),
      signButton
    ])
  ]);

  const startedAt = Date.now();
  const result = await runTaskOnDocument(document, {
    name: 'HotaruAPI',
    url: 'https://hotaruapi.com/profile',
    root: null,
    actionSelector: 'button.group\\/button.inline-flex.items-center',
    actionText: '立即签到',
    contextText: '每日签到',
    signedText: '已签到',
    signedState: {
      textIncludes: ['已签到'],
      disabledMeansSigned: true
    },
    clickDelayMs: 30
    ,
    confirmTimeoutMs: 50,
    confirmPollMs: 10
  });

  assert.equal(result.status, 'clicked');
  assert.equal(result.delayMs, 30);
  assert.equal(signButton.clicked, 1);
  assert.ok(Date.now() - startedAt >= 25);
});

test('isElementVisible rejects hidden elements', () => {
  const document = createDocument([
    el('button', { id: 'hidden', hidden: true }, [text('签到')]),
    el('button', { id: 'shown' }, [text('签到')])
  ]);

  assert.equal(isElementVisible(document.querySelector('#hidden')), false);
  assert.equal(isElementVisible(document.querySelector('#shown')), true);
});

test('applyPickedToTask creates a one-button task from a right-click pick', () => {
  const picked = {
    selector: 'section.card button',
    text: '今日已签到',
    tag: 'button'
  };

  const task = applyPickedToTask({
    name: '牧原签到',
    url: 'https://muyuan.do/console/personal'
  }, picked);

  assert.equal(task.actionSelector, 'section.card button');
  assert.equal(task.action.strategy, 'selector');
  assert.equal(task.action.value, 'section.card button');
  assert.equal(task.action.tagName, 'button');
  assert.equal(task.signedState.disabledMeansSigned, true);
  assert.deepEqual(task.signedState.textIncludes, ['今日已签到', '已签到']);
  assert.equal(task.root, null);
});

test('createTaskFromPicked turns a picked button into a runnable task', () => {
  const task = applyPickedToTask({
    name: '签到任务',
    url: 'https://muyuan.do/console/personal'
  }, {
    selector: 'button.checkin',
    text: '签到',
    tag: 'button'
  });

  assert.equal(task.actionSelector, 'button.checkin');
  assert.equal(task.root, null);
  assert.equal(task.signedState.disabledMeansSigned, true);
});

test('resolveTaskMenuState returns edit text when a task already exists for the page', () => {
  const state = resolveTaskMenuState([
    { url: 'https://muyuan.do/console/personal', matchUrl: 'https://muyuan.do/console/*' }
  ], 'https://muyuan.do/console/personal?tab=1');

  assert.equal(state.hasTask, true);
  assert.equal(state.mode, 'edit');
  assert.equal(state.title, '任务存在：编辑任务');
});

test('resolveTaskMenuState returns create text when no task matches the page', () => {
  const state = resolveTaskMenuState([
    { url: 'https://example.com/foo', matchUrl: 'https://example.com/foo' }
  ], 'https://muyuan.do/console/personal');

  assert.equal(state.hasTask, false);
  assert.equal(state.mode, 'create');
  assert.equal(state.title, '任务不存在：创建任务');
});

test('resolveTaskMenuState searches all tasks by current sign-in address', () => {
  const state = resolveTaskMenuState([
    { id: 'first', url: 'https://example.com/foo', matchUrl: 'https://example.com/foo' },
    { id: 'muyuan', url: 'https://muyuan.do/console/personal', matchUrl: 'https://muyuan.do/console/*' }
  ], 'https://muyuan.do/console/personal#daily');

  assert.equal(state.hasTask, true);
  assert.equal(state.task.id, 'muyuan');
});

test('resolveTaskMenuState matches wildcard task address', () => {
  const state = resolveTaskMenuState([
    { id: 'wildcard', url: 'https://muyuan.do/console/home', matchUrl: 'https://muyuan.do/console/*' }
  ], 'https://muyuan.do/console/personal?tab=account');

  assert.equal(state.hasTask, true);
  assert.equal(state.task.id, 'wildcard');
});
