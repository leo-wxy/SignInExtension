const STORAGE_KEYS = ['tasks', 'lastResults'];

const DEFAULT_TASK = {
  id: 'muyuan-personal-checkin',
  name: '牧原签到',
  url: 'https://muyuan.do/console/personal',
  matchUrl: 'https://muyuan.do/console/*',
  rootSelector: '',
  actionSelector: '',
  signedSelector: '',
  enabled: true,
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

const state = {
  tasks: [],
  lastResults: [],
  selectedTaskId: ''
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  els.runAllBtn = document.getElementById('runAllBtn');
  els.saveTopBtn = document.getElementById('saveTopBtn');
  els.saveBtn = document.getElementById('saveBtn');
  els.deleteTaskBtn = document.getElementById('deleteTaskBtn');
  els.addTaskBtn = document.getElementById('addTaskBtn');
  els.saveState = document.getElementById('saveState');
  els.taskCount = document.getElementById('taskCount');
  els.taskList = document.getElementById('taskList');
  els.editorTitle = document.getElementById('editorTitle');
  els.taskName = document.getElementById('taskName');
  els.taskUrl = document.getElementById('taskUrl');
  els.taskMatchUrl = document.getElementById('taskMatchUrl');
  els.taskClickDelay = document.getElementById('taskClickDelay');
  els.taskEnabled = document.getElementById('taskEnabled');
  els.rootValue = document.getElementById('rootValue');
  els.actionValue = document.getElementById('actionValue');
  els.signedValue = document.getElementById('signedValue');
  els.pickRootBtn = document.getElementById('pickRootBtn');
  els.pickActionBtn = document.getElementById('pickActionBtn');
  els.pickSignedBtn = document.getElementById('pickSignedBtn');
  els.runBtn = document.getElementById('runBtn');
  els.openBtn = document.getElementById('openBtn');
  els.toast = document.getElementById('toast');
  els.autoSigninEnabled = document.getElementById('autoSigninEnabled');
  els.autoSigninTime = document.getElementById('autoSigninTime');
  els.exportBtn = document.getElementById('exportBtn');
  els.importBtn = document.getElementById('importBtn');
  els.exportModal = document.getElementById('exportModal');
  els.importModal = document.getElementById('importModal');
  els.exportText = document.getElementById('exportText');
  els.importText = document.getElementById('importText');
  els.importFile = document.getElementById('importFile');
  els.closeExportModal = document.getElementById('closeExportModal');
  els.closeImportModal = document.getElementById('closeImportModal');
  els.copyExportBtn = document.getElementById('copyExportBtn');
  els.downloadExportBtn = document.getElementById('downloadExportBtn');
  els.selectFileBtn = document.getElementById('selectFileBtn');
  els.confirmImportBtn = document.getElementById('confirmImportBtn');
  els.cancelImportBtn = document.getElementById('cancelImportBtn');

  // 定时签到变化时自动保存
  els.autoSigninEnabled.addEventListener('change', saveSchedule);
  els.autoSigninTime.addEventListener('change', saveSchedule);

  // 导入/导出
  els.exportBtn.addEventListener('click', showExportModal);
  els.importBtn.addEventListener('click', showImportModal);
  els.closeExportModal.addEventListener('click', hideExportModal);
  els.closeImportModal.addEventListener('click', hideImportModal);
  els.copyExportBtn.addEventListener('click', copyExportConfig);
  els.downloadExportBtn.addEventListener('click', downloadExportConfig);
  els.selectFileBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', handleFileSelect);
  els.confirmImportBtn.addEventListener('click', confirmImport);
  els.cancelImportBtn.addEventListener('click', hideImportModal);

  // 点击模态框背景关闭
  els.exportModal.addEventListener('click', (e) => {
    if (e.target === els.exportModal) hideExportModal();
  });
  els.importModal.addEventListener('click', (e) => {
    if (e.target === els.importModal) hideImportModal();
  });

  els.taskName.addEventListener('input', () => {
    syncTaskFromForm(false);
    renderTaskList();
  });
  els.taskUrl.addEventListener('input', () => {
    syncTaskFromForm(false);
    renderTaskList();
  });
  els.taskMatchUrl.addEventListener('input', () => syncTaskFromForm(false));
  els.taskClickDelay.addEventListener('input', () => syncTaskFromForm(false));
  els.taskEnabled.addEventListener('change', () => syncTaskFromForm(true));
  els.saveTopBtn.addEventListener('click', saveTask);
  els.saveBtn.addEventListener('click', saveTask);
  els.deleteTaskBtn.addEventListener('click', deleteTask);
  els.addTaskBtn.addEventListener('click', addTask);
  els.pickRootBtn.addEventListener('click', () => startPicker('rootSelector'));
  els.pickActionBtn.addEventListener('click', () => startPicker('actionSelector'));
  els.pickSignedBtn.addEventListener('click', () => startPicker('signedSelector'));
  els.runBtn.addEventListener('click', runTask);
  els.runAllBtn.addEventListener('click', runAllTasks);
  els.openBtn.addEventListener('click', openTask);
  document.getElementById('historyBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/history.html') });
  });
  chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);

  loadState();
  loadScheduleSettings();
}

