(function initTaskMenu(root) {
  'use strict';

  const DEFAULT_TASK_ID = 'muyuan-personal-checkin';

  function normalizeTask(task) {
    if (!task || typeof task !== 'object') {
      return null;
    }

    const name = String(task.name || '').trim() || '签到任务';
    const url = String(task.url || '').trim();
    const matchUrl = String(task.matchUrl || url).trim();

    return {
      ...task,
      id: String(task.id || task.taskId || task.name || task.url || DEFAULT_TASK_ID).trim() || DEFAULT_TASK_ID,
      name,
      url,
      matchUrl
    };
  }

  function normalizeTasks(tasks) {
    if (Array.isArray(tasks)) {
      return tasks.map(normalizeTask).filter(Boolean);
    }
    if (tasks && typeof tasks === 'object') {
      return [normalizeTask(tasks)].filter(Boolean);
    }
    return [];
  }

  function normalizePageUrl(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }

    try {
      const parsed = new URL(url);
      parsed.search = '';
      parsed.hash = '';
      const normalized = parsed.toString();

      if (parsed.pathname !== '/' && normalized.endsWith('/')) {
        return normalized.slice(0, -1);
      }

      return normalized;
    } catch (_error) {
      return String(url || '').trim();
    }
  }

  function normalizePattern(pattern) {
    if (!pattern || typeof pattern !== 'string') {
      return '';
    }

    const normalized = pattern.trim().split('#')[0].split('?')[0];
    if (normalized.endsWith('/*')) {
      return normalized;
    }
    if (normalized.endsWith('/') && !normalized.includes('*')) {
      return normalized.slice(0, -1);
    }
    return normalized;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function matchesPageUrl(pageUrl, pattern) {
    const normalizedPageUrl = normalizePageUrl(pageUrl);
    const normalizedPattern = normalizePattern(pattern);

    if (!normalizedPageUrl || !normalizedPattern) {
      return false;
    }

    if (!normalizedPattern.includes('*')) {
      return normalizedPageUrl === normalizedPattern;
    }

    const regexp = new RegExp(`^${escapeRegExp(normalizedPattern).replace(/\\\*/g, '.*')}$`);
    return regexp.test(normalizedPageUrl);
  }

  function findTaskByPageUrl(tasks, pageUrl) {
    const list = normalizeTasks(tasks);
    const exactMatched = list.find((task) => matchesPageUrl(pageUrl, task.url));
    if (exactMatched) {
      return exactMatched;
    }

    return list.find((task) => matchesPageUrl(pageUrl, task.matchUrl)) || null;
  }

  function resolveTaskMenuState(tasks, pageUrl) {
    const task = findTaskByPageUrl(tasks, pageUrl);
    const hasTask = Boolean(task);

    return {
      hasTask,
      mode: hasTask ? 'edit' : 'create',
      title: hasTask ? '任务存在：编辑任务' : '任务不存在：创建任务',
      task
    };
  }

  const api = {
    normalizePageUrl,
    matchesPageUrl,
    findTaskByPageUrl,
    resolveTaskMenuState,
    normalizeTasks
  };

  root.resolveTaskMenuState = resolveTaskMenuState;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
