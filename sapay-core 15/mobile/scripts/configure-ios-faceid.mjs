import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const plistPath = path.resolve('ios/App/App/Info.plist');
let plist;
try {
  plist = await readFile(plistPath, 'utf8');
} catch {
  console.error('iOS project not found. Run npm run cap:add:ios before npm run cap:sync.');
  process.exit(1);
}

const key = '<key>NSFaceIDUsageDescription</key>';
const value = '<string>يستخدم SApay Face ID للتحقق من هويتك عند تسجيل الدخول إلى حسابك.</string>';
if (!plist.includes(key)) {
  const closingIndex = plist.lastIndexOf('</dict>');
  if (closingIndex < 0) throw new Error('Info.plist is missing its root dict element.');
  plist = `${plist.slice(0, closingIndex)}  ${key}\n  ${value}\n${plist.slice(closingIndex)}`;
  await writeFile(plistPath, plist, 'utf8');
}
console.log('Configured NSFaceIDUsageDescription in iOS Info.plist.');
