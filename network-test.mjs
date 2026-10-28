
import { run } from '@microsoft/mxc-sdk/v1';

const result = await run({
  command: 'C:\\Windows\\System32\\curl.exe -I --max-time 5 https://example.com',
  containment: { type: 'process' },
  workingDirectory: 'C:\\',
  timeoutMs: 15000,
});

console.log('stdout:', result.stdout);
console.log('stderr:', result.stderr);
console.log('exitCode:', result.exitCode);
console.log('warnings:', result.warnings);
