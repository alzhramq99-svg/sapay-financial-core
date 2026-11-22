// Verifies the generated iOS project before Xcode builds it. Run after
// `npx cap add ios && npm run cap:sync`; exits non-zero on the first problem.
// Used by ios-packaging.yml, ios-simulator.yml and ios-testflight.yml so all
// three validate the same thing, and runnable on Linux for local checks.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_BUNDLE_ID = 'com.saadaligroup.sapay';
const EXPECTED_NAME = 'SApay';
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); else console.log(`ok   ${message}`); };
const read = (p) => readFile(path.resolve(p), 'utf8').catch(() => '');

const pbxproj = await read('ios/App/App.xcodeproj/project.pbxproj');
const bundleIds = [...new Set([...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]))];
check(bundleIds.length === 1 && bundleIds[0] === EXPECTED_BUNDLE_ID, `Xcode bundle identifier is ${EXPECTED_BUNDLE_ID} (found: ${bundleIds.join(', ') || 'none'})`);

const capConfig = JSON.parse((await read('ios/App/App/capacitor.config.json')) || '{}');
check(capConfig.appId === EXPECTED_BUNDLE_ID, `Capacitor appId is ${EXPECTED_BUNDLE_ID}`);
check(capConfig.appName === EXPECTED_NAME, `Capacitor appName is ${EXPECTED_NAME}`);
check(capConfig.ios?.backgroundColor === '#0A0A0A', 'WebView background is #0A0A0A');

const plist = await read('ios/App/App/Info.plist');
const plistValue = (key) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
check(plistValue('CFBundleDisplayName') === EXPECTED_NAME, `home-screen name is ${EXPECTED_NAME}`);
check(Boolean(plistValue('NSFaceIDUsageDescription')), 'NSFaceIDUsageDescription is set');
check(plistValue('UIUserInterfaceStyle') === 'Dark', 'UIUserInterfaceStyle is Dark');

const storyboard = await read('ios/App/App/Base.lproj/LaunchScreen.storyboard');
check(storyboard.includes('red="0.0392" green="0.0392" blue="0.0392"') && !storyboard.includes('image="Splash"'),
  'launch screen is solid #0A0A0A without the white template splash');

// The app must ship the existing SApay web UI from sapay-core 15/public, not a copy or a placeholder.
const [webIndex, bundledIndex, bridge] = await Promise.all([
  read('../public/index.html'), read('ios/App/App/public/index.html'), read('ios/App/App/public/biometric-bridge.js'),
]);
check(webIndex.length > 0 && bundledIndex === webIndex, 'bundled index.html is identical to sapay-core 15/public/index.html');
check(bridge.includes('SApayBiometric'), 'Face ID bridge (biometric-bridge.js) is bundled');

// The app icon must be the official SApay monogram, not Capacitor's default.
const iconSetDir = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
const iconEntry = JSON.parse((await read(`${iconSetDir}/Contents.json`)) || '{}').images?.[0];
const [installedIcon, officialIcon] = await Promise.all([
  readFile(path.resolve(`${iconSetDir}/${iconEntry?.filename ?? 'missing'}`)).catch(() => Buffer.alloc(0)),
  readFile(path.resolve('resources/AppIcon-1024.png')).catch(() => Buffer.alloc(0)),
]);
check(officialIcon.length > 0 && installedIcon.equals(officialIcon), 'app icon is the official SApay monogram (resources/AppIcon-1024.png)');

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log('iOS project verified.');
