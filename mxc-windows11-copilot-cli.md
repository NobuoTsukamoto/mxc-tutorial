# Microsoft eXecution Container（MXC）を試す — Windows 11での導入からGitHub Copilot CLIのローカルサンドボックスまで

生成AIを利用したソフトウェア開発では、AIエージェントがファイルの編集、プログラムの実行、ネットワークアクセスなどを自律的に行うようになってきました。

便利になる一方で、意図しないファイルの変更や削除、機密情報へのアクセス、不適切なコマンドの実行といったリスクもあります。

こうした問題への対策の一つが、**サンドボックスによる実行環境の隔離**です。

今回はMicrosoftが公開しているオープンソースの **Microsoft eXecution Container（MXC）** をWindows 11上で動かし、ファイルシステムとネットワークのアクセス制御を検証しました。

さらに、MXCを利用しているGitHub Copilot CLIのローカルサンドボックスも試し、AIエージェントのコマンド実行がどのように制限されるのか確認しました。

## 1. Microsoft eXecution Container（MXC）とは

MXCは、信頼できないコードやコマンドを制限された環境で実行するためのサンドボックス実行基盤です。

公式リポジトリ：

https://github.com/microsoft/mxc

Windows、Linux、macOSに対応し、OSごとに異なる隔離機構を共通のAPIから利用できるようにしています。

| OS | 主な分離バックエンド |
|---|---|
| Windows | ProcessContainer |
| Linux | Bubblewrap |
| macOS | Seatbelt |

MXCには、次のような特徴があります。

- ファイルシステムの読み取り・書き込み・アクセス拒否を制御できる
- ネットワークへの接続を制御できる
- コマンド実行のタイムアウトを設定できる
- Rust、.NET、Node.js向けのSDKが用意されている
- WindowsではProcessContainerなど複数のバックエンドを利用できる

MXCはDockerのようなコンテナ管理ツールというよりも、**アプリケーションに組み込んで安全なコード実行機能を提供するSDK**と捉えると理解しやすいと思います。

GitHub Copilot CLIのローカルサンドボックスも、このMXCを利用しています。

### GitHub Copilot CLIとの関係

Copilot CLIは、実行するコマンドやアクセスできるディレクトリ、ネットワークなどについてポリシーを構成し、MXCがOSに応じた隔離機構を使用してその制限を適用します。

つまり、Copilot CLIとMXCでは役割が異なります。

| 役割 | 担当 |
|---|---|
| AIによるタスクの計画・コマンド選択 | GitHub Copilot CLI |
| アクセス許可範囲の構成 | GitHub Copilot CLI |
| コマンド実行時のOSレベルの隔離 | MXC |
| 実際のアクセス制御 | OSの分離機構 |

なお、ローカルサンドボックスは必ずしも独立した仮想マシンを起動するものではありません。WindowsのProcessContainerでは、OSの提供する軽量な隔離機構を利用します。

