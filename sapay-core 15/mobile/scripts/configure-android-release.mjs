import fs from 'node:fs';
import path from 'node:path';

const required = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required GitHub Actions secret: ${name}`);
}
const dir = path.resolve('android/app');
const keystore = path.join(dir, 'sapay-upload.jks');
fs.writeFileSync(keystore, Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'), { mode: 0o600 });
if (fs.statSync(keystore).size < 100) throw new Error('Invalid Android keystore');
const gradleFile = path.join(dir, 'build.gradle');
let gradle = fs.readFileSync(gradleFile, 'utf8');
if (!gradle.includes('signingConfigs.debug')) throw new Error('Unexpected generated Android Gradle layout; refuse to modify signing');
const quote = value => "'" + value.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
const signing = `    signingConfigs {
        release {
            storeFile file('sapay-upload.jks')
            storePassword ${quote(process.env.ANDROID_KEYSTORE_PASSWORD)}
            keyAlias ${quote(process.env.ANDROID_KEY_ALIAS)}
            keyPassword ${quote(process.env.ANDROID_KEY_PASSWORD)}
        }
    }
`;
if (!gradle.includes('    buildTypes {')) throw new Error('Expected buildTypes section not found');
gradle = gradle.replace('    buildTypes {', signing + '    buildTypes {');
gradle = gradle.replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release');
fs.writeFileSync(gradleFile, gradle, { mode: 0o600 });
console.log('Configured ephemeral release signing; credentials are not committed.');
