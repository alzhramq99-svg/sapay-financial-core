'use strict';
const $ = (id) => document.getElementById(id);
const state = { token: sessionStorage.getItem('sapay_access_token') || '', user: null, wallets: [], authMode: 'login' };
let actionIdempotencyKey = '';
const money = (minor) => { try { return BigInt(minor || '0').toLocaleString('en-US'); } catch { return '0'; } };
const headers = () => ({ 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) });
const nativeRuntime = window.location.protocol === 'capacitor:';
const configuredApiBase = String(window.SAPAY_CONFIG?.apiBaseUrl || '').trim().replace(/\/+$/, '');
function apiOrigin() {
  const base = configuredApiBase || (nativeRuntime ? '' : window.location.origin);
  if (!base) throw new Error('لم يتم إعداد عنوان خادم SApay لهذا الإصدار التجريبي.');
  let url;
  try { url = new URL(base); } catch { throw new Error('عنوان خادم SApay غير صالح.'); }
  if ((nativeRuntime || url.origin !== window.location.origin) && url.protocol !== 'https:') {
    throw new Error('يجب استخدام اتصال HTTPS آمن مع خادم SApay.');
  }
  return url.origin;
}
async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(window.SAPAY_CONFIG?.requestTimeoutMs) || 20000);
  try {
    const response = await fetch(apiOrigin() + '/api' + path, {
      ...options, signal: controller.signal,
      headers: { ...headers(), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && state.token) {
        logout(false);
        throw new Error('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.');
      }
      if (response.status === 429) throw new Error('محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مجدداً.');
      if (response.status >= 500) throw new Error('الخادم يواجه مشكلة مؤقتة. حاول مرة أخرى بعد قليل.');
      throw new Error(data.message || 'تعذر إكمال الطلب. تحقق من البيانات وحاول مرة أخرى.');
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('استغرق الاتصال وقتاً أطول من المتوقع. قد يكون الخادم قيد التشغيل؛ حاول مجدداً.');
    if (error instanceof TypeError) throw new Error('تعذر الاتصال بخادم SApay. تحقق من الإنترنت ثم حاول مجدداً.');
    throw error;
  } finally { clearTimeout(timeout); }
}
function message(id, text, ok = false) { const el = $(id); el.textContent = text || ''; el.classList.toggle('success', !!ok); }
const biometricServer = 'sapay-financial-core';
async function configureFaceIdAfterLogin(email, password) {
  if (!window.SApayBiometric?.isNative) return;
  try {
    const available = await window.SApayBiometric.isAvailable();
    if (!available) return;
    if (window.confirm('هل تريد تفعيل تسجيل الدخول باستخدام Face ID على هذا الجهاز؟')) {
      await window.SApayBiometric.saveCredentials(email, password, biometricServer);
      message('biometricMessage', 'تم تفعيل Face ID لهذا الجهاز.', true);
    }
  } catch (error) {
    message('biometricMessage', 'تعذر تفعيل Face ID. يمكنك استخدام كلمة المرور كالمعتاد.');
  }
}
$('faceIdLogin').addEventListener('click', async () => {
  const button = $('faceIdLogin');
  button.disabled = true;
  message('biometricMessage', 'يرجى تأكيد هويتك عبر Face ID…');
  try {
    if (!window.SApayBiometric?.isNative) throw new Error('Face ID متاح داخل تطبيق iOS فقط.');
    const credentials = await window.SApayBiometric.getCredentials(biometricServer);
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: credentials.username, password: credentials.password }) });
    state.token = result.accessToken; state.user = result.user; sessionStorage.setItem('sapay_access_token', state.token);
    await showDashboard();
  } catch (error) {
    message('biometricMessage', error.message || 'تعذر تسجيل الدخول باستخدام Face ID.');
  } finally { button.disabled = false; }
});
async function initializeFaceId() {
  const button = $('faceIdLogin');
  if (!window.SApayBiometric?.isNative) return;
  try {
    if (await window.SApayBiometric.hasCredentials(biometricServer)) button.hidden = false;
  } catch { /* Keep password login available if biometric setup is unavailable. */ }
}
initializeFaceId();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!window.__sapaySwReloaded) { window.__sapaySwReloaded = true; window.location.reload(); }
  });
}
window.addEventListener('load', () => {
  if (navigator.onLine) api('/health').catch(() => {});
});

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
    if (state.authMode === 'login') {
      await configureFaceIdAfterLogin($('email').value.trim(), $('password').value);
      if (window.SApayBiometric?.isNative && await window.SApayBiometric.hasCredentials(biometricServer)) $('faceIdLogin').hidden = false;
    }
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
    <div class="wallet-actions"><button class="outline-btn" data-credit="${escapeHtml(w.id)}">شحن تجريبي</button><button class="outline-btn" data-send="${escapeHtml(w.id)}">تحويل داخلي</button></div>
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
      const title = credit ? 'شحن رصيد تجريبي' : row.type === 'EXTERNAL_TRANSFER' ? 'تحويل خارجي تجريبي (لم يُرسل)' : 'تحويل بين محافظ';
      return `<div class="history-item"><div><div class="history-title">${title}</div><div class="history-meta">${escapeHtml(date)} · ${escapeHtml(row.status || 'مكتمل')}</div></div><div class="history-amount ${credit ? 'credit' : 'debit'}">${money(amount)} ${escapeHtml(currency)}</div></div>`;
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
  $('actionForm').reset(); message('actionMessage',''); actionIdempotencyKey = crypto.randomUUID(); $('actionType').value = type;
  $('actionTitle').textContent = type === 'credit' ? 'شحن رصيد تجريبي' : type === 'external' ? 'تحويل خارجي تجريبي' : 'تحويل داخلي تجريبي';
  $('destinationWrap').hidden = type !== 'transfer'; $('creditWrap').hidden = type !== 'credit';
  $('externalModeWrap').hidden = type !== 'external'; $('externalFields').hidden = type !== 'external';
  $('externalCountryWrap').hidden = $('externalMode').value !== 'GLOBAL';
  $('actionHint').textContent = type === 'credit' ? 'هذا الشحن افتراضي لأغراض الاختبار فقط، ولا يمثل إيداعًا ماليًا.' : type === 'external' ? 'قيد محاسبي تجريبي فقط. لن يتم إرسال الأموال أو الاتصال بأي بنك أو شركة تحويل.' : 'اختر محفظة مستلم نشطة بنفس العملة. هذا تحويل داخلي بين محافظ SApay.';
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
    } else if (type === 'external') {
      const source = state.wallets.find(w => w.id === walletId);
      const mode = $('externalMode').value;
      const provider = $('externalProvider').value.trim();
      const beneficiaryName = $('externalBeneficiary').value.trim();
      const destinationReference = $('externalReference').value.trim();
      const destinationCountry = $('externalCountry').value.trim();
      if (!provider || !beneficiaryName || !/^DEMO-[A-Z0-9-]{4,60}$/i.test(destinationReference)) throw new Error('أدخل الجهة والمستفيد ومرجعًا وهميًا يبدأ بـ DEMO-.');
      if (mode === 'GLOBAL' && !destinationCountry) throw new Error('أدخل دولة المستفيد للتحويل الدولي التجريبي.');
      await api('/transfers/external', { method:'POST', headers:{'Idempotency-Key':actionIdempotencyKey}, body:JSON.stringify({ fromWalletId:walletId, amountMinor:amount, currency:source.currency, destinationType:mode, provider, beneficiaryName, destinationReference, destinationCountry }) });
    } else {
      const destination = $('destinationWallet').value.trim().replace(/^ID\s*:\s*/i, '').trim();
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!destination) throw new Error('أدخل معرّف محفظة المستلم.');
      if (!uuidPattern.test(destination)) throw new Error('معرّف المحفظة غير صحيح. الصق المعرّف كاملًا أو السطر الذي يبدأ بـ ID:.');
      const source = state.wallets.find(w => w.id === walletId);
      await api('/transfers', { method:'POST', headers:{'Idempotency-Key':actionIdempotencyKey}, body:JSON.stringify({ fromWalletId:walletId, toWalletId:destination, amountMinor:amount, currency:source.currency }) });
    }
    $('actionDialog').close(); toast(type === 'external' ? 'تم تسجيل التحويل الخارجي التجريبي دون إرساله.' : 'تم تسجيل العملية في قاعدة البيانات التجريبية.'); await refreshData();
  } catch (error) { message('actionMessage', error.message); }
  finally { button.disabled = false; }
});
$('refreshBtn').addEventListener('click', refreshData);
if (state.token) {
  api('/demo/wallets').then(async () => { state.user = { email: 'حسابك' }; await showDashboard(); }).catch(() => logout(false));
}

