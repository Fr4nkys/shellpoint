// ╔══════════════════════════════════════════════════════════════╗
// ║  ShellPoint renderer.js — UI, Terminals, SFTP, Context Menus ║
// ║                                                              ║
// ║  Author : Alexandro Michel Davide                            ║
// ║  Web    : https://franksec.com                               ║
// ║                                                              ║
// ║  🎂  The cake is a lie. The shell is not.                    ║
// ║  ~ AMD                                                       ║
// ╚══════════════════════════════════════════════════════════════╝

const { ipcRenderer } = require('electron');

const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');

// =============================================
// STATE
// =============================================
let hosts = [];
let activeTabs = [];
let currentTabId = null;
let customCommands = [];   // user-defined commands
let customSKs = [];        // user-defined SKs
let splitView = null;      // { ids: [id1, id2] } when in split mode

// =============================================
// DOM REFS
// =============================================
const hostListEl         = document.getElementById('host-list');
const cmdListEl          = document.getElementById('command-list');
const cmdSearchEl        = document.getElementById('cmd-search');
const tabsBarEl          = document.getElementById('tabs-bar');
const terminalsEl        = document.getElementById('terminals-container');

const modalHost          = document.getElementById('modal-host');
const formHost           = document.getElementById('form-host');
const btnAddHost         = document.getElementById('btn-add-host');
const btnHostCancel      = document.getElementById('btn-host-cancel');

const modalCmd           = document.getElementById('modal-cmd');
const formCmd            = document.getElementById('form-cmd');
const btnCmdCancel       = document.getElementById('btn-cmd-cancel');
const cmdParamsContainer = document.getElementById('cmd-params-container');

const modalFlags         = document.getElementById('modal-flags');
const flagsList          = document.getElementById('flags-list');
const flagsPreview       = document.getElementById('modal-flags-preview');


let pendingCmd  = null;
let activeFlagsCmd = null; // holds the flag-type command being built


// =============================================
// IPC WRAPPERS
// =============================================
const api = {
  storeGet:        (key)               => ipcRenderer.invoke('store-get', key),
  storeSet:        (key, val)          => ipcRenderer.invoke('store-set', key, val),
  keytarSet:       (acc, pwd)          => ipcRenderer.invoke('keytar-set', acc, pwd),
  keytarGet:       (acc)               => ipcRenderer.invoke('keytar-get', acc),
  keytarDelete:    (acc)               => ipcRenderer.invoke('keytar-delete', acc),
  sshConnect:      (id, cfg)           => ipcRenderer.invoke('ssh-connect', id, cfg),
  sshDisconnect:   (id)               => ipcRenderer.invoke('ssh-disconnect', id),
  sshWrite:        (id, data)          => ipcRenderer.send('ssh-write', id, data),
  sshResize:       (id, cols, rows)    => ipcRenderer.send('ssh-resize', id, cols, rows),
  sshMfaResponse:  (id, code)          => ipcRenderer.invoke('ssh-mfa-response', id, code),
  sftpList:        (id, path)          => ipcRenderer.invoke('sftp-list', id, path),
  sftpUpload:      (id, local, remote) => ipcRenderer.invoke('sftp-upload', id, local, remote),
  sftpDownload:    (id, remote, local) => ipcRenderer.invoke('sftp-download', id, remote, local),
  sftpKeepalive:   (id)               => ipcRenderer.invoke('sftp-keepalive', id),
};

// MFA: push notification — write message to the active terminal
ipcRenderer.on('ssh-mfa-push', (_, hostId, message) => {
  const t = activeTabs.find(t => t.id === hostId);
  if (t) t.term.writeln(`\r\n\x1b[33m[2FA] ${message}\x1b[0m`);
});

// MFA: OTP prompt — show the modal so user can type their code
ipcRenderer.on('ssh-mfa-prompt', (_, hostId, promptText) => {
  const modal   = document.getElementById('modal-mfa');
  const form    = document.getElementById('form-mfa');
  const input   = document.getElementById('mfa-code-input');
  const labelEl = document.getElementById('mfa-prompt-text');
  labelEl.textContent = promptText || 'Enter your authentication code:';
  input.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 80);
  form.onsubmit = (e) => {
    e.preventDefault();
    const code = input.value.trim();
    modal.classList.add('hidden');
    api.sshMfaResponse(hostId, code);
  };
});


ipcRenderer.on('ssh-data', (_, id, data) => {
  const t = activeTabs.find(t => t.id === id);
  if (t) t.term.write(data);
});

ipcRenderer.on('ssh-closed', (_, id) => {
  const t = activeTabs.find(t => t.id === id);
  if (t) t.term.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n');
  updateTabStatus(id, 'disconnected');
});

// =============================================
// INIT
// =============================================
let currentFontSize = 14;
let currentAccentColor = '#E51261';

async function init() {
  await loadHosts();
  try { await loadSettings(); } catch(e) { console.error('Failed to load settings', e); }
  await loadCustomCommands();
  await loadCustomSKs();
  renderCommands();
  if (typeof cpGuides !== 'undefined') renderSK();
  setupListeners();

  // First Welcome Modal Logic
  try {
    const hasSeenWelcome = await api.storeGet('hasSeenWelcome');
    if (!hasSeenWelcome) {
      document.getElementById('modal-first-welcome').classList.remove('hidden');
      document.getElementById('btn-welcome-close').onclick = async () => {
        document.getElementById('modal-first-welcome').classList.add('hidden');
        await api.storeSet('hasSeenWelcome', true);
      };
    }
  } catch(e) { console.error('Welcome modal logic error', e); }
}

// =============================================
// HOSTS
// =============================================
async function loadHosts() {
  hosts = (await api.storeGet('hosts')) || [];
  renderHosts();
}

function renderHosts() {
  // Extract and update datalists
  const customers = [...new Set(hosts.map(h => h.customer).filter(Boolean))].sort();
  const clusters = [...new Set(hosts.map(h => h.cluster).filter(Boolean))].sort();
  document.getElementById('datalist-customers').innerHTML = customers.map(c => `<option value="${c}">`).join('');
  document.getElementById('datalist-clusters').innerHTML = clusters.map(c => `<option value="${c}">`).join('');

  hostListEl.innerHTML = '';
  if (hosts.length === 0) {
    hostListEl.innerHTML = '<div style="color:#555;font-size:12px;padding:20px 16px;text-align:center;line-height:1.6">No hosts yet.<br>Click <b style="color:#e8192c">+</b> to add one.</div>';
    return;
  }

  // Group by customer -> cluster
  const grouped = {};
  hosts.forEach(h => {
    const cust = h.customer || 'Uncategorized';
    const clus = h.cluster || 'Standalone';
    if (!grouped[cust]) grouped[cust] = {};
    if (!grouped[cust][clus]) grouped[cust][clus] = [];
    grouped[cust][clus].push(h);
  });

  // Render tree
  Object.keys(grouped).sort().forEach(cust => {
    const custDetails = document.createElement('details');
    custDetails.className = 'host-group-customer';
    custDetails.open = true;
    custDetails.innerHTML = `<summary>${cust}</summary>`;

    Object.keys(grouped[cust]).sort().forEach(clus => {
      const clusDetails = document.createElement('details');
      clusDetails.className = 'host-group-cluster';
      clusDetails.open = true;
      clusDetails.innerHTML = `<summary>${clus}</summary>`;

      // Add split button if cluster has >=2 hosts
      const clusHosts = grouped[cust][clus];
      if (clusHosts.length >= 2) {
        const splitBtn = document.createElement('div');
        splitBtn.className = 'cluster-split-btn';
        splitBtn.title = 'Open split screen (Node 1 | Node 2)';
        splitBtn.innerHTML = '⊟ Split';
        splitBtn.onclick = (e) => { e.stopPropagation(); openClusterSplit(clusHosts[0], clusHosts[1]); };
        clusDetails.querySelector('summary').appendChild(splitBtn);
      }

      clusHosts.forEach(h => {
        const el = document.createElement('div');
        el.className = 'host-item';
        el.id = `host-item-${h.id}`;
        el.innerHTML = `
          ${h.image ? `<img src="${h.image}" class="host-custom-img">` : `<div class="host-dot">${(h.name||'?')[0].toUpperCase()}</div>`}
          <div class="host-info">
            <span class="host-name">${h.name}</span>
            <span class="host-ip">${h.user}@${h.ip}:${h.port}</span>
          </div>
          <div class="host-actions">
            <span class="ha-btn" data-action="connect" title="Connect"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-top;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></span>
            <span class="ha-btn" data-action="edit"    title="Edit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-top;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></span>
          </div>`;

        el.querySelector('[data-action="connect"]').onclick = (e) => { e.stopPropagation(); openTab(h); };
        el.querySelector('[data-action="edit"]').onclick    = (e) => { e.stopPropagation(); openEditModal(h); };
        el.ondblclick = () => openTab(h);

        // Right-click context menu on host item
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById('host-ctx-menu')?.remove();
          const ctxMenu = document.createElement('div');
          ctxMenu.id = 'host-ctx-menu';
          ctxMenu.className = 'term-ctx-menu';
          const hasWebUI = !!(h.ip);
          ctxMenu.innerHTML = `
            <div class="ctx-item" id="hctx-connect">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke-width="0"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Connect
            </div>
            <div class="ctx-item" id="hctx-webui" ${hasWebUI ? '' : 'data-disabled="true"'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              Open Gaia Portal
              <span class="ctx-shortcut">${h.ip}:${h.webUIPort || 4434}</span>
            </div>
            <div class="ctx-separator"></div>
            <div class="ctx-item" id="hctx-edit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              Edit host
            </div>
            <div class="ctx-item" id="hctx-delete" style="color:var(--accent);">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Delete host
            </div>
          `;
          document.body.appendChild(ctxMenu);
          const mW = ctxMenu.offsetWidth || 200;
          const mH = ctxMenu.offsetHeight || 160;
          let cx = e.clientX, cy = e.clientY;
          if (cx + mW > window.innerWidth)  cx = window.innerWidth  - mW - 8;
          if (cy + mH > window.innerHeight) cy = window.innerHeight - mH - 8;
          ctxMenu.style.left = cx + 'px';
          ctxMenu.style.top  = cy + 'px';
          ctxMenu.classList.add('visible');

          ctxMenu.querySelector('#hctx-connect').onclick  = () => { ctxMenu.remove(); openTab(h); };
          ctxMenu.querySelector('#hctx-webui').onclick    = () => {
            ctxMenu.remove();
            const url = `https://${h.ip}:${h.webUIPort || 4434}`;
            require('electron').shell.openExternal(url);
          };
          ctxMenu.querySelector('#hctx-edit').onclick     = () => { ctxMenu.remove(); openEditModal(h); };
          ctxMenu.querySelector('#hctx-delete').onclick   = () => { ctxMenu.remove(); deleteHost(h); };

          const dismiss = (ev) => {
            if (!ctxMenu.contains(ev.target)) { ctxMenu.remove(); document.removeEventListener('mousedown', dismiss); }
          };
          setTimeout(() => document.addEventListener('mousedown', dismiss), 10);
        });

        clusDetails.appendChild(el);
      });
      custDetails.appendChild(clusDetails);
    });
    hostListEl.appendChild(custDetails);
  });
}

