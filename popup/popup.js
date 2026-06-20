const STORAGE_KEYS = ['tasks', 'lastResults'];

const state = {
  tasks: [],
  lastResults: []
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  try {
    init();
  } catch (error) {
    console.error('[Popup] 初始化失败:', error);
    document.body.innerHTML = `<div style="padding: 20px; color: red;">初始化失败: ${error.message}</div>`;
  }
});

function init() {
  console.log('[Popup] 开始初始化');

  try {
    els.taskList = document.getElementById('taskList');
    els.hint = document.getElementById('hint');
    els.runAllBtn = document.getElementById('runAllBtn');
    els.optionsBtn = document.getElementById('optionsBtn');

    console.log('[Popup] DOM 元素已找到');

    els.runAllBtn.addEventListener('click', () => {
      console.log('[Popup] runAllBtn 被点击');
      runAllTasks().catch((err) => {
        console.error('[Popup] runAllTasks 顶层错误:', err);
        setHint('执行出错: ' + err.message);
        toggleBusy(false);
      });
    });

    els.optionsBtn.addEventListener('click', openOptions);
    chrome.storage?.onChanged?.addListener(handleStorageChanged);

    console.log('[Popup] 事件监听器已绑定');

    loadState();
  } catch (error) {
    console.error('[Popup] init 内部错误:', error);
    throw error;
  }
}

async function loadState() {
  console.log('[Popup] 开始加载状态');

  try {
    setHint('正在读取任务列表...');
    toggleBusy(true);

    const storage = await storageGet(STORAGE_KEYS);
    console.log('[Popup] storage 数据:', storage);

    const tasks = normalizeTasks(storage.tasks);
    const lastResults = normalizeLastResults(storage.lastResults);
    console.log('[Popup] 任务数:', tasks.length);

    state.tasks = tasks;
    state.lastResults = lastResults;

    renderTaskList();
    setHint(buildHint(tasks.length));
  } catch (error) {
    console.error('[Popup] 加载失败:', error);
    console.error('[Popup] 错误堆栈:', error.stack);
    setHint('读取失败: ' + error.message);
    els.taskList.innerHTML = '<div class="error">加载失败: ' + error.message + '</div>';
  } finally {
    toggleBusy(false);
  }
}

function renderTaskList() {
  const tasks = state.tasks;
  els.taskList.innerHTML = '';

  if (!tasks.length) {
    els.taskList.innerHTML = '<div class="empty">未配置任务，请点击右上角设置</div>';
    els.runAllBtn.disabled = true;
    return;
  }

  els.runAllBtn.disabled = false;

  tasks.forEach((task) => {
    const result = findLastResult(task);
    const item = document.createElement('div');
    item.className = 'task-item';

    const info = document.createElement('div');
    info.className = 'task-info';

    const name = document.createElement('div');
    name.className = 'task-name';
    name.textContent = task.name || '未命名任务';

    const status = document.createElement('div');
    status.className = 'task-status';
    status.textContent = describeTaskState(task, result);
    status.dataset.kind = getResultKind(result);

    info.append(name, status);

    if (result?.message) {
      const detail = document.createElement('div');
      detail.className = 'task-detail';
      detail.textContent = result.message;
      info.appendChild(detail);
    }

    item.append(info);
    els.taskList.appendChild(item);
  });
}

async function runAllTasks() {
  console.log('[Popup] runAllTasks 开始');

  const tasks = state.tasks.filter(t => t.enabled !== false);
  console.log('[Popup] 过滤后的任务数:', tasks.length);

  if (!tasks.length) {
    setHint('没有可执行的任务');
    return;
  }

  setHint('正在执行签到...');
  toggleBusy(true);

  try {
    // 发送消息给 background 执行批量签到
    const response = await sendRuntimeMessage({
      type: 'RUN_ALL_TASKS',
      tasks
    });

    console.log('[Popup] 批量签到响应:', response);

    if (response?.ok) {
      setHint('签到已开始，结果会自动刷新');
      await loadState();
      toggleBusy(false);
    } else {
      setHint('执行失败: ' + (response?.error || '未知错误'));
      toggleBusy(false);
    }
  } catch (error) {
    console.error('[Popup] 批量签到失败:', error);
    console.error('[Popup] 错误堆栈:', error.stack);
    setHint('执行失败: ' + error.message);
    toggleBusy(false);
  }
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function findLastResult(task) {
  if (!state.lastResults.length) return null;
  return (
    state.lastResults.find((item) => matchResultTask(item, task)) ||
    state.lastResults[0] ||
    null
  );
}

function matchResultTask(result, task) {
  if (!result || !task) return false;
  const keys = [task.id, task.name, task.url, task.matchUrl].filter(Boolean);
  const probes = [result.taskId, result.taskName, result.name, result.url, result.matchUrl].filter(Boolean);
  return keys.some((key) => probes.includes(key));
}

function describeTaskState(task, result) {
  if (result?.status === 'success') return '签到成功';
  if (result?.status === 'clicked') return '未确认成功';
  if (result?.status === 'signed') return '已签到';
  if (result?.status === 'missing-action') return '签到失败';
  if (result?.status === 'missing-root') return '签到失败';
  if (result?.status === 'blocked') return '按钮不可点';
  if (result?.status === 'error') return '签到失败';
  if (result?.status) return String(result.status);
  if (task?.enabled === false) return '已停用';
  if (task?.url) return '待执行';
  return '未配置';
}

function getResultKind(result) {
  if (result?.status === 'success') return 'success';
  if (result?.status === 'clicked') return 'info';
  if (result?.status === 'signed') return 'info';
  if (['missing-action', 'missing-root', 'blocked', 'error'].includes(result?.status)) return 'error';
  return 'idle';
}

function buildHint(taskCount) {
  const failedCount = state.lastResults.filter((item) => ['missing-action', 'missing-root', 'blocked', 'error'].includes(item?.status)).length;
  if (!taskCount) return '还没有任务配置';
  if (!failedCount) return `共 ${taskCount} 个任务`;
  return `共 ${taskCount} 个任务，${failedCount} 个失败`;
}

function handleStorageChanged(changes, areaName) {
  if (areaName !== 'local') {
    return;
  }

  if (changes.tasks || changes.lastResults) {
    loadState().catch((error) => {
      console.error('[Popup] storage 变化刷新失败:', error);
    });
  }
}

function toggleBusy(isBusy) {
  els.runAllBtn.disabled = isBusy;
  els.optionsBtn.disabled = isBusy;
}

function setHint(text) {
  els.hint.textContent = text;
}

function normalizeTasks(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return [value];
  }
  return [];
}

function normalizeLastResults(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([taskId, result]) => ({
      taskId,
      ...(result && typeof result === 'object' ? result : { message: String(result) })
    }));
  }
  return [];
}

function matchesUrl(url, pattern) {
  if (!pattern) return false;
  if (!pattern.includes('*')) return url === pattern;
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return regex.test(url);
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}
