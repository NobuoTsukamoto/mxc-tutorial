
import http from 'node:http';
import { run } from '@microsoft/mxc-sdk/v1';

// 1. ホスト側でHTTPサーバーを起動
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from host');
});

await new Promise(resolve => {
  server.listen(0, '127.0.0.1', resolve);
});

const port = server.address().port;
console.log(`HTTP server: http://127.0.0.1:${port}`);

try {
  // 2. ネットワーク制限の有無を比較
  for (const deny of [false, true]) {
    console.log(`\n=== Network deny: ${deny} ===`);

    const request = {
      command: `C:\\Windows\\System32\\curl.exe --noproxy "*" --max-time 3 http://127.0.0.1:${port}`,
      containment: { type: 'process' },
      workingDirectory: 'C:\\',
      timeoutMs: 10000,
    };

    request.network = deny
    ? {
        egress: { default: 'deny' },
        ingress: {
            default: 'deny',
            hostLoopback: 'deny',
        },
        }
    : {
        egress: { default: 'allow' },
        ingress: {
            default: 'allow',
            hostLoopback: 'allow',
        },
        };

    const result = await run(request);

    console.log('stdout:', result.stdout);
    console.log('stderr:', result.stderr);
    console.log('exitCode:', result.exitCode);
    console.log('warnings:', result.warnings);
  }
} finally {
  server.close();
}