参考：[GitHub Copilotのクラウド・ローカルサンドボックス](https://docs.github.com/ja/copilot/concepts/security-governance-and-network-settings/about-cloud-and-local-sandboxes)

## 2. 検証環境

今回の実験環境は以下のとおりです。

| 項目 | 環境 |
|---|---|
| OS | Windows 11 26H2 |
| 更新前のビルド | 26300.9457 |
| 更新後のビルド | 26300.9711 |
| Node.js | v24.20.0（検証時） |
| MXC | `@microsoft/mxc-sdk` |
| MXC分離バックエンド | ProcessContainer |
| 隔離レベル | base-container |
| GitHub Copilot CLI | 1.0.103（ポリシー表示から確認） |

Windows側の隔離機能は、OSのバージョンや更新状況によって利用できるものが異なります。

今回も、Windows Updateの前後でネットワーク関連の動作に違いが見られました。

## 3. MXCのインストール

### 3.1 Node.jsの準備

Node.jsとnpmが利用できることを確認します。

```powershell
node --version
npm --version
```

今回の実験ではNode.js v24.20.0を使用しました。MXCの公式サンプルには24.21.0以上を要求するものがあるため、新規に環境を構築する場合は要件を満たすバージョンを利用するのがよいでしょう。

### 3.2 プロジェクトの作成

```powershell
mkdir mxc-tutorial
cd mxc-tutorial

npm init -y
npm install @microsoft/mxc-sdk
```

MXCのNode.js SDKはnpmから導入でき、ネイティブ実行環境もパッケージに含まれます。

今回はMXC自体をソースからビルドしないため、Rustの開発環境は不要です。

## 4. 最小サンプル：Hello World

まず、MXC経由でWindowsのコマンドを実行してみます。

`hello.mjs` を作成します。

```javascript
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
```

実行します。

```powershell
node hello.mjs
```

実行結果：

```text
stdout: Hello from MXC

stderr:
exitCode: 0
timedOut: false
warnings: []
```

正常に実行できました。

`run()` に渡す `command` がサンドボックス内で実行するコマンドです。`containment` で分離方式を指定し、`timeoutMs` で実行時間を制限しています。

通常の `child_process` によるコマンド起動と異なり、MXCではファイルシステムやネットワークなどのアクセス制限も指定できます。

## 5. ネットワーク制御を試す

次に、MXCでネットワークアクセスを制御できるか検証します。

MXCには、外向き通信を制御する `egress` と、内向き通信やホストへのループバックアクセスを制御する `ingress` があります。

基本的なポリシーの例です。

```javascript
network: {
  egress: {
    default: 'deny',
  },
  ingress: {
    default: 'deny',
    hostLoopback: 'deny',
  },
},
```

今回はDNSや外部Webサイトの状態に依存しないよう、ホスト側にHTTPサーバーを立て、サンドボックス内から `127.0.0.1` に接続する方法を採用しました。

### 5.1 ネットワーク検証プログラム

`local-network-test.mjs` を作成します。

```javascript
import http from 'node:http';
import { run } from '@microsoft/mxc-sdk/v1';

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
  for (const deny of [false, true]) {
    console.log(`\n=== Network deny: ${deny} ===`);

    const request = {
      command:
        `C:\\Windows\\System32\\curl.exe --noproxy "*" ` +
        `--max-time 3 http://127.0.0.1:${port}`,
      containment: { type: 'process' },
      workingDirectory: 'C:\\',
      timeoutMs: 10000,

      network: deny
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
```

ここでは、通信を許可する場合と拒否する場合の2回、同じHTTPサーバーにアクセスします。

### 5.2 補足：Windowsのビルド要件

今回のネットワーク制御を試すには、Windowsのビルド26300.9711以降が必要です。それ以前のビルドでは、ホストのループバック通信の許可などが期待どおりに動作しないため、Windowsを更新してから実行してください。

### 5.3 ネットワーク制御の検証結果

通信を許可する場合と拒否する場合で、次の結果が得られました。

```text
=== Network deny: false ===
stdout: Hello from host
exitCode: 0
warnings: []

=== Network deny: true ===
stderr: curl: (7) Failed to connect ...
exitCode: 7
warnings: []
```

期待した結果が得られました。

| ネットワークポリシー | 結果 |
|---|---|
| Allow | HTTPアクセス成功 |
| Deny | 接続失敗 |

この比較により、**MXCのネットワークポリシーによって、ホストのループバック通信を許可・拒否できること**を確認しました。

ただし、検証できたのはこの通信経路についてであり、すべてのネットワークアクセスに対する制御の完全性を確認したわけではありません。

参考：[MXC Windows OS-version support](https://github.com/microsoft/mxc/blob/main/docs/backends/process-container/os-version-support.md)

## 6. ファイルシステムのアクセス制御

次に、ファイルシステムのアクセス権限を制御してみます。

MXCでは、主に以下の3種類を指定できます。

| 設定 | 用途 |
|---|---|
| `readwritePaths` | 読み取り・書き込みを許可 |
| `readonlyPaths` | 読み取りのみ許可 |
| `deniedPaths` | アクセスを拒否 |

### 6.1 読み取り専用ポリシー

テスト用ディレクトリを作成します。

```powershell
New-Item -ItemType Directory -Path .\readonly-test -Force

Set-Content .\readonly-test\input.txt `
  "Hello from readonly file" -Encoding ascii
```

`filesystem-test.mjs` を作成します。

```javascript
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
      readonlyPaths: [testDir],
    },
    workingDirectory: testDir,
    timeoutMs: 30000,
  });

  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('exitCode:', result.exitCode);
  console.log('warnings:', result.warnings);
}

await execute(
  'READ TEST',
  'C:\\Windows\\System32\\cmd.exe /d /s /c "type input.txt"'
);

await execute(
  'WRITE TEST',
  'C:\\Windows\\System32\\cmd.exe /d /s /c "echo test>blocked.txt"'
);

console.log(
  'blocked.txt exists:',
  fs.existsSync(path.join(testDir, 'blocked.txt'))
);
```

実行する前に、以前の試行で `blocked.txt` が残っていないことを確認します。

```powershell
Remove-Item .\readonly-test\blocked.txt -ErrorAction SilentlyContinue

node filesystem-test.mjs
```

実際の結果：

```text
=== READ TEST ===
stdout: Hello from readonly file
exitCode: 0

=== WRITE TEST ===
exitCode: 1

=== HOST VERIFICATION ===
blocked.txt exists: false
```

読み取りは成功しましたが、書き込みは拒否されました。

ホスト側にファイルが作成されていないことも確認できたため、`readonlyPaths` の動作を確認できました。

### 6.2 読み書き許可ポリシー

次に、ポリシーを変更します。

```javascript
filesystem: {
  readwritePaths: [testDir],
},
```

同じテストを実行した結果です。

```text
=== READ TEST ===
stdout: Hello from readonly file
exitCode: 0

=== WRITE TEST ===
exitCode: 0

=== HOST VERIFICATION ===
blocked.txt exists: true
```

読み取り・書き込みの両方が成功しました。

**ポリシーの変更によってファイルの書き込み可否が変化すること**を確認できました。

### 6.3 アクセス拒否ポリシー

最後に `deniedPaths` を試します。

```powershell
New-Item -ItemType Directory -Path .\denied-test -Force

Set-Content .\denied-test\secret.txt `
  "SECRET_DATA" -Encoding ascii
```

`denied-test.mjs` を作成します。

```javascript
import { run } from '@microsoft/mxc-sdk/v1';
import path from 'node:path';

const deniedDir = path.resolve('denied-test');
const secretFile = path.join(deniedDir, 'secret.txt');

const result = await run({
  command:
    `C:\\Windows\\System32\\cmd.exe /d /s /c "type ${secretFile}"`,
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
```

結果：

```text
stdout:
exitCode: 1
warnings: []
```

`SECRET_DATA` は出力されず、アクセス拒否となりました。

### ファイルシステム検証のまとめ

| ポリシー | 読み取り | 書き込み |
|---|---|---|
| `readonlyPaths` | 成功 | 拒否 |
| `readwritePaths` | 成功 | 成功 |
| `deniedPaths` | 拒否 | 今回は未検証 |

今回実施した操作については、期待した動作が確認できました。

参考：[MXC公式ファイルシステム制御サンプル](https://github.com/microsoft/mxc/blob/main/samples/run-with-containment-of-filesystem/node/src/main.ts)

## 7. GitHub Copilot CLIのローカルサンドボックス

MXC単体での検証が完了したので、次にGitHub Copilot CLIからサンドボックスを利用します。

Copilot CLIでは、MXC SDKのプログラムを自分で作成しなくても、`/sandbox` コマンドからアクセス制御を構成できます。

### 7.1 サンドボックスの有効化

作業ディレクトリを作成してCopilot CLIを起動します。

```powershell
mkdir copilot-test
cd copilot-test
copilot
```

Copilot CLIで次のコマンドを実行します。

```text
/sandbox enable
/sandbox status
```

実際の出力：

```text
Current sandbox status: enabled
```

正常に有効化できました。

### 7.2 実際のポリシーを確認する

```text
/sandbox policy
```

今回の環境では、以下のような設定が表示されました。

```text
Working directory:
  Read-write paths (1):
    C:\Users\nextr\Project\mxc-tutorial\copilot-test

Current session:
  Read-write paths (1):
    ...\session-state\...\files

Network:
  Outbound: allowed
  Local network: allowed

Capabilities:
  Allow sandbox bypass: yes
  Sandbox MCP servers: sandboxed
  Sandbox LSP servers: sandboxed
  Authenticate git: on
  Authenticate gh: on
```

実際のポリシーには、このほか多数の開発ツールのインストール先が読み取り専用パスとして登録されていました。

この結果から、Copilot CLIが単純に作業ディレクトリだけを許可するのではなく、Node.js、Git、Python関連ツールなどの実行環境も考慮してポリシーを構成していることが分かります。

なお、開発ツールの検出結果や許可パスは環境によって異なります。

## 8. Copilot CLIでファイルシステム制御を試す

今回は、作業ディレクトリとは別に保護用ディレクトリを作成しました。

```text
mxc-tutorial/
├── copilot-test/
└── copilot-protected/
    ├── readonly.txt
    └── secret.txt
```

Copilot CLIで次を実行します。

```text
/sandbox config
```

Filesystem設定から、以下のポリシーを追加しました。

| ファイル | 設定 |
|---|---|
| `readonly.txt` | Read-only |
| `secret.txt` | Deny |

`/sandbox policy` で、次の設定が反映されていることを確認できました。

```text
User-configured paths:
  Read-only paths (1):
    ...\copilot-protected\readonly.txt

  Denied paths (1):
    ...\copilot-protected\secret.txt
```

### 8.1 読み取り専用テスト

Copilotに次のように指示しました。

> PowerShellのGet-Contentでreadonly.txtを読み取り、その後Add-Contentで追記してください。サンドボックス外での再実行やバイパスはしないでください。

結果：

- 読み取りは成功
- 追記はアクセス拒否
- ファイル内容は変更されなかった

MXC単体と同じように、読み取り専用ポリシーが機能していることを確認できました。

なお、PowerShellのコマンドレットでは `$LASTEXITCODE` だけで失敗を判定できません。`-ErrorAction Stop` や例外処理を利用すると、結果をより正確に扱えます。

### 8.2 アクセス拒否テストとバイパス機能

次は `secret.txt` を読み取るようにCopilotへ指示しました。

最初の実行では、Copilotが承認を求め、確認がキャンセルされたため、Shellコマンドは実行されませんでした。

このとき、サンドボックスの制限を緩和して再実行する選択肢が表示されました。

ポリシーを確認すると、次の設定が有効になっていました。

```text
Allow sandbox bypass: yes
```

Copilot CLIでは、サンドボックスがアクセスを拒否した場合でも、ユーザーが承認することで制限を緩和したり、バイパスして再実行できる場合があります。

今回はアクセス制御を検証するため、`/sandbox config` から **Allow sandbox bypassを無効**にしました。

```text
Allow sandbox bypass: no
```

その後、再び `secret.txt` の読み取りを指示した結果です。

```text
Shell (sandboxed)

読み取りはアクセス拒否で失敗しました。
内容は取得できていません。
終了コードは1です。
再試行やバイパスは行っていません。
```

アクセス拒否が確認できました。

ここで重要なのは、**Copilot CLIのコマンド実行承認と、MXCによる実行時のアクセス制御は異なる仕組みである**という点です。

今回の最初のテストは承認段階で中止されました。一方、バイパスを無効化した後のテストは、Shellツールが実行され、アクセス拒否で終了しました。

ただし、CLIの実行ログだけでは、個々のアクセス拒否がOS側のどの機構によって発生したかまでは断定できません。

## 9. Copilot CLIでネットワーク制御を試す

最後に、Copilot CLIのネットワークアクセスを検証しました。

### 9.1 Outboundを拒否する

`/sandbox config` で外向き通信を拒否し、Shellツールからcurlを実行します。

```powershell
curl.exe --noproxy "*" -I --max-time 5 https://example.com
```

結果：

```text
curl: (6) Could not resolve host: example.com
```

終了コードは6でした。

サンドボックス内でDNS名前解決に失敗し、外部サイトに接続できませんでした。

### 9.2 Outboundを許可する

次に、ネットワーク設定を以下のように変更しました。

```text
Network:
  Outbound: allowed
  Local network: blocked
```

同じcurlコマンドを実行すると、予想外の結果になりました。

```text
GenericFailure

Cannot start sandboxed command:
Sandboxed commands cannot reach the loc...
```

今回はcurlのエラーではなく、**サンドボックス内のコマンド自体が開始できませんでした。**

つまり、通信に失敗したというより、MXCによるコマンド実行の準備段階で問題が発生したことになります。

### 9.3 なぜLocal networkが関係するのか

GitHub公式ドキュメントによると、Windows版Copilot CLIでは、ホスト別ネットワークルールやプロキシ機能、認証情報の保護にローカルプロキシが利用されます。

こうした機能を使用する場合、`Allow local network` の設定が必要になります。

今回の環境では、次の機能も有効でした。

```text
Authenticate git: on
Authenticate gh: on
```

今回の起動エラーは、ローカルネットワークを禁止した状態で、Copilot CLIが必要とするローカルサービスへの接続条件を満たせなかった可能性があります。

ただし、ログが途中で省略されているため、具体的にどのローカルサービスが原因だったかは確定していません。

なお、`https://example.com` 自体は外部インターネット上のホストであり、ローカルネットワークのアドレスではありません。

### 9.4 ネットワーク許可時の最終検証

ネットワーク設定を以下のように変更し、サンドボックスのバイパスを無効にした状態で検証しました。

```yaml
Network:
  Outbound: allowed
  Local network: allowed

Capabilities:
  Allow sandbox bypass: no
```

実行したコマンドは以下です。

```powershell
curl.exe --noproxy "*" -I --max-time 10 https://example.com
```

実行結果：

```text
curl: (7) Failed to connect to example.com:443
after 49 ms: Could not connect to server
```

コマンド自体はサンドボックス内で実行できましたが、外部サーバーへの接続に失敗しました。終了コードは7でした。

Local networkを許可した今回の試行では、前節のコマンド起動エラーは発生しませんでした。ただし、**OutboundとLocal networkの両方を許可しても、今回の検証では外部通信の成功を確認できませんでした。**

この結果だけでは接続失敗の原因は特定できません。サンドボックス外での同じコマンドの実行結果との比較など、追加の切り分けが必要です。

参考：[GitHub Copilotのローカルサンドボックス設定](https://docs.github.com/ja/copilot/how-tos/cloud-and-local-sandboxes/configuring-local-sandbox-settings)

## 10. MXC単体とCopilot CLIの比較

ここまでの検証結果をまとめます。

| 検証項目 | MXC単体 | Copilot CLI |
|---|---|---|
| 最小コマンド実行 | 成功 | 成功 |
| 読み取り専用制御 | 成功 | 成功 |
| 書き込み許可 | 成功 | 作業ディレクトリへの許可設定を確認 |
| アクセス拒否 | 成功 | 成功 |
| ネットワーク拒否 | 成功 | 外部通信失敗を確認 |
| ネットワーク許可 | ループバック通信で成功 | コマンド起動は成功、外部接続は失敗（curl終了コード7） |
| ポリシー管理 | SDKのコード | `/sandbox config` |
| 実効ポリシー確認 | SDK設定・実行結果 | `/sandbox policy` |
| バイパス制御 | 呼び出し側で設計 | Copilot CLIが機能を提供 |

今回の実験を通じて、MXCによるOSレベルのアクセス制御と、Copilot CLIが提供するポリシー管理・承認機能の役割を理解できました。

## 11. 企業でAIエージェントを利用する際の考慮事項

今回の検証は技術的な動作確認でしたが、企業内でGitHub Copilot CLIのようなAIエージェントを利用する場合には、いくつか重要な観点があります。

### 11.1 最小権限の原則

AIエージェントに与えるファイルシステム権限は、作業に必要な範囲に限定するべきです。

作業ディレクトリには書き込みを許可し、参照のみ必要な資料は読み取り専用にすることで、意図しない変更を防ぐことができます。

また、認証情報や機密ファイルについては、明示的なアクセス拒否を検討する必要があります。

### 11.2 Sandbox bypassの扱い

サンドボックスが有効でも、バイパスが許可されていると、ユーザーの承認により制限を緩和して実行できる場合があります。

開発時には便利な機能ですが、企業内での運用では承認操作に依存した安全対策だけでは不十分です。

リスクの高い環境では、`Allow sandbox bypass` の無効化を検討する価値があります。

### 11.3 ネットワークアクセスの制御

ソフトウェア開発では、GitHubやパッケージレジストリへのアクセスが必要になるため、ネットワークを完全に禁止することは現実的でない場合があります。

一方、不要な外部通信やローカルネットワークへのアクセスは制限したいところです。

そのため、開発で必要な通信先を整理し、OSやツールが提供する制御機能の範囲を理解したうえでポリシーを設計する必要があります。

なお、Windowsにおけるプロキシベースのホスト制限には、プログラムがプロキシを経由しない場合の制約があります。ホスト別ルールだけであらゆる通信を強制的に制限できると考えるべきではありません。

### 11.4 サンドボックスだけで安全性が保証されるわけではない

MXCは実行時のアクセスを制限する有効な仕組みですが、すべてのセキュリティ対策を代替するものではありません。

例えば、次のような対策との組み合わせが重要です。

- Gitによる変更履歴の管理とレビュー
- 実行権限の最小化
- 認証情報の適切な管理
- AIエージェントによる操作のログ確認
- 危険な操作に対する承認ルール
- テスト・CIによる生成コードの品質確認

特に企業での導入では、**サンドボックスを安全対策の一つの層として位置付ける**ことが重要だと考えます。

## 12. まとめ

今回、Windows 11上でMicrosoft eXecution Container（MXC）を導入し、Node.js SDKを使ってファイルシステムとネットワークのアクセス制御を検証しました。

さらに、GitHub Copilot CLIのローカルサンドボックスでも、読み取り専用やアクセス拒否のポリシーが機能することを確認しました。

実験を通じて、特に次のことが分かりました。

**第一に、MXCは比較的少ないコードでサンドボックス実行をアプリケーションに組み込めること。**

**第二に、Windowsのビルドや分離バックエンドによって、利用可能なアクセス制御機能が異なること。**

**第三に、GitHub Copilot CLIでは、MXCによる隔離に加えて、承認やバイパスなどの制御が存在すること。**

AIエージェントによる自律的な開発作業が増えるなかで、コマンド実行をどのように制限し、意図しない操作から開発環境を保護するかは、今後さらに重要になると思います。

今回の検証は、その実行環境の仕組みを理解するためのよい機会になりました。

今後は、Copilot CLIでネットワークを許可しても外部接続に失敗した原因の切り分けに加え、MCPサーバーやLSPサーバーに対する隔離、認証情報の取り扱いなども確認していきたいと考えています。

---

### 補足：Windowsの日本語出力について

日本語WindowsでMXCから `cmd.exe` を実行すると、標準エラー出力が文字化けする場合がありました。

WindowsのコマンドがCP932などで出力した文字列と、SDKによるUTF-8デコードの不一致が原因として考えられますが、MXC内部の具体的な変換箇所までは特定していません。

今回の実験では、終了コードと実際のファイル操作結果から動作を判定しています。

### 参考資料

1. [Microsoft eXecution Container（MXC）公式リポジトリ](https://github.com/microsoft/mxc)
2. [MXC SDKサンプル一覧](https://github.com/microsoft/mxc/tree/main/samples)
3. [Windows OS-version support](https://github.com/microsoft/mxc/blob/main/docs/backends/process-container/os-version-support.md)
4. [GitHub Copilot — クラウドとローカルのサンドボックス](https://docs.github.com/ja/copilot/concepts/security-governance-and-network-settings/about-cloud-and-local-sandboxes)
5. [GitHub Copilot — ローカルサンドボックスの構成](https://docs.github.com/ja/copilot/how-tos/cloud-and-local-sandboxes/configuring-local-sandbox-settings)
6. [GitHub Copilot — Using local sandboxing](https://docs.github.com/en/copilot/how-tos/cloud-and-local-sandboxes/using-local-sandboxing)

*検証日：2026年10月12日〜28日*
