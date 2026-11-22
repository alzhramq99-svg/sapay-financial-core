// Verifies the generated iOS project before Xcode builds it. Run after
// `npx cap add ios && npm run cap:sync`; exits non-zero on the first problem.
// Used by ios-packaging.yml, ios-simulator.yml and ios-testflight.yml so all
// three validate the same thing, and runnable on Linux for local checks.
import { existsSync } from 'node:fs';
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

// Face ID dependency: GHSA-vx5f-vmr6-32wf affects @capgo/capacitor-native-biometric < 8.3.6,
// and the Face ID-bound Keychain API used by src/biometric-core.ts needs >= 8.6
// (getSecureCredentials, AccessControl). Check what is actually installed.
const installedVersion = async (pkg) => JSON.parse((await read(`node_modules/${pkg}/package.json`)) || '{}').version ?? '';
const atLeast = (version, minimum) => {
  const a = version.split('.').map(Number); const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); }
  return true;
};
const biometricVersion = await installedVersion('@capgo/capacitor-native-biometric');
check(atLeast(biometricVersion, '8.9.3'), `biometric plugin is >= 8.9.3, outside GHSA-vx5f-vmr6-32wf (found: ${biometricVersion || 'none'})`);
const capIosVersion = await installedVersion('@capacitor/ios');
check(capIosVersion.startsWith('8.'), `Capacitor iOS is 8.x (found: ${capIosVersion || 'none'})`);
const targets = [...new Set([...pbxproj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)].map((m) => m[1]))];
check(targets.length === 1 && targets[0] === '15.0', `iOS deployment target is 15.0 (found: ${targets.join(', ') || 'none'})`);
// Capacitor 8 defaults to SPM, which has no App.xcworkspace; the workflows
// build -workspace ios/App/App.xcworkspace, so require the CocoaPods template.
// (contents.xcworkspacedata itself is written later by pod install.)
const podfile = await read('ios/App/Podfile');
check(podfile.includes("platform :ios, '15.0'") && existsSync(path.resolve('ios/App/App.xcworkspace')) && !existsSync(path.resolve('ios/App/CapApp-SPM')),
  'CocoaPods project with App.xcworkspace (cap add ios --packagemanager CocoaPods)');
// Unit tests (test/biometric-bridge.spec.ts) assert the bridge never uses the
// unprotected read; here confirm the bundled bridge is the Face ID-bound one.
check(bridge.includes('getSecureCredentials') && bridge.includes('accessControl'),
  'bundled Face ID bridge uses the Face ID-bound Keychain (getSecureCredentials, accessControl)');

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log('iOS project verified.');
