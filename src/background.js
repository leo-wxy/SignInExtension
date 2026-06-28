const MESSAGE_TYPES = {
  GET_STATUS: 'GET_STATUS',
  RUN_TASK: 'RUN_TASK',
  RUN_ALL_TASKS: 'RUN_ALL_TASKS',
  OPEN_TASK: 'OPEN_TASK',
  START_PICKER: 'START_PICKER',
  QUICK_PICK_ELEMENT: 'QUICK_PICK_ELEMENT',
  SHOW_PICK_RESULT: 'SHOW_PICK_RESULT',
  PICKER_RESULT: 'PICKER_RESULT',
  PICKER_CANCELLED: 'PICKER_CANCELLED'
};

const HOME_PAGE = chrome.runtime.getURL('options/options.html');
const TASK_MENU_ID = 'signin-task-menu';

const STORAGE_KEYS = {
  tasks: 'tasks',
  lastResults: 'lastResults'
};

const DEFAULT_TASK = {
  id: 'muyuan-personal-checkin',
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

function isChromeApiReady() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.tabs;
}

function isContextMenuReady() {
  return typeof chrome !== 'undefined' && chrome.contextMenus;
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    return null;
  }
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
  const exactMatched = tasks.find((task) => matchesPageUrl(pageUrl, task.url));
  if (exactMatched) {
    return exactMatched;
  }

  return tasks.find((task) => matchesPageUrl(pageUrl, task.matchUrl)) || null;
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

function createErrorResponse(message, extra) {
  return {
    ok: false,
    error: message,
    ...(extra || {})
  };
}

function getResponseResult(response) {
  if (!response || response.ok === false) {
    throw new Error(response?.error || '页面未返回元素信息');
  }
  return response.result || response;
}

function setActionBadge(tabId, text, color) {
  if (!chrome.action) {
    return;
  }

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' });
  }, 2500);
}

function isSuccessStatus(status) {
  return status === 'success' || status === 'signed' || status === 'ok';
}

function isFailureStatus(status) {
  return ['missing-root', 'missing-action', 'blocked', 'error'].includes(status);
}

function isPendingStatus(status) {
  return status === 'clicked';
}

function getBadgeByStatus(status) {
  if (isSuccessStatus(status)) {
    return {
      text: '成',
      color: '#16a34a'
    };
  }

  if (isPendingStatus(status)) {
    return {
      text: '待',
      color: '#d97706'
    };
  }

  if (isFailureStatus(status)) {
    return {
      text: '失',
      color: '#dc2626'
    };
  }

  return {
    text: '中',
    color: '#2563eb'
  };
}

function showTaskBadge(tabId, result) {
  const badge = getBadgeByStatus(result?.status || '');
  setActionBadge(tabId, badge.text, badge.color);
}

function createNotificationId(taskId) {
  return `signin-result-${taskId}-${Date.now()}`;
}

function getNotificationTitle(status, taskName) {
  const name = taskName || '签到任务';
  if (status === 'success') {
    return `${name}：签到成功`;
  }
  if (status === 'signed') {
    return `${name}：已签到`;
  }
  if (status === 'clicked') {
    return `${name}：未确认成功`;
  }
  if (isFailureStatus(status)) {
    return `${name}：签到失败`;
  }
  return `${name}：签到提醒`;
}

async function showBrowserNotification(task, result) {
  if (!chrome.notifications?.create || !result?.status) {
    return;
  }

  return new Promise((resolve) => {
    chrome.notifications.create(
      createNotificationId(getTaskId(task)),
      {
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAx0lEQVR4Ae3XQQrCMBQF0XfQe1P3P6Vh3YhQKfRpyR2S3gT0p3QkqT8J9yRzM0Q9M8y8j2Qn3o7gH1oG6D2QK8A0M2s1mE4r9J2aJ3m5d8m2H2c6gAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAqgAo4AByd2W8Q4Fq1QAAAABJRU5ErkJggg==',
        title: getNotificationTitle(result.status, task?.name),
        message: result.message || formatResultMessage(result.status, ''),
        priority: 2
      },
      () => {
        void chrome.runtime?.lastError;
        resolve();
      }
    );
  });
}