async function deleteHost(h) {
  if (!confirm(`Delete host "${h.name}"?`)) return;
  await api.keytarDelete(h.id);
  hosts = hosts.filter(x => x.id !== h.id);
  await api.storeSet('hosts', hosts);
  renderHosts();
}

function updateTabStatus(id, status) {
  const tabEl = document.getElementById(`tab-${id}`);
  if (tabEl) {
    const dot = tabEl.querySelector('.tab-dot');
    if (dot) dot.style.background = status === 'connected' ? 'var(--green)' : 'var(--accent)';
  }
  // Also update host-item in sidebar
  const hostEl = document.getElementById(`host-item-${id}`);
  if (hostEl) {
    if (status === 'connected') {
      hostEl.classList.add('connected');
    } else {
      hostEl.classList.remove('connected');
    }
  }
}

// =============================================
// HOST MODAL
// =============================================
let currentHostImageBase64 = null;

function openAddModal() {
  formHost.reset();
  document.getElementById('host-id').value = '';
  document.getElementById('host-customer').value = '';
  document.getElementById('host-cluster').value = '';
  document.getElementById('host-auth-type').value = 'password';
  document.getElementById('auth-type-hint').textContent = '';
  document.getElementById('modal-host-title').innerText = 'Add Host';
  
  // Reset image
  currentHostImageBase64 = null;
  document.getElementById('host-image-preview').style.display = 'none';
  document.getElementById('host-image-placeholder').style.display = 'flex';
  document.getElementById('btn-remove-host-image').style.display = 'none';
  document.getElementById('host-image').value = '';

  const delBtn = document.getElementById('btn-host-delete');
  if (delBtn) delBtn.style.display = 'none';

  modalHost.classList.remove('hidden');
  document.getElementById('host-customer').focus();
}

async function openEditModal(h) {
  document.getElementById('host-id').value   = h.id;
  document.getElementById('host-customer').value = h.customer || '';
  document.getElementById('host-cluster').value = h.cluster || '';
  document.getElementById('host-name').value = h.name;
  document.getElementById('host-ip').value   = h.ip;
  document.getElementById('host-port').value = h.port;
  document.getElementById('host-user').value = h.user;
  document.getElementById('host-key').value  = h.privateKey || '';
  document.getElementById('host-webui-port').value = h.webUIPort || 4434;
  document.getElementById('host-auth-type').value  = h.authType  || 'password';
  const pwd = await api.keytarGet(h.id);
  document.getElementById('host-password').value = pwd || '';
  
  if (h.image) {
    currentHostImageBase64 = h.image;
    document.getElementById('host-image-preview').src = h.image;
    document.getElementById('host-image-preview').style.display = 'block';
    document.getElementById('host-image-placeholder').style.display = 'none';
    document.getElementById('btn-remove-host-image').style.display = 'inline-block';
  } else {
    currentHostImageBase64 = null;
    document.getElementById('host-image-preview').style.display = 'none';
    document.getElementById('host-image-placeholder').style.display = 'flex';
    document.getElementById('btn-remove-host-image').style.display = 'none';
  }
  document.getElementById('host-image').value = '';

  document.getElementById('modal-host-title').innerText = 'Edit Host';

  const delBtn = document.getElementById('btn-host-delete');
  if (delBtn) {
    delBtn.style.display = 'block';
    delBtn.onclick = async () => {
      await deleteHost(h);
      closeHostModal();
    };
  }

  modalHost.classList.remove('hidden');
}

// =============================================
// COMMANDS RENDER
// =============================================
const CMD_PREVIEW_LIMIT = 6;
const expandedCategories = new Set(); // tracks which categories are expanded

function renderCommands(filter = '') {
  const q = filter.toLowerCase().trim();
  const isFiltering = q.length > 0;
  cmdListEl.innerHTML = '';

  // --- Custom Commands section first ---
  const filteredCustom = customCommands.filter(c => {
    const s = (c.cmd || '') + ' ' + (c.desc || '') + ' ' + (c.label || '');
    return s.toLowerCase().includes(q);
  });
  if (filteredCustom.length > 0 || !isFiltering) {
    const catEl = document.createElement('div');
    catEl.className = 'cmd-category cmd-category-custom';
    catEl.innerHTML = `★ My Commands <span id="btn-open-custom-modal" class="cmd-add-btn" title="Add command">+</span>`;
    cmdListEl.appendChild(catEl);
    document.getElementById('btn-open-custom-modal')?.addEventListener('click', (e) => {
      e.stopPropagation(); openCustomCmdModal();
    });
    if (filteredCustom.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'cmd-empty-hint';
      emptyEl.innerText = 'No custom commands. Click + to add one.';
      cmdListEl.appendChild(emptyEl);
    }
    filteredCustom.forEach(cmd => {
      const el = document.createElement('div');
      el.className = 'cmd-item cmd-item-custom';
      el.innerHTML = `
        <span class="cmd-label">${cmd.label || cmd.cmd}</span>
        <span class="cmd-desc">${cmd.desc || ''}</span>
        <span class="cmd-custom-actions">
          <span class="cmd-custom-edit" title="Edit">⚙️</span>
        </span>`;
      el.querySelector('.cmd-custom-edit').onclick = (e) => { e.stopPropagation(); openCustomCmdModal(cmd); };
      el.onclick = () => handleCmd(cmd);
      cmdListEl.appendChild(el);
    });
  }

  // --- Built-in CP commands ---
  cpCommands.forEach(cat => {
    const cmds = cat.commands.filter(c => {
      const searchStr = (c.cmd || c.label || '') + ' ' + (c.desc || '');
      return searchStr.toLowerCase().includes(q);
    });
    if (!cmds.length) return;

    // Category header
    const catEl = document.createElement('div');
    catEl.className = 'cmd-category';
    catEl.innerText = cat.category;
    cmdListEl.appendChild(catEl);

    // Decide how many to show
    const catKey = cat.category;
    const isExpanded = expandedCategories.has(catKey);
    const showAll = isFiltering || isExpanded;
    const visibleCmds  = showAll ? cmds : cmds.slice(0, CMD_PREVIEW_LIMIT);
    const hiddenCount  = cmds.length - visibleCmds.length;

    // Render visible commands
    visibleCmds.forEach(cmd => {
      const el = document.createElement('div');
      el.className = 'cmd-item' + (cmd.type === 'flags' ? ' cmd-item-builder' : '');

      if (cmd.type === 'flags') {
        el.innerHTML = `
          <span class="cmd-label"><span class="cmd-builder-badge">[B]</span> ${cmd.label}</span>
          <span class="cmd-desc">${cmd.desc}</span>`;
      } else {
        el.innerHTML = `
          <span class="cmd-label">${cmd.cmd}</span>
          <span class="cmd-desc">${cmd.desc}</span>`;
      }
      el.title = cmd.desc;
      el.onclick = () => handleCmd(cmd);
      cmdListEl.appendChild(el);
    });

    // "Show more" / "Show less" button
    if (!isFiltering && cmds.length > CMD_PREVIEW_LIMIT) {
      const moreEl = document.createElement('div');
      moreEl.className = 'cmd-more-btn';

      if (isExpanded) {
        moreEl.innerHTML = `<span class="cmd-more-icon">^</span> Show less`;
        moreEl.onclick = () => {
          expandedCategories.delete(catKey);
          renderCommands(cmdSearchEl.value);
        };
      } else {
        moreEl.innerHTML = `<span class="cmd-more-icon">v</span> ${hiddenCount} more...`;
        moreEl.onclick = () => {
          expandedCategories.add(catKey);
          renderCommands(cmdSearchEl.value);
        };
      }

      cmdListEl.appendChild(moreEl);
    }
  });
}

// =============================================
// COMMAND DISPATCH
// =============================================
function handleCmd(cmd) {
  if (!currentTabId) {
    showToast('Connect to a firewall first!', 'error');
    return;
  }

  if (cmd.type === 'flags') {
    openFlagsModal(cmd);
    return;
  }

  if (cmd.params && cmd.params.length > 0) {
    openParamsModal(cmd);
  } else {
    sendCmd(cmd.cmd);
  }
}