async function loadState() {
  setSaveState('读取配置中');
  try {
    const storage = await storageGet(STORAGE_KEYS);
    const tasks = normalizeTasks(storage.tasks);
    const lastResults = normalizeLastResults(storage.lastResults);

    state.tasks = tasks;
    state.lastResults = lastResults;
    if (!state.selectedTaskId || !tasks.some((task) => task.id === state.selectedTaskId)) {
      state.selectedTaskId = tasks[0]?.id || '';
    }

    render();
    setSaveState(tasks.length ? '已加载' : '暂无任务');
  } catch (error) {
    console.error(error);
    state.tasks = [normalizeTask(DEFAULT_TASK)];
    state.selectedTaskId = state.tasks[0].id;
    render();
    setSaveState('读取失败');
    showToast('读取失败，请检查扩展权限', 'error');
  }
}

function render() {
  renderTaskList();
  renderEditor();
  renderTaskCount();
}

function renderTaskList() {
  els.taskList.innerHTML = '';

  if (!state.tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '还没有任务，先创建一个。';
    els.taskList.appendChild(empty);
    return;
  }

  for (const task of state.tasks) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `task-item${task.id === state.selectedTaskId ? ' active' : ''}`;

    const name = document.createElement('strong');
    name.textContent = task.name || '未命名任务';

    const meta = document.createElement('span');
    meta.textContent = task.url || '未配置地址';

    item.append(name, meta);
    item.addEventListener('click', () => {
      state.selectedTaskId = task.id;
      render();
    });
    els.taskList.appendChild(item);
  }
}

function renderEditor() {
  const task = getSelectedTask();
  if (!task) {
    els.editorTitle.textContent = '任务详情';
    els.taskName.value = '';
    els.taskUrl.value = '';
    els.taskMatchUrl.value = '';
    els.taskClickDelay.value = String(DEFAULT_TASK.clickDelayMs);
    els.taskEnabled.checked = true;
    els.rootValue.textContent = '未设置';
    els.actionValue.textContent = '未设置';
    els.signedValue.textContent = '未设置';
    return;
  }

  els.editorTitle.textContent = task.name || '任务详情';
  els.taskName.value = task.name || '';
  els.taskUrl.value = task.url || '';
  els.taskMatchUrl.value = task.matchUrl || '';
  els.taskClickDelay.value = String(normalizeDelayMs(task.clickDelayMs));
  els.taskEnabled.checked = task.enabled !== false;
  els.rootValue.textContent = displaySelector(task.rootSelector || task.root?.value);
  els.actionValue.textContent = displaySelector(task.actionSelector || task.action?.value);
  els.signedValue.textContent = displaySelector(task.signedSelector || task.signedState?.selector || task.signedState?.textIncludes?.join(', '));
}

function renderTaskCount() {
  els.taskCount.textContent = `${state.tasks.length} 个任务`;
}

function syncTaskFromForm(renderEditorView = true) {
  const task = getSelectedTask();
  if (!task) {
    return;
  }

  task.name = els.taskName.value.trim() || '未命名任务';
  task.url = els.taskUrl.value.trim();
  task.matchUrl = els.taskMatchUrl.value.trim();
  task.clickDelayMs = normalizeDelayMs(els.taskClickDelay.value);
  task.enabled = els.taskEnabled.checked;

  if (renderEditorView) {
    renderEditor();
  }
  markDirty();
}

async function saveTask() {
  syncTaskFromForm(false);
  const tasks = state.tasks.map((task) => toExecutableTask(normalizeTask(task)));
  await storageSet({ tasks });
  setSaveState('已保存');
  showToast('任务已保存', 'success');
}

