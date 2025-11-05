import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// 静的ファイルの配信（assetsディレクトリ）
app.use('/static/assets/*', serveStatic({ root: './static' }))

// その他の静的ファイル
app.use('/static/*', serveStatic({ root: './' }))

// ルートパス - index.htmlを返す
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#a855f7" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>VoiceTask - あらゆるデバイスで使えるスケジュール管理</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="/static/style.css" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/static/client.js"></script>
  </body>
</html>`)
})

// すべてのパスでindex.htmlを返す（SPAルーティング）
app.get('*', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#a855f7" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <title>VoiceTask - あらゆるデバイスで使えるスケジュール管理</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="/static/style.css" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/static/client.js"></script>
  </body>
</html>`)
})

export default app
