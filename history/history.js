/**
 * history.js — SSI Optimizer local history viewer
 *
 * Reads chrome.storage.local keys:
 *  - connections      : [{ profileId, name, profileUrl, sentAt }]
 *  - postInteractions : [{ postId, postUrl, action, interactedAt }]
 *  - activityLog      : [{ message, level, timestamp }]
 */

// ─── Utility helpers ──────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Tab switching ────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('tab-panel--active'));

    btn.classList.add('tab-btn--active');
    document.getElementById(`tab-${target}`).classList.add('tab-panel--active');
  });
});

// ─── Render connections ───────────────────────────────────────────────────────

function renderConnections(connections) {
  const tbody = document.getElementById('connections-body');
  document.getElementById('badge-connections').textContent = connections.length;

  if (!connections.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">No connections recorded yet.</td></tr>';
    return;
  }

  // Most recent first
  const sorted = [...connections].sort((a, b) =>
    new Date(b.sentAt) - new Date(a.sentAt)
  );

  tbody.innerHTML = sorted.map(c => {
    const profileHref = escapeHtml(c.profileUrl || `https://www.linkedin.com/in/${c.profileId}/`);
    const nameDisplay = escapeHtml(c.name || c.profileId);
    return `
      <tr>
        <td class="date-cell">${formatDate(c.sentAt)}</td>
        <td class="name-cell">${nameDisplay}</td>
        <td>
          <a class="profile-link" href="${profileHref}" target="_blank" rel="noopener noreferrer">
            Open profile ↗
          </a>
        </td>
      </tr>`;
  }).join('');
}

// ─── Render post interactions ─────────────────────────────────────────────────

function renderPosts(postInteractions) {
  const tbody = document.getElementById('posts-body');
  document.getElementById('badge-posts').textContent = postInteractions.length;

  if (!postInteractions.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">No post interactions recorded yet.</td></tr>';
    return;
  }

  const sorted = [...postInteractions].sort((a, b) =>
    new Date(b.interactedAt) - new Date(a.interactedAt)
  );

  tbody.innerHTML = sorted.map(p => {
    const actionClass = `action-badge--${escapeHtml(p.action || 'like')}`;
    const actionLabel = escapeHtml((p.action || 'like').toUpperCase());

    const linkHtml = p.postUrl
      ? `<a class="post-link" href="${escapeHtml(p.postUrl)}" target="_blank" rel="noopener noreferrer">Open post ↗</a>`
      : `<span class="date-cell">${escapeHtml(p.postId)}</span>`;

    return `
      <tr>
        <td class="date-cell">${formatDate(p.interactedAt)}</td>
        <td><span class="action-badge ${actionClass}">${actionLabel}</span></td>
        <td>${linkHtml}</td>
      </tr>`;
  }).join('');
}

// ─── Render relationships ────────────────────────────────────────────────────

function renderRelationships(relationships) {
  const tbody = document.getElementById('relationships-body');
  document.getElementById('badge-relationships').textContent = relationships.length;

  if (!relationships.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No relationship touches recorded yet.</td></tr>';
    return;
  }

  const sorted = [...relationships].sort((a, b) =>
    new Date(b.touchedAt) - new Date(a.touchedAt)
  );

  tbody.innerHTML = sorted.map(r => {
    const profileHref  = escapeHtml(r.profileUrl || `https://www.linkedin.com/in/${r.profileId}/`);
    const nameDisplay  = escapeHtml(r.name || r.profileId);
    const eventLabel =
      r.eventType === 'anniversary' ? '🎂 Anniversary' :
      r.eventType === 'birthday'    ? '🎈 Birthday'    :
                                      '🎯 New Job';
    const msgDisplay   = escapeHtml((r.messageSent || '').slice(0, 80) + ((r.messageSent || '').length > 80 ? '…' : ''));
    return `
      <tr>
        <td class="date-cell">${formatDate(r.touchedAt)}</td>
        <td class="name-cell">${nameDisplay}</td>
        <td>${eventLabel}</td>
        <td class="msg-preview" title="${escapeHtml(r.messageSent || '')}">${msgDisplay}</td>
        <td>
          <a class="profile-link" href="${profileHref}" target="_blank" rel="noopener noreferrer">
            Open profile ↗
          </a>
        </td>
      </tr>`;
  }).join('');
}

// ─── Render activity log ──────────────────────────────────────────────────────