function getToastKindByStatus(status) {
  if (isFailureStatus(status)) {
    return 'error';
  }
  if (isSuccessStatus(status)) {
    return 'success';
  }
  return 'info';
}

async function showTaskResultToast(tabId, result) {
  if (!tabId || !result?.message) {
    return;
  }

  await showPickResult(tabId, result.message, getToastKindByStatus(result.status));
}

function formatResultMessage(status, rawMessage) {
  const message = String(rawMessage || '').trim();
  if (message) {
    if (status === 'missing-action') {
      return `${message}，可能未登录或页面结构已变化`;
    }
    if (status === 'missing-root') {
      return `${message}，可能未登录或页面结构已变化`;
    }
    if (status === 'blocked') {
      return `${message}，可能已签到、未登录，或按钮仍不可点击`;
    }
    return message;
  }

  if (status === 'clicked') {
    return '已点击签到按钮，但暂未观察到成功状态';
  }
  if (status === 'success') {
    return '点击后检测到已签到状态';
  }
  if (status === 'signed') {
    return '当前任务已签到，已跳过';
  }
  if (status === 'missing-action' || status === 'missing-root') {
    return '未找到签到入口，可能未登录或页面结构已变化';
  }
  if (status === 'blocked') {
    return '签到按钮不可点击，可能已签到、未登录，或页面尚未加载完成';
  }
  if (status === 'error') {
    return '签到失败，请检查页面状态';
  }
  return message;
}

async function showPickResult(tabId, text, kind) {
  if (!tabId) {
    return;
  }

  try {
    await sendTaskMessage(tabId, {
      type: MESSAGE_TYPES.SHOW_PICK_RESULT,
      text,
      kind
    });
  } catch (_error) {
    // no-op
  }
}

function promisifyChromeCall(fn) {
  return new Promise((resolve, reject) => {
    fn((result) => {
      const runtimeError = chrome.runtime && chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(result);
    });
  });
}

function queryTabs(queryInfo) {
  return promisifyChromeCall((done) => chrome.tabs.query(queryInfo, done));
}

function createTab(createProperties) {
  return promisifyChromeCall((done) => chrome.tabs.create(createProperties, done));
}

function updateTab(tabId, updateProperties) {
  return promisifyChromeCall((done) => chrome.tabs.update(tabId, updateProperties, done));
}

function getTab(tabId) {
  return promisifyChromeCall((done) => chrome.tabs.get(tabId, done));
}

function sendTabMessage(tabId, message) {
  return promisifyChromeCall((done) => chrome.tabs.sendMessage(tabId, message, done));
}

function executeScript(tabId, files) {
  return promisifyChromeCall((done) => {
    chrome.scripting.executeScript({
      target: { tabId },
      files
    }, done);
  });
}

async function sendTaskMessage(tabId, message) {
  try {
    return await sendTabMessage(tabId, message);
  } catch (error) {
    await executeScript(tabId, ['src/shared/rules.js', 'src/content.js']);
    return sendTabMessage(tabId, message);
  }
}

function storageGet(keys) {
  return promisifyChromeCall((done) => chrome.storage.local.get(keys, done));
}

function storageSet(items) {
  return promisifyChromeCall((done) => chrome.storage.local.set(items, done));
}

function getTaskId(task) {
  return String(task?.id || task?.name || task?.url || DEFAULT_TASK.id);
}

async function getPrimaryTask(messageTask) {
  if (messageTask) {
    return normalizeTask(messageTask);
  }

  const storage = await storageGet([STORAGE_KEYS.tasks]);
  const tasks = storage[STORAGE_KEYS.tasks];
  if (Array.isArray(tasks) && tasks.length) {
    return normalizeTask(tasks[0]);
  }
  if (tasks && typeof tasks === 'object') {
    return normalizeTask(tasks);
  }
  return normalizeTask(DEFAULT_TASK);
}

