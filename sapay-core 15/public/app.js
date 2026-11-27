'use strict';
const $ = (id) => document.getElementById(id);
const state = { token: sessionStorage.getItem('sapay_access_token') || '', user: null, wallets: [], authMode: 'login' };
const money = (minor) => { try { return BigInt(minor || '0').toLocaleString('en-US'); } catch { return '0'; } };
const headers = () => ({ 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) });
// Capacitor iOS WebViews commonly use https://localhost, not capacitor://. Detect the native bridge explicitly.
const nativeRuntime = window.location.protocol === 'capacitor:' || window.Capacitor?.isNativePlatform?.() === true;
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
  const origin = apiOrigin();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(origin + '/api' + path, { ...options, signal: controller.signal, headers: { ...headers(), ...(options.headers || {}) } });
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? 'انتهت مهلة الاتصال بخادم SApay. حاول مرة أخرى.' : 'تعذر الاتصال بخادم SApay. تحقق من الإنترنت وحاول مرة أخرى.');
  } finally { clearTimeout(timer); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(data.message || 'تعذر إكمال الطلب. حاول مرة أخرى.');
  }
  return data;
}
function message(id, text, ok = false) { const el = $(id); el.textContent = text || ''; el.classList.toggle('success', !!ok); }
// Native Face ID is opt-in and uses iOS Keychain protected by the current biometric set.
const biometricServer='sapay-financial-core';
async function enrollFaceId(email,password){
  if(!window.SApayBiometric?.isNative || state.authMode!=='login')return;
  try{
    if(!(await window.SApayBiometric.isAvailable()))return;
    if(window.confirm('هل تريد تفعيل تسجيل الدخول باستخدام Face ID على هذا الجهاز؟')){
      await window.SApayBiometric.saveCredentials(email,password,biometricServer);
      message('biometricMessage','تم تفعيل Face ID على هذا الجهاز.',true);
      $('faceIdLogin').hidden=false;
    }
  }catch{message('biometricMessage','تعذر تفعيل Face ID. يمكنك استخدام كلمة المرور.');}
}
async function initializeFaceId(){
  if(!window.SApayBiometric?.isNative)return;
  try{$('faceIdLogin').hidden=!(await window.SApayBiometric.hasCredentials(biometricServer));}
  catch{$('faceIdLogin').hidden=true;}
}
$('faceIdLogin').addEventListener('click',async()=>{
  const button=$('faceIdLogin');button.disabled=true;
  message('biometricMessage','يرجى تأكيد هويتك عبر Face ID…');
  try{
    if(!window.SApayBiometric?.isNative)throw Error('Face ID متاح في تطبيق iOS فقط.');
    const credentials=await window.SApayBiometric.getCredentials(biometricServer);
    const result=await api('/auth/login',{method:'POST',body:JSON.stringify({email:credentials.username,password:credentials.password})});
    state.token=result.accessToken;state.user=result.user;
    sessionStorage.setItem('sapay_access_token',state.token);
    await showDashboard();
  }catch(error){message('biometricMessage',error.message||'تعذر استخدام Face ID. استخدم كلمة المرور.');}
  finally{button.disabled=false;}
});
initializeFaceId();
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function setAuthMode(mode) {
  state.authMode = mode;
  $('loginTab').classList.toggle('active', mode === 'login');
  $('registerTab').classList.toggle('active', mode === 'register');
  $('authTitle').textContent = mode === 'login' ? 'مرحبًا بعودتك' : 'أنشئ حساب SApay';
  $('authHint').textContent = mode === 'login' ? 'سجّل الدخول للوصول إلى محفظتك التجريبية.' : 'استخدم بريدًا تجريبيًا وكلمة مرور من 12 حرفًا على الأقل.';
  $('authSubmit').textContent = mode === 'login' ? 'دخول آمن' : 'إنشاء الحساب';
  $('password').minLength = mode === 'login' ? 1 : 12;
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  message('authMessage', '');
}
$('loginTab').addEventListener('click', () => setAuthMode('login'));
$('registerTab').addEventListener('click', () => setAuthMode('register'));
$('password').minLength = 1;
$('togglePassword').addEventListener('click', () => {
  const field = $('password'); const button = $('togglePassword');
  const visible = field.type === 'password';
  field.type = visible ? 'text' : 'password';
  button.textContent = visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';
  button.setAttribute('aria-pressed', String(visible));
});
$('authForm').addEventListener('invalid', () => message('authMessage', 'تحقق من البريد الإلكتروني وكلمة المرور ومتطلبات الحقول.'), true);
$('authForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('authSubmit'); button.disabled = true; message('authMessage', 'جارٍ التحقق…');
  try {
    const result = await api('/auth/' + (state.authMode === 'login' ? 'login' : 'register'), { method: 'POST', body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }) });
    state.token = result.accessToken; state.user = result.user; sessionStorage.setItem('sapay_access_token', state.token);
    await showDashboard();
    if(state.authMode==='login') await enrollFaceId($('email').value.trim(),$('password').value);
  } catch (error) { message('authMessage', error.message); }
  finally { button.disabled = false; }
});
function logout(show = true) {
  state.token = ''; state.user = null; state.wallets = []; sessionStorage.removeItem('sapay_access_token');
  $('password').value = ''; $('password').type = 'password';
  $('togglePassword').textContent = 'إظهار كلمة المرور'; $('togglePassword').setAttribute('aria-pressed','false');
  $('wallets').replaceChildren(); $('history').replaceChildren(); $('totalBalance').textContent = '—';
  for (const id of ['actionDialog','walletDialog']) { if ($(id)?.open) $(id).close(); }
  for (const id of ['actionForm','walletForm','inlineTransfer','serviceSimulation']) $(id)?.reset();
  $('simReview')?.replaceChildren(); $('inlineSource')?.replaceChildren();
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
      catch { throw new Error('تعذر تحديث رصيد المحفظة. حاول مرة أخرى.'); }
    }));
    state.wallets = detailed;
    renderWallets();
    const totals = {};
    detailed.forEach(w => totals[w.currency] = (BigInt(totals[w.currency] || '0') + BigInt(w.balanceMinor || '0')).toString());
    $('totalBalance').innerHTML = Object.keys(totals).length ? Object.entries(totals).map(([currency, value]) => `<span class="total-currency" dir="ltr"><b>${money(value)}</b> <small>${escapeHtml(currency)}</small></span>`).join('<span class="total-separator">·</span>') : 'لا توجد محافظ بعد';
    await loadHistory();
  } catch (error) {
    state.wallets = [];
    $('totalBalance').textContent = 'الرصيد غير متاح حاليًا';
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
    <div class="wallet-id"><span dir="ltr">ID: ${escapeHtml(w.id)}</span> <button type="button" class="outline-btn" data-copy-wallet="${escapeHtml(w.id)}">نسخ المعرّف</button></div>
    <div class="wallet-actions"><button class="outline-btn" data-credit="${escapeHtml(w.id)}">شحن تجريبي</button><button class="outline-btn" data-send="${escapeHtml(w.id)}">تحويل تجريبي</button></div>
  </article>`).join('');
  root.querySelectorAll('[data-copy-wallet]').forEach(btn => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copyWallet); toast('تم نسخ معرّف المحفظة.'); }
    catch { window.prompt('انسخ معرّف المحفظة:', btn.dataset.copyWallet); }
  }));
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
      if (!source) throw new Error('اختر محفظة مصدر صالحة.');
      if (destination.toLowerCase() === walletId.toLowerCase()) throw new Error('اختر محفظة مستلم مختلفة.');
      if (BigInt(amount) > BigInt(source.balanceMinor || '0')) throw new Error('الرصيد التجريبي غير كافٍ.');
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
  const footer=root.querySelector('.footer-note');
  const nav=document.createElement('nav');
  nav.className='app-nav'; nav.setAttribute('aria-label','التنقل الرئيسي');
  const definitions=[['home','⌂','الرئيسية'],['wallets','◈','محافظي'],['cards','▤','البطاقات'],['transfers','⇄','التحويل'],['services','▦','الخدمات'],['history','◷','العمليات'],['account','◎','حسابي'],['support','?','المساعدة'],['settings','⚙','الإعدادات']];
  definitions.forEach(([key,icon,label],i)=>{
    const button=document.createElement('button'); button.type='button'; button.className='nav-item'+(i===0?' active':'');
    button.dataset.page=key; if(i===0)button.setAttribute('aria-current','page'); button.innerHTML='<span>'+icon+'</span>'+label; nav.append(button);
  });
  notice?.after(nav);
  const makePage=(key)=>{const section=document.createElement('section');section.className='page-view'+(key==='home'?' active':'');section.dataset.view=key;return section;};
  const pages={}; definitions.forEach(([key])=>pages[key]=makePage(key));
  if(balance) pages.home.append(balance);
  const shortcuts=document.createElement('div');shortcuts.className='home-shortcuts';
  shortcuts.innerHTML='<button class="shortcut-card" data-go="wallets" type="button"><span>◈</span><b>إدارة المحافظ</b><small>الأرصدة والمحافظ</small></button><button class="shortcut-card" data-go="transfers" type="button"><span>⇄</span><b>تحويل تجريبي</b><small>بين محافظ SApay</small></button><button class="shortcut-card" data-go="services" type="button"><span>▦</span><b>الخدمات</b><small>الفواتير والخدمات السودانية</small></button>';
  shortcuts.innerHTML += '<button class="shortcut-card" data-go="cards" type="button"><span>▤</span><b>البطاقات الافتراضية</b><small>معاينة تجريبية فقط</small></button>';
  pages.home.append(shortcuts);
  if(footer) pages.home.append(footer);
  if(walletHeading) pages.wallets.append(walletHeading);
  if(wallets) pages.wallets.append(wallets);
  if(historyHeading) pages.history.append(historyHeading);
  if(history) pages.history.append(history);
  const intro=(eyebrow,title,description)=>'<div class="page-intro"><div class="eyebrow">'+eyebrow+'</div><h2>'+title+'</h2><p>'+description+'</p></div>';
  // Card controls are a browser-session-only UI simulation; no card API or financial operations.
  const demoCardKey='sapay_demo_card_ui_v1';
  let demoCardState={visa:false,mastercard:false,events:[]};
  try {
    const saved=JSON.parse(sessionStorage.getItem(demoCardKey)||'null');
    if(saved && typeof saved==='object'){
      demoCardState.visa=saved.visa===true;
      demoCardState.mastercard=saved.mastercard===true;
      demoCardState.events=Array.isArray(saved.events)?saved.events.filter(e=>e&&['visa','mastercard'].includes(e.card)&&['freeze','unfreeze'].includes(e.action)&&typeof e.time==='string').slice(0,12):[];
    }
  } catch { /* Ignore malformed browser-session state. */ }
  const cardNames={visa:'Visa',mastercard:'Mastercard'};
  const persistDemoCards=()=>{try{sessionStorage.setItem(demoCardKey,JSON.stringify(demoCardState));}catch{/* storage optional */}};
  const renderDemoCards=()=>{
    const cards=pages.cards.querySelectorAll('[data-demo-card]');
    cards.forEach(card=>{
      const key=card.dataset.demoCard;
      const frozen=demoCardState[key];
      card.querySelector('[data-card-status]').textContent=frozen?'مجمّدة في المعاينة':'غير مفعّلة · نموذج';
      card.querySelector('[data-card-toggle]').textContent=frozen?'إلغاء التجميد التجريبي':'تجميد تجريبي';
      card.querySelector('[data-card-toggle]').setAttribute('aria-pressed',String(frozen));
      card.classList.toggle('is-frozen',frozen);
    });
    const history=pages.cards.querySelector('#demoCardHistory');
    if(!demoCardState.events.length){
      history.textContent='لا توجد إجراءات تجريبية مسجلة في هذه الجلسة. لا توجد معاملات دفع حقيقية.';
    }else{
      history.replaceChildren();
      demoCardState.events.forEach(e=>{
        const row=document.createElement('div');row.className='demo-card-event';
        const action=e.action==='freeze'?'تجميد':'إلغاء تجميد';
        const label=document.createElement('strong');label.textContent=action+' نموذج '+cardNames[e.card];
        const time=document.createElement('small');time.textContent=e.time;
        row.append(label,time);history.append(row);
      });
    }
  };
  pages.cards.innerHTML=intro('بطاقات SApay','إدارة البطاقات الافتراضية','نماذج تفاعلية لأغراض اختبار الواجهة فقط. لا توجد بطاقات صادرة أو أرقام بطاقات أو عمليات دفع أو ربط Visa/Mastercard أو Apple Pay.')+
    '<div class="virtual-card-grid" aria-label="نماذج البطاقات الافتراضية">'+
    '<article class="virtual-card-manager" data-demo-card="visa"><div class="virtual-payment-card"><div class="virtual-card-top"><strong>SApay</strong><span>VISA · نموذج توضيحي</span></div><div class="virtual-card-chip" aria-hidden="true">▦</div><div class="virtual-card-number">•••• •••• •••• ••••</div><div class="virtual-card-bottom"><span>DEMO ONLY · تجريبي</span><span data-card-status>غير مفعّلة · نموذج</span></div></div><div class="demo-card-controls"><button type="button" class="subtle-btn demo-card-button" data-card-details="visa">تفاصيل البطاقة</button><button type="button" class="subtle-btn demo-card-button" data-card-toggle="visa">تجميد تجريبي</button></div></article>'+
    '<article class="virtual-card-manager" data-demo-card="mastercard"><div class="virtual-payment-card secondary"><div class="virtual-card-top"><strong>SApay</strong><span>Mastercard · نموذج توضيحي</span></div><div class="virtual-card-chip" aria-hidden="true">▦</div><div class="virtual-card-number">•••• •••• •••• ••••</div><div class="virtual-card-bottom"><span>DEMO ONLY · تجريبي</span><span data-card-status>غير مفعّلة · نموذج</span></div></div><div class="demo-card-controls"><button type="button" class="subtle-btn demo-card-button" data-card-details="mastercard">تفاصيل البطاقة</button><button type="button" class="subtle-btn demo-card-button" data-card-toggle="mastercard">تجميد تجريبي</button></div></article>'+
    '</div><section class="panel demo-card-details" id="demoCardDetails" aria-live="polite"><h3>تفاصيل البطاقة</h3><p>اختر «تفاصيل البطاقة» لعرض نوع النموذج وحالته. لا توجد بيانات بطاقة حقيقية أو CVV أو تاريخ انتهاء.</p></section>'+
    '<section class="panel demo-card-history"><h3>سجل إجراءات البطاقات التجريبية</h3><div id="demoCardHistory" aria-live="polite"></div></section>'+
    '<p class="virtual-card-warning">التجميد وإلغاء التجميد يغيّران حالة المعاينة على هذا المتصفح فقط، ولا يؤثران على أي بطاقة أو رصيد. السجل يخص إجراءات الواجهة وليس معاملات مالية.</p>';
  pages.cards.addEventListener('click',e=>{
    const details=e.target.closest('[data-card-details]');
    if(details){
      const key=details.dataset.cardDetails;
      if(!Object.prototype.hasOwnProperty.call(cardNames,key))return;
      const target=pages.cards.querySelector('#demoCardDetails');
      target.replaceChildren();
      const title=document.createElement('h3');title.textContent='تفاصيل نموذج '+cardNames[key];
      const desc=document.createElement('p');desc.textContent='الحالة: '+(demoCardState[key]?'مجمّدة في المعاينة':'غير مفعّلة')+' · العملة: غير محددة · رقم البطاقة: غير متاح · CVV: غير متاح · تاريخ الانتهاء: غير متاح · الدفع: غير متاح.';
      target.append(title,desc);return;
    }
    const toggle=e.target.closest('[data-card-toggle]');
    if(!toggle)return;
    const key=toggle.dataset.cardToggle;
    if(!Object.prototype.hasOwnProperty.call(cardNames,key))return;
    demoCardState[key]=!demoCardState[key];
    demoCardState.events.unshift({card:key,action:demoCardState[key]?'freeze':'unfreeze',time:new Date().toLocaleString('ar')});
    demoCardState.events=demoCardState.events.slice(0,12);
    persistDemoCards();renderDemoCards();
    toast('تم تحديث حالة نموذج '+cardNames[key]+' داخل هذه الجلسة فقط.');
  });
  renderDemoCards();
  pages.transfers.innerHTML=intro('حركة الأموال','التحويل بين المحافظ','تحويل تجريبي فقط · لا توجد أموال حقيقية')+
    '<form id="inlineTransfer" class="panel directory-panel"><label for="inlineSource">محفظة المصدر</label><select id="inlineSource" class="directory-search" required></select><label for="inlineDestination">معرّف محفظة المستلم</label><input id="inlineDestination" class="directory-search" dir="ltr" required autocomplete="off"><label for="inlineAmount">المبلغ (بوحدات الرصيد التجريبي)</label><input id="inlineAmount" class="directory-search" inputmode="numeric" pattern="[1-9][0-9]*" required><button class="primary" type="submit">مراجعة التحويل</button><p id="inlineTransferMessage" role="status"></p></form>';
  const populateTransfer=()=>{const select=$('inlineSource');select.innerHTML=state.wallets.map(w=>'<option value="'+escapeHtml(w.id)+'">'+escapeHtml(w.currency)+' · '+money(w.balanceMinor)+'</option>').join('');};
  $('inlineTransfer').addEventListener('submit',e=>{
    e.preventDefault();
    if(!state.wallets.length){message('inlineTransferMessage','أنشئ محفظة أولًا.');return;}
    openAction('transfer',$('inlineSource').value);
    $('destinationWallet').value=$('inlineDestination').value;
    $('actionAmount').value=$('inlineAmount').value;
  });
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
    '<p class="directory-footnote">الأسماء دليل أولي للتصنيف فقط. لم يتم ربط أي جامعة بنظام تحصيل الرسوم، ويجب اعتماد المؤسسات والبرامج والرسوم رسميًا قبل إتاحة الدفع.</p></section></div>';
  const bankDirectory=document.createElement('section');
  bankDirectory.className='directory-panel';
  bankDirectory.innerHTML='<h3>دليل البنوك السودانية</h3><p>أمثلة تعريفية غير مرتبطة بنظام دفع. لا تمثل قائمة رسمية محدثة.</p><div class="institution-chips">'+['بنك الخرطوم','بنك فيصل الإسلامي السوداني','بنك أم درمان الوطني','بنك النيل','بنك البركة السودان','بنك التضامن الإسلامي','بنك السودان الفرنسي'].map(name=>'<span class="institution-chip">'+escapeHtml(name)+'</span>').join('')+'</div><p>التحويل المصرفي والدولي غير متاحين من هذه الواجهة حاليًا.</p>';
  pages.services.querySelector('.service-directory').append(bankDirectory);
  const simulation=document.createElement('section');
  simulation.className='directory-panel';
  simulation.innerHTML='<h3>محاكاة الخدمات والتحويلات الخارجية</h3><p>معاينة محلية فقط: لا خصم من المحفظة ولا إرسال لأي جهة.</p><form id="serviceSimulation"><label for="simType">نوع الخدمة</label><select id="simType" class="directory-search"><option value="bank">تحويل مصرفي</option><option value="international">تحويل دولي</option><option value="telecom">اتصالات</option><option value="government">خدمات حكومية</option><option value="education">رسوم تعليمية</option></select><label for="simProvider">الجهة أو الوجهة التجريبية</label><select id="simProvider" class="directory-search" required></select><label for="simAmount">المبلغ الافتراضي</label><input id="simAmount" class="directory-search" inputmode="numeric" pattern="[1-9][0-9]*" required><button class="primary" type="submit">مراجعة المحاكاة</button></form><div id="simReview" aria-live="polite"></div>';
  pages.services.prepend(simulation);
  const simOptions={bank:['بنك الخرطوم','بنك فيصل الإسلامي','بنك أم درمان الوطني','بنك النيل'],international:['مصر','السعودية','الإمارات'],telecom:['زين','سوداني','MTN','كنار'],government:['الجوازات','المرور','السجل المدني'],education:['جامعة الخرطوم','جامعة السودان للعلوم والتكنولوجيا','جامعة الجزيرة']};
  const simRefresh=()=>{$('simProvider').replaceChildren(...simOptions[$('simType').value].map(name=>new Option(name,name)));$('simReview').replaceChildren();};
  $('simType').addEventListener('change',simRefresh);simRefresh();
  $('serviceSimulation').addEventListener('input',()=>$('simReview').replaceChildren());
  $('serviceSimulation').addEventListener('submit',e=>{
    e.preventDefault();
    const amount=$('simAmount').value;
    if(!/^[1-9][0-9]*$/.test(amount))return;
    const review=$('simReview');review.replaceChildren();
    const details=document.createElement('p');details.textContent=$('simProvider').value+' · '+money(amount)+' وحدة افتراضية · لا خصم أو إرسال.';
    const confirm=document.createElement('button');confirm.type='button';confirm.className='primary';confirm.textContent='تأكيد المعاينة التجريبية';
    confirm.addEventListener('click',()=>{review.textContent='اكتملت المحاكاة المحلية فقط. لم تُنفذ معاملة مالية.';},{once:true});
    review.append(details,confirm);
  });
  const publicInstitutions=['جامعة الخرطوم','جامعة السودان للعلوم والتكنولوجيا','جامعة النيلين','جامعة بحري','جامعة أم درمان الإسلامية','جامعة الجزيرة','جامعة وادي النيل','جامعة شندي','جامعة كسلا','جامعة القضارف','جامعة البحر الأحمر','جامعة دنقلا','جامعة سنار','جامعة النيل الأزرق','جامعة كردفان','جامعة الفاشر','جامعة زالنجي','جامعة نيالا','جامعة بخت الرضا','جامعة القرآن الكريم والعلوم الإسلامية','جامعة الإمام المهدي','جامعة غرب كردفان','جامعة الدلنج','جامعة شرق كردفان','جامعة الجنينة','جامعة الضعين','جامعة المناقل','جامعة مروي التكنولوجية','جامعة السودان المفتوحة'];
  const privateInstitutions=['جامعة الأحفاد للبنات','جامعة السودان العالمية','جامعة أم درمان الأهلية','جامعة العلوم والتقانة','جامعة العلوم الطبية والتكنولوجيا','جامعة المستقبل','جامعة المغتربين','جامعة ود مدني الأهلية','الجامعة الوطنية','جامعة المشرق','جامعة الرازي','الجامعة العربية المفتوحة','جامعة قاردن سيتي','جامعة ابن سينا','جامعة الشيخ عبدالله البدري','جامعة النيل','جامعة البيان','جامعة النصر','جامعة الشرق للعلوم والتكنولوجيا','جامعة بورتسودان الأهلية','كلية شرق النيل','كلية المدار','كلية السودان الجامعية للبنات','أكاديمية السودان للعلوم المصرفية والمالية','كلية كمبوني للعلوم والتكنولوجيا','كلية الإمام الهادي','كلية غرب النيل','كلية بحري الأهلية','كلية أم درمان للعلوم والتكنولوجيا','كلية اليرموك','كلية الكاملين للعلوم والتقانة','كلية النور للعلوم والتكنولوجيا','كلية ستارز للعلوم الطبية والتقنية','كلية الحكمة للعلوم والتكنولوجيا','كلية النهضة','كلية الصفوة','كلية السلامة للعلوم والتكنولوجيا','كلية الريادة','كلية الأفق للعلوم والتكنولوجيا','كلية مكة التقنية لطب العيون','كلية نبتة','كلية الجزيرة للعلوم الطبية والتكنولوجيا','كلية الفجر للعلوم والتكنولوجيا','كلية فكتوريا للعلوم والتكنولوجيا','كلية القضارف للعلوم والتكنولوجيا','كلية المعرفة للعلوم والتكنولوجيا','كلية رويال للعلوم والتكنولوجيا','كلية شمال كردفان','كلية دار العلوم والتكنولوجيا','كلية المدائن للعلوم الطبية والتكنولوجيا'];
  const renderInstitutions=(items,root)=>{root.innerHTML=items.map(name=>'<button type="button" class="institution-chip" data-institution="'+escapeHtml(name)+'">'+escapeHtml(name)+'</button>').join('');};
  const publicRoot=pages.services.querySelector('#publicInstitutions');
  const privateRoot=pages.services.querySelector('#privateInstitutions');
  const institutionSearch=pages.services.querySelector('#institutionSearch');
  renderInstitutions(publicInstitutions,publicRoot);renderInstitutions(privateInstitutions,privateRoot);
  institutionSearch.addEventListener('input',()=>{const q=institutionSearch.value.trim();renderInstitutions(publicInstitutions.filter(n=>n.includes(q)),publicRoot);renderInstitutions(privateInstitutions.filter(n=>n.includes(q)),privateRoot);});
  pages.services.addEventListener('click',e=>{const item=e.target.closest('[data-institution]');if(item)toast('تم اختيار '+item.dataset.institution+' — عرض الرسوم والدفع غير متاحين في النسخة التجريبية.');});
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
    definitions.forEach(([name])=>{pages[name].classList.toggle('active',name===key);const button=nav.querySelector('[data-page="'+name+'"]');button.classList.toggle('active',name===key);if(name===key)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    if(key==='transfers') populateTransfer();
    if(key==='history') loadHistory();
    if(key==='account') $('accountEmail').textContent=state.user?.email||'حسابك التجريبي';
    window.scrollTo({top:0,behavior:'smooth'});
  };
  nav.addEventListener('click',e=>{const button=e.target.closest('[data-page]');if(button)go(button.dataset.page);});
  shortcuts.addEventListener('click',e=>{const button=e.target.closest('[data-go]');if(button)go(button.dataset.go);});
  $('accountLogout').addEventListener('click',()=>logout());
})();
