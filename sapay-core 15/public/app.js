'use strict';
const $ = (id) => document.getElementById(id);
const state = { token: sessionStorage.getItem('sapay_access_token') || '', user: null, wallets: [], authMode: 'login' };
const money = (minor) => { try { return BigInt(minor || '0').toLocaleString('en-US'); } catch { return '0'; } };
const headers = () => ({ 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) });
async function api(path, options = {}) {
  const response = await fetch('/api' + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(data.message || 'تعذر إكمال الطلب. حاول مرة أخرى.');
  }
  return data;
}
function message(id, text, ok = false) { const el = $(id); el.textContent = text || ''; el.classList.toggle('success', !!ok); }
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function setAuthMode(mode) {
  state.authMode = mode;
  $('loginTab').classList.toggle('active', mode === 'login');
  $('registerTab').classList.toggle('active', mode === 'register');
  $('authTitle').textContent = mode === 'login' ? 'مرحبًا بعودتك' : 'أنشئ حساب SApay';
  $('authHint').textContent = mode === 'login' ? 'سجّل الدخول للوصول إلى محفظتك التجريبية.' : 'استخدم بريدًا تجريبيًا وكلمة مرور من 12 حرفًا على الأقل.';
  $('authSubmit').textContent = mode === 'login' ? 'دخول آمن' : 'إنشاء الحساب';
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  message('authMessage', '');
}
$('loginTab').addEventListener('click', () => setAuthMode('login'));
$('registerTab').addEventListener('click', () => setAuthMode('register'));
$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('authSubmit'); button.disabled = true; message('authMessage', 'جارٍ التحقق…');
  try {
    const result = await api('/auth/' + (state.authMode === 'login' ? 'login' : 'register'), { method: 'POST', body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }) });
    state.token = result.accessToken; state.user = result.user; sessionStorage.setItem('sapay_access_token', state.token);
    await showDashboard();
  } catch (error) { message('authMessage', error.message); }
  finally { button.disabled = false; }
});
function logout(show = true) {
  state.token = ''; state.user = null; state.wallets = []; sessionStorage.removeItem('sapay_access_token');
  $('appView').hidden = true; $('authView').hidden = false; $('logoutBtn').hidden = true;
  if (show) toast('تم تسجيل الخروج.');
}
$('logoutBtn').addEventListener('click', () => logout());
async function showDashboard() {
  $('authView').hidden = true; $('appView').hidden = false; $('logoutBtn').hidden = false;
  $('userEmail').textContent = state.user?.email || 'حسابك التجريبي';
  await refreshData();
}
async function refreshData() {
  $('wallets').innerHTML = '<div class="panel loading">جارٍ تحديث المحافظ…</div>';
  try {
    state.wallets = await api('/demo/wallets');
    const detailed = await Promise.all(state.wallets.map(async wallet => {
      try { return await api('/demo/wallets/' + encodeURIComponent(wallet.id)); }
      catch { return { ...wallet, balanceMinor: '0' }; }
    }));
    state.wallets = detailed;
    renderWallets();
    const totals = {};
    detailed.forEach(w => totals[w.currency] = (BigInt(totals[w.currency] || '0') + BigInt(w.balanceMinor || '0')).toString());
    $('totalBalance').innerHTML = Object.keys(totals).length ? Object.entries(totals).map(([currency, value]) => `<span class="total-currency" dir="ltr"><b>${money(value)}</b> <small>${escapeHtml(currency)}</small></span>`).join('<span class="total-separator">·</span>') : 'لا توجد محافظ بعد';
    await loadHistory();
  } catch (error) {
    $('wallets').innerHTML = '<div class="panel empty">' + escapeHtml(error.message) + '</div>';
    if (!state.token) logout(false);
  }
}
function renderWallets() {
  const root = $('wallets');
  if (!state.wallets.length) { root.innerHTML = '<div class="panel empty">لا توجد محافظ حتى الآن. أنشئ محفظتك الأولى للبدء.</div>'; return; }
  root.innerHTML = state.wallets.map(w => `<article class="wallet-card">
    <div class="wallet-head"><span class="currency-icon">${escapeHtml(w.currency.slice(0,2))}</span><span class="wallet-currency">${escapeHtml(w.currency)} · محفظة تجريبية</span></div>
    <div class="wallet-balance">${money(w.balanceMinor)} <small>${escapeHtml(w.currency)}</small></div>
    <div class="wallet-id">ID: ${escapeHtml(w.id)}</div>
    <div class="wallet-actions"><button class="outline-btn" data-credit="${escapeHtml(w.id)}">شحن تجريبي</button><button class="outline-btn" data-send="${escapeHtml(w.id)}">تحويل تجريبي</button></div>
  </article>`).join('');
  root.querySelectorAll('[data-credit]').forEach(btn => btn.addEventListener('click', () => openAction('credit', btn.dataset.credit)));
  root.querySelectorAll('[data-send]').forEach(btn => btn.addEventListener('click', () => openAction('transfer', btn.dataset.send)));
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function loadHistory() {
  try {
    const rows = await api('/ledger/journals'); const root = $('history');
    if (!rows.length) { root.innerHTML = '<p class="empty">لا توجد عمليات مسجلة حتى الآن.</p>'; return; }
    root.innerHTML = rows.slice(0, 20).map(row => {
      const credit = row.type === 'DEMO_CREDIT'; const posting = (row.postings || []).find(p => p.side === (credit ? 'CREDIT' : 'CREDIT')) || (row.postings || [])[0];
      const amount = posting?.amountMinor || '—'; const currency = posting?.currency || '';
      const date = row.createdAt ? new Date(row.createdAt).toLocaleString('ar') : '';
      return `<div class="history-item"><div><div class="history-title">${credit ? 'شحن رصيد تجريبي' : 'تحويل بين محافظ'}</div><div class="history-meta">${escapeHtml(date)} · ${escapeHtml(row.status || 'مكتمل')}</div></div><div class="history-amount ${credit ? 'credit' : 'debit'}">${money(amount)} ${escapeHtml(currency)}</div></div>`;
    }).join('');
  } catch (error) { $('history').innerHTML = '<p class="empty">' + escapeHtml(error.message) + '</p>'; }
}
$('createWalletBtn').addEventListener('click', () => { message('walletMessage',''); $('walletDialog').showModal(); });
$('walletForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await api('/demo/wallets', { method:'POST', body:JSON.stringify({ currency:$('currency').value }) }); $('walletDialog').close(); toast('تم إنشاء المحفظة.'); await refreshData(); }
  catch (error) { message('walletMessage', error.message); }
  finally { button.disabled = false; }
});
function openAction(type, walletId) {
  $('actionForm').reset(); message('actionMessage',''); $('actionType').value = type;
  $('actionTitle').textContent = type === 'credit' ? 'شحن رصيد تجريبي' : 'تحويل تجريبي بين المحافظ';
  $('destinationWrap').hidden = type === 'credit'; $('creditWrap').hidden = type !== 'credit';
  $('actionHint').textContent = type === 'credit' ? 'هذا الشحن افتراضي لأغراض الاختبار فقط، ولا يمثل إيداعًا ماليًا.' : 'الصق معرّف محفظة المستلم كما يظهر في البطاقة، ويمكنك لصق السطر كاملًا بما فيه ID:. لا يمكن التحويل إلا إلى محفظة نشطة بنفس العملة.';
  $('sourceWallet').innerHTML = state.wallets.map(w => `<option value="${escapeHtml(w.id)}" ${w.id === walletId ? 'selected' : ''}>${escapeHtml(w.currency)} · ${money(w.balanceMinor)}</option>`).join('');
  $('actionDialog').showModal();
}
$('actionForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const type = $('actionType').value; const walletId = $('sourceWallet').value; const amount = $('actionAmount').value;
  if (!/^[1-9][0-9]*$/.test(amount)) { message('actionMessage','أدخل مبلغًا صحيحًا أكبر من صفر.'); return; }
  const button = $('actionSubmit'); button.disabled = true; message('actionMessage','جارٍ تنفيذ العملية التجريبية…');
  try {
    if (type === 'credit') {
      const reference = $('creditReference').value.trim() || ('demo-' + crypto.randomUUID());
      await api('/demo/wallets/' + encodeURIComponent(walletId) + '/credit', { method:'POST', body:JSON.stringify({ amountMinor:amount, reference }) });
    } else {
      const destination = $('destinationWallet').value.trim().replace(/^ID\s*:\s*/i, '').trim();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!destination) throw new Error('أدخل معرّف محفظة المستلم.');
      if (!uuidPattern.test(destination)) throw new Error('معرّف المحفظة غير صحيح. الصق المعرّف كاملًا أو السطر الذي يبدأ بـ ID:.');
      const source = state.wallets.find(w => w.id === walletId);
      await api('/transfers', { method:'POST', headers:{'Idempotency-Key':crypto.randomUUID()}, body:JSON.stringify({ fromWalletId:walletId, toWalletId:destination, amountMinor:amount, currency:source.currency }) });
    }
    $('actionDialog').close(); toast('تم تسجيل العملية في قاعدة البيانات التجريبية.'); await refreshData();
  } catch (error) { message('actionMessage', error.message); }
  finally { button.disabled = false; }
});
$('refreshBtn').addEventListener('click', refreshData);
if (state.token) {
  api('/demo/wallets').then(async () => { state.user = { email: 'حسابك' }; await showDashboard(); }).catch(() => logout(false));
}
