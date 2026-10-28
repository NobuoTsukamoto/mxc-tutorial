
import { run } from '@microsoft/mxc-sdk/v1';
import path from 'node:path';
import fs from 'node:fs';

const testDir = path.resolve('readonly-test');

async function execute(name, command) {
  console.log(`\n=== ${name} ===`);

  const result = await run({
    command,
    containment: { type: 'process' },
    filesystem: {
      readwritePaths: [testDir],
    },
    workingDirectory: testDir,
    timeoutMs: 30000,
  });

  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('exitCode:', result.exitCode);
  console.log('warnings:', result.warnings);
}

// 読み取りテスト
await execute(
  'READ TEST',
  'C:\\Windows\\System32\\cmd.exe /d /s /c "type input.txt"'
);

// 書き込みテスト
await execute(
  'WRITE TEST',
  'C:\\Windows\\System32\\cmd.exe /d /s /c "echo test>blocked.txt"'
);

// ホスト側でファイルが作られたか確認
const blocked = path.join(testDir, 'blocked.txt');

console.log('\n=== HOST VERIFICATION ===');
console.log('blocked.txt exists:', fs.existsSync(blocked));
