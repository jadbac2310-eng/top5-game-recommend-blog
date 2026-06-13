// 毎日「おすすめゲーム5選」の記事を自動生成するスクリプト
// 1. used_games.json で被り防止
// 2. Claude API (web_search) で記事を生成
// 3. OpenAI API (gpt-image-1) でサムネイル画像を生成
// 4. posts/YYYY-MM-DD.html を出力
// 5. index.html に記事リンクを追記
// 6. used_games.json を更新
// 7. SEO: robots.txt / sitemap.xml を生成（記事HTMLには meta description・OGP・JSON-LD を付与）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- パス定義 ----
const USED_GAMES_PATH = path.join(__dirname, "used_games.json");
const INDEX_PATH = path.join(__dirname, "index.html");
const POSTS_DIR = path.join(__dirname, "posts");
const IMAGES_DIR = path.join(__dirname, "assets", "images");
const ROBOTS_PATH = path.join(__dirname, "robots.txt");
const SITEMAP_PATH = path.join(__dirname, "sitemap.xml");

// 公開サイトの絶対URL（OGP・canonical・sitemap で使用。末尾スラッシュなし）
// 独自ドメインに変えた場合はここを書き換える。
const SITE_URL = "https://jadbac2310-eng.github.io/top5-game-recommend-blog";
const SITE_NAME = "おすすめゲーム5選ブログ";

// 自社アプリのプロモバナー（記事内 1位と2位の間に挿入）
const PROMO_BANNER = {
  image: "../assets/banner-bokuneko.jpg",
  title: "ぼくとネコ",
  alt: "ヤバかわ！がちんこRPG「ぼくとネコ」",
  genre: "ヤバかわ！がちんこRPG",
  platform: "iOS / Android",
  price: "基本プレイ無料（一部アイテム課金あり）",
  description:
    "かわいいネコたちと一緒に大冒険！「オフェンス型タワーディフェンス」という新ジャンルに挑戦したオリジナルRPG。アメリカ・韓国・台湾など世界中で配信中の人気作です。",
  points: [
    "直感操作でサクサク遊べる、お手軽わくわくバトル",
    "キャラの組み合わせは自由自在！自分だけの編成でキャラメイク",
    "全国のプレイヤーとリアルタイム対戦も楽しめる",
  ],
  androidUrl:
    "https://play.google.com/store/apps/details?id=com.ignm.bokuneko.jp",
  iosUrl: "https://apps.apple.com/jp/app/id1262986572",
};

