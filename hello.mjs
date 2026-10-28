
import { run } from '@microsoft/mxc-sdk/v1';

const result = await run({
  command: 'cmd.exe /d /s /c "echo Hello from MXC"',
  containment: { type: 'process' },
  timeoutMs: 30000,
});

console.log('stdout:', result.stdout);
console.log('stderr:', result.stderr);
console.log('exitCode:', result.exitCode);
console.log('timedOut:', result.timedOut);
console.log('warnings:', result.warnings);
