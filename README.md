# MXC Tutorial

Windows 11上でMicrosoft eXecution Container（MXC）を試すためのサンプル集です。Node.js向けの`@microsoft/mxc-sdk`を使い、コマンドの実行、ファイルシステムへのアクセス制御、ネットワーク制御を確認します。

導入手順や検証結果、GitHub Copilot CLIのローカルサンドボックスについては、[チュートリアル本文](mxc-windows11-copilot-cli.md)を参照してください。

## 実行環境

- Windows 11（ProcessContainerを利用できる環境）
- Node.jsとnpm
- Windows標準の`cmd.exe`と`curl.exe`

本リポジトリの検証ではNode.js v24.20.0を使用しています。Windowsのバージョンや更新状況によって、利用できる隔離機能やネットワーク制御の動作が異なります。検証時の環境はチュートリアル本文に記載しています。

## セットアップ

リポジトリのルートディレクトリで、依存パッケージをインストールします。

```powershell
npm install
```

まず、プラットフォームの対応状況を確認し、簡単なコマンドを実行します。

```powershell
node check-support.mjs
node hello.mjs
```

## サンプル

各コマンドはリポジトリのルートディレクトリから実行してください。

| コマンド | 内容 |
|---|---|
| `node check-support.mjs` | MXCのプラットフォーム対応状況をJSONで表示します。 |
| `node hello.mjs` | サンドボックス内で`Hello from MXC`を出力します。 |
| `node filesystem-test.mjs` | `readonly-test/input.txt`の読み取りと、同じディレクトリへの書き込みを試します。 |
| `node denied-test.mjs` | `deniedPaths`で指定した`denied-test/secret.txt`の読み取りを試します。 |
| `node network-test.mjs` | サンドボックス内から`https://example.com`へのHTTP HEADリクエストを試します。 |
| `node local-network-test.mjs` | ホスト側に一時的なHTTPサーバーを起動し、ネットワークの許可・拒否設定でループバック接続を比較します。 |

`filesystem-test.mjs`の現在の設定は`readwritePaths`です。ディレクトリ名は`readonly-test`ですが、書き込みを許可しており、実行すると`readonly-test/blocked.txt`が作成される場合があります。読み取り専用の設定例はチュートリアル本文を参照してください。

コマンド実行サンプルは`stdout`、`stderr`、`exitCode`、`warnings`などを表示します。出力を確認し、設定したアクセス制御が環境でどのように適用されるかを確認してください。これらは手動検証用のスクリプトで、自動テストは用意していません。

## ファイル構成

- [mxc-windows11-copilot-cli.md](mxc-windows11-copilot-cli.md)：導入からアクセス制御、Copilot CLIまでのチュートリアル
- `*.mjs`：MXC SDKの実行サンプル
- `readonly-test/input.txt`：ファイル読み取り用のサンプルデータ
- `denied-test/secret.txt`：アクセス拒否の検証用サンプルデータ
- `image/`：チュートリアルで使用する図

## ライセンス

[MIT License](LICENSE)
