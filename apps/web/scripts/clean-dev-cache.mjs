import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const devCachePath = fileURLToPath(new URL('../.next/dev', import.meta.url));

rmSync(devCachePath, { recursive: true, force: true });