function normalizeTask(task) {
  return {
    ...DEFAULT_TASK,
    ...(task || {}),
    id: getTaskId(task || DEFAULT_TASK),
    enabled: task?.enabled !== false
  };
}

function createTaskFromPicked(page, picked) {
  const url = page?.pageUrl || page?.url || '';
  const title = page?.pageTitle || '';
  const buttonText = picked?.text || '签到';
  const name = title ? `${title} - ${buttonText}` : buttonText;

  return {
    id: url || `task-${Date.now()}`,
    enabled: true,
    name,
    url,
    matchUrl: url,
    root: null,
    rootSelector: '',
    actionSelector: picked?.selector || '',
    signedSelector: '',
    action: {
      strategy: 'selector',
      value: picked?.selector || '',
      tagName: picked?.tag || picked?.tagName || '',
      picked
    },
    signedState: {
      textIncludes: ['今日已签到', '已签到'],
      disabledMeansSigned: true
    }
  };
}

async function saveTask(task) {
  const current = await getStoredTasks();
  const normalizedTask = normalizeTask(task);
  const next = [];
  let replaced = false;

  for (const item of current) {
    if (!replaced && item.id === normalizedTask.id) {
      next.push(normalizedTask);
      replaced = true;
      continue;
    }
    next.push(item);
  }

  if (!replaced) {
    next.unshift(normalizedTask);
  }

  await storageSet({ [STORAGE_KEYS.tasks]: next });
  return normalizedTask;
}

async function getStoredTasks() {
  const storage = await storageGet([STORAGE_KEYS.tasks]);
  const tasks = storage[STORAGE_KEYS.tasks];
  if (Array.isArray(tasks)) {
    return tasks.map(normalizeTask);
  }
  if (tasks && typeof tasks === 'object') {
    return [normalizeTask(tasks)];
  }
  return [];
}

function applyPickedToExistingTask(task, picked, page) {
  return {
    ...normalizeTask(task),
    url: page?.pageUrl || task.url || '',
    matchUrl: page?.pageUrl || task.matchUrl || task.url || '',
    root: null,
    rootSelector: '',
    actionSelector: picked?.selector || '',
    signedSelector: '',
    action: {
      strategy: 'selector',
      value: picked?.selector || '',
      tagName: picked?.tag || picked?.tagName || '',
      picked
    },
    signedState: {
      textIncludes: ['今日已签到', '已签到'],
      disabledMeansSigned: true
    }
  };
}

async function saveLastResult(task, result) {
  const taskId = getTaskId(task);
  const storage = await storageGet([STORAGE_KEYS.lastResults]);
  const existing = storage[STORAGE_KEYS.lastResults];
  const lastResults = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? existing
    : {};

  const newStatus = result?.result?.status || result?.status || (result?.ok ? 'ok' : 'error');

  // 今天已签到成功，不被错误结果覆盖
  const prev = lastResults[taskId];
  if (prev && isSuccessStatus(prev.status) && isFailureStatus(newStatus)) {
    const prevDate = new Date(prev.time).toDateString();
    if (prevDate === new Date().toDateString()) {
      return prev;
    }
  }

  lastResults[taskId] = {
    taskId,
    taskName: task.name || '',
    url: task.url || '',
    status: newStatus,
    message: formatResultMessage(
      newStatus,
      result?.result?.reason || result?.reason || result?.error || ''
    ),
    detail: result,
    time: new Date().toISOString()
  };

  await storageSet({ [STORAGE_KEYS.lastResults]: lastResults });
  return lastResults[taskId];
}

async function findReusableTab(normalizedUrl) {
  const tabs = await queryTabs({});
  return tabs.find((tab) => normalizeUrl(tab.url) === normalizedUrl) || null;
}