// =============================================
// SIMPLE PARAMS MODAL
// =============================================
function openParamsModal(cmd) {
  pendingCmd = cmd;
  document.getElementById('modal-cmd-title').innerText = cmd.desc;
  document.getElementById('modal-cmd-desc').innerText  = cmd.cmd;
  cmdParamsContainer.innerHTML = '';
  cmd.params.forEach(p => {
    const g = document.createElement('div');
    g.className = 'form-group';
    g.innerHTML = `<label>${p.label}</label>
      <input type="text" id="param-${p.name}" value="${p.default || ''}" required/>`;
    cmdParamsContainer.appendChild(g);
  });
  modalCmd.classList.remove('hidden');
  setTimeout(() => document.getElementById(`param-${cmd.params[0].name}`)?.focus(), 80);
}

// =============================================
// FLAG BUILDER MODAL
// =============================================
function openFlagsModal(cmd) {
  // Deep-clone flags to avoid mutating the original
  activeFlagsCmd = {
    ...cmd,
    flags: cmd.flags.map(f => ({ ...f, extraValues: f.extraValues ? f.extraValues.map(ev => ({...ev})) : undefined }))
  };

  document.getElementById('modal-flags-title').innerText = cmd.label + ' Builder';
  renderFlagsList();
  updateFlagsPreview();
  modalFlags.classList.remove('hidden');
}

function renderFlagsList() {
  flagsList.innerHTML = '';
  const flags = activeFlagsCmd.flags;

  // Separate into options and expressions for grouped display
  const options = flags.filter(f => f.category === 'option');
  const exprs   = flags.filter(f => f.category !== 'option');

  if (options.length) {
    appendFlagGroup('OPTIONS', options);
  }
  if (exprs.length) {
    appendFlagGroup('FILTER EXPRESSIONS', exprs);
  }
}

function appendFlagGroup(title, flags) {
  const groupHeader = document.createElement('div');
  groupHeader.className = 'flag-group-header';
  groupHeader.innerText = title;
  flagsList.appendChild(groupHeader);

  flags.forEach(flag => {
    const row = document.createElement('div');
    row.className = 'flag-row' + (flag.enabled ? ' flag-enabled' : '');
    row.id = `flag-row-${flag.id}`;

    const isRequired = flag.required;
    const checkedAttr = flag.enabled ? 'checked' : '';
    const disabledAttr = isRequired ? 'disabled' : '';

    // Extra values for expr_raw type (multiple inputs)
    let extraValueHtml = '';
    if (flag.category === 'expr_raw' && flag.extraValues) {
      extraValueHtml = flag.extraValues.map(ev => `
        <div class="flag-extra-input">
          <label>${ev.label}</label>
          <input type="text" class="flag-extra-val"
            data-flag="${flag.id}" data-evname="${ev.name}"
            value="${ev.value || ''}" placeholder="${ev.placeholder || ''}"
            ${flag.enabled ? '' : 'disabled'}/>
        </div>`).join('');
    }

    const valueHtml = flag.hasValue ? `
      <div class="flag-value-wrap">
        <input type="text" class="flag-val-input"
          id="flagval-${flag.id}"
          value="${flag.value || ''}"
          placeholder="${flag.placeholder || ''}"
          ${flag.enabled ? '' : 'disabled'}/>
      </div>` : '';

    row.innerHTML = `
      <label class="flag-toggle-wrap" title="${isRequired ? 'Required' : ''}">
        <input type="checkbox" class="flag-cb" data-flag-id="${flag.id}" ${checkedAttr} ${disabledAttr}/>
        <span class="flag-toggle-track">
          <span class="flag-toggle-thumb"></span>
        </span>
      </label>
      <div class="flag-body">
        <div class="flag-head">
          <code class="flag-code">${flag.code}</code>
          <span class="flag-label-text">${flag.label}</span>
          ${isRequired ? '<span class="flag-required-badge">required</span>' : ''}
        </div>
        <p class="flag-desc-text">${flag.desc}</p>
        ${valueHtml}
        ${extraValueHtml}
      </div>`;

    // Toggle checkbox
    const cb = row.querySelector('.flag-cb');
    cb.onchange = () => {
      const f = activeFlagsCmd.flags.find(x => x.id === flag.id);
      if (f) f.enabled = cb.checked;
      row.classList.toggle('flag-enabled', cb.checked);

      // Enable/disable value input
      const valInput = row.querySelector('.flag-val-input');
      if (valInput) valInput.disabled = !cb.checked;
      row.querySelectorAll('.flag-extra-val').forEach(inp => inp.disabled = !cb.checked);

      updateFlagsPreview();
    };

    // Value input change
    const valInput = row.querySelector('.flag-val-input');
    if (valInput) {
      valInput.oninput = () => {
        const f = activeFlagsCmd.flags.find(x => x.id === flag.id);
        if (f) f.value = valInput.value;
        updateFlagsPreview();
      };
    }

    // Extra value inputs
    row.querySelectorAll('.flag-extra-val').forEach(inp => {
      inp.oninput = () => {
        const f = activeFlagsCmd.flags.find(x => x.id === flag.id);
        if (f && f.extraValues) {
          const ev = f.extraValues.find(x => x.name === inp.dataset.evname);
          if (ev) ev.value = inp.value;
        }
        updateFlagsPreview();
      };
    });

    flagsList.appendChild(row);
  });
}

function buildFlagCommand() {
  const flags = activeFlagsCmd.flags;
  const mode  = activeFlagsCmd.buildMode;

  if (mode === 'tcpdump') {
    const opts = flags
      .filter(f => f.enabled && f.category === 'option')
      .map(f => f.hasValue ? f.template.replace('{v}', f.value || '') : f.template);

    const exprs = flags
      .filter(f => f.enabled && (f.category === 'expr' || f.category === 'proto'))
      .map(f => f.hasValue ? f.template.replace('{v}', f.value || '') : f.template);

    let cmd = 'tcpdump';
    if (opts.length)  cmd += ' ' + opts.join(' ');
    if (exprs.length) cmd += ' ' + exprs.join(' and ');
    return cmd;
  }

  if (mode === 'fwmonitor') {
    const opts = flags
      .filter(f => f.enabled && f.category === 'option')
      .map(f => f.hasValue ? f.template.replace('{v}', f.value || '') : f.template);

    const exprs = flags
      .filter(f => f.enabled && (f.category === 'expr' || f.category === 'proto'))
      .map(f => f.hasValue ? f.template.replace('{v}', f.value || '') : f.template);

    // expr_raw flags (multi-value like src+dst pair)
    const rawExprs = flags
      .filter(f => f.enabled && f.category === 'expr_raw')
      .map(f => {
        let tpl = f.template;
        (f.extraValues || []).forEach(ev => {
          tpl = tpl.replace(`{${ev.name}}`, ev.value || '');
        });
        return tpl;
      });

    const allExprs = [...exprs, ...rawExprs];

    let cmd = 'fw monitor';
    if (opts.length)     cmd += ' ' + opts.join(' ');
    if (allExprs.length) cmd += ` -e 'accept ${allExprs.join(' and ')};'`;
    return cmd;
  }

  return '';
}

function updateFlagsPreview() {
  const preview = buildFlagCommand();
  flagsPreview.innerText = preview;
}

function closeFlagsModal() {
  modalFlags.classList.add('hidden');
  activeFlagsCmd = null;
}

// Write command into terminal WITHOUT executing (user presses Enter)
function sendCmd(cmdStr) {
  if (!currentTabId) return;
  // Write without \r — user must press Enter to execute
  api.sshWrite(currentTabId, cmdStr);
  const t = activeTabs.find(x => x.id === currentTabId);
  if (t) t.term.focus();
  showToast('Press ENTER to execute', 'info');
}

