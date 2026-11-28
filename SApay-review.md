<p align="center">
  <img src="sapay-core%2015/public/icons/sapay-192.svg" width="96" height="96" alt="شعار SApay">
</p>

<h1 align="center">مراجعة SApay الشاملة: نسخة iPhone التجريبية</h1>

<p align="center">
  الفرع: <code>feature/ios-capacitor-testflight</code> · تاريخ المراجعة: 2026-11-28 · الوضع: <code>DEMO_ONLY</code>
</p>

> **نطاق هذه الوثيقة:** هذه مراجعة قراءة فقط. لم يُعدَّل أي ملف من ملفات التطبيق أو إعداداته، ولم يُنشأ commit أو طلب سحب، ولم يُنشر شيء، ولم تُنفَّذ أي عملية تحويل. ملف `.env` لم تُقرأ منه إلا أسماء المفاتيح، دون قيمها.
>
> **القرارات المعتمدة من صاحب المشروع:**
> - الأولوية لـ **iPhone فقط**، ولا دعم لـ iPad في هذه النسخة.
> - المبالغ تُعرض **أعدادًا صحيحة كما هي**، دون كسور عشرية ودون تغيير العملة.
> - لا يُخترع عنوان API، ولا تُغيَّر `apiBaseUrl` أو CORS قبل توثيق العنوان الفعلي ومصدره.
> - تُستخدم هوية SApay وأيقونتها الحالية [`public/icons/sapay-192.svg`](sapay-core%2015/public/icons/sapay-192.svg) و[`sapay-512.svg`](sapay-core%2015/public/icons/sapay-512.svg).

---

## المحتويات

