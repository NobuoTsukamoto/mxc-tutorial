
import { run } from '@microsoft/mxc-sdk/v1';
import path from 'node:path';

const deniedDir = path.resolve('denied-test');
const secretFile = path.join(deniedDir, 'secret.txt');

const result = await run({
  command: `C:\\Windows\\System32\\cmd.exe /d /s /c "type ${secretFile}"`,
  containment: { type: 'process' },

  filesystem: {
    deniedPaths: [deniedDir],
  },

  workingDirectory: 'C:\\',
  timeoutMs: 30000,
});

console.log('stdout:', result.stdout);
console.log('stderr:', result.stderr);
console.log('exitCode:', result.exitCode);
console.log('warnings:', result.warnings);
