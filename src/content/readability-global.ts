import { Readability } from '@mozilla/readability';

const root = globalThis as typeof globalThis & { Readability?: typeof Readability };
root.Readability = Readability;
