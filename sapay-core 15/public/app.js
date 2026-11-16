'use strict';
const $ = (id) => document.getElementById(id);
const state = { token: sessionStorage.getItem('sapay_access_token') || '', user: null, wallets: [], authMode: 'login' };
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
  const response = await fetch(apiOrigin() + '/api' + path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
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
  const nav=document.createElement('nav');
  nav.className='app-nav'; nav.setAttribute('aria-label','التنقل الرئيسي');
  const definitions=[['home','⌂','الرئيسية'],['wallets','◈','محافظي'],['transfers','⇄','التحويل'],['services','▦','الخدمات'],['history','◷','العمليات'],['account','◎','حسابي'],['support','?','المساعدة'],['settings','⚙','الإعدادات']];
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
  if(walletHeading) pages.wallets.append(walletHeading);
  if(wallets) pages.wallets.append(wallets);
  if(historyHeading) pages.history.append(historyHeading);
  if(history) pages.history.append(history);
  const intro=(eyebrow,title,description)=>'<div class="page-intro"><div class="eyebrow">'+eyebrow+'</div><h2>'+title+'</h2><p>'+description+'</p></div>';
  pages.transfers.innerHTML=intro('حركة الأموال','التحويل بين المحافظ','نفّذ تحويلًا تجريبيًا بين محفظتين داخل بيئة SApay فقط. يجب أن تكون العملة متطابقة.')+
    '<div class="action-feature panel"><div class="feature-symbol">⇄</div><div><h3>تحويل داخلي تجريبي</h3><p>اختر محفظة المصدر ثم أدخل معرّف محفظة المستلم والمبلغ.</p><button id="startTransferBtn" class="primary" type="button">بدء تحويل تجريبي</button></div></div>'+
    '<div class="notice">لا يدعم هذا النموذج التحويل إلى بنك أو محفظة خارجية، ولا ينفّذ أي حركة مالية حقيقية.</div>';
  pages.services.innerHTML=intro('منظومة خدمات السودان','الخدمات والمدفوعات','مساحة مخصصة لربط الخدمات السودانية ضمن مراحل التطوير القادمة.')+
    '<div class="service-grid">'+
    '<article class="service-card"><span>▤</span><h3>فواتير الاتصالات</h3><p>شركات الاتصالات السودانية</p><em>قيد التطوير</em></article>'+
    '<article class="service-card"><span>▧</span><h3>الخدمات الحكومية</h3><p>رسوم ومعاملات حكومية</p><em>قيد التطوير</em></article>'+
    '<article class="service-card"><span>⌂</span><h3>التحويل إلى البنوك</h3><p>تصور تكامل مصرفي مستقبلي</p><em>غير متاح تجريبيًا</em></article>'+
    '<article class="service-card"><span>◎</span><h3>التحويلات الدولية</h3><p>تصور خدمات عابرة للحدود</p><em>قيد التطوير</em></article>'+
    '<article class="service-card"><span>▣</span><h3>سداد الفواتير</h3><p>خدمات المرافق والاشتراكات</p><em>قيد التطوير</em></article>'+
    '<article class="service-card"><span>＋</span><h3>خدمات أخرى</h3><p>إضافات ضمن المنظومة</p><em>قيد التخطيط</em></article></div>';
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
  $('startTransferBtn').addEventListener('click',()=>{
    if(!state.wallets.length){toast('أنشئ محفظة أولًا للبدء.');go('wallets');return;}
    openAction('transfer',state.wallets[0].id);
  });
  $('accountLogout').addEventListener('click',()=>logout());
})();
