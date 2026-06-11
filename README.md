# おすすめゲーム5選ブログ

Claude API（記事生成）と OpenAI API（サムネイル画像生成）を使って、**毎日自動で「おすすめゲーム5選」のランキング記事を生成**する静的ブログです。GitHub Actions により日本時間の毎朝6時に記事が追加されます。

## 仕組み

1. `used_games.json` を読み込み、過去に紹介したゲームを除外（被り防止）
2. **Claude API**（`claude-sonnet-4-6` + Web検索）で最新のおすすめゲーム5選を生成
3. **OpenAI API**（`gpt-image-1`）でヒーロー用サムネイル画像を生成
4. `posts/YYYY-MM-DD.html` として記事を出力
5. `index.html` の記事一覧に新しい記事を先頭追加
6. `used_games.json` に今回の5本を追記

## ディレクトリ構成

```
.
├── generate.js                 # 記事生成スクリプト（Node.js / ESModules）
├── package.json
├── style.css                   # ダークテーマ・レスポンシブ
├── index.html                  # 記事一覧ページ
├── used_games.json             # 紹介済みゲームの一覧
├── posts/                      # 生成された記事HTML
├── assets/images/              # 生成されたサムネイル画像
└── .github/workflows/daily-post.yml
```

## ローカルでの実行

```bash
npm install

# API キーを .env に記入（.env は .gitignore 済み）
cp .env.example .env
#  → .env を開いて ANTHROPIC_API_KEY と OPENAI_API_KEY を実際の値に置き換える

# .env を読み込んで実行（Node 20.6+ の --env-file を利用）
node --env-file=.env generate.js
```

`.env` を使わず、シェルの環境変数に直接設定して実行することもできます（PowerShell の例）:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:OPENAI_API_KEY = "sk-..."
node generate.js
```

実行後、ブラウザで `index.html` を開くと一覧から記事を確認できます。

## GitHub Actions のセットアップ（重要）

GitHub Actions で自動実行するには、リポジトリに **Secrets** を登録する必要があります。

`リポジトリ > Settings > Secrets and variables > Actions > New repository secret` から、以下の2つを登録してください。

| Secret 名           | 内容                          |
| ------------------- | ----------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic（Claude）の API キー |
| `OPENAI_API_KEY`    | OpenAI の API キー             |

登録後、`.github/workflows/daily-post.yml` が毎日 **日本時間 6:00（UTC 21:00）** に実行され、生成した記事を自動コミット＆プッシュします。`Actions` タブから手動実行（`Run workflow`）も可能です。

> **Note**: Actions がリポジトリへ push できるよう、ワークフローには `permissions: contents: write` を設定済みです。`Settings > Actions > General > Workflow permissions` が **Read and write permissions** になっていることも確認してください。

## ライセンス

MIT