async function addTask() {
  const task = normalizeTask({
    ...DEFAULT_TASK,
    id: `task-${Date.now()}`
  });
  state.tasks.unshift(task);
  state.selectedTaskId = task.id;
  render();
  markDirty();
  showToast('已新增任务', 'success');
}

async function deleteTask() {
  const task = getSelectedTask();
  if (!task) {
    return;
  }

  if (state.tasks.length === 1) {
    showToast('至少保留一个任务，不能删除最后一个', 'error');
    return;
  }

  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  state.selectedTaskId = state.tasks[0]?.id || '';
  render();
  markDirty();
  showToast('任务已删除，请记得保存', 'info');
}

async function runTask() {
  const task = getSelectedTask();
  await runTaskById(task?.id);
}

async function runTaskById(taskId) {
  const task = state.tasks.find((item) => item.id === taskId) || getSelectedTask();
  if (!task) {
    showToast('没有可运行的任务', 'error');
    return;
  }

  const response = await sendRuntimeMessage({
    type: 'RUN_TASK',
    task: toExecutableTask(normalizeTask(task))
  });
  state.selectedTaskId = task.id;
  const status = response?.lastResult?.status || response?.result?.status || '';
  const message = response?.lastResult?.message || response?.result?.reason || response?.error || '';

  if (status === 'success') {
    setSaveState(`签到成功：${task.name || '未命名任务'}`);
    showToast(message || `签到成功：${task.name || '未命名任务'}`, 'success');
    return;
  }

  if (status === 'clicked') {
    setSaveState(`未确认成功：${task.name || '未命名任务'}`);
    showToast(message || `未确认成功：${task.name || '未命名任务'}`, 'info');
    return;
  }

  if (status === 'signed') {
    setSaveState(`已签到：${task.name || '未命名任务'}`);
    showToast(message || `已签到：${task.name || '未命名任务'}`, 'info');
    return;
  }

  if (response?.ok === false || ['missing-root', 'missing-action', 'blocked', 'error'].includes(status)) {
    setSaveState(`签到失败：${task.name || '未命名任务'}`);
    showToast(message || `签到失败：${task.name || '未命名任务'}`, 'error');
    return;
  }

  setSaveState(`已发送立即签到：${task.name || '未命名任务'}`);
  showToast(`已发送立即签到：${task.name || '未命名任务'}`, 'info');
}

async function runAllTasks() {
  syncTaskFromForm(false);
  const enabledTasks = state.tasks.filter((task) => task.enabled !== false);

  if (!enabledTasks.length) {
    showToast('没有启用的任务', 'error');
    return;
  }

  await storageSet({ tasks: state.tasks.map((task) => toExecutableTask(normalizeTask(task))) });

  for (const task of enabledTasks) {
    await sendRuntimeMessage({
      type: 'RUN_TASK',
      task: toExecutableTask(normalizeTask(task))
    });
  }

  setSaveState(`已发送全部签到：${enabledTasks.length} 个任务`);
  showToast(`已发送全部签到：${enabledTasks.length} 个任务`, 'info');
}

async function openTask() {
  const task = getSelectedTask();
  if (!task) {
    showToast('没有可打开的任务', 'error');
    return;
  }

  await sendRuntimeMessage({
    type: 'OPEN_TASK',
    task: toExecutableTask(normalizeTask(task))
  });
  setSaveState('已打开目标页');
}

function getSelectedTask() {
  return state.tasks.find((task) => task.id === state.selectedTaskId) || state.tasks[0] || null;
}

function markDirty() {
  setSaveState('未保存');
}

function setSaveState(text) {
  els.saveState.textContent = text;
}

function normalizeTasks(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeTask).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([id, task]) => normalizeTask({ id, ...task }))
      .filter(Boolean);
  }
  return [normalizeTask(DEFAULT_TASK)];
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null;
  const name = String(task.name || '').trim() || '未命名任务';
  const id = String(task.id || task.taskId || task.name || task.url || name).trim() || `task-${Date.now()}`;
  return {
    ...DEFAULT_TASK,
    ...task,
    id,
    name,
    url: String(task.url || '').trim(),
    matchUrl: String(task.matchUrl || '').trim(),
    rootSelector: String(task.rootSelector || '').trim(),
    actionSelector: String(task.actionSelector || '').trim(),
    signedSelector: String(task.signedSelector || '').trim(),
    root: task.root || DEFAULT_TASK.root,
    action: task.action || DEFAULT_TASK.action,
    signedState: task.signedState || DEFAULT_TASK.signedState,
    clickDelayMs: normalizeDelayMs(task.clickDelayMs),
    enabled: task.enabled !== false
  };
}

function normalizeDelayMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return DEFAULT_TASK.clickDelayMs;
  }
  return Math.min(Math.round(numeric), 30000);
}

function toExecutableTask(task) {
  const output = normalizeTask(task);
  if (output.rootSelector) {
    output.root = {
      ...(output.root || {}),
      strategy: 'selector',
      value: output.rootSelector
    };
  }
  if (output.actionSelector) {
    output.action = {
      ...(output.action || {}),
      strategy: 'selector',
      value: output.actionSelector
    };
  }
  if (output.signedSelector) {
    output.signedState = {
      ...(output.signedState || {}),
      selector: output.signedSelector
    };
  }
  return output;
}

function normalizeLastResults(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([taskId, result]) => ({
      taskId,
      ...(result && typeof result === 'object' ? result : { message: String(result) })
    }));
  }
  return [];
}

function displaySelector(value) {
  return value ? value : '未设置';
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local?.get) {
      reject(new Error('chrome.storage.local unavailable'));
      return;
    }
    chrome.storage.local.get(keys, (items) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(items || {});
    });
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local?.set) {
      reject(new Error('chrome.storage.local unavailable'));
      return;
    }
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) {
      resolve({ ok: false, error: 'chrome.runtime.sendMessage unavailable' });
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime?.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: true });
    });
  });
}

function pickerLabel(targetKey) {
  switch (targetKey) {
    case 'rootSelector':
      return '根容器';
    case 'actionSelector':
      return '动作按钮';
    case 'signedSelector':
      return '已签到状态';
    default:
      return targetKey;
  }
}

async function startPicker(targetKey) {
  const task = getSelectedTask();
  if (!task) {
    showToast('没有可拾取的任务', 'error');
    return;
  }

  syncTaskFromForm(false);
  await storageSet({ tasks: state.tasks.map((item) => toExecutableTask(normalizeTask(item))) });
  await sendRuntimeMessage({
    type: 'START_PICKER',
    task: toExecutableTask(normalizeTask(task)),
    targetKey
  });
  setSaveState(`已发送拾取：${pickerLabel(targetKey)}`);
  showToast(`开始拾取 ${pickerLabel(targetKey)}`, 'info');
}

async function handleRuntimeMessage(message) {
  if (!message || message.type !== 'PICKER_RESULT' || !message.picked) {
    if (message?.type === 'PICKER_CANCELLED') {
      setSaveState('已取消拾取');
      showToast('已取消拾取', 'info');
    }
    return;
  }

  const targetKey = message.targetKey;
  if (!['rootSelector', 'actionSelector', 'signedSelector'].includes(targetKey)) {
    return;
  }

  const task = getSelectedTask();
  if (!task) {
    return;
  }

  task[targetKey] = message.picked.selector || '';
  applyPickedRule(task, targetKey, message.picked);
  render();
  await saveTask();
  setSaveState(`已保存${pickerLabel(targetKey)}：${message.picked.text || message.picked.selector}`);
  showToast(`已保存 ${pickerLabel(targetKey)}`, 'success');
}

function applyPickedRule(task, targetKey, picked) {
  const selector = picked.selector || '';
  if (targetKey === 'rootSelector') {
    task.root = {
      strategy: 'selector',
      value: selector,
      picked
    };
    return;
  }

  if (targetKey === 'actionSelector') {
    task.action = {
      strategy: 'selector',
      value: selector,
      tagName: picked.tag || '',
      picked
    };
    return;
  }

  task.signedState = {
    ...(task.signedState || DEFAULT_TASK.signedState),
    selector,
    textIncludes: uniqueValues([
      ...(task.signedState?.textIncludes || DEFAULT_TASK.signedState.textIncludes),
      picked.text
    ]),
    disabledMeansSigned: true,
    picked
  };
}

function uniqueValues(values) {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function showToast(text, kind = 'info') {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.dataset.kind = kind;
  els.toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2200);
}

async function loadScheduleSettings() {
  try {
    const storage = await storageGet(['autoSigninEnabled', 'autoSigninTime']);
    els.autoSigninEnabled.checked = storage.autoSigninEnabled === true;
    els.autoSigninTime.value = storage.autoSigninTime || '10:00';
  } catch (error) {
    console.error('[Options] 加载定时设置失败:', error);
  }
}