// =============================================
// TABS / TERMINALS
// =============================================
async function openTab(host, forceNew = false) {
  // If the host already has a session AND we are NOT forcing a new one,
  // just switch to the existing one.
  if (!forceNew && activeTabs.find(t => t.id === host.id)) {
    activateTab(host.id);
    return;
  }
  // When opening a new (duplicate) session, mint a fresh unique id so the
  // existing session is left untouched.
  // IMPORTANT: save the original id BEFORE changing it — keytar stores the
  // password under the original id, not the new session-scoped one.
  const originalId = host.id;
  if (forceNew && activeTabs.find(t => t.id === host.id)) {
    const sessionSuffix = 'session_' + Date.now();
    const sessionNum = activeTabs.filter(t => t.host && t.host.ip === host.ip).length + 1;
    host = { ...host, id: host.id + '_' + sessionSuffix, _sessionLabel: host.name + ' #' + sessionNum };
  }

  // _qcPassword is set by Quick Connect flow (no keychain entry exists for temp hosts).
  // Always resolve the password from the ORIGINAL host id so keytar finds it.
  const password = host._qcPassword !== undefined ? host._qcPassword : await api.keytarGet(originalId);

  const tabLabel = host._sessionLabel || host.name;

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = `tab-${host.id}`;
  tabEl.innerHTML = `
    <span class="tab-dot"></span>
    <span class="tab-title">${tabLabel}</span>
    <span class="tab-close" title="Close">&times;</span>`;
  tabEl.onclick = () => activateTab(host.id);
  tabEl.querySelector('.tab-close').onclick = (e) => { e.stopPropagation(); closeTab(host.id); };

  // Tab bar right-click context menu
  tabEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('tab-ctx-menu')?.remove();
    const other = activeTabs.filter(t => t.id !== host.id);
    if (!other.length) return;
    const tabCtx = document.createElement('div');
    tabCtx.id = 'tab-ctx-menu';
    tabCtx.className = 'term-ctx-menu';
    // Build split submenu
    const splitItems = other.map(t => `
      <div class="ctx-item tab-ctx-split-item" data-split-id="${t.id}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        Split with: ${t.host?._sessionLabel || t.host?.name || t.id}
      </div>`).join('');
    tabCtx.innerHTML = `
      <div class="ctx-item" id="tab-ctx-new-session">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New session (same host)
      </div>
      <div class="ctx-separator"></div>
      ${splitItems}
      <div class="ctx-separator"></div>
      <div class="ctx-item" id="tab-ctx-close" style="color:var(--accent);">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Close tab
      </div>`;
    document.body.appendChild(tabCtx);
    const mW = tabCtx.offsetWidth || 240;
    const mH = tabCtx.offsetHeight || 120;
    let cx = e.clientX, cy = e.clientY;
    if (cx + mW > window.innerWidth)  cx = window.innerWidth  - mW - 8;
    if (cy + mH > window.innerHeight) cy = window.innerHeight - mH - 8;
    tabCtx.style.left = cx + 'px';
    tabCtx.style.top  = cy + 'px';
    tabCtx.classList.add('visible');

    tabCtx.querySelector('#tab-ctx-new-session').onclick = () => {
      tabCtx.remove();
      openTab(host, true);
    };
    tabCtx.querySelectorAll('.tab-ctx-split-item').forEach(item => {
      item.onclick = () => {
        tabCtx.remove();
        openSplitView([host.id, item.dataset.splitId]);
      };
    });
    tabCtx.querySelector('#tab-ctx-close').onclick = () => { tabCtx.remove(); closeTab(host.id); };

    const dismiss = (ev) => {
      if (!tabCtx.contains(ev.target)) { tabCtx.remove(); document.removeEventListener('mousedown', dismiss); }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 10);
  });

  tabsBarEl.appendChild(tabEl);

  const wrapper = document.createElement('div');
  wrapper.className = 'terminal-wrapper';
  wrapper.id = `term-${host.id}`;
  terminalsEl.appendChild(wrapper);

  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: "'Courier New', 'DejaVu Sans Mono', 'Liberation Mono', monospace",
    fontSize: currentFontSize || 14,
    lineHeight: 1.15,
    letterSpacing: 0,
    allowProposedApi: true,
    rightClickSelectsWord: false,
    theme: {
      background:          '#000000',
      foreground:          '#cccccc',
      cursor:              '#cccccc',
      cursorAccent:        '#000000',
      selectionBackground: 'rgba(255,255,255,0.25)',
      black:   '#000000', brightBlack:   '#555555',
      red:     '#cc0000', brightRed:     '#ff5555',
      green:   '#4ec94e', brightGreen:   '#55ff55',
      yellow:  '#c4a000', brightYellow:  '#ffff55',
      blue:    '#3465a4', brightBlue:    '#5599ff',
      magenta: '#75507b', brightMagenta: '#ff55ff',
      cyan:    '#06989a', brightCyan:    '#55ffff',
      white:   '#d3d7cf', brightWhite:   '#ffffff',
    }
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(wrapper);
  fitAddon.fit();

  // ── Right-click context menu ─────────────────────────────
  wrapper.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Remove any existing context menu
    document.getElementById('term-ctx-menu')?.remove();

    const hasSelection = term.getSelection().length > 0;

    const menu = document.createElement('div');
    menu.id = 'term-ctx-menu';
    menu.className = 'term-ctx-menu';
    menu.innerHTML = `
      <div class="ctx-item" id="ctx-copy" ${hasSelection ? '' : 'data-disabled="true"'}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        Copy
        <span class="ctx-shortcut">Ctrl+Shift+C</span>
      </div>
      <div class="ctx-item" id="ctx-paste">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
        Paste
        <span class="ctx-shortcut">Ctrl+Shift+V</span>
      </div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" id="ctx-reconnect">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
        Reconnect
      </div>
      <div class="ctx-item" id="ctx-duplicate">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        New session (same host)
      </div>
      <div class="ctx-item" id="ctx-split-pick" ${activeTabs.length < 2 ? 'data-disabled="true"' : ''}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        Split with tab…
      </div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" id="ctx-clear">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        Clear screen
      </div>
    `;

    // Position near cursor, keep inside viewport
    document.body.appendChild(menu);
    const menuW = menu.offsetWidth || 180;
    const menuH = menu.offsetHeight || 200;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuW > window.innerWidth)  x = window.innerWidth  - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.classList.add('visible');

    // Actions
    document.getElementById('ctx-copy').onclick = () => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      menu.remove();
    };
    document.getElementById('ctx-paste').onclick = async () => {
      menu.remove();
      try {
        const text = await navigator.clipboard.readText();
        if (text) api.sshWrite(host.id, text);
      } catch(err) {
        showToast('Paste failed — clipboard access denied', 'error');
      }
    };
    document.getElementById('ctx-reconnect').onclick = async () => {
      menu.remove();
      term.writeln('\r\n\x1b[33m[Reconnecting...]\x1b[0m');
      await api.sshDisconnect(host.id);
      // Give main process 400ms to fully close the channel before reconnecting
      await new Promise(r => setTimeout(r, 400));
      const password = host._qcPassword !== undefined
        ? host._qcPassword
        : await api.keytarGet(host.id);
      try {
        await api.sshConnect(host.id, {
          host: host.ip, port: host.port,
          username: host.user,
          password: password || undefined,
          privateKey: host.privateKey,
        });
        term.writeln('\x1b[32m✓ Reconnected\x1b[0m\r\n');
        updateTabStatus(host.id, 'connected');
        // Dispose old listeners before re-attaching — otherwise every reconnect
        // adds a NEW onData/onResize handler and each keystroke is sent N times.
        const tabEntry = activeTabs.find(t => t.id === host.id);
        if (tabEntry) {
          tabEntry.dataDisposable?.dispose();
          tabEntry.resizeDisposable?.dispose();
          tabEntry.dataDisposable   = term.onData(data => api.sshWrite(host.id, data));
          tabEntry.resizeDisposable = term.onResize(({ cols, rows }) => api.sshResize(host.id, cols, rows));
        }
      } catch(err) {
        term.writeln(`\x1b[31m✗ Reconnect failed: ${err}\x1b[0m`);
        updateTabStatus(host.id, 'disconnected');
      }
    };
    document.getElementById('ctx-duplicate').onclick = async () => {
      menu.remove();
      openTab(host, true); // forceNew=true → mint a unique session id
    };

    document.getElementById('ctx-split-pick').onclick = () => {
      menu.remove();
      const others = activeTabs.filter(t => t.id !== host.id);
      if (!others.length) return;
      // Show a secondary picker menu
      const picker = document.createElement('div');
      picker.id = 'split-picker-menu';
      picker.className = 'term-ctx-menu';
      picker.innerHTML = others.map(t => `
        <div class="ctx-item split-pick-item" data-id="${t.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
          ${t.host?._sessionLabel || t.host?.name || t.id}
        </div>`).join('');
      document.body.appendChild(picker);
      // Position near the last menu
      const pW = picker.offsetWidth || 220;
      const pH = picker.offsetHeight || 80;
      let px = menu.style.left ? parseInt(menu.style.left) + (menu.offsetWidth || 190) : e.clientX + 10;
      let py = menu.style.top  ? parseInt(menu.style.top) : e.clientY;
      if (px + pW > window.innerWidth)  px = window.innerWidth  - pW - 8;
      if (py + pH > window.innerHeight) py = window.innerHeight - pH - 8;
      picker.style.left = px + 'px';
      picker.style.top  = py + 'px';
      picker.classList.add('visible');
      picker.querySelectorAll('.split-pick-item').forEach(item => {
        item.onclick = () => {
          picker.remove();
          openSplitView([host.id, item.dataset.id]);
        };
      });
      const dismissPicker = (ev) => {
        if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('mousedown', dismissPicker); }
      };
      setTimeout(() => document.addEventListener('mousedown', dismissPicker), 10);
    };

    document.getElementById('ctx-clear').onclick = () => {
      term.clear();
      menu.remove();
    };


    // Dismiss on any outside interaction
    const dismiss = (ev) => {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', dismiss); }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 10);
  });
  // ────────────────────────────────────────────────────────

  // xterm.js natively handles Ctrl+V and Shift+Insert pasting, triggering term.onData().

  // Manual interception has been removed to fix the double-paste issue.

  // Store disposables so we can remove listeners before re-attaching on reconnect
  const tabEntry = { id: host.id, host, term, fitAddon, dataDisposable: null, resizeDisposable: null };
  activeTabs.push(tabEntry);

  term.writeln(`\x1b[36mShellPoint\x1b[0m — Connecting to \x1b[33m${host.user}@${host.ip}:${host.port}\x1b[0m ...`);

  try {
    let privateKey = undefined;
    if (host.privateKey) {
      try {
        const fs = require('fs');
        privateKey = fs.readFileSync(host.privateKey, 'utf-8');
      } catch(e) {
        term.writeln(`\x1b[31mWarning: Could not read private key: ${e.message}\x1b[0m`);
      }
    }

    await api.sshConnect(host.id, {
      host: host.ip, port: host.port,
      username: host.user,
      password: password || undefined,
      privateKey,
      authType: host.authType || 'password',
    });

    term.writeln('\x1b[32m✓ Connected\x1b[0m\r\n');
    updateTabStatus(host.id, 'connected');
    tabEntry.dataDisposable   = term.onData(data => api.sshWrite(host.id, data));
    tabEntry.resizeDisposable = term.onResize(({ cols, rows }) => api.sshResize(host.id, cols, rows));

  } catch(err) {
    term.writeln(`\x1b[31m✗ Connection failed: ${err}\x1b[0m`);
    updateTabStatus(host.id, 'disconnected');
  }

  activateTab(host.id);
  document.getElementById('welcome-screen')?.style.setProperty('display', 'none');
  document.getElementById('tabs-empty-msg')?.style.setProperty('display', 'none');
}