async function openExtensionPage(url) {
  const tabs = await queryTabs({});
  const existing = tabs.find((tab) => tab.url === url);
  if (existing) {
    return updateTab(existing.id, { active: true });
  }
  return createTab({ url, active: true });
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      clearTimeout(timeoutId);
      callback(value);
    };

    const handleUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) {
        return;
      }

      if (changeInfo.status === 'complete') {
        finish(resolve);
      }
    };

    const timeoutId = setTimeout(async () => {
      try {
        const tab = await getTab(tabId);
        if (tab && tab.status === 'complete') {
          finish(resolve);
          return;
        }
        finish(reject, new Error('等待页面加载超时'));
      } catch (error) {
        finish(reject, error);
      }
    }, 15000);

    chrome.tabs.onUpdated.addListener(handleUpdated);

    getTab(tabId)
      .then((tab) => {
        if (tab && tab.status === 'complete') {
          finish(resolve);
        }
      })
      .catch((error) => finish(reject, error));
  });
}

async function openOrReuseTaskTab(task) {
  const normalizedUrl = normalizeUrl(task && task.url);
  if (!normalizedUrl) {
    throw new Error('task.url 无效');
  }

  const reusableTab = await findReusableTab(normalizedUrl);
  let tab = reusableTab;

  if (tab) {
    tab = await updateTab(tab.id, {
      active: true
    });
  } else {
    tab = await createTab({
      url: normalizedUrl,
      active: true
    });
  }

  await waitForTabLoad(tab.id);
  return tab;
}

async function dispatchTaskMessage(messageType, taskInput, extra) {
  const task = await getPrimaryTask(taskInput);
  const tab = await openOrReuseTaskTab(task);
  const response = await sendTaskMessage(tab.id, {
    type: messageType,
    task,
    ...(extra || {})
  });

  const result = {
    ok: true,
    tabId: tab.id,
    url: tab.url || normalizeUrl(task && task.url),
    result: response
  };

  if (messageType === MESSAGE_TYPES.RUN_TASK || messageType === MESSAGE_TYPES.GET_STATUS) {
    result.lastResult = await saveLastResult(task, response);
    showTaskBadge(tab.id, result.lastResult);
    await showTaskResultToast(tab.id, result.lastResult);
    await showBrowserNotification(task, result.lastResult);
  }

  return result;
}

async function startContextPicker(tab, targetKey, reason) {
  if (!tab?.id) {
    throw new Error('没有可用标签页');
  }

  await sendTaskMessage(tab.id, {
    type: MESSAGE_TYPES.START_PICKER,
    targetKey
  });
  setActionBadge(tab.id, '选', '#2563eb');
  await saveLastResult(DEFAULT_TASK, {
    status: 'selecting',
    reason: reason || '请在页面上左键点击签到按钮'
  });
  await showPickResult(tab.id, reason || '请在页面上左键点击签到按钮', 'info');
}

async function startQuickPick(tab, targetKey, state) {
  if (!tab?.id) {
    throw new Error('没有可用标签页');
  }

  await sendTaskMessage(tab.id, {
    type: MESSAGE_TYPES.QUICK_PICK_ELEMENT,
    targetKey,
    mode: state?.mode || 'create',
    taskId: state?.task?.id || null
  });
  setActionBadge(tab.id, '选', '#2563eb');
}

async function handlePickerResult(message, sender) {
  const tab = sender?.tab || {};
  const page = {
    pageTitle: tab.title || '',
    pageUrl: tab.url || ''
  };
  const tasks = await getStoredTasks();
  const existingTask = findTaskByPageUrl(tasks, page.pageUrl);

  if (!existingTask) {
    const task = createTaskFromPicked(page, message.picked);
    await saveTask(task);
    await saveLastResult(task, {
      status: 'configured',
      reason: `已添加任务：${task.name}`
    });
    setActionBadge(tab.id, 'OK', '#16a34a');
    await showPickResult(tab.id, `已保存签到任务：${task.name}`, 'success');
    return { ok: true };
  }

  const task = applyPickedToExistingTask(existingTask, message.picked, page);
  await saveTask(task);
  await saveLastResult(task, {
    status: 'configured',
    reason: `已更新签到元素：${task.name}`
  });
  setActionBadge(tab.id, 'OK', '#16a34a');
  await showPickResult(tab.id, `已更新签到任务：${task.name}`, 'success');
  return { ok: true };
}