async function saveSchedule() {
  try {
    const enabled = els.autoSigninEnabled.checked;
    const time = els.autoSigninTime.value;

    await storageSet({
      autoSigninEnabled: enabled,
      autoSigninTime: time
    });

    // 通知 background 重新设置定时器
    chrome.runtime.sendMessage({ type: 'UPDATE_SCHEDULE' });

  } catch (error) {
    console.error('[Options] 保存定时设置失败:', error);
  }
}

async function showExportModal() {
  try {
    const storage = await storageGet(['tasks', 'autoSigninEnabled', 'autoSigninTime']);

    // 导出必要配置
    const simplifiedTasks = (storage.tasks || []).map(task => {
      const simple = {
        name: task.name,
        url: task.url,
        actionSelector: task.actionSelector || task.action?.value || ''
      };

      // 可选字段
      if (task.enabled === false) simple.enabled = false;
      if (task.matchUrl && task.matchUrl !== task.url) simple.matchUrl = task.matchUrl;
      if (task.clickDelayMs && task.clickDelayMs !== 3000) simple.clickDelayMs = task.clickDelayMs;

      return simple;
    });

    const config = {
      tasks: simplifiedTasks,
      autoSignin: {
        enabled: storage.autoSigninEnabled === true,
        time: storage.autoSigninTime || '10:00'
      }
    };

    els.exportText.value = JSON.stringify(config, null, 2);
    els.exportModal.style.display = 'flex';
  } catch (error) {
    console.error('[Options] 导出失败:', error);
    showToast('导出失败', 'error');
  }
}

function hideExportModal() {
  els.exportModal.style.display = 'none';
}

async function copyExportConfig() {
  try {
    await navigator.clipboard.writeText(els.exportText.value);
    showToast('已复制到剪贴板', 'success');
  } catch (error) {
    console.error('[Options] 复制失败:', error);
    showToast('复制失败', 'error');
  }
}

function downloadExportConfig() {
  const blob = new Blob([els.exportText.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `signin-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('配置已下载', 'success');
}

function showImportModal() {
  els.importText.value = '';
  els.importModal.style.display = 'flex';
}

function hideImportModal() {
  els.importModal.style.display = 'none';
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    els.importText.value = text;
  } catch (error) {
    console.error('[Options] 读取文件失败:', error);
    showToast('读取文件失败', 'error');
  } finally {
    event.target.value = '';
  }
}

async function confirmImport() {
  const text = els.importText.value.trim();
  if (!text) {
    showToast('请输入配置 JSON', 'error');
    return;
  }

  try {
    const config = JSON.parse(text);

    // 验证配置格式
    if (!config.tasks || !Array.isArray(config.tasks)) {
      throw new Error('无效的配置格式：缺少 tasks 数组');
    }

    // 补全任务字段
    const fullTasks = config.tasks.map((task, index) => {
      if (!task.name || !task.url) {
        throw new Error(`任务 ${index + 1} 缺少 name 或 url 字段`);
      }

      const fullTask = {
        id: task.id || task.url,
        name: task.name,
        url: task.url,
        matchUrl: task.matchUrl || task.url,
        enabled: task.enabled !== false,
        clickDelayMs: task.clickDelayMs || 3000
      };

      // 核心配置：保留原值
      if (task.actionSelector) fullTask.actionSelector = task.actionSelector;
      if (task.rootSelector) fullTask.rootSelector = task.rootSelector;
      if (task.signedSelector) fullTask.signedSelector = task.signedSelector;

      // 高级配置：保留完整对象
      if (task.action) fullTask.action = task.action;
      if (task.root) fullTask.root = task.root;
      if (task.signedState) fullTask.signedState = task.signedState;

      return fullTask;
    });

    // 导入任务
    await storageSet({
      tasks: fullTasks,
      autoSigninEnabled: config.autoSignin?.enabled !== false,
      autoSigninTime: config.autoSignin?.time || '10:00'
    });

    // 通知 background 更新定时器
    chrome.runtime.sendMessage({ type: 'UPDATE_SCHEDULE' });

    showToast(`已导入 ${fullTasks.length} 个任务`, 'success');
    hideImportModal();

    // 重新加载页面
    setTimeout(() => {
      location.reload();
    }, 1000);

  } catch (error) {
    console.error('[Options] 导入失败:', error);
    showToast('导入失败: ' + error.message, 'error');
  }
}