/* SApay multi-page experience: build page shell around existing live wallet modules */
(function installMultiPageExperience(){
  const root=$('appView');
  if(!root || root.dataset.multiPageReady==='1') return;
  root.dataset.multiPageReady='1';
  const notice=root.querySelector('.notice');
  const balance=root.querySelector('.balance-card');
  const walletHeading=root.querySelector('#createWalletBtn')?.closest('.section-heading');
  const wallets=$('wallets');
  const historyHeading=root.querySelector('#refreshBtn')?.closest('.section-heading');
  const history=$('history');
  const footer=root.querySelector('.footer-note');
  const nav=document.createElement('nav');
  nav.className='app-nav'; nav.setAttribute('aria-label','التنقل الرئيسي');
  const definitions=[['home','⌂','الرئيسية'],['wallets','◈','محافظي'],['transfers','⇄','التحويل'],['services','▦','الخدمات'],['history','◷','العمليات'],['support','?','المساعدة'],['account','◎','حسابي'],['settings','⚙','الإعدادات']];
  definitions.forEach(([key,icon,label],i)=>{
    const button=document.createElement('button'); button.type='button'; button.className='nav-item'+(i===0?' active':'');
    button.dataset.page=key; button.innerHTML='<span>'+icon+'</span>'+label; nav.append(button);
  });
  notice?.after(nav);
  const makePage=(key)=>{const section=document.createElement('section');section.className='page-view'+(key==='home'?' active':'');section.dataset.view=key;return section;};
  const pages={}; definitions.forEach(([key])=>pages[key]=makePage(key));
  if(balance) pages.home.append(balance);
  const shortcuts=document.createElement('div');shortcuts.className='home-shortcuts';
  shortcuts.innerHTML='<button class="shortcut-card" data-go="wallets" type="button"><span>◈</span><b>إدارة المحافظ</b><small>الأرصدة والمحافظ</small></button><button class="shortcut-card" data-go="transfers" type="button"><span>⇄</span><b>تحويل تجريبي</b><small>بين محافظ SApay</small></button><button class="shortcut-card" data-go="services" type="button"><span>▦</span><b>الخدمات</b><small>الفواتير والخدمات السودانية</small></button>';
  pages.home.append(shortcuts);
  if(footer) pages.home.append(footer);
  if(walletHeading) pages.wallets.append(walletHeading);
  if(wallets) pages.wallets.append(wallets);
  if(historyHeading) pages.history.append(historyHeading);
  if(history) pages.history.append(history);
  const intro=(eyebrow,title,description)=>'<div class="page-intro"><div class="eyebrow">'+eyebrow+'</div><h2>'+title+'</h2><p>'+description+'</p></div>';
  pages.transfers.innerHTML=intro('حركة الأموال','التحويل بين المحافظ','نفّذ تحويلًا تجريبيًا بين محفظتين داخل بيئة SApay فقط. يجب أن تكون العملة متطابقة.')+
    '<div class="action-feature panel"><div class="feature-symbol">⇄</div><div><h3>تحويل داخلي تجريبي</h3><p>اختر محفظة المصدر ثم أدخل معرّف محفظة المستلم والمبلغ.</p><button id="startTransferBtn" class="primary" type="button">بدء تحويل تجريبي</button></div></div>'+
    '<div class="notice">التحويلات البنكية والدولية معروضة للتعريف فقط، ولا تنفّذ النسخة التجريبية أي تحويلات خارجية أو أموالًا حقيقية.</div>'+
    '<div class="section-heading"><div><div class="eyebrow">داخل السودان</div><h2>التحويل إلى البنوك السودانية</h2></div></div>'+
    '<div class="action-feature panel"><div class="feature-symbol">⌂</div><div><h3>تحويل بنكي محلي</h3><p>اختر البنك المستهدف من دليل البنوك في صفحة الخدمات. الربط المصرفي والتنفيذ الفعلي غير متاحين حاليًا.</p><button class="outline-btn" data-go="services" type="button">استعراض البنوك السودانية</button></div></div>'+
    '<div class="section-heading"><div><div class="eyebrow">عبر الحدود</div><h2>التحويلات العالمية</h2></div></div>'+
    '<div class="action-feature panel"><div class="feature-symbol">◎</div><div><h3>تحويل دولي</h3><p>وجهات مستهدفة تشمل الخليج ومصر وتركيا وأوروبا والمملكة المتحدة والولايات المتحدة. شبكات التحويل ومقدمو الخدمة لم يتم تفعيلهم.</p><button class="outline-btn" data-go="services" type="button">استعراض الوجهات العالمية</button></div></div>';
  pages.services.innerHTML=intro('منظومة خدمات السودان','الخدمات والمدفوعات','استعرض الجهات السودانية والخدمات المستهدفة. جميع خيارات السداد والربط معروضة للتعريف والتخطيط فقط، وليست متاحة للدفع الحقيقي.')+
    '<div class="service-grid">'+
    '<article class="service-card"><span>▤</span><h3>فواتير الاتصالات</h3><p>زين، سوداني، MTN، كنار</p><em>عرض الجهات</em></article>'+
    '<article class="service-card"><span>▧</span><h3>الخدمات الحكومية</h3><p>الجوازات، المرور، الأحوال المدنية وغيرها</p><em>قيد التطوير</em></article>'+
    '<article class="service-card"><span>▣</span><h3>رسوم الجامعات والكليات</h3><p>قائمة المؤسسات التعليمية السودانية</p><em>دليل تعريفي</em></article>'+
    '<article class="service-card"><span>⌂</span><h3>التحويل إلى البنوك</h3><p>تصور تكامل مصرفي مستقبلي</p><em>غير متاح تجريبيًا</em></article>'+
    '<article class="service-card"><span>◎</span><h3>التحويلات الدولية</h3><p>تصور خدمات عابرة للحدود</p><em>قيد التطوير</em></article>'+
    '<article class="service-card"><span>＋</span><h3>خدمات أخرى</h3><p>إضافات ضمن المنظومة</p><em>قيد التخطيط</em></article></div>'+
    '<div class="service-directory">'+
    '<section class="directory-panel"><div class="directory-heading"><span>01</span><div><h3>شركات الاتصالات السودانية</h3><p>الجهات المعروفة في قطاع الاتصالات</p></div></div><div class="directory-list">'+
    '<div class="directory-item"><b>زين السودان</b><small>Zain Sudan · اتصالات وإنترنت</small><em>استعراض فقط</em></div>'+
    '<div class="directory-item"><b>سوداني</b><small>Sudani · مجموعة سوداتل</small><em>استعراض فقط</em></div>'+
    '<div class="directory-item"><b>MTN السودان</b><small>MTN Sudan · اتصالات وإنترنت</small><em>استعراض فقط</em></div>'+
    '<div class="directory-item"><b>كنار</b><small>Canar Telecom · اتصالات وخدمات إنترنت</small><em>استعراض فقط</em></div>'+
    '</div></section>'+
    '<section class="directory-panel"><div class="directory-heading"><span>02</span><div><h3>الخدمات الحكومية</h3><p>تصنيف المعاملات الحكومية المقترحة</p></div></div><div class="directory-list">'+
    '<div class="directory-item"><b>الإدارة العامة للجوازات والهجرة</b><small>إصدار وتجديد الجوازات، والاستعلام عن المعاملات</small><em>غير متاح للدفع</em></div>'+
    '<div class="directory-item"><b>الإدارة العامة للمرور</b><small>رسوم وتجديد رخص القيادة، وترخيص المركبات والمخالفات</small><em>غير متاح للدفع</em></div>'+
    '<div class="directory-item"><b>السجل المدني والأحوال المدنية</b><small>شهادات الميلاد والوفاة والرقم الوطني</small><em>قيد الدراسة</em></div>'+
    '<div class="directory-item"><b>الخدمات الضريبية والزكوية</b><small>الاستعلام عن الرسوم والسداد الحكومي</small><em>قيد الدراسة</em></div>'+
    '<div class="directory-item"><b>الأراضي والتسجيلات</b><small>رسوم المعاملات والشهادات</small><em>قيد الدراسة</em></div>'+
    '<div class="directory-item"><b>المحليات والولايات</b><small>رسوم الخدمات والتصاديق المحلية</small><em>قيد الدراسة</em></div>'+
    '</div></section>'+
    '<section class="directory-panel"><div class="directory-heading"><span>03</span><div><h3>رسوم الجامعات والكليات</h3><p>ابحث عن المؤسسة التعليمية لعرضها ضمن دليل رسوم الطلاب</p></div></div>'+
    '<label class="directory-search-label" for="institutionSearch">ابحث باسم الجامعة أو الكلية</label><input id="institutionSearch" class="directory-search" type="search" placeholder="مثال: جامعة الخرطوم، جامعة السودان..." autocomplete="off">'+
    '<div class="institution-group"><h4>جامعات حكومية</h4><div id="publicInstitutions" class="institution-chips"></div></div>'+
    '<div class="institution-group"><h4>جامعات أهلية وخاصة وكليات</h4><div id="privateInstitutions" class="institution-chips"></div></div>'+
    '<p class="directory-footnote">الأسماء دليل أولي للتصنيف فقط. لم يتم ربط أي جامعة بنظام تحصيل الرسوم، ويجب اعتماد المؤسسات والبرامج والرسوم رسميًا قبل إتاحة الدفع.</p></section>'+
    '<section class="directory-panel"><div class="directory-heading"><span>04</span><div><h3>البنوك السودانية</h3><p>دليل أسماء البنوك الواردة في قائمة بنك السودان المركزي</p></div></div>'+
    '<label class="directory-search-label" for="bankSearch">ابحث باسم البنك</label><input id="bankSearch" class="directory-search" type="search" placeholder="مثال: بنك الخرطوم، فيصل..." autocomplete="off">'+
    '<div id="sudanBanks" class="directory-list"></div>'+
    '<p class="directory-footnote">الأسماء مستندة إلى قائمة البنوك المنشورة لدى بنك السودان المركزي. ظهور البنك هنا لا يعني توفر التحويل إليه أو تأكيد نشاط كل فرع؛ يلزم التحقق من التشغيل والربط والاعتماد قبل تفعيل الخدمة.</p></section>'+
    '<section class="directory-panel"><div class="directory-heading"><span>05</span><div><h3>التحويلات العالمية</h3><p>وجهات دولية مستهدفة ضمن خارطة طريق SApay</p></div></div>'+
    '<label class="directory-search-label" for="countrySearch">ابحث عن دولة أو وجهة</label><input id="countrySearch" class="directory-search" type="search" placeholder="ابحث عن الإمارات، السعودية، مصر..." autocomplete="off">'+
    '<div id="globalDestinations" class="directory-list"></div>'+
    '<p class="directory-footnote">هذه وجهات مقترحة للتخطيط وليست ممرات تحويل مفعّلة. لم يتم ربط SApay بمصارف مراسلة أو شبكات تحويل دولية أو مزودي صرف.</p></section></div>';
  const publicInstitutions=['جامعة الخرطوم','جامعة السودان للعلوم والتكنولوجيا','جامعة النيلين','جامعة بحري','جامعة أم درمان الإسلامية','جامعة الجزيرة','جامعة وادي النيل','جامعة شندي','جامعة كسلا','جامعة القضارف','جامعة البحر الأحمر','جامعة دنقلا','جامعة سنار','جامعة النيل الأزرق','جامعة كردفان','جامعة الفاشر','جامعة زالنجي','جامعة نيالا','جامعة بخت الرضا','جامعة القرآن الكريم والعلوم الإسلامية','جامعة الإمام المهدي','جامعة غرب كردفان','جامعة الدلنج','جامعة شرق كردفان','جامعة الجنينة','جامعة الضعين','جامعة المناقل','جامعة مروي التكنولوجية','جامعة السودان المفتوحة'];
  publicInstitutions.sort((a,b)=>a.localeCompare(b,'ar'));
  const privateInstitutions=['جامعة الأحفاد للبنات','جامعة السودان العالمية','جامعة أم درمان الأهلية','جامعة العلوم والتقانة','جامعة العلوم الطبية والتكنولوجيا','جامعة المستقبل','جامعة المغتربين','جامعة ود مدني الأهلية','الجامعة الوطنية','جامعة المشرق','جامعة الرازي','الجامعة العربية المفتوحة','جامعة قاردن سيتي','جامعة ابن سينا','جامعة الشيخ عبدالله البدري','جامعة النيل','جامعة البيان','جامعة النصر','جامعة الشرق للعلوم والتكنولوجيا','جامعة بورتسودان الأهلية','كلية شرق النيل','كلية المدار','كلية السودان الجامعية للبنات','أكاديمية السودان للعلوم المصرفية والمالية','كلية كمبوني للعلوم والتكنولوجيا','كلية الإمام الهادي','كلية غرب النيل','كلية بحري الأهلية','كلية أم درمان للعلوم والتكنولوجيا','كلية اليرموك','كلية الكاملين للعلوم والتقانة','كلية النور للعلوم والتكنولوجيا','كلية ستارز للعلوم الطبية والتقنية','كلية الحكمة للعلوم والتكنولوجيا','كلية النهضة','كلية الصفوة','كلية السلامة للعلوم والتكنولوجيا','كلية الريادة','كلية الأفق للعلوم والتكنولوجيا','كلية مكة التقنية لطب العيون','كلية نبتة','كلية الجزيرة للعلوم الطبية والتكنولوجيا','كلية الفجر للعلوم والتكنولوجيا','كلية فكتوريا للعلوم والتكنولوجيا','كلية القضارف للعلوم والتكنولوجيا','كلية المعرفة للعلوم والتكنولوجيا','كلية رويال للعلوم والتكنولوجيا','كلية شمال كردفان','كلية دار العلوم والتكنولوجيا','كلية المدائن للعلوم الطبية والتكنولوجيا'];
  privateInstitutions.sort((a,b)=>a.localeCompare(b,'ar'));
  const renderInstitutions=(items,root)=>{root.innerHTML=items.map(name=>'<button type="button" class="institution-chip" data-institution="'+escapeHtml(name)+'">'+escapeHtml(name)+'</button>').join('');};
  const publicRoot=pages.services.querySelector('#publicInstitutions');
  const privateRoot=pages.services.querySelector('#privateInstitutions');
  const institutionSearch=pages.services.querySelector('#institutionSearch');
  renderInstitutions(publicInstitutions,publicRoot);renderInstitutions(privateInstitutions,privateRoot);
  institutionSearch.addEventListener('input',()=>{const q=institutionSearch.value.trim();renderInstitutions(publicInstitutions.filter(n=>n.includes(q)),publicRoot);renderInstitutions(privateInstitutions.filter(n=>n.includes(q)),privateRoot);});
  const sudaneseBanks=['بنك الخرطوم','بنك فيصل الإسلامي','بنك أم درمان الوطني','بنك النيلين','البنك الزراعي السوداني','بنك التنمية الصناعية','بنك تنمية الصادرات','بنك الادخار والتنمية الاجتماعية','بنك الثروة الحيوانية','بنك العمال الوطني','البنك الإسلامي السوداني','البنك السوداني الفرنسي','البنك السوداني المصري','البنك العربي السوداني','البنك السعودي السوداني','بنك قطر الوطني – فرع السودان','بنك قطر الإسلامي – فرع السودان','بنك السلام','بنك البركة السوداني','بنك الخليج','بنك الجزيرة السوداني الأردني','بنك بيبلوس أفريقيا','بنك النيل الأزرق المشرق','بنك النيل للتجارة والتنمية','البنك التجاري للمزارعين','بنك الاستثمار المالي','بنك الأسرة','بنك العاصمة المتحد','بنك آيفوري','بنك البلد','بنك أفريقيا والخليج','بنك التضامن الإسلامي','البنك الوطني السوداني','البنك الأهلي المصري – فرع الخرطوم','بنك الساحل والصحراء','بنك العقارات التجارية','مصرف أبوظبي الإسلامي – السودان','بنك أبوظبي الوطني – السودان','بنك زراعات كاتيليم'];
  sudaneseBanks.sort((a,b)=>a.localeCompare(b,'ar'));
  const globalDestinations=['الإمارات العربية المتحدة','المملكة العربية السعودية','مصر','قطر','الكويت','البحرين','سلطنة عُمان','تركيا','المملكة المتحدة','الولايات المتحدة الأمريكية','دول الاتحاد الأوروبي','الأردن','لبنان'];
  globalDestinations.sort((a,b)=>a.localeCompare(b,'ar'));
  const renderDirectory=(items,root,attribute)=>{root.innerHTML=items.map(name=>'<div class="directory-item"><b>'+escapeHtml(name)+'</b><em>قيد التخطيط · غير متاح للتحويل</em></div>').join('');};
  const bankRoot=pages.services.querySelector('#sudanBanks');
  const renderBanks=(items)=>{bankRoot.innerHTML=items.map(name=>'<article class="directory-item bank-directory-item"><div><b>'+escapeHtml(name)+'</b><small>تحويل تجريبي داخلي · لا اتصال بالبنك</small></div><button type="button" class="outline-btn" data-demo-bank="'+escapeHtml(name)+'">تحويل تجريبي</button></article>').join('');};
  const bankSearch=pages.services.querySelector('#bankSearch');
  const destinationRoot=pages.services.querySelector('#globalDestinations');
  const countrySearch=pages.services.querySelector('#countrySearch');
  renderBanks(sudaneseBanks);renderDirectory(globalDestinations,destinationRoot,'destination');
  bankSearch.addEventListener('input',()=>renderBanks(sudaneseBanks.filter(n=>n.includes(bankSearch.value.trim()))));
  countrySearch.addEventListener('input',()=>renderDirectory(globalDestinations.filter(n=>n.includes(countrySearch.value.trim())),destinationRoot,'destination'));
  pages.services.addEventListener('click',e=>{
    const item=e.target.closest('[data-institution]');
    if(item) toast('تم اختيار '+item.dataset.institution+' — الدفع الجامعي سيضاف في المرحلة التالية.');
    const bank=e.target.closest('[data-demo-bank]');
    if(bank){
      if(!window.SAPAY_CONFIG?.bankDemoTransfers){toast('التحويل البنكي التجريبي غير مفعّل حالياً.');return;}
      if(!state.wallets.length){toast('أنشئ محفظة أولاً لإجراء تحويل تجريبي.');go('wallets');return;}
      openAction('external',state.wallets[0].id);
      $('externalMode').value='SUDAN_BANK';
      $('externalProvider').value=bank.dataset.demoBank;
      $('actionTitle').textContent='تحويل بنكي تجريبي';
      $('actionHint').textContent='سيُخصم المبلغ من محفظتك التجريبية ويُسجل محاسبياً. لن يتم إرسال أي أموال إلى البنك.';
    }
  });
  pages.account.innerHTML=intro('الإعدادات والملف الشخصي','حسابي','معلومات حسابك وروابط السياسات وقنوات المساعدة.')+
    '<div class="account-card panel"><span class="account-icon">◎</span><div><small>البريد الإلكتروني المسجل</small><strong id="accountEmail">—</strong><small>نوع البيئة</small><strong>نسخة تجريبية فقط</strong></div></div>'+
    '<div class="account-links"><a href="/privacy.html">سياسة الخصوصية <span>←</span></a><a href="/support.html">الدعم والمساعدة <span>←</span></a><button id="accountLogout" type="button">تسجيل الخروج <span>←</span></button></div>'+
    '<div class="notice">لا تشارك كلمة المرور أو رموز الدخول. لا تستخدم بيانات مصرفية حقيقية داخل النسخة التجريبية.</div>';
  pages.support.innerHTML=intro('مركز المساعدة','كيف نساعدك؟','إرشادات استخدام النسخة التجريبية ومعلومات الدعم.')+
    '<div class="faq-list">'+
    '<details class="faq-item"><summary>هل يمكنني إرسال أموال حقيقية؟</summary><p>لا. SApay في هذه المرحلة نموذج تجريبي فقط، وجميع الأرصدة والتحويلات افتراضية.</p></details>'+
    '<details class="faq-item"><summary>كيف أنشئ محفظة؟</summary><p>افتح صفحة محافظي، ثم اضغط إنشاء محفظة واختر العملة المتاحة.</p></details>'+
    '<details class="faq-item"><summary>كيف أحوّل إلى مستخدم آخر؟</summary><p>من صفحة التحويل التجريبي، اختر محفظة المصدر وأدخل معرّف محفظة المستلم الصحيح والمبلغ. يجب أن تتطابق العملة.</p></details>'+
    '<details class="faq-item"><summary>هل التحويل إلى البنوك أو شركات الاتصالات متاح؟</summary><p>لا. تظهر هذه الخدمات ضمن خارطة الطريق فقط، ولا توجد تكاملات مصرفية أو حكومية فعالة.</p></details>'+
    '<div class="support-contact panel"><h3>تحتاج إلى مساعدة إضافية؟</h3><p>راجع صفحة الدعم لمعرفة حالة قنوات التواصل الرسمية.</p><a class="primary support-link" href="/support.html">فتح صفحة الدعم</a></div></div>';
  pages.settings.innerHTML=intro('تفضيلات الحساب','الإعدادات','إعدادات النسخة التجريبية والخصوصية.')+
    '<div class="settings-list">'+
    '<div class="setting-row"><div><b>اللغة</b><small>لغة واجهة التطبيق الحالية</small></div><strong>العربية</strong></div>'+
    '<div class="setting-row"><div><b>اتجاه العرض</b><small>واجهة من اليمين إلى اليسار</small></div><strong>RTL</strong></div>'+
    '<div class="setting-row"><div><b>بيئة التشغيل</b><small>لا توجد أموال حقيقية أو ربط مصرفي</small></div><strong>Demo</strong></div>'+
    '<a class="setting-row" href="/privacy.html"><div><b>سياسة الخصوصية</b><small>معلومات الخصوصية والبيانات</small></div><span>←</span></a>'+
    '<a class="setting-row" href="/support.html"><div><b>الدعم والمساعدة</b><small>قنوات التواصل وحالة الدعم</small></div><span>←</span></a>'+
    '</div><div class="notice">لا تغيّر هذه الإعدادات طريقة معالجة البيانات أو صلاحيات الحساب. لا تدخل معلومات مالية أو شخصية حساسة في النسخة التجريبية.</div>';
  definitions.forEach(([key])=>root.append(pages[key]));
  const go=(key)=>{
    definitions.forEach(([name])=>{pages[name].classList.toggle('active',name===key);nav.querySelector('[data-page="'+name+'"]').classList.toggle('active',name===key);});
    if(key==='history') loadHistory();
    if(key==='account') $('accountEmail').textContent=state.user?.email||'حسابك التجريبي';
    window.scrollTo({top:0,behavior:'smooth'});
  };
  nav.addEventListener('click',e=>{const button=e.target.closest('[data-page]');if(button)go(button.dataset.page);});
  shortcuts.addEventListener('click',e=>{const button=e.target.closest('[data-go]');if(button)go(button.dataset.go);});
  pages.transfers.addEventListener('click',e=>{const button=e.target.closest('[data-go]');if(button)go(button.dataset.go);});
  $('startTransferBtn').addEventListener('click',()=>{
    if(!state.wallets.length){toast('أنشئ محفظة أولًا للبدء.');go('wallets');return;}
    openAction('transfer',state.wallets[0].id);
  });
  $('accountLogout').addEventListener('click',()=>logout());
$('externalMode').addEventListener('change', () => { $('externalCountryWrap').hidden = $('externalMode').value !== 'GLOBAL'; });
})();