function activateTab(id) {
  currentTabId = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.terminal-wrapper').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${id}`)?.classList.add('active');
  document.getElementById(`term-${id}`)?.classList.add('active');
  const t = activeTabs.find(x => x.id === id);
  if (t) setTimeout(() => { t.fitAddon.fit(); t.term.focus(); }, 50);
}

async function closeTab(id) {
  await api.sshDisconnect(id);
  document.getElementById(`tab-${id}`)?.remove();
  document.getElementById(`term-${id}`)?.remove();
  activeTabs = activeTabs.filter(t => t.id !== id);
  if (currentTabId === id) {
    currentTabId = null;
    if (activeTabs.length) {
      activateTab(activeTabs[activeTabs.length - 1].id);
    } else {
      goHome();
    }
  } else if (activeTabs.length === 0) {
    goHome();
  }
}

function goHome() {
  currentTabId = null;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.terminal-wrapper').forEach(t => t.classList.remove('active'));
  document.getElementById('welcome-screen')?.style.removeProperty('display');
  document.getElementById('tabs-empty-msg')?.style.removeProperty('display');
}

// =============================================
// TOAST
// =============================================
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// =============================================
// SFTP INLINE PANEL
// =============================================
let currentSftpPath = '/home/admin';
let sftpKeepaliveTimer = null;
const sftpPanel      = document.getElementById('sftp-panel');
const sftpFileList   = document.getElementById('sftp-file-list');
const sftpPathInput  = document.getElementById('sftp-path');
const sftpStatusMsg  = document.getElementById('sftp-status-msg');
const sftpDropZone   = document.getElementById('sftp-drop-zone');
const sftpDropOverlay = document.getElementById('sftp-drop-overlay');
const sftpProgressWrap = document.getElementById('sftp-progress-wrap');
const sftpProgressBar  = document.getElementById('sftp-progress-bar');
const sftpProgressLabel = document.getElementById('sftp-progress-label');
const sftpBreadcrumb   = document.getElementById('sftp-breadcrumb');

// Listen to real-time progress events from main process
ipcRenderer.on('sftp-progress', (_, hostId, direction, transferred, total) => {
  if (hostId !== currentTabId) return;
  const pct = total > 0 ? Math.round((transferred / total) * 100) : 0;
  sftpProgressWrap.classList.remove('hidden');
  sftpProgressBar.style.width = pct + '%';
  sftpProgressLabel.textContent = pct + '%';
  const dir = direction === 'upload' ? '↑ Uploading' : '↓ Downloading';
  sftpStatusMsg.textContent = `${dir}  ${formatBytes(transferred)} / ${formatBytes(total)}`;
});

function setSftpStatus(msg) {
  sftpStatusMsg.textContent = msg;
}

function setSftpProgress(pct, msg) {
  if (pct === null) {
    sftpProgressWrap.classList.add('hidden');
    sftpProgressBar.style.width = '0%';
    sftpProgressLabel.textContent = '0%';
  } else {
    sftpProgressWrap.classList.remove('hidden');
    sftpProgressBar.style.width = pct + '%';
    sftpProgressLabel.textContent = pct + '%';
  }
  if (msg !== undefined) setSftpStatus(msg);
}

function renderBreadcrumb(path) {
  if (!sftpBreadcrumb) return;
  const parts = path.split('/').filter(Boolean);
  let html = `<span class="sftp-bc-seg sftp-bc-root" data-path="/">/</span>`;
  let built = '';
  parts.forEach((p, i) => {
    built += '/' + p;
    const fullPath = built;
    html += `<span class="sftp-bc-sep">›</span><span class="sftp-bc-seg" data-path="${fullPath}">${p}</span>`;
  });
  sftpBreadcrumb.innerHTML = html;
  sftpBreadcrumb.querySelectorAll('.sftp-bc-seg').forEach(seg => {
    seg.onclick = () => {
      currentSftpPath = seg.dataset.path;
      sftpPathInput.value = currentSftpPath;
      loadSftpDirectory(currentSftpPath);
    };
  });
}

async function openSftpPanel() {
  if (!currentTabId) {
    showToast('Connect to a firewall first!', 'error');
    return;
  }
  // Show SFTP panel alongside terminal (split layout)
  sftpPanel.classList.remove('hidden');
  terminalsEl.classList.add('with-sftp');

  // Re-fit the terminal so it resizes to the 2/3 width
  const t = activeTabs.find(x => x.id === currentTabId);
  if (t) setTimeout(() => t.fitAddon.fit(), 80);

  // Start keepalive timer
  if (sftpKeepaliveTimer) clearInterval(sftpKeepaliveTimer);
  sftpKeepaliveTimer = setInterval(() => {
    if (currentTabId) api.sftpKeepalive(currentTabId);
  }, 8000);

  await loadSftpDirectory(currentSftpPath);
}

function closeSftpPanel() {
  sftpPanel.classList.add('hidden');
  terminalsEl.classList.remove('with-sftp');
  if (sftpKeepaliveTimer) { clearInterval(sftpKeepaliveTimer); sftpKeepaliveTimer = null; }
  // Re-fit terminal back to full width
  if (currentTabId) {
    const t = activeTabs.find(x => x.id === currentTabId);
    if (t) setTimeout(() => { t.fitAddon.fit(); t.term.focus(); }, 80);
  }
}


async function loadSftpDirectory(dirPath) {
  setSftpStatus(`Loading ${dirPath}...`);
  setSftpProgress(null);
  sftpFileList.innerHTML = '<div style="padding:20px;text-align:center;color:#555;font-size:12px;">Loading...</div>';
  renderBreadcrumb(dirPath);
  sftpPathInput.value = dirPath;
  try {
    let list = await api.sftpList(currentTabId, dirPath);
    list.sort((a, b) => {
      if (a.attrs.isDirectory && !b.attrs.isDirectory) return -1;
      if (!a.attrs.isDirectory && b.attrs.isDirectory) return 1;
      return a.filename.localeCompare(b.filename);
    });

    sftpFileList.innerHTML = '';

    // ".." row
    if (dirPath !== '/') {
      const upItem = document.createElement('div');
      upItem.className = 'sftp-file-item sftp-file-dir';
      upItem.innerHTML = `<span class="sftp-file-icon">${iconFolder()}</span><span class="sftp-file-name">..</span>`;
      upItem.onclick = () => {
        const parts = currentSftpPath.split('/').filter(Boolean);
        parts.pop();
        currentSftpPath = '/' + parts.join('/');
        if (!currentSftpPath.startsWith('/')) currentSftpPath = '/';
        sftpPathInput.value = currentSftpPath;
        loadSftpDirectory(currentSftpPath);
      };
      sftpFileList.appendChild(upItem);
    }

    list.forEach(item => {
      const isDir = item.attrs.isDirectory;
      const el = document.createElement('div');
      el.className = 'sftp-file-item' + (isDir ? ' sftp-file-dir' : '');
      const sizeStr = isDir ? '' : formatBytes(item.attrs.size);
      const mtime = item.attrs.mtime ? new Date(item.attrs.mtime * 1000).toLocaleDateString() : '';
      el.innerHTML = `
        <span class="sftp-file-icon">${isDir ? iconFolder() : iconFile()}</span>
        <span class="sftp-file-name" title="${item.filename}">${item.filename}</span>
        <span class="sftp-file-mtime">${mtime}</span>
        <span class="sftp-file-size">${sizeStr}</span>
        <div class="sftp-file-actions">
          ${!isDir ? `<button class="sftp-act-btn sftp-dl-btn" title="Download"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download</button>` : ''}
        </div>`;

      if (isDir) {
        el.ondblclick = () => {
          currentSftpPath = (currentSftpPath.endsWith('/') ? currentSftpPath : currentSftpPath + '/') + item.filename;
          sftpPathInput.value = currentSftpPath;
          loadSftpDirectory(currentSftpPath);
        };
        el.onclick = (e) => {
          // Single click highlights
          sftpFileList.querySelectorAll('.sftp-file-item').forEach(r => r.classList.remove('selected'));
          el.classList.add('selected');
        };
      }

      const dlBtn = el.querySelector('.sftp-dl-btn');
      if (dlBtn) {
        dlBtn.onclick = async (e) => {
          e.stopPropagation();
          const remoteFile = (currentSftpPath.endsWith('/') ? currentSftpPath : currentSftpPath + '/') + item.filename;
          const pathModule = require('path');
          const os = require('os');
          const destPath = pathModule.join(os.homedir(), 'Downloads', item.filename);
          setSftpStatus(`↓ Downloading ${item.filename}...`);
          setSftpProgress(0);
          try {
            await api.sftpDownload(currentTabId, remoteFile, destPath);
            setSftpProgress(100, `✓ Downloaded to ~/Downloads/${item.filename}`);
            setTimeout(() => setSftpProgress(null, `${list.length} items`), 4000);
            showToast(`Downloaded ${item.filename}`);
          } catch(err) {
            setSftpProgress(null, `✗ Download failed: ${err}`);
            showToast(`Download failed: ${err}`, 'error');
          }
        };
      }

      sftpFileList.appendChild(el);
    });

    setSftpStatus(`${list.length} items  —  ${dirPath}`);
  } catch(err) {
    const errStr = String(err);
    // "Packet length XXXXXXX exceeds max length of 262144" is a well-known ssh2
    // symptom: the server is sending ASCII text (e.g. a shell banner or login
    // message) instead of binary SFTP protocol data.  This is NOT a ShellPoint
    // bug — it is a server-side misconfiguration on the Gaia firewall.
    const isPacketLengthError = /packet length \d+ exceeds max/i.test(errStr);

    if (isPacketLengthError) {
      sftpFileList.innerHTML = `
        <div style="padding:24px 20px;color:var(--text-main);font-size:13px;line-height:1.7;max-width:480px;margin:0 auto;">
          <div style="color:var(--accent);font-size:15px;font-weight:700;margin-bottom:12px;">
            ⚠ SFTP subsystem not available on this host
          </div>
          <p style="margin-bottom:10px;">
            The firewall is returning <strong>plain text</strong> instead of binary SFTP data.
            This is a <strong>server-side issue</strong>, not a ShellPoint bug.
          </p>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Likely causes on Gaia:</p>
          <ul style="color:var(--text-muted);font-size:12px;padding-left:16px;margin-bottom:14px;line-height:2;">
            <li>The SFTP subsystem is disabled in <code style="color:var(--blue);">/etc/ssh/sshd_config</code></li>
            <li>The shell profile (<code style="color:var(--blue);">~/.bashrc</code> / <code style="color:var(--blue);">~/.profile</code>) prints text to stdout on login</li>
            <li>The user's default shell is <code style="color:var(--blue);">clish</code> which does not support SFTP</li>
          </ul>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Quick fix (run in terminal):</p>
          <code style="display:block;background:#111;border:1px solid #333;border-radius:4px;padding:8px 12px;font-size:12px;color:var(--blue);white-space:pre;margin-bottom:6px;">grep -i sftp /etc/ssh/sshd_config</code>
          <p style="font-size:11px;color:var(--text-dim);">
            Make sure the line <code style="color:var(--blue);">Subsystem sftp /usr/lib/openssh/sftp-server</code> (or similar) is present and uncommented.
          </p>
          <p style="font-size:11px;color:var(--text-dim);margin-top:8px;">Technical detail: ${errStr}</p>
        </div>`;
      setSftpStatus('✗ SFTP subsystem unavailable on this host');
      showToast('SFTP not available — see panel for details', 'error');
    } else {
      sftpFileList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--accent);font-size:13px;">✗ ${err}</div>`;
      setSftpStatus(`Error loading directory`);
    }
  }
}

