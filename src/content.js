(function bootstrapContentScript() {
  if (window.__signinContentScriptLoaded && typeof window.__signinContentScriptCleanup === 'function') {
    try {
      window.__signinContentScriptCleanup();
    } catch (_error) {
      // ignore stale cleanup errors from a previous extension reload
    }
  }
  window.__signinContentScriptLoaded = true;

  const MESSAGE_TYPES = {
    GET_STATUS: 'GET_STATUS',
    RUN_TASK: 'RUN_TASK',
    START_PICKER: 'START_PICKER',
    PICKER_RESULT: 'PICKER_RESULT',
    PICKER_CANCELLED: 'PICKER_CANCELLED',
    QUICK_PICK_ELEMENT: 'QUICK_PICK_ELEMENT',
    SHOW_PICK_RESULT: 'SHOW_PICK_RESULT'
  };

  const PICKER_OVERLAY_ID = '__signin_picker_overlay__';
  const PICKER_LABEL_ID = '__signin_picker_label__';
  const PICKER_CAPTURE_ID = '__signin_picker_capture__';
  const PICKER_PANEL_ID = '__signin_picker_panel__';
  const PICKER_STATE = {
    active: false,
    hoveredElement: null,
    cleanup: null,
    requestId: null,
    targetKey: null,
    mode: 'create',
    taskId: null,
    task: null
  };
  let pendingPickedElement = null;
  let pendingPickContext = null;
  let lastContextElement = null;

  function getRules() {
    const ruleHost = window.SigninRules || globalThis.SigninRules;
    if (!ruleHost) {
      throw new Error('页面未暴露 SigninRules');
    }
    if (
      typeof ruleHost.getTaskStatus !== 'function' ||
      typeof ruleHost.runTaskOnDocument !== 'function'
    ) {
      throw new Error('SigninRules 缺少 getTaskStatus 或 runTaskOnDocument');
    }
    return ruleHost;
  }

  function isElementVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }
    if (element.hidden) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }
    if ('disabled' in element && Boolean(element.disabled)) {
      return true;
    }

    const ariaDisabled = element.getAttribute('aria-disabled');
    if (ariaDisabled && ariaDisabled.toLowerCase() === 'true') {
      return true;
    }

    const className = element.className || '';
    return /\b(?:is-disabled|btn-disabled|semi-button-disabled|semi-button-primary-disabled|ant-btn-disabled)\b/i.test(className);
  }

  function getElementText(element) {
    return (element.innerText || element.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  function getAriaLabel(element) {
    const directLabel = element.getAttribute('aria-label');
    if (directLabel) {
      return directLabel.trim();
    }

    const labelledBy = element.getAttribute('aria-labelledby');
    if (!labelledBy) {
      return '';
    }

    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ');
  }

  function getImplicitRole(element) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'button') {
      return 'button';
    }
    if (tagName === 'a' && element.hasAttribute('href')) {
      return 'link';
    }
    if (tagName === 'input') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(type)) {
        return 'button';
      }
      if (type === 'checkbox') {
        return 'checkbox';
      }
      if (type === 'radio') {
        return 'radio';
      }
      return 'textbox';
    }
    if (tagName === 'select') {
      return 'combobox';
    }
    if (tagName === 'textarea') {
      return 'textbox';
    }
    return '';
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_\u00A0-\uFFFF-]/g, '\\$&');
  }

  function isStableSelectorClass(className) {
    return className
      && !/disabled|loading|active|focus|hover|selected|primary-disabled/i.test(className);
  }

  function uniqueSelectorFrom(element) {
    if (!(element instanceof Element)) {
      return '';
    }

    if (element.id) {
      return `#${cssEscape(element.id)}`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let part = current.tagName.toLowerCase();

      if (current.id) {
        part = `#${cssEscape(current.id)}`;
        parts.unshift(part);
        break;
      }

      const testId = current.getAttribute('data-testid') || current.getAttribute('data-test');
      if (testId) {
        part += `[data-testid="${cssEscape(testId)}"]`;
      } else {
        const classNames = typeof current.className === 'string'
          ? current.className.split(/\s+/).filter(isStableSelectorClass).slice(0, 3)
          : [];
        if (classNames.length) {
          part += `.${classNames.map(cssEscape).join('.')}`;
        }

        const siblings = current.parentElement
          ? Array.from(current.parentElement.children).filter(
              (child) => child.tagName === current.tagName
            )
          : [];

        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(part);
      const candidate = parts.join(' > ');
      try {
        if (document.querySelectorAll(candidate).length === 1) {
          return candidate;
        }
      } catch (error) {
        // ignore invalid intermediate selector and continue walking up
      }

      current = current.parentElement;
    }

    parts.unshift('body');
    return parts.join(' > ');
  }

	  function selectorCandidatesFrom(element) {
	    const candidates = [];
	    const push = (selector) => {
	      if (selector && !candidates.includes(selector)) {
	        candidates.push(selector);
	      }
	    };

    if (!(element instanceof Element)) {
      return candidates;
    }

	    const uniqueSelector = uniqueSelectorFrom(element);
	    push(uniqueSelector);

	    if (element.id) {
	      push(`#${cssEscape(element.id)}`);
	    }

    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test');
    if (testId) {
      push(`${element.tagName.toLowerCase()}[data-testid="${cssEscape(testId)}"]`);
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      push(`${element.tagName.toLowerCase()}[aria-label="${cssEscape(ariaLabel)}"]`);
    }

    const classNames = typeof element.className === 'string'
      ? element.className.split(/\s+/).filter(isStableSelectorClass).slice(0, 3)
      : [];
	    if (classNames.length) {
	      push(`${element.tagName.toLowerCase()}.${classNames.map(cssEscape).join('.')}`);
	    }
	    return candidates;
	  }

  function ensureOverlay() {
    let overlay = document.getElementById(PICKER_OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = PICKER_OVERLAY_ID;
      Object.assign(overlay.style, {
        position: 'fixed',
        zIndex: '2147483646',
        border: '2px solid #2563eb',
        background: 'rgba(37, 99, 235, 0.12)',
        pointerEvents: 'none',
        left: '0px',
        top: '0px',
        width: '0px',
        height: '0px',
        boxSizing: 'border-box',
        display: 'none'
      });
      document.documentElement.appendChild(overlay);
    }

    let label = document.getElementById(PICKER_LABEL_ID);
    if (!label) {
      label = document.createElement('div');
      label.id = PICKER_LABEL_ID;
      Object.assign(label.style, {
        position: 'fixed',
        zIndex: '2147483647',
        pointerEvents: 'none',
        padding: '4px 8px',
        borderRadius: '4px',
        background: '#111827',
        color: '#ffffff',
        font: '12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'none',
        maxWidth: '320px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      });
      document.documentElement.appendChild(label);
    }

    return { overlay, label };
  }

  function ensureCaptureLayer() {
    let capture = document.getElementById(PICKER_CAPTURE_ID);
    if (!capture) {
      capture = document.createElement('div');
      capture.id = PICKER_CAPTURE_ID;
      Object.assign(capture.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483645',
        cursor: 'crosshair',
        background: 'transparent'
      });
      document.documentElement.appendChild(capture);
    }

    return capture;
  }

  function getElementAtPoint(x, y) {
    const ignoredIds = new Set([
      PICKER_CAPTURE_ID,
      PICKER_OVERLAY_ID,
      PICKER_LABEL_ID,
      PICKER_PANEL_ID
    ]);

    const elements = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)].filter(Boolean);

    return elements.find((element) => (
      element instanceof Element &&
      !ignoredIds.has(element.id) &&
      element !== document.documentElement &&
      element !== document.body
    )) || null;
  }

  function updateHighlight(element) {
    const { overlay, label } = ensureOverlay();
    if (!element || !document.documentElement.contains(element)) {
      overlay.style.display = 'none';
      label.style.display = 'none';
      return;
    }

    const rect = element.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    const tag = element.tagName.toLowerCase();
    const selector = uniqueSelectorFrom(element);
    label.textContent = `${tag} ${selector}`.trim();
    label.style.display = 'block';
    label.style.left = `${Math.max(8, rect.left)}px`;
    label.style.top = `${Math.max(8, rect.top - 28)}px`;
  }

  function buildPickedElementInfo(element) {
    return {
      selector: uniqueSelectorFrom(element),
      selectorCandidates: selectorCandidatesFrom(element),
      text: getElementText(element),
      tag: element.tagName.toLowerCase(),
      disabled: isDisabled(element),
      visible: isElementVisible(element),
      role: element.getAttribute('role') || getImplicitRole(element),
      ariaLabel: getAriaLabel(element),
      id: element.id || '',
      className: typeof element.className === 'string' ? element.className : '',
      href: element.getAttribute('href') || '',
      name: element.getAttribute('name') || '',
      type: element.getAttribute('type') || ''
    };
  }

  function teardownPicker() {
    const cleanup = PICKER_STATE.cleanup;
    PICKER_STATE.active = false;
    PICKER_STATE.hoveredElement = null;
    PICKER_STATE.cleanup = null;
    PICKER_STATE.requestId = null;
    PICKER_STATE.targetKey = null;
    PICKER_STATE.mode = 'create';
    PICKER_STATE.taskId = null;
    PICKER_STATE.task = null;

    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        if (!isExtensionContextInvalidated(error)) {
          console.error(error);
        }
      }
    }

    try {
      updateHighlight(null);
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        console.error(error);
      }
    }
  }

  function removeConfirmPanel() {
    document.getElementById(PICKER_PANEL_ID)?.remove();
  }

  function isExtensionContextInvalidated(error) {
    const message = String(error?.message || error || '');
    return /Extension context invalidated/i.test(message);
  }

  function showToast(text, kind = 'info') {
    let toast = document.getElementById('__signin_picker_toast__');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = '__signin_picker_toast__';
      Object.assign(toast.style, {
        position: 'fixed',
        right: '24px',
        bottom: '24px',
        zIndex: '2147483647',
        padding: '10px 14px',
        borderRadius: '8px',
        color: '#ffffff',
        background: '#2563eb',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24)',
        font: '600 14px/1.4 -apple-system, BlinkMacSystemFont, sans-serif',
        maxWidth: '420px'
      });
      document.documentElement.appendChild(toast);
    }

    toast.textContent = text;
    toast.style.background = kind === 'error' ? '#b91c1c' : kind === 'success' ? '#15803d' : '#2563eb';
    toast.style.display = 'block';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2200);
  }

  function notifyExtension(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, () => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError && isExtensionContextInvalidated(runtimeError)) {
            resolve({ ok: false, invalidated: true });
            return;
          }

          void runtimeError;
          resolve({ ok: true });
        });
      } catch (error) {
        if (isExtensionContextInvalidated(error)) {
          resolve({ ok: false, invalidated: true });
          return;
        }

        resolve({
          ok: false,
          error: error?.message || String(error)
        });
      }
    });
  }

  function createButton(text, variant) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    Object.assign(button.style, {
      minHeight: '34px',
      padding: '0 12px',
      border: variant === 'primary' ? '1px solid #2563eb' : '1px solid #c8c8d4',
      borderRadius: '6px',
      background: variant === 'primary' ? '#2563eb' : '#f2f2f6',
      color: variant === 'primary' ? '#ffffff' : '#1f1b3d',
      font: '600 14px/1 -apple-system, BlinkMacSystemFont, sans-serif',
      cursor: 'pointer'
    });
    return button;
  }

  function showConfirmPanel(picked, context = {}) {
    pendingPickedElement = { ...picked };
    pendingPickContext = { ...context };
    removeConfirmPanel();

    const panel = document.createElement('div');
    panel.id = PICKER_PANEL_ID;
    Object.assign(panel.style, {
      position: 'fixed',
      right: '24px',
      bottom: '24px',
      zIndex: '2147483647',
      width: '520px',
      maxWidth: 'calc(100vw - 48px)',
      border: '1px solid #b7b7c4',
      borderRadius: '8px',
      background: '#f5f5f7',
      color: '#201936',
      boxShadow: '0 12px 32px rgba(0, 0, 0, 0.28)',
      font: '14px/1.45 -apple-system, BlinkMacSystemFont, sans-serif',
      overflow: 'hidden'
    });

    const address = document.createElement('div');
    address.textContent = location.href;
    Object.assign(address.style, {
      padding: '10px 12px',
      borderBottom: '1px solid #d7d7df',
      background: '#ffffff',
      color: '#201936',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    });

    const body = document.createElement('div');
    Object.assign(body.style, {
      padding: '10px 12px',
      display: 'grid',
      gap: '8px'
    });

    const title = document.createElement('div');
    title.textContent = '选择元素信息';
    Object.assign(title.style, {
      fontWeight: '700'
    });

    const summary = document.createElement('div');
    summary.textContent = `${picked.tag || 'element'} ${picked.text ? `· ${picked.text}` : ''}`;
    Object.assign(summary.style, {
      color: '#4a465d'
    });

    const select = document.createElement('select');
    select.setAttribute('aria-label', 'selector');
    Object.assign(select.style, {
      width: '100%',
      minHeight: '38px',
      border: '1px solid #bfc0ca',
      borderRadius: '6px',
      background: '#ffffff',
      color: '#201936',
      font: '13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace'
    });

    for (const selector of picked.selectorCandidates || [picked.selector]) {
      const option = document.createElement('option');
      option.value = selector;
      option.textContent = selector;
      select.appendChild(option);
    }

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px',
      padding: '10px 12px',
      borderTop: '1px solid #d7d7df',
      background: '#eeeef2'
    });

    const cancel = createButton('取消', 'secondary');
    const repick = createButton('重选', 'secondary');
    const confirm = createButton(context.mode === 'edit' ? '确认更新' : '确认创建', 'primary');

    cancel.addEventListener('click', () => {
      removeConfirmPanel();
      pendingPickedElement = null;
      pendingPickContext = null;
      notifyExtension({
        type: MESSAGE_TYPES.PICKER_CANCELLED,
        targetKey: context.targetKey,
        mode: context.mode,
        taskId: context.taskId
      }).catch(() => {});
    });

    repick.addEventListener('click', () => {
      removeConfirmPanel();
      pendingPickedElement = null;
      pendingPickContext = null;
      startPicker(null, null, context.targetKey, context.mode, context.taskId);
    });

    confirm.addEventListener('click', () => {
      const confirmed = {
        ...pendingPickedElement,
        selector: select.value
      };
      removeConfirmPanel();
      pendingPickedElement = null;
      pendingPickContext = null;
      notifyExtension({
        type: MESSAGE_TYPES.PICKER_RESULT,
        targetKey: context.targetKey,
        mode: context.mode,
        taskId: context.taskId,
        picked: confirmed
      }).catch(() => {});
      showToast('已提交选择，等后台保存完成');
    });

    body.append(title, summary, select);
    actions.append(cancel, repick, confirm);
    panel.append(address, body, actions);
    document.documentElement.appendChild(panel);
    // 面板已在初始样式中固定在右下角，无需调整
  }

  function startPicker(task, requestId, targetKey, mode = 'create', taskId = null) {
    if (PICKER_STATE.active) {
      teardownPicker();
    }

    PICKER_STATE.active = true;
    PICKER_STATE.requestId = requestId || null;
    PICKER_STATE.targetKey = targetKey || null;
    PICKER_STATE.mode = mode || 'create';
    PICKER_STATE.taskId = taskId || null;
    PICKER_STATE.task = task || null;
    const capture = ensureCaptureLayer();

    const handlePointerMove = (event) => {
      const target = getElementAtPoint(event.clientX, event.clientY);
      PICKER_STATE.hoveredElement = target;
      updateHighlight(target);
    };

    const handlePick = async (event) => {
      const target = getElementAtPoint(event.clientX, event.clientY);
      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const picked = buildPickedElementInfo(target);
      picked.rect = target.getBoundingClientRect();
      const context = {
        targetKey: PICKER_STATE.targetKey,
        mode: PICKER_STATE.mode,
        taskId: PICKER_STATE.taskId
      };
      teardownPicker();
      showConfirmPanel(picked, context);
    };

    const swallowClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleKeyDown = async (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      await notifyExtension({
        type: MESSAGE_TYPES.PICKER_CANCELLED,
        requestId: PICKER_STATE.requestId,
        targetKey: PICKER_STATE.targetKey,
        task: PICKER_STATE.task
      });

      teardownPicker();
    };

    capture.addEventListener('pointermove', handlePointerMove, true);
    capture.addEventListener('pointerdown', handlePick, true);
    capture.addEventListener('click', swallowClick, true);
    document.addEventListener('keydown', handleKeyDown, true);

    PICKER_STATE.cleanup = () => {
      capture.removeEventListener('pointermove', handlePointerMove, true);
      capture.removeEventListener('pointerdown', handlePick, true);
      capture.removeEventListener('click', swallowClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      capture.remove();
    };

    return {
      started: true,
      requestId: PICKER_STATE.requestId
    };
  }

  async function handleGetStatus(task) {
    const rules = getRules();
    return rules.getTaskStatus(document, task);
  }

  async function handleRunTask(task) {
    const rules = getRules();
    return rules.runTaskOnDocument(document, task);
  }

  async function handleQuickPickElement(targetKey, mode, taskId) {
    if (lastContextElement && document.documentElement.contains(lastContextElement)) {
      const picked = buildPickedElementInfo(lastContextElement);
      picked.rect = lastContextElement.getBoundingClientRect();
      showConfirmPanel(picked, { targetKey, mode, taskId });
      return { confirming: true };
    }
    showToast('请在页面上左键点击签到按钮', 'info');
    return startPicker(null, null, targetKey, mode, taskId);
  }

  async function handleShowPickResult(message) {
    if (message?.kind === 'success') {
      showToast(message.text || '已保存签到任务', 'success');
    } else if (message?.kind === 'error') {
      showToast(message.text || '保存失败', 'error');
    } else {
      showToast(message?.text || '已选择元素', 'info');
    }
    return { ok: true };
  }

  const handleRuntimeMessage = (message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
      return false;
    }

    (async () => {
      switch (message.type) {
        case MESSAGE_TYPES.GET_STATUS:
          return handleGetStatus(message.task);
        case MESSAGE_TYPES.RUN_TASK:
          return handleRunTask(message.task);
        case MESSAGE_TYPES.START_PICKER:
          return startPicker(message.task, message.requestId, message.targetKey, message.mode, message.taskId);
        case MESSAGE_TYPES.QUICK_PICK_ELEMENT:
          return handleQuickPickElement(message.targetKey, message.mode, message.taskId);
        case MESSAGE_TYPES.SHOW_PICK_RESULT:
          return handleShowPickResult(message);
        default:
          return null;
      }
    })()
      .then((result) => {
        sendResponse({
          ok: true,
          result
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message
        });
      });

    return true;
  };

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  document.addEventListener('contextmenu', (event) => {
    if (event.target instanceof Element) {
      lastContextElement = event.target;
    }
  }, true);

  window.__signinContentScriptCleanup = () => {
    teardownPicker();
    removeConfirmPanel();
    document.getElementById(PICKER_CAPTURE_ID)?.remove();
    document.getElementById(PICKER_OVERLAY_ID)?.remove();
    document.getElementById(PICKER_LABEL_ID)?.remove();
    document.getElementById('__signin_picker_toast__')?.remove();

    try {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    } catch (_error) {
      // previous extension contexts may already be invalid after reload
    }
  };
})();