function renderLog(activityLog) {
  const container = document.getElementById('log-list');
  document.getElementById('badge-log').textContent = activityLog.length;

  if (!activityLog.length) {
    container.innerHTML = '<p class="empty">No log entries yet.</p>';
    return;
  }

  // Most recent first — already stored newest-last, so reverse
  const sorted = [...activityLog].reverse();

  container.innerHTML = sorted.map(e => {
    const lvl = escapeHtml(e.level || 'info');
    return `
      <div class="log-entry log-entry--${lvl}">
        <span class="log-time">${formatDate(e.ts)}</span>
        <span class="log-msg">${escapeHtml(e.msg)}</span>
      </div>`;
  }).join('');
}

// ─── Render SSI score history ────────────────────────────────────────────────

function renderSSIHistory(ssiScores) {
  const tbody = document.getElementById('ssi-body');
  document.getElementById('badge-ssi').textContent = ssiScores.length;

  if (!ssiScores.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No SSI scores captured yet.</td></tr>';
    return;
  }

  // Most recent first
  const sorted = [...ssiScores].sort((a, b) =>
    new Date(b.capturedAt) - new Date(a.capturedAt)
  );

  tbody.innerHTML = sorted.map(s => `
    <tr>
      <td class="date-cell">${formatDate(s.capturedAt)}</td>
      <td><strong>${escapeHtml(String(s.total ?? '—'))}</strong></td>
      <td>${escapeHtml(String(s.brand ?? '—'))}</td>
      <td>${escapeHtml(String(s.people ?? '—'))}</td>
      <td>${escapeHtml(String(s.insights ?? '—'))}</td>
      <td>${escapeHtml(String(s.relationships ?? '—'))}</td>
    </tr>`).join('');
}

// ─── Load & render all ────────────────────────────────────────────────────────