function refreshContextMenus() {
  if (!isContextMenuReady()) {
    return;
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: TASK_MENU_ID,
      title: '任务不存在：创建任务',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  });
}

async function updateContextMenusForTab(tab) {
  if (!isContextMenuReady() || !tab?.id) {
    return;
  }

  const tasks = await getStoredTasks();
  const state = resolveTaskMenuState(tasks, tab.url || '');

  chrome.contextMenus.update(TASK_MENU_ID, {
    title: state.title,
    contexts: ['page'],
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  }, () => {
    void chrome.runtime.lastError;
  });
}

async function handleContextMenuClick(info, tab) {
  if (info.menuItemId !== TASK_MENU_ID || !tab?.id) {
    return;
  }

  const tasks = await getStoredTasks();
  const state = resolveTaskMenuState(tasks, tab.url || '');
  await startQuickPick(tab, TASK_MENU_ID, state);
}

async function handleOpenTask(message) {
  const task = await getPrimaryTask(message.task);
  const tab = await openOrReuseTaskTab(task);
  return {
    ok: true,
    tabId: tab.id,
    url: tab.url || normalizeUrl(task && task.url)
  };
}

function relayPickerEvent(message, sender) {
  const payload = {
    ...message,
    tabId: sender && sender.tab ? sender.tab.id : null
  };

  chrome.runtime.sendMessage(payload, () => {
    void chrome.runtime.lastError;
  });
}

async function setupDailyAlarm() {
  try {
    // 获取用户配置的时间
    const storage = await storageGet(['autoSigninTime', 'autoSigninEnabled']);
    const enabled = storage.autoSigninEnabled === true;
    const timeStr = storage.autoSigninTime || '10:00'; // 默认10:00

    if (!enabled) {
      chrome.alarms.clear('daily-signin');
      return;
    }

    // 解析时间
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    // 如果今天的时间已过，设置为明天
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    // 创建定时器
    await chrome.alarms.create('daily-signin', {
      when: scheduledTime.getTime(),
      periodInMinutes: 24 * 60 // 每24小时重复
    });

  } catch (error) {
    console.error('[Background] 设置定时器失败:', error);
  }
}

async function handleDailySignin() {

  try {
    const storage = await storageGet([STORAGE_KEYS.tasks]);
    const tasks = storage[STORAGE_KEYS.tasks] || [];
    const enabledTasks = tasks.filter(t => t.enabled !== false);

    if (!enabledTasks.length) {
      return;
    }

    // 调用批量签到
    await handleRunAllTasks(enabledTasks);
  } catch (error) {
    console.error('[Background] 定时签到失败:', error);
  }
}