async function sftpUploadFiles(fileList) {
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    const remotePath = (currentSftpPath.endsWith('/') ? currentSftpPath : currentSftpPath + '/') + f.name;
    setSftpStatus(`↑ Uploading ${f.name} (${i+1}/${fileList.length})...`);
    setSftpProgress(0);
    try {
      await api.sftpUpload(currentTabId, f.path, remotePath);
      setSftpProgress(100, `✓ Uploaded ${f.name}`);
      showToast(`Uploaded ${f.name}`);
      await new Promise(r => setTimeout(r, 400));
    } catch(err) {
      setSftpProgress(null, `✗ Upload failed: ${err}`);
      showToast(`Upload failed: ${err}`, 'error');
    }
  }
  setSftpProgress(null);
  loadSftpDirectory(currentSftpPath);
}

function iconFolder() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
}
function iconFile() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}


// Drag & Drop
if (sftpDropZone) {
  sftpDropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    sftpDropOverlay.classList.remove('hidden');
    sftpDropOverlay.classList.add('active');
  });
  sftpDropZone.addEventListener('dragleave', (e) => {
    e.preventDefault(); e.stopPropagation();
    sftpDropOverlay.classList.add('hidden');
    sftpDropOverlay.classList.remove('active');
  });
  sftpDropZone.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation();
    sftpDropOverlay.classList.add('hidden');
    sftpDropOverlay.classList.remove('active');
    if (!currentTabId) return;
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    await sftpUploadFiles(Array.from(files));
  });
}

