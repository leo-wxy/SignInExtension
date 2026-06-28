document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('backBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.local.get(['lastResults'], ({ lastResults }) => {
    const tbody = document.getElementById('historyBody');

    if (!lastResults || !Object.keys(lastResults).length) {
      tbody.innerHTML = '<tr><td colspan="4" style="color: var(--muted); text-align: center; padding: 24px;">暂无签到记录</td></tr>';
      return;
    }

    const rows = Object.values(lastResults)
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    const kind = (status) =>
      ['success', 'signed', 'clicked'].includes(status) ? 'success'
      : ['missing-action', 'missing-root', 'blocked', 'error'].includes(status) ? 'error'
      : 'info';

    const fmt = (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false
      });
    };

    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.taskName || r.taskId || '未知任务'}</td>
        <td><span class="status-badge" data-kind="${kind(r.status)}">${r.status || '-'}</span></td>
        <td>${r.message || '-'}</td>
        <td>${fmt(r.time)}</td>
      </tr>
    `).join('');
  });
});
