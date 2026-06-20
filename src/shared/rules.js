(function initSigninRules(root) {
  'use strict';

  const STORAGE_KEYS = {
    tasks: 'tasks',
    lastResults: 'lastResults',
    activePicker: 'activePicker'
  };

  const DEFAULT_TASK_ID = 'muyuan-personal-checkin';

  const DEFAULT_TASK = {
    id: DEFAULT_TASK_ID,
    enabled: true,
    name: '牧原签到',
    url: 'https://muyuan.do/console/personal',
    matchUrl: 'https://muyuan.do/console/*',
    root: {
      strategy: 'text',
      value: '每日签到',
      preferContainer: true
    },
    action: {
      strategy: 'text',
      value: '签到',
      tagName: 'button'
    },
    signedState: {
      textIncludes: ['今日已签到', '已签到'],
      disabledMeansSigned: true
    },
    clickDelayMs: 3000
  };

  const DISABLED_CLASS_NAMES = [
    'disabled',
    'is-disabled',
    'ant-btn-disabled',
    'semi-button-disabled',
    'semi-button-primary-disabled',
    'btn-disabled',
    'cursor-not-allowed'
  ];

  const UNSTABLE_SELECTOR_CLASS_RE = /\.(?:[a-zA-Z0-9_-]*(?:disabled|loading|active|selected|focus|hover)[a-zA-Z0-9_-]*|opacity-\d+|cursor-not-allowed|pointer-events-none)/gi;

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getAllElements(scope) {
    if (!scope) {
      return [];
    }

    const elements = [];
    if (scope.nodeType === 1) {
      elements.push(scope);
    }

    if (typeof scope.querySelectorAll === 'function') {
      try {
        elements.push(...Array.from(scope.querySelectorAll('*')));
      } catch (_error) {
        return elements;
      }
    }

    return elements;
  }

  function getElementText(element) {
    return normalizeText(element && element.textContent);
  }

  function isElementVisible(element) {
    if (!element) {
      return false;
    }

    if (element.hidden || element.getAttribute?.('hidden') !== null) {
      return false;
    }

    if (element.getAttribute?.('aria-hidden') === 'true') {
      return false;
    }

    const style = element.style || {};
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    if (typeof root.getComputedStyle === 'function') {
      const computed = root.getComputedStyle(element);
      if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') {
        return false;
      }
    }

    return true;
  }

  function isDisabled(element) {
    if (!element) {
      return false;
    }

    if (element.disabled === true || element.hasAttribute?.('disabled')) {
      return true;
    }

    const ariaDisabled = element.getAttribute?.('aria-disabled');
    if (ariaDisabled === 'true') {
      return true;
    }

    const dataDisabled = element.getAttribute?.('data-disabled');
    if (dataDisabled === 'true') {
      return true;
    }

    const className = typeof element.className === 'string' ? element.className : '';
    for (const disabledClassName of DISABLED_CLASS_NAMES) {
      if (element.classList?.contains(disabledClassName) || className.split(/\s+/).includes(disabledClassName)) {
        return true;
      }
    }

    if (/\b[a-z0-9_-]*disabled[a-z0-9_-]*\b/i.test(className)) {
      const tokens = className.split(/\s+/).filter(Boolean);
      if (tokens.some((token) => DISABLED_CLASS_NAMES.includes(token))) {
        return true;
      }
    }

    return false;
  }

  function isActionLike(element) {
    const tagName = element?.tagName?.toLowerCase();
    const role = element?.getAttribute?.('role');
    return tagName === 'button'
      || tagName === 'a'
      || tagName === 'input'
      || role === 'button'
      || typeof element?.click === 'function';
  }

  function scoreTextMatch(element, needle, rule) {
    const text = getElementText(element);
    if (!text || !text.includes(needle)) {
      return -1;
    }

    let score = 0;
    const tagName = element.tagName?.toLowerCase();
    if (text === needle) {
      score += 30;
    }
    if (rule?.tagName && tagName === rule.tagName.toLowerCase()) {
      score += 80;
    }
    if (!rule?.tagName && isActionLike(element)) {
      score += 10;
    }
    if (rule?.preferContainer && isContainerLike(element)) {
      score += 50;
    }
    score -= Math.min(text.length, 240) / 20;
    return score;
  }

  function isContainerLike(element) {
    const tagName = element?.tagName?.toLowerCase();
    if (!tagName) {
      return false;
    }
    return ['section', 'article', 'main', 'aside', 'div', 'li'].includes(tagName);
  }

  function findTextElement(scope, rule) {
    const value = normalizeText(rule.value);
    if (!value) {
      return null;
    }

    const elements = getAllElements(scope).filter(isElementVisible);
    let best = null;
    let bestScore = -1;

    for (const element of elements) {
      const score = scoreTextMatch(element, value, rule);
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    return bestScore >= 0 ? best : null;
  }

  function findByRule(scope, rule) {
    return findByRuleCandidates(scope, rule)[0] || null;
  }

  function findByRuleCandidates(scope, rule) {
    if (!scope || !rule) {
      return [];
    }

    if (rule.strategy === 'selector' && rule.value) {
      for (const selector of selectorFallbacks(rule.value)) {
        try {
          const scopeMatches = typeof scope.querySelectorAll === 'function'
            ? Array.from(scope.querySelectorAll(selector))
            : [];
          const documentMatches = typeof scope.ownerDocument?.querySelectorAll === 'function'
            ? Array.from(scope.ownerDocument.querySelectorAll(selector))
            : [];
          const matches = uniqueElements([...scopeMatches, ...documentMatches])
            .filter(isElementVisible);
          if (matches.length) {
            return matches;
          }
        } catch (_error) {
          // try the next selector fallback
        }
      }
      return [];
    }

    if (rule.strategy === 'text' && rule.value) {
      const element = findTextElement(scope, rule);
      return element ? [element] : [];
    }

    if (rule.strategy === 'picked' && rule.selector) {
      return findByRuleCandidates(scope, { strategy: 'selector', value: rule.selector });
    }

    return [];
  }

  function uniqueElements(elements) {
    return elements.filter((element, index, array) => element && array.indexOf(element) === index);
  }

  function selectorFallbacks(selector) {
    const values = [String(selector || '').trim()].filter(Boolean);
    const withoutStateClasses = values[0]?.replace(UNSTABLE_SELECTOR_CLASS_RE, '');

    if (withoutStateClasses && withoutStateClasses !== values[0]) {
      values.push(withoutStateClasses);
    }

    return values.filter((value, index, array) => value && array.indexOf(value) === index);
  }

  function findActionElement(scope, task) {
    const action = task.action || DEFAULT_TASK.action;
    const narrowedScope = getActionContextScope(scope, task);
    if (narrowedScope) {
      const narrowedElement = findBestActionElement(narrowedScope, task, action);
      if (narrowedElement) {
        return narrowedElement;
      }
    }

    const actionElement = findBestActionElement(scope, task, action);
    if (actionElement) {
      return actionElement;
    }

    for (const text of getActionTextCandidates(task)) {
      const element = findByRule(narrowedScope || scope, { strategy: 'text', value: text, tagName: action.tagName || 'button' });
      if (element) {
        return element;
      }
    }

    return null;
  }

  function findBestActionElement(scope, task, action) {
    const candidates = findByRuleCandidates(scope, action)
      .filter((element) => !action.tagName || element.tagName?.toLowerCase() === action.tagName.toLowerCase());
    if (!candidates.length) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0];
    }

    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const score = scoreActionCandidate(candidate, task, action);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  function getActionContextScope(scope, task) {
    for (const text of getContextTextCandidates(task)) {
      if (!text) {
        continue;
      }
      const anchor = findByRule(scope, {
        strategy: 'text',
        value: text,
        preferContainer: true
      });
      if (anchor) {
        return anchor;
      }
    }
    return scope;
  }

  function scoreActionCandidate(element, task, action) {
    const elementText = getElementText(element);
    const ancestorText = getAncestorText(element, 5);
    let score = 0;

    if (isActionLike(element)) {
      score += 20;
    }

    for (const text of getActionTextCandidates(task)) {
      if (!text) {
        continue;
      }
      if (elementText === text) {
        score += 120;
      } else if (elementText.includes(text)) {
        score += 80;
      }
    }

    for (const text of getContextTextCandidates(task)) {
      if (!text) {
        continue;
      }
      if (ancestorText.includes(text)) {
        score += 60;
      }
      if (elementText.includes(text)) {
        score += 20;
      }
    }

    const picked = action?.picked || {};
    if (picked.text && elementText === normalizeText(picked.text)) {
      score += 80;
    }
    if (picked.ariaLabel && element.getAttribute?.('aria-label') === picked.ariaLabel) {
      score += 40;
    }

    if (isDisabled(element)) {
      score -= 20;
    }
    score -= Math.min(elementText.length, 200) / 20;
    return score;
  }

  function getAncestorText(element, maxDepth) {
    const values = [];
    let current = element;
    let depth = 0;
    while (current && depth <= maxDepth) {
      values.push(getElementText(current));
      current = current.parentElement;
      depth += 1;
    }
    return normalizeText(values.join(' '));
  }

  function getActionTextCandidates(task) {
    const action = task.action || {};
    return uniqueValues([
      task.actionText,
      action.text,
      action.picked?.text,
      action.strategy === 'text' ? action.value : '',
      task.actionLabel
    ]);
  }

  function getContextTextCandidates(task) {
    const root = task.root || {};
    return uniqueValues([
      task.contextText,
      task.cardText,
      root.strategy === 'text' ? root.value : '',
      task.name && /签到/.test(task.name) ? '每日签到' : ''
    ]);
  }

  function uniqueValues(values) {
    return values
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);
  }

  function getSignedStateRules(task) {
    const signedState = task.signedState || DEFAULT_TASK.signedState;
    const rules = [];

    for (const text of signedState.textIncludes || []) {
      rules.push({
        strategy: 'text',
        value: text
      });
    }

    if (signedState.selector) {
      rules.push({
        strategy: 'selector',
        value: signedState.selector
      });
    }

    if (Array.isArray(signedState.rules)) {
      rules.push(...signedState.rules);
    }

    return rules;
  }

  function getTaskScope(documentLike, task) {
    if (task.root === null) {
      return documentLike;
    }
    const rootRule = task.root || DEFAULT_TASK.root;
    return findByRule(documentLike, rootRule) || documentLike;
  }

  function getTaskStatus(documentLike, taskInput) {
    const task = mergeTask(taskInput);
    const scope = getTaskScope(documentLike, task);
    if (!scope) {
      return {
        status: 'missing-root',
        reason: '未找到组件根容器'
      };
    }

    const actionElement = findActionElement(scope, task);
    for (const rule of getSignedStateRules(task)) {
      const matched = findByRule(scope, rule);
      if (matched) {
        return {
          status: 'signed',
          reason: `找到已签到状态：${rule.value || rule.selector || rule.strategy}`,
          actionText: actionElement ? getElementText(actionElement) : ''
        };
      }
    }

    if (!actionElement) {
      return {
        status: 'missing-action',
        reason: '未找到可操作元素'
      };
    }

    const actionText = getElementText(actionElement);
    if (task.signedState?.textIncludes?.some((text) => actionText.includes(text))) {
      return {
        status: 'signed',
        reason: `按钮文案显示已签到：${actionText}`,
        actionText
      };
    }

    if (task.signedState?.disabledMeansSigned && isDisabled(actionElement)) {
      return {
        status: 'signed',
        reason: '操作元素为 disabled 状态',
        actionText
      };
    }

    return {
      status: 'ready',
      reason: '找到可点击签到元素',
      actionText
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      root.setTimeout(resolve, ms);
    });
  }

  function normalizeDelayMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 0;
    }
    return Math.min(Math.round(numeric), 30000);
  }

  function normalizeConfirmWindowMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 5000;
    }
    return Math.min(Math.round(numeric), 15000);
  }

  function normalizeConfirmPollMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 400;
    }
    return Math.min(Math.max(Math.round(numeric), 50), 2000);
  }

  async function confirmPostClickStatus(documentLike, task, delayMs) {
    const timeoutMs = normalizeConfirmWindowMs(task.confirmTimeoutMs);
    const pollMs = normalizeConfirmPollMs(task.confirmPollMs);
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      await sleep(pollMs);
      const status = getTaskStatus(documentLike, task);
      if (status.status === 'signed') {
        return {
          status: 'success',
          reason: status.reason || '点击后检测到已签到状态',
          actionText: status.actionText || '',
          delayMs,
          confirmTimeoutMs: timeoutMs
        };
      }
    }

    return null;
  }

  async function runTaskOnDocument(documentLike, taskInput) {
    const task = mergeTask(taskInput);
    const delayMs = normalizeDelayMs(task.clickDelayMs);

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const status = getTaskStatus(documentLike, task);
    if (status.status !== 'ready') {
      return {
        ...status,
        delayMs
      };
    }

    const scope = getTaskScope(documentLike, task);
    const actionElement = findActionElement(scope, task);
    if (!actionElement || isDisabled(actionElement) || !isElementVisible(actionElement)) {
      return {
        status: 'blocked',
        reason: '操作元素不可点击',
        delayMs
      };
    }

    actionElement.scrollIntoView?.({ block: 'center', inline: 'center' });
    actionElement.click();

    const confirmedStatus = await confirmPostClickStatus(documentLike, task, delayMs);
    if (confirmedStatus) {
      return confirmedStatus;
    }

    return {
      status: 'clicked',
      reason: '已点击签到元素',
      actionText: getElementText(actionElement),
      delayMs
    };
  }

  function mergeTask(task) {
    const root = task?.root === null ? null : normalizeRule(task?.root || task?.rootSelector, DEFAULT_TASK.root);
    const action = normalizeRule(task?.action || task?.actionSelector, DEFAULT_TASK.action);
    const signedState = normalizeSignedState(task?.signedState, task?.signedSelector);

    return {
      ...DEFAULT_TASK,
      ...(task || {}),
      root,
      action,
      signedState,
      actionText: normalizeText(task?.actionText || action?.picked?.text || action?.text || ''),
      contextText: normalizeText(task?.contextText || ''),
      signedText: normalizeText(task?.signedText || ''),
      clickDelayMs: normalizeDelayMs(task?.clickDelayMs ?? DEFAULT_TASK.clickDelayMs)
    };
  }

  function normalizeRule(input, fallback) {
    if (!input) {
      return { ...fallback };
    }

    if (typeof input === 'string') {
      return {
        ...fallback,
        strategy: 'selector',
        value: input
      };
    }

    if (input.selector) {
      return {
        ...fallback,
        ...input,
        strategy: input.strategy || 'selector',
        value: input.value || input.selector
      };
    }

    return {
      ...fallback,
      ...input
    };
  }

  function normalizeSignedState(input, signedSelector) {
    const state = {
      ...DEFAULT_TASK.signedState,
      ...(input || {})
    };

    if (signedSelector && !state.selector) {
      state.selector = signedSelector;
    }

    if (state.text || state.label) {
      state.textIncludes = uniqueValues([...(state.textIncludes || []), state.text, state.label]);
    }

    return state;
  }

  function createPickedRule(picked) {
    if (!picked) {
      return null;
    }
    return {
      strategy: 'picked',
      selector: picked.selector || '',
      text: picked.text || '',
      tagName: picked.tagName || '',
      role: picked.role || '',
      ariaLabel: picked.ariaLabel || ''
    };
  }

  function applyPickedToTask(taskInput, picked) {
    const task = {
      ...DEFAULT_TASK,
      ...(taskInput || {})
    };
    const selector = picked?.selector || '';
    const tagName = picked?.tag || picked?.tagName || '';

    return {
      ...task,
      id: task.id || task.url || DEFAULT_TASK_ID,
      enabled: task.enabled !== false,
      root: null,
      rootSelector: '',
      actionSelector: selector,
      actionText: picked?.text || '',
      contextText: task.contextText || '',
      signedSelector: '',
      action: {
        strategy: 'selector',
        value: selector,
        text: picked?.text || '',
        tagName,
        picked
      },
      signedState: {
        textIncludes: ['今日已签到', '已签到'],
        disabledMeansSigned: true
      }
    };
  }

  const api = {
    STORAGE_KEYS,
    DEFAULT_TASK_ID,
    DEFAULT_TASK,
    normalizeText,
    getElementText,
    getAllElements,
    findByRule,
    selectorFallbacks,
    isDisabled,
    isElementVisible,
    getTaskStatus,
    runTaskOnDocument,
    mergeTask,
    normalizeRule,
    normalizeDelayMs,
    createPickedRule,
    applyPickedToTask
  };

  root.SigninRules = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
