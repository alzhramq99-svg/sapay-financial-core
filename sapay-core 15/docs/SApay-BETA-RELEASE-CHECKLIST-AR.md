# سجل تجهيز إصدار SApay Beta

**تاريخ المراجعة:** 10 نوفمبر 2026  
**النوع:** إصدار تجريبي خاص (Private Beta)  
**النطاق الإلزامي:** `DEMO_ONLY` — لا أموال حقيقية، ولا تحويلات بنكية فعلية، ولا ادعاء بوجود ترخيص مالي.

## الحالة الحالية

| البند | الحالة | الدليل / الملاحظة |
|---|---|---|
| بناء NestJS للإنتاج | ناجح سابقًا | `npm run build` |
| الاختبارات الوحدوية | ناجح سابقًا | 5 مجموعات، 32 اختبارًا |
| اختبارات تكامل PostgreSQL | ناجح سابقًا | 11 اختبارًا؛ لا حاجة لإعادتها ما لم يتغير كود المسارات أو قاعدة البيانات |
| فحص صحة API | ناجح سابقًا | `/api/health` يعرض `DEMO_ONLY` و`realMoneyEnabled=false` و`bankIntegrationsEnabled=false` |
| فحص اتصال قاعدة البيانات | ناجح سابقًا | `/api/database/health` يعرض `configured=true` و`reachable=true` |
| نسخة PostgreSQL الاحتياطية | تم التحقق سابقًا | `backups/sapay_demo_prebeta_2026-11-06.dump` واجتاز SHA-256 |
| واجهة الهاتف | اجتازت تجربة المستخدم | فتح لوحة الحسابين على iPhone |
| فصل الحسابات والمحافظ | ناجح في التحقق الحالي | محفظتان SDG بمعرّفيْن مختلفين، وكل واحدة مرتبطة بمالك مختلف في PostgreSQL |
| دليل المختبر العربي | جاهز | `SApay-BETA-TEST-GUIDE-AR.md` |
| دليل الإصدار | محدث | هذا الملف |
| هيكل تطبيق iOS عبر Capacitor | مدمج | Bundle ID: `com.saadaligroup.sapay`، PR #5 مدمج |
| بناء iOS للمحاكي | ناجح سابقًا | Artifact `sapay-ios-simulator`؛ هذا ليس IPA ولا يصلح للتثبيت على iPhone |
| سير بناء IPA ورفعه إلى TestFlight | مجهز، غير منفذ بعد | `.github/workflows/ios-testflight.yml`؛ يتطلب عضوية Apple نشطة والأسرار السبعة |
| عضوية Apple Developer | قيد مراجعة Apple | تم استلام المستندات وطلب الدعم؛ لا يوجد تأكيد تفعيل حتى الآن |
| ESLint | غير متاح في بيئة التطوير | أمر `npm run lint` يشير إلى `eslint` لكنه غير مثبت؛ وليس ضمن خطوات CI الحالية |

## بوابات ما قبل توزيع النسخة الخاصة

- [x] تثبيت نطاق Demo فقط وإظهار التنبيه داخل الواجهة.
- [x] التحقق سابقًا من صحة API واتصال PostgreSQL.
- [x] اجتياز الاختبارات الوحدوية وبناء الإنتاج سابقًا.
- [x] تحقق المستخدم عمليًا من حسابين ومحفظتين منفصلتين.
- [x] تجهيز دليل المختبر العربي.
- [x] تثبيت نقطة استعادة آمنة (نسخة احتياطية موثقة) والتحقق من SHA-256 قبل أي تغيير إصدار أو ترحيل قاعدة بيانات.
- [x] تجهيز هيكل iOS باستخدام Capacitor ومعرّف الحزمة الثابت.
- [x] إعداد سير بناء سحابي على macOS لتوقيع التطبيق وإنتاج IPA ورفعه إلى TestFlight بعد توفير متطلبات Apple.
- [ ] تفعيل عضوية Apple Developer وربط طلب الدفع/التسجيل بحساب المطور.
- [ ] إنشاء App ID صريح بالمعرّف `com.saadaligroup.sapay` وسجل التطبيق في App Store Connect.
- [ ] إنشاء شهادة Apple Distribution وملف App Store provisioning profile المطابقين لمعرّف الحزمة وTeam ID.
- [ ] إنشاء App Store Connect API key وإضافة الأسرار السبعة إلى GitHub Actions Secrets.
- [ ] تنفيذ سير `SApay iOS TestFlight build` يدويًا والتحقق من نجاح التوقيع وتوليد IPA وظهور البناء في TestFlight.
- [ ] مراجعة مستقلة لإعدادات النشر والأسرار وHTTPS وسياسات الوصول قبل دعوة مختبرين إضافيين.
- [ ] إكمال مراجعة أمنية مستقلة لمسارات المصادقة والصلاحيات ومحدّد المعدل.
- [ ] تحديد قناة استقبال بلاغات المختبرين وآلية التعامل مع الأعطال.
- [ ] استكمال بيانات الخصوصية والدعم ولقطات الشاشة والتصنيف والتصدير في App Store Connect.
- [ ] اعتماد رقم إصدار Beta وإنشاء وسم Git بعد اجتياز البوابات أعلاه.