async function handleRunAllTasks(tasks) {
  if (!tasks || !tasks.length) {
    return { ok: false, error: '没有任务' };
  }

  // 在后台异步执行，立即返回响应
  (async () => {
    const [activeTab] = await queryTabs({ active: true, currentWindow: true }).catch(() => [null]);

    for (let i = 0; i < tasks.length; i++) {
      const task = normalizeTask(tasks[i]);

      let targetTab = null;
      let isNewTab = false;
      try {
        // 检查是否已有该任务的标签页
        const tabs = await queryTabs({});
        targetTab = tabs.find(tab =>
          tab.url && (tab.url.startsWith(task.url) || matchesPageUrl(tab.url, task.matchUrl))
        );

        if (!targetTab) {
          // 打开新页面
          isNewTab = true;
          targetTab = await createTab({ url: task.url, active: false });
          await waitForTabLoad(targetTab.id);
        }

        // 执行签到
        const response = await sendTaskMessage(targetTab.id, {
          type: MESSAGE_TYPES.RUN_TASK,
          task
        });

        const lastResult = await saveLastResult(task, response);
        showTaskBadge(targetTab.id, lastResult);
        await showTaskResultToast(targetTab.id, lastResult);
        await showBrowserNotification(task, lastResult);

        // 如果是新打开的标签页，等待3秒后关闭
        if (isNewTab && targetTab?.id) {
          await new Promise(resolve => setTimeout(resolve, 3000));

          try {
            await chrome.tabs.remove(targetTab.id);
          } catch (e) {
            console.error(`[Background] ✗ 关闭标签页失败:`, e);
          }
        }

        // 任务间隔
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`[Background] 任务 ${task.name} 执行失败:`, error);
        const lastResult = await saveLastResult(task, {
          status: 'error',
          reason: error.message || String(error)
        });
        if (targetTab?.id) {
          showTaskBadge(targetTab.id, lastResult);
          await showTaskResultToast(targetTab.id, lastResult);
        }
        await showBrowserNotification(task, lastResult);

        if (isNewTab && targetTab?.id) {
          try {
            await chrome.tabs.remove(targetTab.id);
          } catch (_closeError) {
            // ignore cleanup error
          }
        }
      }
    }

    // 切回原来的标签页
    if (activeTab?.id) {
      updateTab(activeTab.id, { active: true }).catch(() => {});
    }
  })();

  return { ok: true, message: '批量签到已启动' };
}

async function handleRuntimeMessage(message, sender) {
  if (!isChromeApiReady() || !message || typeof message.type !== 'string') {
    return null;
  }

  switch (message.type) {
    case MESSAGE_TYPES.GET_STATUS:
      return dispatchTaskMessage(MESSAGE_TYPES.GET_STATUS, message.task, {
        requestId: message.requestId || null
      });
    case MESSAGE_TYPES.RUN_TASK:
      return dispatchTaskMessage(MESSAGE_TYPES.RUN_TASK, message.task, {
        requestId: message.requestId || null
      });
    case MESSAGE_TYPES.RUN_ALL_TASKS:
      return handleRunAllTasks(message.tasks);
    case MESSAGE_TYPES.OPEN_TASK:
      return handleOpenTask(message);
    case 'UPDATE_SCHEDULE':
      setupDailyAlarm();
      return { ok: true };
    case MESSAGE_TYPES.START_PICKER:
      return dispatchTaskMessage(MESSAGE_TYPES.START_PICKER, message.task, {
        requestId: message.requestId || null,
        targetKey: message.targetKey || null
      });
    case MESSAGE_TYPES.PICKER_RESULT:
      return handlePickerResult(message, sender);
    case MESSAGE_TYPES.PICKER_CANCELLED:
      relayPickerEvent(message, sender);
      return {
        ok: true
      };
    default:
      return null;
  }
}

if (isChromeApiReady()) {
  chrome.runtime.onInstalled.addListener(() => {
    refreshContextMenus();
    setupDailyAlarm(); // 设置定时签到
  });

  refreshContextMenus();
  setupDailyAlarm(); // 扩展加载时也设置一次

  // 监听定时器触发
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'daily-signin') {
      handleDailySignin();
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    getTab(activeInfo.tabId)
      .then(updateContextMenusForTab)
      .catch(() => {});
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') {
      return;
    }

    updateContextMenusForTab(tab || { id: tabId }).catch(() => {});
  });

  if (isContextMenuReady()) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      handleContextMenuClick(info, tab).catch((error) => {
        startContextPicker(tab, TASK_MENU_ID, error.message).catch(() => {
          saveLastResult(DEFAULT_TASK, {
            status: 'error',
            reason: error.message
          }).catch(() => {});
          showPickResult(tab?.id, error.message, 'error').catch(() => {});
        });
      });
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleRuntimeMessage(message, sender)
      .then((response) => {
        if (response !== null) {
          sendResponse(response);
        }
      })
      .catch((error) => {
        sendResponse(createErrorResponse(error.message));
      });

    return true;
  });
}