// ---- ユーティリティ ----
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// meta description 用にテキストを1行・指定長に整える
function toMetaDescription(str = "", max = 120) {
  const flat = String(str).replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

// 日本時間（JST）の YYYY-MM-DD を返す
function todayJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// ---- 1. 被り防止：過去に紹介したゲーム一覧を読み込む ----
function loadUsedGames() {
  if (!fs.existsSync(USED_GAMES_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(USED_GAMES_PATH, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ---- 2. Claude API で記事を生成 ----
async function generateArticle(usedGames, date) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `あなたは日本語のゲーム紹介ブログのライターです。
Web検索で最新情報を調べ、今おすすめのゲーム5選を紹介する記事を作成してください。

必ず以下のJSON形式**のみ**で出力してください（前後に説明文やコードブロックの記号を付けないこと）:
{
  "title": "記事タイトル",
  "date": "${date}",
  "thumbnail_prompt": "DALL-E用の英語画像生成プロンプト",
  "games": [
    {
      "rank": 1,
      "title": "ゲームタイトル",
      "platform": "対応プラットフォーム",
      "genre": "ジャンル",
      "description": "紹介文（200文字程度）",
      "reason": "おすすめ理由（100文字程度）"
    }
  ],
  "summary": "締めの一言（100文字程度）"
}

- games は必ず rank 1〜5 の5本にすること。
- thumbnail_prompt は「1位に選んだゲーム」の世界観・雰囲気・ジャンルを連想させる英語の画像生成プロンプトにすること（記事1位カード内に表示する画像になる）。著作権侵害を避けるため、ロゴ・タイトル文字・実在キャラクターや具体的な固有名詞は含めず、雰囲気やモチーフで表現すること。`;

  const usedList =
    usedGames.length > 0
      ? usedGames.map((g) => `- ${g}`).join("\n")
      : "（まだありません）";

  const userPrompt = `Web検索を使って「最新のおすすめゲーム5選」を調べ、本日（${date}）付けのランキング記事を作成してください。

【重要】以下のゲームは過去に紹介済みなので、絶対に含めないでください:
${usedList}

最新かつ話題のゲームを中心に、ジャンルやプラットフォームに偏りが出ないよう5本選んでください。
最後はJSONのみで回答してください。`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  // テキストブロックを連結（web_search のため複数ブロックになりうる）
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const article = extractJson(text);

  // 念のため date を補正
  article.date = article.date || date;
  return article;
}

// テキストから JSON 部分を抽出してパースする
function extractJson(text) {
  // ```json ... ``` で囲まれている場合に対応
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;

  // 最初の { から最後の } までを抜き出す
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Claude の応答から JSON を抽出できませんでした:\n" + text);
  }
  const jsonStr = candidate.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

// ---- 3. OpenAI API でサムネイル画像を生成 ----
async function generateThumbnail(prompt, date) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1536x1024",
    n: 1,
  });

  const b64 = result.data[0].b64_json;
  ensureDir(IMAGES_DIR);
  const imagePath = path.join(IMAGES_DIR, `${date}.png`);
  fs.writeFileSync(imagePath, Buffer.from(b64, "base64"));

  // 記事HTMLから参照する相対パス
  return `../assets/images/${date}.png`;
}

// 構造化データ(JSON-LD)を生成：Article + ランキングの ItemList
function buildJsonLd(article, date, pageUrl, imageUrl, description) {
  const games = (article.games || []).slice().sort((a, b) => a.rank - b.rank);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.title,
        description,
        image: imageUrl,
        datePublished: date,
        dateModified: date,
        inLanguage: "ja",
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        publisher: { "@type": "Organization", name: SITE_NAME },
      },
      {
        "@type": "ItemList",
        name: article.title,
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        numberOfItems: games.length,
        itemListElement: games.map((g) => ({
          "@type": "ListItem",
          position: g.rank,
          item: {
            "@type": "VideoGame",
            name: g.title,
            genre: g.genre,
            gamePlatform: g.platform,
            description: g.description,
          },
        })),
      },
    ],
  };
  // </script> 終端や < による早期終了を防ぐためエスケープ
  return JSON.stringify(graph, null, 2).replace(/</g, "\\u003c");
}

// 自社アプリの紹介カード（スマホ閲覧前提で 1位と2位の間に表示）
function buildPromoBanner() {
  const points = PROMO_BANNER.points
    .map((p) => `            <li>${escapeHtml(p)}</li>`)
    .join("\n");
  return `
      <aside class="promo-card" aria-label="広告：${escapeHtml(PROMO_BANNER.title)}">
        <span class="promo-tag">PR</span>
        <img class="promo-image" src="${PROMO_BANNER.image}" alt="${escapeHtml(
    PROMO_BANNER.alt
  )}" loading="lazy" />
        <div class="promo-body">
          <h2 class="promo-title">${escapeHtml(PROMO_BANNER.title)}</h2>
          <div class="game-meta">
            <span class="tag platform">${escapeHtml(PROMO_BANNER.platform)}</span>
            <span class="tag genre">${escapeHtml(PROMO_BANNER.genre)}</span>
          </div>
          <p class="promo-description">${escapeHtml(PROMO_BANNER.description)}</p>
          <p class="promo-points-title">おすすめポイント</p>
          <ul class="promo-points">
${points}
          </ul>
          <p class="promo-price">${escapeHtml(PROMO_BANNER.price)}</p>
          <div class="store-buttons">
            <a class="store-btn" href="${PROMO_BANNER.iosUrl}" target="_blank" rel="noopener sponsored">
              <img class="store-badge" src="../assets/badge-app-store.svg" alt="App Store からダウンロード" />
            </a>
            <a class="store-btn" href="${PROMO_BANNER.androidUrl}" target="_blank" rel="noopener sponsored">
              <img class="store-badge" src="../assets/badge-google-play.svg" alt="Google Play で手に入れよう" />
            </a>
          </div>
        </div>
      </aside>`;
}