// =============================================
// LISTENERS
// =============================================
function setupListeners() {
  btnAddHost.onclick    = openAddModal;
  btnHostCancel.onclick = () => modalHost.classList.add('hidden');
  document.getElementById('btn-host-cancel-2')?.addEventListener('click', () => modalHost.classList.add('hidden'));

  // Auth type hint
  const authTypeHints = {
    'password': '',
    'push-2fa': 'A push notification will be sent to your device. Approve it to connect.',
    'otp-2fa':  'You will be prompted to enter your OTP/token code after the password.',
  };
  const authTypeSelect = document.getElementById('host-auth-type');
  const authTypeHint   = document.getElementById('auth-type-hint');
  if (authTypeSelect && authTypeHint) {
    authTypeSelect.addEventListener('change', () => {
      authTypeHint.textContent = authTypeHints[authTypeSelect.value] || '';
    });
  }



  // Welcome screen action cards
  document.getElementById('tip-add-host')?.addEventListener('click', () => {
    openAddModal();
  });
  document.getElementById('tip-connect')?.addEventListener('click', () => {
    // Pulse the host list sidebar to highlight it
    const sidebar = document.querySelector('.sidebar-left');
    if (sidebar) {
      sidebar.classList.remove('sidebar-pulse');
      void sidebar.offsetWidth; // reflow to restart animation
      sidebar.classList.add('sidebar-pulse');
      setTimeout(() => sidebar.classList.remove('sidebar-pulse'), 1300);
    }
  });
  document.getElementById('tip-commands')?.addEventListener('click', () => {
    // Pulse the commands sidebar and focus its search
    const sidebar = document.querySelector('.sidebar-right');
    if (sidebar) {
      sidebar.classList.remove('sidebar-pulse');
      void sidebar.offsetWidth;
      sidebar.classList.add('sidebar-pulse');
      setTimeout(() => sidebar.classList.remove('sidebar-pulse'), 1300);
    }
    document.getElementById('cmd-search')?.focus();
  });



  // Host Image logic
  function resizeImage(file, maxSize) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxSize) { height *= maxSize / width; width = maxSize; }
          } else {
            if (height > maxSize) { width *= maxSize / height; height = maxSize; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const hostImageInput = document.getElementById('host-image');
  const hostImagePreview = document.getElementById('host-image-preview');
  const hostImagePlaceholder = document.getElementById('host-image-placeholder');
  const btnRemoveHostImage = document.getElementById('btn-remove-host-image');

  if (hostImageInput) {
    hostImageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const b64 = await resizeImage(file, 256); // max 256px width/height for thumbnails
        currentHostImageBase64 = b64;
        hostImagePreview.src = b64;
        hostImagePreview.style.display = 'block';
        hostImagePlaceholder.style.display = 'none';
        btnRemoveHostImage.style.display = 'inline-block';
      } catch(err) {
        console.error('Image resize error:', err);
      }
    });
  }
  if (btnRemoveHostImage) {
    btnRemoveHostImage.addEventListener('click', () => {
      currentHostImageBase64 = null;
      hostImagePreview.src = '';
      hostImagePreview.style.display = 'none';
      hostImagePlaceholder.style.display = 'flex';
      btnRemoveHostImage.style.display = 'none';
      hostImageInput.value = '';
    });
  }

  btnCmdCancel.onclick  = () => { modalCmd.classList.add('hidden'); pendingCmd = null; };
  document.getElementById('btn-cmd-cancel-2')?.addEventListener('click', () => { modalCmd.classList.add('hidden'); pendingCmd = null; });

  // Quick Connect
  let pendingQcHost = null;
  const quickConnectInput = document.getElementById('quick-connect-input');
  const modalQcPassword   = document.getElementById('modal-qc-password');
  const formQcPassword    = document.getElementById('form-qc-password');
  const qcPasswordDesc    = document.getElementById('qc-password-desc');
  const qcPasswordInput   = document.getElementById('qc-password-input');

  function openQcPasswordModal(hostObj) {
    pendingQcHost = hostObj;
    qcPasswordDesc.innerText = `Connecting to ${hostObj.user}@${hostObj.ip}:${hostObj.port}`;
    qcPasswordInput.value = '';
    modalQcPassword.classList.remove('hidden');
    setTimeout(() => qcPasswordInput.focus(), 80);
  }

  function closeQcPasswordModal() {
    modalQcPassword.classList.add('hidden');
    pendingQcHost = null;
    qcPasswordInput.value = '';
  }

  document.getElementById('btn-qc-password-cancel')?.addEventListener('click', closeQcPasswordModal);
  document.getElementById('btn-qc-password-cancel-2')?.addEventListener('click', closeQcPasswordModal);

  if (formQcPassword) {
    formQcPassword.onsubmit = (e) => {
      e.preventDefault();
      if (!pendingQcHost) return;
      const host = { ...pendingQcHost, _qcPassword: qcPasswordInput.value };
      closeQcPasswordModal();
      openTab(host);
    };
  }

  if (quickConnectInput) {
    quickConnectInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = quickConnectInput.value.trim();
        if (!val) return;
        let user = 'admin';
        let ip = val;
        let port = 22;
        if (val.includes('@')) {
          const parts = val.split('@');
          user = parts[0];
          ip = parts[1];
        }
        if (ip.includes(':')) {
          const parts = ip.split(':');
          ip = parts[0];
          port = parseInt(parts[1], 10);
        }
        const hostObj = {
          id: 'qc_' + Date.now(),
          name: ip,
          ip,
          port,
          user
        };
        quickConnectInput.value = '';
        openQcPasswordModal(hostObj);
      }
    });
  }

  // SFTP panel
  document.getElementById('btn-open-sftp').onclick = openSftpPanel;
  document.getElementById('btn-sftp-back').onclick  = closeSftpPanel;
  document.getElementById('btn-sftp-refresh').onclick = () => loadSftpDirectory(currentSftpPath);
  document.getElementById('btn-sftp-up').onclick = () => {
    if (currentSftpPath === '/') return;
    const parts = currentSftpPath.split('/').filter(Boolean);
    parts.pop();
    currentSftpPath = '/' + parts.join('/');
    if (!currentSftpPath.startsWith('/')) currentSftpPath = '/';
    sftpPathInput.value = currentSftpPath;
    loadSftpDirectory(currentSftpPath);
  };
  sftpPathInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      currentSftpPath = sftpPathInput.value.trim();
      if (!currentSftpPath.startsWith('/')) currentSftpPath = '/' + currentSftpPath;
      loadSftpDirectory(currentSftpPath);
    }
  };
  const sftpUploadInput = document.getElementById('sftp-upload-input');
  document.getElementById('btn-sftp-upload-file').onclick = () => sftpUploadInput.click();
  sftpUploadInput.onchange = async (e) => {
    if (!currentTabId || !e.target.files.length) return;
    await sftpUploadFiles(Array.from(e.target.files));
    sftpUploadInput.value = '';
  };

  // Flags modal buttons
  document.getElementById('btn-flags-close').onclick  = closeFlagsModal;
  document.getElementById('btn-flags-cancel').onclick = closeFlagsModal;
  document.getElementById('btn-flags-insert').onclick = () => {
    const finalCmd = buildFlagCommand();
    closeFlagsModal();
    sendCmd(finalCmd);
  };


  cmdSearchEl.oninput = (e) => renderCommands(e.target.value);

  formHost.onsubmit = async (e) => {
    e.preventDefault();
    const id  = document.getElementById('host-id').value || 'host_' + Date.now();
    const pwd = document.getElementById('host-password').value;
    const hostData = {
      id,
      customer:   document.getElementById('host-customer').value.trim(),
      cluster:    document.getElementById('host-cluster').value.trim(),
      name:       document.getElementById('host-name').value.trim(),
      ip:         document.getElementById('host-ip').value.trim(),
      port:       parseInt(document.getElementById('host-port').value) || 22,
      user:       document.getElementById('host-user').value.trim(),
      privateKey: document.getElementById('host-key').value.trim(),
      webUIPort:  parseInt(document.getElementById('host-webui-port').value) || 4434,
      authType:   document.getElementById('host-auth-type').value || 'password',
      image:      currentHostImageBase64
    };
    if (pwd) await api.keytarSet(id, pwd);
    const idx = hosts.findIndex(h => h.id === id);
    if (idx >= 0) hosts[idx] = hostData; else hosts.push(hostData);
    await api.storeSet('hosts', hosts);
    modalHost.classList.add('hidden');
    renderHosts();
    showToast(`Host "${hostData.name}" saved!`);
  };

  formCmd.onsubmit = (e) => {
    e.preventDefault();
    if (!pendingCmd) return;
    let final = pendingCmd.cmd;
    pendingCmd.params.forEach(p => {
      const val = document.getElementById(`param-${p.name}`)?.value || '';
      final = final.replace(`{${p.name}}`, val);
    });
    modalCmd.classList.add('hidden');
    sendCmd(final);
    pendingCmd = null;
  };

  window.onresize = () => {
    if (splitView) {
      splitView.ids.forEach(id => {
        const t = activeTabs.find(x => x.id === id);
        if (t) t.fitAddon.fit();
      });
    } else {
      const t = activeTabs.find(x => x.id === currentTabId);
      if (t) t.fitAddon.fit();
    }
  };

  // Custom command modal form
  const formCustomCmd = document.getElementById('form-custom-cmd');
  if (formCustomCmd) {
    formCustomCmd.onsubmit = async (e) => {
      e.preventDefault();
      const id    = document.getElementById('custom-cmd-id').value || 'cc_' + Date.now();
      const label = document.getElementById('custom-cmd-label').value.trim();
      const cmd   = document.getElementById('custom-cmd-cmd').value.trim();
      const desc  = document.getElementById('custom-cmd-desc').value.trim();
      await saveCustomCommand({ id, label, cmd, desc });
      closeCustomCmdModal();
      showToast(`Command "${label}" saved!`);
    };
  }
  const btnCustomCmdClose = document.getElementById('btn-custom-cmd-close');
  if (btnCustomCmdClose) btnCustomCmdClose.onclick = closeCustomCmdModal;
  const modalCustomCmd = document.getElementById('modal-custom-cmd');
  const btnHome = document.getElementById('btn-home');
  if (btnHome) btnHome.onclick = goHome;

  const brandLogoBtn = document.getElementById('brand-logo-btn');
  const modalAbout = document.getElementById('modal-about');
  const btnAboutClose = document.getElementById('btn-about-close');

  if (brandLogoBtn) brandLogoBtn.onclick = () => { if (modalAbout) modalAbout.classList.remove('hidden'); };
  if (btnAboutClose) btnAboutClose.onclick = () => { if (modalAbout) modalAbout.classList.add('hidden'); };

  const btnOpenSk = document.getElementById('btn-open-sk');
  const btnSkClose = document.getElementById('btn-sk-close');
  const modalSk = document.getElementById('modal-sk');

  if (btnOpenSk) btnOpenSk.onclick = openSKModal;
  if (btnSkClose) btnSkClose.onclick = closeSKModal;

  // Custom SK Modal
  const btnAddCustomSK = document.getElementById('btn-add-custom-sk');
  if (btnAddCustomSK) btnAddCustomSK.onclick = () => openCustomSKModal();

  const formCustomSK = document.getElementById('form-custom-sk');
  if (formCustomSK) {
    formCustomSK.onsubmit = async (e) => {
      e.preventDefault();
      const id    = document.getElementById('custom-sk-id').value || 'csk_' + Date.now();
      const title = document.getElementById('custom-sk-title').value.trim();
      let skCode  = document.getElementById('custom-sk-code').value.trim();
      if (/^\d+$/.test(skCode)) skCode = 'sk' + skCode;
      
      await saveCustomSK({ id, title, sk: skCode });
      closeCustomSKModal();
      showToast(`SK "${title}" saved!`);
    };
  }
  const btnCustomSKClose = document.getElementById('btn-custom-sk-close');
  const btnCustomSKCancel = document.getElementById('btn-custom-sk-cancel');
  if (btnCustomSKClose) btnCustomSKClose.onclick = closeCustomSKModal;
  if (btnCustomSKCancel) btnCustomSKCancel.onclick = closeCustomSKModal;
  
  const modalCustomSK = document.getElementById('modal-custom-sk');

  // Settings
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnSettingsClose = document.getElementById('btn-settings-close');
  const btnSettingsSave = document.getElementById('btn-settings-save');
  const modalSettings = document.getElementById('modal-settings');

  if (btnOpenSettings) btnOpenSettings.onclick = openSettingsModal;
  if (btnSettingsClose) btnSettingsClose.onclick = closeSettingsModal;
  if (btnSettingsSave) btnSettingsSave.onclick = saveSettings;
  
  const fontSizeInput = document.getElementById('setting-font-size');
  if (fontSizeInput) {
    fontSizeInput.oninput = (e) => {
      document.getElementById('font-size-val').innerText = e.target.value + 'px';
    };
  }

  document.querySelectorAll('.color-option').forEach(opt => {
    opt.onclick = () => {
      document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      currentAccentColor = opt.dataset.color;
    };
  });


}

// =============================================
// KNOWLEDGE BASE (SK) LOGIC
// =============================================
async function loadCustomSKs() {
  customSKs = (await api.storeGet('custom-sks')) || [];
}

async function saveCustomSK(data) {
  const existing = customSKs.findIndex(c => c.id === data.id);
  if (existing >= 0) {
    customSKs[existing] = data;
  } else {
    customSKs.push(data);
  }
  await api.storeSet('custom-sks', customSKs);
  renderSK();
}

async function deleteCustomSK(id) {
  if (!confirm('Delete this custom SK?')) return;
  customSKs = customSKs.filter(c => c.id !== id);
  await api.storeSet('custom-sks', customSKs);
  renderSK();
  showToast('SK deleted', 'info');
}

function renderSK() {
  const skListEl = document.getElementById('sk-list');
  if (!skListEl) return;
  skListEl.innerHTML = '';
  
  if (typeof cpGuides === 'undefined') return;

  const allCategories = [];
  if (customSKs && customSKs.length > 0) {
    allCategories.push({
      category: "★ My SKs",
      isCustom: true,
      links: customSKs
    });
  }
  allCategories.push(...cpGuides);

  allCategories.forEach(cat => {
    const group = document.createElement('div');
    group.className = 'sk-cat-group';
    group.innerHTML = `<div class="sk-cat-title">${cat.category}</div>`;
    
    const grid = document.createElement('div');
    grid.className = 'sk-grid';
    
    cat.links.forEach(link => {
      const item = document.createElement('a');
      item.className = 'sk-item';
      item.href = '#';

      let innerContent = `
        <span class="sk-item-title">${link.title}</span>
        <span class="sk-item-code">${link.sk}</span>
      `;

      if (cat.isCustom) {
        innerContent += `
          <span class="cmd-custom-actions" style="position:absolute; right:8px; top:8px; display:none;">
            <span class="cmd-custom-edit" title="Edit">⚙️</span>
          </span>
        `;
      }
      
      item.innerHTML = innerContent;
      
      if (cat.isCustom) {
        const editBtn = item.querySelector('.cmd-custom-edit');
        if (editBtn) {
          item.style.position = 'relative';
          item.addEventListener('mouseenter', () => editBtn.style.display = 'block');
          item.addEventListener('mouseleave', () => editBtn.style.display = 'none');
          editBtn.onclick = (e) => {
             e.stopPropagation();
             e.preventDefault();
             openCustomSKModal(link);
          };
        }
      }

      item.onclick = (e) => {
        if(e.target.classList.contains('cmd-custom-edit')) return;
        e.preventDefault();
        
        let finalUrl = link.url;
        if (link.sk && link.sk.toLowerCase().startsWith('sk')) {
          finalUrl = `https://support.checkpoint.com/results/sk/${link.sk.toLowerCase()}`;
        }
        
        if (finalUrl) require('electron').shell.openExternal(finalUrl);
      };
      
      grid.appendChild(item);
    });
    
    group.appendChild(grid);
    skListEl.appendChild(group);
  });
}