## تجهيز TestFlight — القيم الثابتة

| الحقل | القيمة |
|---|---|
| اسم التطبيق | SApay |
| Bundle ID | `com.saadaligroup.sapay` |
| SKU | `SAPAY-IOS-001` |
| الإصدار التسويقي | `0.1.0` |
| رقم البناء | رقم GitHub Actions run |
| API | `https://sapay-api.onrender.com` |
| نمط التشغيل | `DEMO_ONLY` |

### أسرار GitHub المطلوبة

تُضاف من إعدادات المستودع: **Settings → Secrets and variables → Actions**. لا تُرسل هذه القيم في المحادثة ولا تضعها في ملفات المشروع.

1. `IOS_DISTRIBUTION_CERTIFICATE_BASE64`
2. `IOS_CERTIFICATE_PASSWORD`
3. `IOS_PROVISIONING_PROFILE_BASE64`
4. `IOS_TEAM_ID`
5. `APP_STORE_CONNECT_ISSUER_ID`
6. `APP_STORE_CONNECT_API_KEY_ID`
7. `APP_STORE_CONNECT_API_PRIVATE_KEY`

يتحقق سير البناء من وجود الأسرار ومن تطابق `application-identifier` و`TeamIdentifier` في ملف provisioning profile قبل التوقيع.

## قيود معروفة تمنع اعتبارها إصدارًا عامًا

1. محدّد المعدل الحالي داخل الذاكرة وعلى مستوى عملية واحدة؛ لا يكفي وحده لتشغيل متعدد النسخ أو إنتاج عام.
2. لا توجد آلية إبطال فوري للجلسات/الرموز أو تدوير جلسات مكتملة؛ يلزم استكمالها قبل الاستخدام العام.
3. لا توجد تكاملات بنكية أو مالية حقيقية، ويجب إبقاء ذلك معطّلًا.
4. لا يُسمح بإدخال بيانات مالية حقيقية أو بيانات حساسة للمختبرين.
5. رابط Codespaces خاص ومناسب للاختبار المؤقت فقط، وليس عنوان نشر دائمًا أو SLA.
6. نجاح بناء المحاكي لا يعني وجود IPA موقّع أو أن التطبيق رُفع إلى TestFlight.

## سياسة اعتماد الإصدار

لا يُنشأ Git tag ولا يُعلن إصدار Beta على أنه جاهز للتوزيع قبل إكمال بوابات التوقيع والخصوصية والأمن والوصول. يمكن إجراء تجربة قبول خاصة محدودة بالحسابات التجريبية الحالية ضمن `DEMO_ONLY` مع إبقاء الرابط خاصًا.

## ملحق PWA للآيفون

- [x] إضافة `manifest.webmanifest` مع الاسم العربي والاتجاه RTL ووضع standalone.
- [x] إضافة أيقونات SVG.
- [x] إضافة دعم Apple web app وتسجيل Service Worker.
- [x] عدم تخزين `/api/*` أو صفحات التنقل؛ الواجهة تحتاج اتصالًا بالخادم لعرض بيانات الحساب الحالية.
- [x] التحقق سابقًا من استجابة ملفات PWA بـ HTTP 200.
- [ ] اختبار التثبيت الفعلي على iPhone عبر Safari بواسطة المستخدم.

## ملحق تطبيق iOS الأصلي

- [x] تجهيز غلاف Capacitor لواجهة الويب الحالية؛ لا يعيد تنفيذ منطق المحفظة أو API.
- [x] تثبيت Bundle ID: `com.saadaligroup.sapay`.
- [x] إضافة Workflow يدوي على GitHub Actions يستخدم macOS وXcode.
- [x] التحقق في Workflow من أسرار التوقيع وملف provisioning profile.
- [ ] بناء Release archive موقّع وتصدير IPA.
- [ ] رفع IPA إلى App Store Connect والتحقق من ظهوره في TestFlight.
- [ ] تثبيت نسخة TestFlight على iPhone وإجراء قبول نهائي قبل دعوة المختبرين.