async function loadAll() {
  const data = await chrome.storage.local.get([
    'connections',
    'postInteractions',
    'relationships',
    'activityLog',
    'ssiScores',
  ]);

  renderConnections(data.connections || []);
  renderPosts(data.postInteractions || []);
  renderRelationships(data.relationships || []);
  renderLog(data.activityLog || []);
  renderSSIHistory(data.ssiScores || []);
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function toCsvRow(fields) {
  return fields.map(f => {
    const v = String(f ?? '');
    // Wrap in quotes if the value contains comma, quote, or newline
    return v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  }).join(',');
}

function downloadCsv(filename, headers, rows) {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
  const blob  = new Blob(['\uFEFF' + lines], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url   = URL.createObjectURL(blob);
  chrome.downloads.download({
    url,
    filename: `link_ssi/output/${filename}`,
    saveAs: false,
  }, () => URL.revokeObjectURL(url));
}

// ─── Button handlers ──────────────────────────────────────────────────────────

document.getElementById('btn-refresh').addEventListener('click', loadAll);

document.getElementById('btn-csv-connections').addEventListener('click', async () => {
  const { connections = [] } = await chrome.storage.local.get('connections');
  const sorted = [...connections].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  downloadCsv(
    `connections-${new Date().toISOString().slice(0,16).replace('T','-').replace(':','')}.csv`,
    ['Date', 'Name', 'Profile URL', 'Profile ID'],
    sorted.map(c => [
      c.sentAt,
      c.name || c.profileId,
      c.profileUrl || `https://www.linkedin.com/in/${c.profileId}/`,
      c.profileId,
    ])
  );
});

document.getElementById('btn-csv-posts').addEventListener('click', async () => {
  const { postInteractions = [] } = await chrome.storage.local.get('postInteractions');
  const sorted = [...postInteractions].sort((a, b) => new Date(b.interactedAt) - new Date(a.interactedAt));
  downloadCsv(
    `post-interactions-${new Date().toISOString().slice(0,16).replace('T','-').replace(':','')}.csv`,
    ['Date', 'Action', 'Post URL', 'Post ID'],
    sorted.map(p => [
      p.interactedAt,
      p.action || 'like',
      p.postUrl || '',
      p.postId,
    ])
  );
});

document.getElementById('btn-csv-relationships').addEventListener('click', async () => {
  const { relationships = [] } = await chrome.storage.local.get('relationships');
  const sorted = [...relationships].sort((a, b) => new Date(b.touchedAt) - new Date(a.touchedAt));
  downloadCsv(
    `relationships-${new Date().toISOString().slice(0,16).replace('T','-').replace(':','')}.csv`,
    ['Date', 'Name', 'Event Type', 'Message Sent', 'Profile URL', 'Profile ID'],
    sorted.map(r => [
      r.touchedAt,
      r.name || r.profileId,
      r.eventType,
      r.messageSent || '',
      r.profileUrl || `https://www.linkedin.com/in/${r.profileId}/`,
      r.profileId,
    ])
  );
});

document.getElementById('btn-csv-log').addEventListener('click', async () => {
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  const sorted = [...activityLog].reverse();
  downloadCsv(
    `activity-log-${new Date().toISOString().slice(0,16).replace('T','-').replace(':','')}.csv`,
    ['Date', 'Level', 'Message'],
    sorted.map(e => [e.ts, e.level || 'info', e.msg || ''])
  );
});

document.getElementById('btn-csv-ssi').addEventListener('click', async () => {
  const { ssiScores = [] } = await chrome.storage.local.get('ssiScores');
  const sorted = [...ssiScores].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
  downloadCsv(
    `ssi-scores-${new Date().toISOString().slice(0,16).replace('T','-').replace(':','')}.csv`,
    ['Date', 'CapturedAt', 'Total', 'Brand', 'People', 'Insights', 'Relationships'],
    sorted.map(s => [
      s.date || s.capturedAt.slice(0, 10),
      s.capturedAt,
      s.total ?? '',
      s.brand ?? '',
      s.people ?? '',
      s.insights ?? '',
      s.relationships ?? '',
    ])
  );
});

document.getElementById('btn-export-all-csv').addEventListener('click', async () => {
  const data = await chrome.storage.local.get([
    'connections', 'postInteractions', 'relationships', 'activityLog', 'ssiScores',
  ]);
  const ts = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  // ts = 'YYYYMMDD-HHMM'

  const sorted_c = [...(data.connections || [])].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  downloadCsv(`connections-${ts}.csv`,
    ['Date', 'Name', 'Profile URL', 'Profile ID'],
    sorted_c.map(c => [c.sentAt, c.name || c.profileId, c.profileUrl || `https://www.linkedin.com/in/${c.profileId}/`, c.profileId]));

  const sorted_p = [...(data.postInteractions || [])].sort((a, b) => new Date(b.interactedAt) - new Date(a.interactedAt));
  downloadCsv(`post-interactions-${ts}.csv`,
    ['Date', 'Action', 'Post URL', 'Post ID'],
    sorted_p.map(p => [p.interactedAt, p.action || 'like', p.postUrl || '', p.postId]));

  const sorted_r = [...(data.relationships || [])].sort((a, b) => new Date(b.touchedAt) - new Date(a.touchedAt));
  downloadCsv(`relationships-${ts}.csv`,
    ['Date', 'Name', 'Event Type', 'Message Sent', 'Profile URL', 'Profile ID'],
    sorted_r.map(r => [r.touchedAt, r.name || r.profileId, r.eventType, r.messageSent || '', r.profileUrl || `https://www.linkedin.com/in/${r.profileId}/`, r.profileId]));

  const sorted_l = [...(data.activityLog || [])].reverse();
  downloadCsv(`activity-log-${ts}.csv`,
    ['Date', 'Level', 'Message'],
    sorted_l.map(e => [e.ts, e.level || 'info', e.msg || '']));

  const sorted_s = [...(data.ssiScores || [])].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
  downloadCsv(`ssi-scores-${ts}.csv`,
    ['Date', 'CapturedAt', 'Total', 'Brand', 'People', 'Insights', 'Relationships'],
    sorted_s.map(s => [s.date || s.capturedAt.slice(0, 10), s.capturedAt, s.total ?? '', s.brand ?? '', s.people ?? '', s.insights ?? '', s.relationships ?? '']));
});

document.getElementById('btn-clear-all').addEventListener('click', async () => {
  const confirmed = confirm(
    'This will permanently delete all recorded connections, post interactions, and activity log entries. Continue?'
  );
  if (!confirmed) return;

  await chrome.storage.local.remove(['connections', 'postInteractions', 'relationships', 'activityLog']);
  await loadAll();
});

// ─── Auto-refresh when storage changes ───────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if ('connections' in changes || 'postInteractions' in changes ||
      'relationships' in changes || 'activityLog' in changes ||
      'ssiScores' in changes) {
    loadAll();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

loadAll();