1. [الملخص التنفيذي](#1-الملخص-التنفيذي)
2. [ما فحصته وما لم أتحقق منه](#2-ما-فحصته-وما-لم-أتحقق-منه)
3. [عنوان API وCORS](#3-عنوان-api-وcors)
4. [المشكلات المؤكدة حسب الأولوية](#4-المشكلات-المؤكدة-حسب-الأولوية)
5. [ما هو سليم](#5-ما-هو-سليم)
6. [خطة المراحل](#6-خطة-المراحل)
7. [قرارات مطلوبة](#7-قرارات-مطلوبة)

---

## 1. الملخص التنفيذي

**نسخة TestFlight لن تعمل بالإعداد الحالي.** السبب الأول أن `apiBaseUrl` فارغ، ولا يوجد في المستودع أي عنوان API منشور عبر HTTPS يمكن وضعه فيه. والسبب الثاني أن الخادم لا يفعّل CORS، فحتى بعد إضافة العنوان ستُرفض طلبات التطبيق القادمة من `capacitor://localhost`.

**تجربة iPhone فيها أعطال ظاهرة:**
- الشريط العلوي يقع تحت النوتش، لأنه لا يوجد أي `safe-area` في الأنماط.
- أيقونة التطبيق في iOS هي أيقونة Capacitor الافتراضية، وليست أيقونة SApay.
- تسجيل الـ Service Worker تمنعه سياسة CSP.
- رسائل الخطأ تظهر للمستخدم بالإنجليزية.

**الأساس سليم:** الاختبارات تنجح كلها (32 من 32)، ولا أخطاء في فحص الأنواع، ولا ثغرات معروفة في حزم الإنتاج. ومنطق الدفتر المالي محكم.

| الأولوية | العدد | أبرز ما فيها |
|---|---|---|
| 🔴 حرجة | 7 | العنوان وCORS، الـ SW، safe-area، الأيقونات، الرسائل الإنجليزية |
| 🟠 عالية | 7 | مرجع الشحن العام، حد الطلبات خلف proxy، سقف الشحن، CSP الأصلية، الجلسة، خطأ في السجل |
| 🟡 متوسطة | 9 | الخطوط وRTL، تكبير Safari، الأرقام العربية، زر نسخ المعرّف |
| 🔵 منخفضة | 7 | دعم iPad المفعّل، Info.plist، ملفات زائدة، تعارض الوثائق |

---

## 2. ما فحصته وما لم أتحقق منه

### ✅ فحصته فعليًا

| ما فحصته | الطريقة |
|---|---|
| كل كود الواجهة: `index.html` و`app.js` و`styles.css` و`service-worker.js` و`manifest.webmanifest` و`runtime-config.js` | قراءة كاملة |
| كل كود الخادم في `src/`، ومخطط قاعدة البيانات `database/`، و`dev-server.cjs` | قراءة كاملة |
| `Dockerfile` و`docker-compose.yml` و`.gitignore` و`.dockerignore` وCI | قراءة كاملة |
| `capacitor.config.ts`، و`Info.plist`، وإعدادات الأجهزة والإصدار في `project.pbxproj`، و`ios/.gitignore` | قراءة |
| تطابق نسخة الواجهة داخل `ios/App/App/public/` مع `public/` | مقارنة بالأمر `cmp`: متطابقة |
| أيقونة iOS `AppIcon-512@2x.png` | فتحتها بصريًا: هي أيقونة Capacitor الافتراضية، بمقاس 1024×1024 |
| سياسة CSP الافتراضية في Helmet المثبّت | قرأتها من الحزمة نفسها في `node_modules` عبر Node |
| البحث عن أي عنوان API أو إعداد CORS في كل المستودع | `grep` على كل الملفات ما عدا `node_modules` و`dist` و`backups` |
| الاختبارات | `npm test`: 5 ملفات، و32 اختبارًا، كلها ناجحة |
| فحص الأنواع | `tsc --noEmit`: لا أخطاء |
| ثغرات حزم الإنتاج | `npm audit --omit=dev`: لا ثغرات |
| أسرار في الملف `sapay-core 15.zip` | فحصت أسماء الملفات داخله فقط، ولم أجد ملفات `.env` أو مفاتيح |
| تجاهل git لـ `.env` و`backups/` و`ios/App/App/public` | `git check-ignore` |

### ⚠️ لم أتحقق منه، ويحتاج اختبارًا قبل الاعتماد عليه

| ما لم أتحقق منه | السبب |
|---|---|
| السلوك الفعلي على جهاز iPhone أو في محاكي iOS | البيئة Linux، ولا يوجد Xcode ولا جهاز |
| بناء المشروع في Xcode، أو إنشاء Archive، أو الرفع إلى TestFlight | يتطلب macOS |
| تشغيل الواجهة في متصفح وأخذ لقطات شاشة | لم أشغّل التطبيق. ملاحظات العرض مستنتجة من الكود ومن سلوك iOS المعروف |
| أثر `letter-spacing` على الحروف العربية، وتكبير Safari للحقول الصغيرة، وتداخل النوتش | سلوك موثّق ومعروف، لكني لم أره على جهاز |
| هل تُحسب طلبات `OPTIONS` ضمن حد الطلبات بعد تفعيل CORS | يعتمد على ترتيب الـ middleware في Nest، ويحتاج تجربة بعد التفعيل |
| صور شاشة البداية (Splash) | لم أفتحها. أرجّح أنها افتراضية لكني لم أتأكد |
| البيانات الفعلية في قاعدة البيانات | لم أستعلم عنها، ولم أنفّذ أي عملية |
| محتوى النسخ الاحتياطية في `backups/` | لم أفتحها |
| قرار مراجعة Apple | التقديرات هنا مبنية على متطلبات Apple المعروفة، وليست نتيجة مراجعة فعلية |
| عناوين Codespaces المُعاد توجيهها | لا يوجد أي رابط مكتوب في المستودع، ولم أفحص إعدادات Codespaces نفسها |

---

## 3. عنوان API وCORS

### 3.1 العنوان: ما يوجد فعلًا في المشروع

**لا يوجد في المستودع أي عنوان API منشور عبر HTTPS يصلح لنسخة iPhone.** هذا ما وجدته ومصدر كل منه:

| ما وجدته | المصدر | يصلح لـ iPhone؟ |
|---|---|---|
| `apiBaseUrl: ''` (فارغ) | [`public/runtime-config.js:2`](sapay-core%2015/public/runtime-config.js#L2)، ونسخة `ios/App/App/public/` مطابقة | — |
| `http://localhost:3000` | [`README.md`](sapay-core%2015/README.md) في الأسطر 16 إلى 112 | لا. عنوان محلي وغير HTTPS، والكود يرفضه |
| `https://api.example.com` | [`docs/SApay-IOS-TESTFLIGHT-PREPARATION-AR.md:10`](sapay-core%2015/docs/SApay-IOS-TESTFLIGHT-PREPARATION-AR.md#L10) | لا. الوثيقة نفسها تصفه بأنه "مثال توضيحي فقط" |
| "رابط Codespaces خاص ومؤقت" | [`SApay-BETA-RELEASE-CHECKLIST-AR.md:43`](sapay-core%2015/docs/SApay-BETA-RELEASE-CHECKLIST-AR.md#L43) و[`SApay-BETA-RELEASE-NOTES-0.1.0-beta.1.md:32`](sapay-core%2015/docs/SApay-BETA-RELEASE-NOTES-0.1.0-beta.1.md#L32) | لا. الرابط غير مكتوب في أي ملف، و[وثيقة TestFlight:22](sapay-core%2015/docs/SApay-IOS-TESTFLIGHT-PREPARATION-AR.md#L22) تستبعده صراحة |
| أسماء مفاتيح `.env` | `PORT` و`DATABASE_URL` و`POSTGRES_PASSWORD` و`TEST_POSTGRES_PASSWORD` و`AUTH_TOKEN_SECRET` | لا يوجد مفتاح لعنوان عام |
| إعدادات نشر (fly أو render أو vercel أو railway أو devcontainer) | غير موجودة | — |

**كيف يتعامل الكود مع العنوان الآن، والسلوك آمن** ([`app.js:6-16`](sapay-core%2015/public/app.js#L6-L16)):
- يكتشف أنه يعمل داخل التطبيق الأصلي من `window.location.protocol === 'capacitor:'`.
- إذا كان `apiBaseUrl` فارغًا، يرفض الطلب برسالة عربية، ولا يرسله إلى localhost.
- يقبل `https:` فقط، فلا حاجة إلى استثناءات ATS.
- يأخذ أصل العنوان وحده (`url.origin`) ثم يضيف `/api`. أي أن القيمة المطلوبة تكون بالشكل `https://<النطاق>` دون `/api`.

### 3.2 تعارض في الوثائق يجب حسمه قبل اختيار العنوان

| المصدر | ما يقوله |
|---|---|
| [`README.md:5`](sapay-core%2015/README.md#L5) و[`README.md:86`](sapay-core%2015/README.md#L86) | الـ API مربوط بـ `127.0.0.1:3000`، و"لا تعرّضه عبر نفق عام أو reverse proxy" |
| [`docker-compose.yml:27`](sapay-core%2015/docker-compose.yml#L27) و[`:30`](sapay-core%2015/docker-compose.yml#L30) | `network_mode: host` مع `APP_HOST: 0.0.0.0`، أي أن الخادم يستمع على كل الواجهات |
| [وثيقة TestFlight:10 و22](sapay-core%2015/docs/SApay-IOS-TESTFLIGHT-PREPARATION-AR.md#L10) | التطبيق يحتاج API منشورًا وثابتًا عبر HTTPS |

### 3.3 CORS

**غير مُعدّ إطلاقًا.** لا يوجد `enableCors` ولا أي ترويسة `Access-Control-*` في [`src/main.ts`](sapay-core%2015/src/main.ts) أو غيره. حزمة `cors` موجودة فقط كاعتمادية تابعة لـ `@nestjs/platform-express`، فلا حاجة لإضافة حزمة جديدة.

- **أصل التطبيق:** `capacitor://localhost`، لأن [`capacitor.config.ts`](sapay-core%2015/capacitor.config.ts) لا يحتوي قسم `server`.
- **طلبات preflight:** كل طلب يرسل `Content-Type: application/json` و`Authorization`، والتحويل يرسل أيضًا `Idempotency-Key`، فسيسبق كل طلبٍ طلبُ `OPTIONS`.
- **حد الطلبات:** مُطبَّق على كل المسارات ([`app.module.ts:9`](sapay-core%2015/src/app.module.ts#L9))، وحد الدخول 5 طلبات في الدقيقة. *لم أتحقق* مما إذا كانت `OPTIONS` ستُحسب ضمنه.
- **الوثائق:** [وثيقة TestFlight](sapay-core%2015/docs/SApay-IOS-TESTFLIGHT-PREPARATION-AR.md) لا تذكر CORS.

### 3.4 ما يلزم، ومشروط بتوثيق العنوان أولًا

1. ينشر صاحب المشروع الخادم التجريبي على عنوان HTTPS ثابت، ويوثّق مصدره.
2. يُحسم تعارض README مع `docker-compose` (القسم 3.2).
3. يوضع أصل العنوان في `apiBaseUrl`، ثم يُشغَّل `npx cap sync ios`. هذا ضروري لأن `ios/App/App/public` مستبعد من git ([`ios/.gitignore`](sapay-core%2015/ios/.gitignore)).
4. يُفعَّل CORS لأصل `capacitor://localhost` وحده، بالطرق `GET` و`POST` و`OPTIONS`، والترويسات `Content-Type` و`Authorization` و`Idempotency-Key`، وبدون credentials ولا `*`. ويُفضَّل أن تُقرأ القائمة من متغير بيئة.
5. يُختبر أن الأصل المسموح يُقبل وأن غيره يُرفض، وأن طلبات `OPTIONS` لا تستهلك حد الدخول.

---

## 4. المشكلات المؤكدة حسب الأولوية

> "مؤكدة" تعني أن الدليل موجود في الكود. البنود التي يعتمد أثرها على جهاز فعلي مُعلَّمة بـ *(الأثر لم يُختبر على جهاز)*.

### 🔴 حرجة: تمنع TestFlight أو تكسر تجربة iPhone

#### C1. لا يوجد عنوان API، وCORS غير مفعّل
- **الملفات:** [`public/runtime-config.js:2`](sapay-core%2015/public/runtime-config.js#L2) و[`src/main.ts`](sapay-core%2015/src/main.ts)
- **الدليل:** القسم 3.
- **الخطر:** التطبيق لا يستطيع تسجيل الدخول ولا جلب أي بيانات.

#### C2. CSP تمنع تسجيل الـ Service Worker
- **الملف:** [`public/index.html:17`](sapay-core%2015/public/index.html#L17)
- **الدليل:** التسجيل مكتوب في `<script>` مضمّن، و`helmet()` ([`main.ts:12`](sapay-core%2015/src/main.ts#L12)) يفرض `script-src 'self'`. تأكدت من القيمة من الحزمة المثبّتة. و[`dev-server.cjs`](sapay-core%2015/dev-server.cjs) يفرض السياسة نفسها.
- **الخطر:** نسخة Safari أو "الإضافة إلى الشاشة الرئيسية" لا تخزّن شيئًا ولا تعرض رسالة انقطاع الاتصال.

#### C3. استراتيجية تخزين تمنع وصول التحديثات
- **الملف:** [`public/service-worker.js:1`](sapay-core%2015/public/service-worker.js#L1) و[`:24`](sapay-core%2015/public/service-worker.js#L24)
- **الدليل:** `CACHE_NAME = 'sapay-beta-shell-v1'` ثابت، والملفات `app.js` و`styles.css` تُقدَّم من الذاكرة المؤقتة أولًا.
- **الخطر:** بعد إصلاح C2 سيبقى المختبرون على نسخة قديمة.

#### C4. لا يوجد safe-area على iPhone
- **الملفات:** [`public/index.html:5`](sapay-core%2015/public/index.html#L5) و[`:8`](sapay-core%2015/public/index.html#L8) و[`public/styles.css`](sapay-core%2015/public/styles.css)
- **الدليل:** الصفحة تستخدم `viewport-fit=cover` و`black-translucent`، بينما عدد مرات ظهور `safe-area` في `styles.css` صفر. و`.topbar` بارتفاع ثابت 72px وخلفية بيضاء، و`.toast` مثبّت على `bottom:22px`.
- **الخطر:** الشعار وزر الخروج تحت النوتش أو Dynamic Island، ونص شريط الحالة أبيض فوق خلفية بيضاء، والـ toast فوق مؤشر الشاشة الرئيسية. *(الأثر لم يُختبر على جهاز)*

#### C5. أيقونة iOS ليست أيقونة SApay
- **الملف:** [`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`](sapay-core%2015/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png)
- **الدليل:** عند فتح الصورة تظهر أيقونة Capacitor الافتراضية (شكل X أزرق على شبكة).
- **الخطر:** هوية خاطئة على الشاشة الرئيسية وفي TestFlight، واحتمال رفض في مراجعة App Store.
- **الإصلاح:** تُولَّد من الأيقونة الحالية [`sapay-512.svg`](sapay-core%2015/public/icons/sapay-512.svg) كصورة PNG بمقاس 1024×1024، بلا شفافية ولا زوايا مدوّرة لأن iOS يدوّرها بنفسه.

#### C6. `apple-touch-icon` بصيغة SVG
- **الملف:** [`public/index.html:11`](sapay-core%2015/public/index.html#L11)
- **الدليل:** `href="/icons/sapay-192.svg"`، وiOS لا يدعم SVG في هذا الوسم.
- **الخطر:** عند الإضافة إلى الشاشة الرئيسية من Safari تظهر لقطة للصفحة بدل الشعار.
- **الإصلاح:** صورة PNG بمقاس 180×180 من الأيقونة نفسها.

#### C7. رسائل الخادم الإنجليزية تظهر في الواجهة العربية
- **الملف:** [`public/app.js:21`](sapay-core%2015/public/app.js#L21)
- **الدليل:** `throw new Error(data.message || ...)`، والخادم يرسل رسائل مثل `Invalid email or password` و`Insufficient balance` و`Currency mismatch; FX is not supported`.
- **الخطر:** تجربة عربية مكسورة في كل حالة خطأ.

### 🟠 عالية: أمان ووظائف تجريبية

#### H1. مرجع الشحن التجريبي فريد على مستوى النظام كله
- **الملفات:** [`database/init/001_schema.sql:54`](sapay-core%2015/database/init/001_schema.sql#L54) و[`postgres-ledger.service.ts:106`](sapay-core%2015/src/database/postgres-ledger.service.ts#L106) و[`index.html:76`](sapay-core%2015/public/index.html#L76)
- **الدليل:** المخطط يحتوي `UNIQUE (entry_type, reference)`، والاستعلام لا يقيّد المرجع بالمستخدم، والحقل يقترح القيمة `demo-credit-001`.
- **الخطر:** ثاني مستخدم يكتب المرجع نفسه يتلقى خطأ 409، فيعرف أن مستخدمًا آخر استعمله.

#### H2. حد الطلبات يُحسب لكل IP خلف proxy
- **الملف:** [`src/security/rate-limit.middleware.ts:18-20`](sapay-core%2015/src/security/rate-limit.middleware.ts#L18-L20)
- **الدليل:** `trust proxy` معطّل عمدًا، والمفتاح هو `req.ip`.
- **الخطر:** خلف أي reverse proxy أو منصة استضافة يتشارك كل المختبرين حدًا واحدًا: 5 محاولات دخول في الدقيقة للجميع.

#### H3. الشحن التجريبي بلا سقف عملي
- **الملف:** [`postgres-ledger.service.ts:248`](sapay-core%2015/src/database/postgres-ledger.service.ts#L248)
- **الدليل:** الحد الوحيد هو `9_000_000_000_000_000_000n`.
- **الخطر:** أرصدة غير واقعية تربك نتائج الاختبار.

#### H4. لا توجد CSP داخل التطبيق الأصلي
- **الملف:** [`public/index.html`](sapay-core%2015/public/index.html)
- **الدليل:** Helmet لا يُطبَّق على الملفات المحلية داخل WebView، ولا يوجد وسم `<meta http-equiv="Content-Security-Policy">`.
- **الخطر:** لا خط دفاع ثانٍ ضد XSS داخل التطبيق. الإصلاح مشروط بالعنوان من C1، لأن `connect-src` يجب أن يسمح به وحده.

#### H5. إمكانية معرفة الحسابات المسجلة
- **الملف:** [`src/auth/auth.service.ts:67`](sapay-core%2015/src/auth/auth.service.ts#L67) و[`:74`](sapay-core%2015/src/auth/auth.service.ts#L74)
- **الدليل:** التسجيل يرد بـ "An account with this email already exists"، وتسجيل الدخول لا يشغّل scrypt عندما يكون البريد غير موجود، فيختلف زمن الرد.
- **الخطر:** منخفض في بيئة تجريبية، لكن يُستحسن توحيد الرد.

#### H6. انتهاء الجلسة بصمت
- **الملفات:** [`auth.service.ts:6`](sapay-core%2015/src/auth/auth.service.ts#L6) و[`app.js:20`](sapay-core%2015/public/app.js#L20) و[`app.js:140`](sapay-core%2015/public/app.js#L140)
- **الدليل:** `TTL = 900` ثانية ولا يوجد تجديد للرمز، وعند 401 يُستدعى `logout(false)` دون أي رسالة. وبعد إعادة التحميل يُستبدل البريد بالنص `'حسابك'`.
- **الخطر:** المختبر يُعاد إلى شاشة الدخول فجأة ويظن أن التطبيق تعطّل.

#### H7. التحويل الوارد يظهر في السجل كأنه خصم
- **الملف:** [`public/app.js:96`](sapay-core%2015/public/app.js#L96)
- **الدليل:** `p.side === (credit ? 'CREDIT' : 'CREDIT')`، والفرعان متطابقان. والخادم يُرجع فقط القيود الخاصة بحسابات المستخدم ([`postgres-ledger.service.ts:79`](sapay-core%2015/src/database/postgres-ledger.service.ts#L79))، فالتحويل الوارد يُعرض بلون الخصم الأحمر، دون تمييز الوارد من الصادر ودون إشارة +/−.
- **الخطر:** معلومة مالية مضللة في السجل.

### 🟡 متوسطة: الواجهة العربية وRTL وتجربة iPhone

| # | المشكلة | الملف والدليل |
|---|---|---|
| M1 | `letter-spacing` على النصوص العربية يفكك اتصال الحروف *(الأثر البصري لم يُختبر على جهاز)*. ولا يوجد خط عربي محدد، فالواجهة تعتمد على `system-ui` و`Tahoma` | [`styles.css`](sapay-core%2015/public/styles.css): القيم `-1.3px` في `.intro h1`، و`-1px` في `.brand`، و`.4px` في `.eyebrow` |
| M2 | خط الحقول أصغر من 16px، فيكبّر Safari الصفحة عند التركيز *(سلوك iOS معروف، لم يُختبر هنا)* | `styles.css`: `input,select{...font-size:14px}` |
| M3 | حقل المبلغ يرفض الأرقام العربية الهندية (٥٠٠). الإصلاح: تحويلها إلى لاتينية، مع بقاء القيمة عددًا صحيحًا دون أي تحويل للوحدة | [`index.html:77`](sapay-core%2015/public/index.html#L77) يستخدم `type="number"`، والتحقق في `app.js` بالنمط `/^[1-9][0-9]*$/` |
| M4 | المبالغ بأرقام لاتينية والتواريخ بأرقام عربية هندية | [`app.js:4`](sapay-core%2015/public/app.js#L4) يستخدم `en-US`، و[`app.js:98`](sapay-core%2015/public/app.js#L98) يستخدم `ar` |
| M5 | معرّف المحفظة بحجم 10px ولا يوجد زر نسخ، مع أن التحويل يتطلب لصقه | `styles.css`: `.wallet-id{font-size:10px}`، و`app.js` في `renderWallets` |
| M6 | على الهاتف يأتي نص التعريف قبل نموذج الدخول، والارتفاع محسوب بـ `100vh` | `index.html` (`.intro` قبل `.auth-panel`)، و`styles.css`: `calc(100vh - 160px)` |
| M7 | خصائص فيزيائية بدل المنطقية في RTL، وإجمالي الرصيد محاذى بعكس عنوانه | `styles.css`: `margin-left` و`float:left`، و`.total-balance{direction:ltr;justify-content:flex-start}` |
| M8 | `theme-color` كحلي بينما الشريط العلوي أبيض | [`index.html:6`](sapay-core%2015/public/index.html#L6) و[`manifest.webmanifest`](sapay-core%2015/public/manifest.webmanifest) |
| M9 | الحالة `POSTED` تظهر بالإنجليزية، وأزرار التبويب بلا `role="tab"` أو `aria-selected` | [`app.js:99`](sapay-core%2015/public/app.js#L99) و[`index.html:36`](sapay-core%2015/public/index.html#L36) |

### 🔵 منخفضة: تهيئة iOS وتنظيف المستودع

| # | المشكلة | الملف والدليل |
|---|---|---|
| L1 | **دعم iPad مفعّل، وهذا يخالف قرار "iPhone فقط"** | [`project.pbxproj:316`](sapay-core%2015/ios/App/App.xcodeproj/project.pbxproj#L316) و[`:337`](sapay-core%2015/ios/App/App.xcodeproj/project.pbxproj#L337) فيهما `TARGETED_DEVICE_FAMILY = "1,2"`، و[`Info.plist:60`](sapay-core%2015/ios/App/App/Info.plist#L60) فيه `UISupportedInterfaceOrientations~ipad` |
| L2 | الوضع الأفقي مسموح على iPhone، والتصميم عمودي | [`Info.plist:57`](sapay-core%2015/ios/App/App/Info.plist#L57) |
| L3 | `CFBundleDevelopmentRegion` قيمته `en` والأنسب `ar`. ومفتاح `ITSAppUsesNonExemptEncryption` غير موجود، فسيسأل TestFlight مع كل رفع. و`armv7` إعداد قديم من القالب | [`Info.plist:8`](sapay-core%2015/ios/App/App/Info.plist#L8) و[`:52`](sapay-core%2015/ios/App/App/Info.plist#L52) |
| L4 | أيقونات الـ manifest بصيغة SVG فقط، مع `"any maskable"` مجتمعين | [`manifest.webmanifest`](sapay-core%2015/public/manifest.webmanifest) |
| L5 | ملفات زائدة متتبعة أو متروكة: `sapay-core 15.zip` متتبع في git، و`public/sapay-demo.html` قديم في الجذر، وملفات `*.bak` | جذر المستودع، و`sapay-core 15/docker-compose.yml*.bak` |
| L6 | تعارض README مع `docker-compose` حول عنوان الاستماع | القسم 3.2 |
| L7 | لا توجد اختبارات للواجهة، ولا خطوة في CI للتحقق من `cap sync` | [`.github/workflows/sapay-ci.yml`](.github/workflows/sapay-ci.yml) |

---

## 5. ما هو سليم

- **الاختبارات:** 32 من 32 ناجحة، و`tsc` نظيف، و`npm audit --omit=dev` بلا ثغرات.
- **الدفتر المالي:** كل عملية داخل transaction، والأقفال تُؤخذ بترتيب ثابت، وفيه `pg_advisory_xact_lock` مع idempotency، والمبالغ تُعالج بـ BigInt، ويُتحقق من الرصيد داخل الـ transaction.
- **المصادقة:** كلمات المرور مشفّرة بـ scrypt مع salt، والرمز موقّع بـ HMAC ومقارنته آمنة زمنيًا، ويُتحقق من `iss` و`aud` و`exp`.
- **الخصوصية:** كل الاستعلامات مقيّدة بـ `user_id`.
- **الأسرار:** `.env` و`backups/` مستبعدان من git وDocker.
- **التطبيق الأصلي:** يفرض HTTPS، ولا يرسل الطلبات إلى localhost.
- **الواجهة:** تهرّب كل النصوص المعروضة عبر `escapeHtml`.

---

## 6. خطة المراحل

**قواعد التنفيذ:**
- لا يُعدَّل أي ملف إلا بعد موافقة صريحة على المرحلة أو البند.
- كل مرحلة في commit منفصل على `feature/ios-capacitor-testflight`، بعد نجاح `npm test` و`npm run build`.
- لا طلب سحب، ولا دمج، ولا نشر، إلا بطلب صريح.
- المبالغ تبقى أعدادًا صحيحة، والعملة لا تتغير.
- تُستخدم هوية SApay وأيقونتها الحالية.

| المرحلة | البنود | الملفات المتأثرة | المخاطر والشروط |
|---|---|---|---|
| **0: قرار صاحب المشروع** | C1 والقسم 3.2 | — | تحديد عنوان HTTPS ومصدره، وحسم تعارض README. **شرط للمرحلة 2** |
| **1: iPhone أولًا** | C2 و C3 و C4 و C5 و C6 و C7، مع L1 و L2 | `public/index.html` و`app.js` و`styles.css` و`service-worker.js` و`manifest.webmanifest` و`public/icons/` (PNG جديدة من SVG الحالية) و`AppIcon.appiconset` و`project.pbxproj` و`Info.plist` | لا تمس CORS ولا `apiBaseUrl`. تغيير اسم الذاكرة المؤقتة يمسح الملفات المخزّنة عند المختبرين، وهذا مقصود. تحتاج اختبارًا على جهاز فعلي |
| **2: العنوان وCORS** | C1 و H4، وبند `OPTIONS` | `src/main.ts` و`public/runtime-config.js` و`rate-limit.middleware.ts` و`index.html` (CSP) و`docs/` و`README.md` و`test/` | **لا تبدأ إلا بعد المرحلة 0.** خطأ في قائمة الأصول المسموحة إما يكسر التطبيق أو يفتح الـ API لكل الأصول |
| **3: الأمان والوظائف** | H1 و H2 و H3 و H5 و H6 و H7 | `postgres-ledger.service.ts` و`database/migrations/` (migration جديد) و`rate-limit.middleware.ts` و`auth.service.ts` و`app.js` و`test/` | H1 يغيّر قيدًا في قاعدة البيانات، فيلزم نسخ احتياطي قبله. H2 يتطلب ضبط `trust proxy` حسب منصة النشر من المرحلة 0 |
| **4: الواجهة العربية** | M1 إلى M9 | `styles.css` و`index.html` و`app.js`، وملف خط عربي مستضاف محليًا | الخط يُستضاف محليًا ولا يُحمَّل من خدمة خارجية، حفاظًا على CSP والخصوصية. تحتاج مراجعة بصرية على iPhone |
| **5: التنظيف** | L3 و L4 و L5 و L6 و L7 | `Info.plist` و`manifest.webmanifest` والجذر و`README.md` وCI | حذف الملفات القديمة يحتاج تأكيدًا لكل ملف |

**بوابة قبول المرحلة 1، تُختبر على iPhone فعلي:**
- [ ] الشريط العلوي لا يتداخل مع النوتش أو Dynamic Island.
- [ ] نص شريط الحالة مقروء.
- [ ] أيقونة SApay تظهر في الشاشة الرئيسية وفي TestFlight.
- [ ] رسائل الخطأ بالعربية.
- [ ] الـ Service Worker يُسجَّل في Safari، والتحديث يصل بعد إعادة الفتح.
- [ ] التطبيق لا يعمل على iPad ولا يدور أفقيًا على iPhone.

---

## 7. قرارات مطلوبة

1. **عنوان API:** ما عنوان HTTPS الثابت للخادم التجريبي، وأين يُستضاف؟ هذا شرط للمرحلة 2.
2. **التعارض:** هل يُحدَّث README ليسمح بنشر عام محدود للنسخة التجريبية، أم يُستضاف الخادم بطريقة تحافظ على القيد الحالي؟
3. **المرحلة 1:** هل توافق عليها كما هي، أم تريد بنودًا محددة منها فقط؟

---

<p align="center"><sub>SApay · نسخة تجريبية خاصة · لا أموال حقيقية ولا تكاملات مصرفية · DEMO_ONLY</sub></p>
