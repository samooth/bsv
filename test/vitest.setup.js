import { Buffer } from 'buffer';
import { afterAll } from 'vitest';
import { Workers } from '../lib/workers';

globalThis.Buffer = Buffer;

afterAll(() => {
  Workers.endGlobalWorkers();
});
