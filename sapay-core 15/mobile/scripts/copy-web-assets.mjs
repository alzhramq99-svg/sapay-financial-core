import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');
const webRoot = path.resolve(mobileRoot, '..', 'public');
const output = path.join(mobileRoot, 'www');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(webRoot, output, { recursive: true });
console.log(`Copied SApay web assets from ${webRoot} to ${output}`);