let pendingCustomSK = null;
function openCustomSKModal(sk) {
  pendingCustomSK = sk || null;
  const modal = document.getElementById('modal-custom-sk');
  if (!modal) return;
  document.getElementById('custom-sk-id').value    = sk?.id || '';
  document.getElementById('custom-sk-title').value = sk?.title || '';
  document.getElementById('custom-sk-code').value  = sk?.sk || '';

  const delBtn = document.getElementById('btn-custom-sk-delete');
  if (delBtn) {
    if (sk) {
      delBtn.style.display = 'block';
      delBtn.onclick = async () => {
        await deleteCustomSK(sk.id);
        closeCustomSKModal();
      };
    } else {
      delBtn.style.display = 'none';
      delBtn.onclick = null;
    }
  }

  modal.classList.remove('hidden');
  document.getElementById('custom-sk-title').focus();
}

function closeCustomSKModal() {
  document.getElementById('modal-custom-sk')?.classList.add('hidden');
  pendingCustomSK = null;
}

function openSKModal() { 
  const m = document.getElementById('modal-sk');
  if(m) m.classList.remove('hidden'); 
}
function closeSKModal() { 
  const m = document.getElementById('modal-sk');
  if(m) m.classList.add('hidden'); 
}

// =============================================
// SETTINGS LOGIC
// =============================================
async function loadSettings() {
  let settings = await api.storeGet('settings');
  if (!settings) {
    settings = { fontSize: 14, accentColor: '#E51261' };
  } else if (settings.accentColor === '#e8192c' || settings.accentColor === '#E81988') {
    // Force upgrade old Check Point colors to exact Check Point Pink
    settings.accentColor = '#E51261';
    await api.storeSet('settings', settings);
  }
  
  currentFontSize = settings.fontSize;
  currentAccentColor = settings.accentColor;
  
  const fsInput = document.getElementById('setting-font-size');
  const fsVal = document.getElementById('font-size-val');
  if (fsInput && fsVal) {
    fsInput.value = currentFontSize;
    fsVal.innerText = currentFontSize + 'px';
  }
  
  const opt = document.querySelector(`.color-option[data-color="${currentAccentColor}"]`);
  if (opt) {
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  }
  
  applySettings();
}

function applySettings() {
  document.documentElement.style.setProperty('--accent', currentAccentColor);
  document.documentElement.style.setProperty('--accent-hover', adjustColor(currentAccentColor, 20));
  document.documentElement.style.setProperty('--accent-dim', currentAccentColor + '26');
  
  activeTabs.forEach(tab => {
    if (tab.terminal) {
      tab.terminal.options.fontSize = currentFontSize;
      tab.fitAddon.fit();
    }
  });
}

async function saveSettings() {
  const fsInput = document.getElementById('setting-font-size');
  if (fsInput) {
    currentFontSize = parseInt(fsInput.value);
  }
  
  await api.storeSet('settings', {
    fontSize: currentFontSize,
    accentColor: currentAccentColor
  });
  
  applySettings();
  closeSettingsModal();
  showToast('Settings saved and applied!');
}

function openSettingsModal() { 
  const m = document.getElementById('modal-settings');
  if (m) m.classList.remove('hidden'); 
}
function closeSettingsModal() { 
  const m = document.getElementById('modal-settings');
  if (m) m.classList.add('hidden'); 
}

function adjustColor(col, amt) {
  let usePound = false;
  if (col[0] == "#") { col = col.slice(1); usePound = true; }
  let num = parseInt(col,16);
  let r = (num >> 16) + amt;
  if (r > 255) r = 255; else if  (r < 0) r = 0;
  let b = ((num >> 8) & 0x00FF) + amt;
  if (b > 255) b = 255; else if  (b < 0) b = 0;
  let g = (num & 0x0000FF) + amt;
  if (g > 255) g = 255; else if  (g < 0) g = 0;
  return (usePound?"#":"") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

// START
init();

// =============================================
// CLUSTER SPLIT SCREEN
// =============================================
// ── Cluster split (called from sidebar cluster button) ──────────────────────
async function openClusterSplit(host1, host2) {
  if (!activeTabs.find(t => t.id === host1.id)) await openTab(host1);
  if (!activeTabs.find(t => t.id === host2.id)) await openTab(host2);
  openSplitView([host1.id, host2.id]);
  showToast(`Split: ${host1.name} | ${host2.name}`, 'info');
}

// ── Generic split view — accepts an array of 2–4 tab ids ────────────────────
function openSplitView(ids) {
  exitSplitView();

  const container = document.getElementById('terminals-container');
  container.classList.add('split-view');
  // Add a modifier class for 3 or 4 panes
  if (ids.length === 3) container.classList.add('split-view-3');
  if (ids.length === 4) container.classList.add('split-view-4');
  splitView = { ids };

  // Hide all wrappers, then show only the split ones
  document.querySelectorAll('.terminal-wrapper').forEach(w => {
    w.classList.remove('active');
    w.style.display = 'none';
  });

  ids.forEach(id => {
    const w = document.getElementById(`term-${id}`);
    if (!w) return;
    w.classList.add('split-pane');
    w.style.display = '';

    // Label
    let lbl = w.querySelector('.split-label');
    if (!lbl) {
      lbl = document.createElement('div');
      lbl.className = 'split-label';
      w.insertBefore(lbl, w.firstChild);
    }
    const tab = activeTabs.find(t => t.id === id);
    lbl.textContent = tab?.host?._sessionLabel || tab?.host?.name || id;

    // Click label to set this pane as the focused/active one
    lbl.onclick = () => {
      currentTabId = id;
      document.querySelectorAll('.split-pane').forEach(p => p.classList.remove('split-active'));
      w.classList.add('split-active');
      const t = activeTabs.find(x => x.id === id);
      if (t) t.term.focus();
    };
  });

  // Auto-activate first pane
  const firstW = document.getElementById(`term-${ids[0]}`);
  if (firstW) firstW.classList.add('split-active');

  // Exit button
  let exitBtn = document.getElementById('btn-exit-split');
  if (!exitBtn) {
    exitBtn = document.createElement('button');
    exitBtn.id = 'btn-exit-split';
    exitBtn.className = 'btn-top btn-exit-split';
    exitBtn.onclick = exitSplitView;
    document.querySelector('.tabs-actions').prepend(exitBtn);
  }
  exitBtn.textContent = `[⊠] Exit Split (${ids.length})`;
  exitBtn.style.display = '';

  currentTabId = ids[0];

  setTimeout(() => {
    ids.forEach(id => {
      const t = activeTabs.find(x => x.id === id);
      if (t) t.fitAddon.fit();
    });
  }, 100);
}

function exitSplitView() {
  if (!splitView) return;
  const container = document.getElementById('terminals-container');
  container.classList.remove('split-view', 'split-view-3', 'split-view-4');

  document.querySelectorAll('.split-pane').forEach(w => {
    w.classList.remove('split-pane');
    w.style.display = '';
  });
  document.querySelectorAll('.split-label').forEach(l => l.remove());

  splitView = null;

  if (activeTabs.length) activateTab(activeTabs[activeTabs.length - 1].id);

  const btn = document.getElementById('btn-exit-split');
  if (btn) btn.style.display = 'none';
}

// =============================================
// CUSTOM COMMANDS
// =============================================
async function loadCustomCommands() {
  customCommands = (await api.storeGet('custom-commands')) || [];
}

async function saveCustomCommand(data) {
  const existing = customCommands.findIndex(c => c.id === data.id);
  if (existing >= 0) {
    customCommands[existing] = data;
  } else {
    customCommands.push(data);
  }
  await api.storeSet('custom-commands', customCommands);
  renderCommands(cmdSearchEl.value);
}

async function deleteCustomCommand(id) {
  if (!confirm('Delete this custom command?')) return;
  customCommands = customCommands.filter(c => c.id !== id);
  await api.storeSet('custom-commands', customCommands);
  renderCommands(cmdSearchEl.value);
  showToast('Command deleted', 'info');
}

let pendingCustomCmd = null;
function openCustomCmdModal(cmd) {
  pendingCustomCmd = cmd || null;
  const modal = document.getElementById('modal-custom-cmd');
  if (!modal) return;
  document.getElementById('custom-cmd-id').value    = cmd?.id || '';
  document.getElementById('custom-cmd-label').value = cmd?.label || '';
  document.getElementById('custom-cmd-cmd').value   = cmd?.cmd || '';
  document.getElementById('custom-cmd-desc').value  = cmd?.desc || '';

  const delBtn = document.getElementById('btn-custom-cmd-delete');
  if (delBtn) {
    if (cmd) {
      delBtn.style.display = 'block';
      delBtn.onclick = async () => {
        await deleteCustomCommand(cmd.id);
        closeCustomCmdModal();
      };
    } else {
      delBtn.style.display = 'none';
      delBtn.onclick = null;
    }
  }

  modal.classList.remove('hidden');
  document.getElementById('custom-cmd-label').focus();
}
function closeCustomCmdModal() {
  document.getElementById('modal-custom-cmd')?.classList.add('hidden');
  pendingCustomCmd = null;
}