// ---- 4. 記事HTMLの生成 ----
function buildArticleHtml(article, imageRelPath, date) {
  const cards = (article.games || [])
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((g) => {
      // 1位カードには、その記事用に生成した「1位ゲーム関連画像」を表示
      const gameImage =
        g.rank === 1
          ? `
          <img class="game-image" src="${escapeHtml(imageRelPath)}" alt="${escapeHtml(
              g.title
            )}のイメージ" loading="lazy" />`
          : "";
      return `
      <article class="rank-card">
        <div class="rank-badge">${escapeHtml(String(g.rank))}<span>位</span></div>
        <div class="rank-body">${gameImage}
          <h2 class="game-title">${escapeHtml(g.title)}</h2>
          <div class="game-meta">
            <span class="tag platform">${escapeHtml(g.platform)}</span>
            <span class="tag genre">${escapeHtml(g.genre)}</span>
          </div>
          <p class="game-description">${escapeHtml(g.description)}</p>
          <p class="game-reason"><strong>おすすめ理由：</strong>${escapeHtml(g.reason)}</p>
        </div>
      </article>`;
    });

  // 1位カードの直後に自社アプリのプロモバナーを挿入
  if (cards.length >= 1) {
    cards.splice(1, 0, buildPromoBanner());
  }
  const games = cards.join("\n");

  const description = toMetaDescription(
    article.summary ||
      (article.games || []).map((g) => g.title).join("、")
  );
  const pageUrl = `${SITE_URL}/posts/${date}.html`;
  const imageUrl = `${SITE_URL}/assets/images/${date}.png`;
  const jsonLd = buildJsonLd(article, date, pageUrl, imageUrl, description);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(article.title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(pageUrl)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:title" content="${escapeHtml(article.title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="article:published_time" content="${escapeHtml(date)}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(article.title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../style.css" />

  <script type="application/ld+json">
${jsonLd}
  </script>
</head>
<body>
  <header class="hero">
    <img class="hero-image" src="../assets/hero.png" alt="${escapeHtml(SITE_NAME)}" />
    <div class="hero-overlay">
      <h1 class="hero-title">${escapeHtml(article.title)}</h1>
      <p class="hero-date">${escapeHtml(date)}</p>
    </div>
  </header>

  <main class="container">
    <a class="back-link" href="../index.html">&larr; 記事一覧へ戻る</a>

    <section class="ranking">
${games}
    </section>

    <section class="summary">
      <p>${escapeHtml(article.summary)}</p>
    </section>

    <a class="back-link" href="../index.html">&larr; 記事一覧へ戻る</a>
  </main>

  <footer class="site-footer">
    <p>&copy; ${new Date().getFullYear()} おすすめゲーム5選ブログ</p>
  </footer>
</body>
</html>
`;
}

function saveArticleHtml(html, date) {
  ensureDir(POSTS_DIR);
  const filePath = path.join(POSTS_DIR, `${date}.html`);
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

// ---- 5. index.html の更新 ----
function indexLabel(article, date) {
  // 例: 「6/10 おすすめゲーム5選」
  const [, m, d] = date.split("-");
  const md = `${Number(m)}/${Number(d)}`;
  return `${md} ${article.title}`;
}

function updateIndex(article, date) {
  const label = indexLabel(article, date);
  const link = `<li><a href="posts/${date}.html">${escapeHtml(label)}</a></li>`;

  if (!fs.existsSync(INDEX_PATH)) {
    // index.html が無ければ新規作成
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>おすすめゲーム5選ブログ</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="site-header">
    <h1>おすすめゲーム5選ブログ</h1>
    <p>毎日更新！今プレイすべきゲームをランキング形式で紹介します。</p>
  </header>

  <main class="container">
    <ul class="post-list">
      ${link}
    </ul>
  </main>

  <footer class="site-footer">
    <p>&copy; ${new Date().getFullYear()} おすすめゲーム5選ブログ</p>
  </footer>
</body>
</html>
`;
    fs.writeFileSync(INDEX_PATH, html, "utf-8");
    return;
  }

  // 既存の index.html に新しい記事を先頭へ追加
  let html = fs.readFileSync(INDEX_PATH, "utf-8");
  if (html.includes(`posts/${date}.html`)) {
    // 既に同日付の記事があれば二重追加しない
    return;
  }
  const marker = '<ul class="post-list">';
  if (html.includes(marker)) {
    html = html.replace(marker, `${marker}\n      ${link}`);
  } else {
    // 万一マーカーが無ければ </main> 直前に挿入
    html = html.replace(
      "</main>",
      `  <ul class="post-list">\n      ${link}\n    </ul>\n  </main>`
    );
  }
  fs.writeFileSync(INDEX_PATH, html, "utf-8");
}

// ---- 6. used_games.json の更新 ----
function updateUsedGames(usedGames, article) {
  const newTitles = (article.games || []).map((g) => g.title);
  const merged = [...usedGames, ...newTitles];
  fs.writeFileSync(USED_GAMES_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}

// ---- 7. SEO: robots.txt / sitemap.xml の生成 ----
function writeRobots() {
  const body = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  fs.writeFileSync(ROBOTS_PATH, body, "utf-8");
}

function writeSitemap(today) {
  const urls = [{ loc: `${SITE_URL}/`, lastmod: today }];

  if (fs.existsSync(POSTS_DIR)) {
    const posts = fs
      .readdirSync(POSTS_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
      .sort()
      .reverse();
    for (const f of posts) {
      const d = f.replace(/\.html$/, "");
      urls.push({ loc: `${SITE_URL}/posts/${f}`, lastmod: d });
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`
  )
  .join("\n")}
</urlset>
`;
  fs.writeFileSync(SITEMAP_PATH, body, "utf-8");
}

// ---- メイン処理 ----
async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("環境変数 ANTHROPIC_API_KEY が設定されていません。");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("環境変数 OPENAI_API_KEY が設定されていません。");
  }

  // 日付は通常 JST の本日。引数 or 環境変数で上書き可能（例: node generate.js 2026-06-12）
  const dateOverride = process.argv[2] || process.env.POST_DATE;
  if (dateOverride && !/^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    throw new Error(`日付の形式が不正です（YYYY-MM-DD）: ${dateOverride}`);
  }
  const date = dateOverride || todayJST();
  console.log(`[1/7] 日付: ${date}${dateOverride ? "（指定）" : ""}`);

  const usedGames = loadUsedGames();
  console.log(`[1/7] 紹介済みゲーム: ${usedGames.length} 件`);

  console.log("[2/7] Claude API で記事を生成中...");
  const article = await generateArticle(usedGames, date);
  console.log(`[2/7] 生成完了: ${article.title}`);

  console.log("[3/7] OpenAI API でサムネイル画像を生成中...");
  const imageRelPath = await generateThumbnail(article.thumbnail_prompt, date);
  console.log(`[3/7] 画像保存: assets/images/${date}.png`);

  console.log("[4/7] 記事HTMLを生成中...");
  const html = buildArticleHtml(article, imageRelPath, date);
  const articlePath = saveArticleHtml(html, date);
  console.log(`[4/7] 保存: ${path.relative(__dirname, articlePath)}`);

  console.log("[5/7] index.html を更新中...");
  updateIndex(article, date);

  console.log("[6/7] used_games.json を更新中...");
  updateUsedGames(usedGames, article);

  console.log("[7/7] robots.txt / sitemap.xml を更新中...");
  writeRobots();
  writeSitemap(date);

  console.log("✅ 完了しました。");
}

// 直接実行されたときのみ本処理を走らせる（テストから import 可能にするため）
const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error("❌ エラーが発生しました:", err);
    process.exit(1);
  });
}

export { buildArticleHtml, buildJsonLd, writeSitemap, writeRobots, toMetaDescription };
