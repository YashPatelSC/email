const state = {
  config: null
};

const el = {
  appName: document.getElementById('appName'),
  fromEmailPreview: document.getElementById('fromEmailPreview'),
  dataDir: document.getElementById('dataDir'),
  mailerForm: document.getElementById('mailerForm'),
  previewButton: document.getElementById('previewButton'),
  sendButton: document.getElementById('sendButton'),
  previewTo: document.getElementById('previewTo'),
  previewSubject: document.getElementById('previewSubject'),
  previewBody: document.getElementById('previewBody'),
  previewHtml: document.getElementById('previewHtml'),
  statusText: document.getElementById('statusText'),
  recentSends: document.getElementById('recentSends'),
  refreshSends: document.getElementById('refreshSends')
};

function renderRecentSends(sends) {
  if (!sends.length) {
    el.recentSends.innerHTML = '<div class="report-row">No send attempts logged yet.</div>';
    return;
  }

  el.recentSends.innerHTML = sends.map((send) => `
    <div class="report-row">
      <div><strong>${send.guest.firstName || ''} ${send.guest.lastName || ''}</strong> · ${send.guest.email}</div>
      <div>${send.rendered.subject}</div>
      <small>${new Date(send.attemptedAt).toLocaleString()} · <span class="badge ${send.status === 'sent' ? 'normal' : 'urgent'}">${send.status}</span></small>
      <small>${send.filePath || ''}</small>
      ${send.error ? `<small>${send.error}</small>` : ''}
    </div>
  `).join('');
}

function formPayload() {
  return Object.fromEntries(new FormData(el.mailerForm).entries());
}

async function loadConfig() {
  const response = await fetch('/api/config');
  state.config = await response.json();

  el.appName.textContent = state.config.appName;
  el.fromEmailPreview.textContent = state.config.defaults.fromEmail;
  el.dataDir.textContent = state.config.dataDir;

  el.mailerForm.elements.fromName.value = state.config.defaults.fromName;
  el.mailerForm.elements.fromEmail.value = state.config.defaults.fromEmail;
  el.mailerForm.elements.hotelName.value = state.config.defaults.hotelName;
  el.mailerForm.elements.feedbackUrl.value = state.config.defaults.feedbackUrl;
  el.mailerForm.elements.bookingUrl.value = state.config.defaults.bookingUrl;
  el.mailerForm.elements.logoUrl.value = state.config.defaults.logoUrl;
  el.mailerForm.elements.subject.value = state.config.defaults.subject;
  el.mailerForm.elements.body.value = state.config.defaults.body;

  renderRecentSends(state.config.recentSends || []);
  await previewEmail();
}

async function previewEmail() {
  const response = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formPayload())
  });

  const result = await response.json();
  if (!response.ok) {
    el.statusText.textContent = result.error || 'Preview failed.';
    return null;
  }

  el.previewTo.textContent = result.preview.guest.email || '--';
  el.previewSubject.textContent = result.preview.rendered.subject || '--';
  el.previewBody.textContent = result.preview.rendered.body || '--';
  el.previewHtml.innerHTML = result.preview.rendered.html || '--';
  el.statusText.textContent = 'Preview ready.';
  return result.preview;
}

async function refreshSends() {
  const response = await fetch('/api/sends/recent');
  const result = await response.json();
  renderRecentSends(result.sends || []);
}

el.previewButton.addEventListener('click', previewEmail);

el.sendButton.addEventListener('click', async () => {
  el.statusText.textContent = 'Sending...';
  const response = await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formPayload())
  });

  const result = await response.json();
  if (!response.ok) {
    el.statusText.textContent = result.attempt?.error || result.error || 'Send failed.';
    await refreshSends();
    return;
  }

  el.statusText.textContent = `Sent to ${result.attempt.guest.email}`;
  await previewEmail();
  await refreshSends();
});

el.mailerForm.addEventListener('input', () => {
  previewEmail().catch((error) => {
    el.statusText.textContent = error.message;
  });
});

el.refreshSends.addEventListener('click', refreshSends);

loadConfig().catch((error) => {
  el.statusText.textContent = `Load failed: ${error.message}`;
});