**مهم:** عضوية Apple قيد المراجعة حاليًا. تأكيد استلام Apple للمستندات أو طلب الدعم لا يساوي تفعيل العضوية. لا تُكرر عملية الدفع.### حالة تطبيق iOS وTestFlight — تحديث 10 نوفمبر 2026

| البند | الحالة | الدليل / القيد |
|---|---|---|
| غلاف iOS باستخدام Capacitor | [x] جاهز في المستودع | `sapay-core 15/mobile`، Bundle ID: `com.saadaligroup.sapay` |
| إعداد البناء السحابي على macOS | [x] مُعدّ | `.github/workflows/ios-testflight.yml`، تشغيل يدوي من GitHub Actions |
| بناء محاكي iOS | [x] نجح سابقًا | Artifact باسم `sapay-ios-simulator`؛ هذا للمحاكي فقط وليس IPA للآيفون |
| التحقق من إعدادات التوقيع | [x] أضيفت فحوصات مسبقة | يتحقق Workflow من الأسرار السبعة ومن تطابق Bundle ID وTeam ID في ملف Provisioning Profile |
| نجاح أحدث Workflow بعد آخر تعديل | [ ] غير مثبت | لا نعتبر تعديل Workflow ناجحًا حتى يظهر تشغيل أخضر على أحدث commit |
| عضوية Apple Developer | [ ] بانتظار تأكيد Apple | تم استلام مستندات التسجيل وطلب الدعم؛ الاستلام ليس تأكيد تفعيل |
| App ID وسجل التطبيق في App Store Connect | [ ] ينتظران تفعيل العضوية | Bundle ID المطلوب: `com.saadaligroup.sapay`، وSKU: `SAPAY-IOS-001` |
| شهادة Apple Distribution وملف App Store Provisioning | [ ] غير مثبتين | يجب إنشاؤهما من حساب Apple النشط |
| مفاتيح GitHub Actions السبعة | [ ] غير مثبتة | تُضاف في إعدادات GitHub Secrets فقط، ولا تُرسل في المحادثة |
| إنشاء IPA موقع ورفعه إلى TestFlight | [ ] لم يحدث بعد | لا يوجد حتى الآن دليل IPA موقع أو رفع ناجح إلى TestFlight |
| بيانات صفحة App Store والخصوصية | [ ] تحتاج اعتماد المالك | روابط الدعم والخصوصية، إفصاحات البيانات، لقطات الشاشة، التصنيف، ومعلومات المراجعة |

## خطوات الإكمال بالترتيب

1. انتظار تأكيد Apple أن عضوية Apple Developer أصبحت **Active**. لا تُكرر الدفع ولا تُلغِ طلب التسجيل الحالي أثناء المراجعة.
2. بعد التفعيل، تسجيل App ID صريح بالمعرّف `com.saadaligroup.sapay` وإنشاء سجل التطبيق في App Store Connect بالاسم SApay وSKU `SAPAY-IOS-001`.
3. إنشاء شهادة Apple Distribution وملف App Store provisioning profile المرتبطين بالمعرّف نفسه والفريق نفسه.
4. إنشاء App Store Connect API key بصلاحية رفع البناء، ثم إضافة القيم السبعة إلى GitHub → Settings → Secrets and variables → Actions:
   - `IOS_DISTRIBUTION_CERTIFICATE_BASE64`
   - `IOS_CERTIFICATE_PASSWORD`
   - `IOS_PROVISIONING_PROFILE_BASE64`
   - `IOS_TEAM_ID`
   - `APP_STORE_CONNECT_ISSUER_ID`
   - `APP_STORE_CONNECT_API_KEY_ID`
   - `APP_STORE_CONNECT_API_PRIVATE_KEY`
5. تشغيل `SApay iOS TestFlight build` يدويًا من تبويب Actions، والتحقق من نجاح جميع الخطوات وظهور artifact باسم `sapay-iphone-ipa` ثم تأكيد ظهور البناء داخل TestFlight.
6. إكمال بيانات الخصوصية والدعم ولقطات شاشة من النسخة الموقعة، ثم دعوة المختبرين بعد اعتماد المالك.

## ضوابط أمان الإصدار

- لا تُرسل أو تلصق ملفات `.p12` أو `.mobileprovision` أو مفتاح `.p8` أو كلمات المرور في المحادثة أو في ملفات المستودع.
- لا نضع أي بيانات حقيقية أو أموال أو تكاملات مصرفية في نسخة الاختبار؛ تظل `DEMO_ONLY`.
- لا نعلن أن التطبيق جاهز للآيفون قبل وجود IPA موقع ورفع مؤكد داخل TestFlight.
- بناء المحاكي لا يساوي بناء جهاز حقيقي، ونجاح نشر الويب لا يثبت نجاح توقيع iOS.

