# 每日任务 · 英语学习

一个记录每日工作任务、个人安排，并配套英语学习日历的 PWA（网页应用），
可以"添加到主屏幕"，在手机上获得接近原生 App 的体验。

## 本地运行

```bash
npm install
npm run dev
```

打开终端给出的地址（通常是 `http://localhost:5173`）即可预览。

## 构建生产版本

```bash
npm run build
```

产物在 `dist/` 目录，`npm run preview` 可以本地预览构建结果。

## 部署到 Vercel（推荐，免费）

1. 把这个项目推到一个 GitHub 仓库
2. 打开 https://vercel.com ，用 GitHub 账号登录
3. 点 "Add New Project"，选择这个仓库
4. Framework Preset 选 **Vite**，其余保持默认，点 Deploy
5. 几十秒后会拿到一个 `https://xxx.vercel.app` 的网址

也可以用命令行（在项目根目录执行）：

```bash
npm install -g vercel
vercel
```

按提示走完流程即可，之后每次想重新部署运行 `vercel --prod`。

## 部署到 Netlify（备选，同样免费）

1. 把项目推到 GitHub
2. 打开 https://app.netlify.com ，连接该仓库
3. Build command 填 `npm run build`，Publish directory 填 `dist`
4. Deploy

## 手机安装到主屏幕

部署完拿到网址后：

- **iPhone（Safari）**：打开网址 → 点击底部分享图标 → "添加到主屏幕"
- **Android（Chrome）**：打开网址 → 右上角菜单 → "安装应用" 或 "添加到主屏幕"

安装后桌面会出现一个图标，点开是全屏独立窗口，跟普通 App 没有区别。

## 数据存储说明

当前版本使用浏览器本地的 IndexedDB（封装在 `src/storage.js` 里）存储数据，
**数据只保存在当前这台设备的这个浏览器里**，换手机或清除浏览器数据会丢失，
也不会在多个设备间同步。

如果以后需要多设备同步（比如手机和电脑共用一份记录），思路是：
把 `src/storage.js` 里的几个函数（`storageGet` / `storageSet` 等）
改成调用云端数据库（推荐 [Supabase](https://supabase.com)，免费额度对个人使用足够），
上层组件（`App.jsx`）完全不需要改动，因为它只依赖这几个函数的接口。

## 项目结构

```
├── index.html              # 入口 HTML，包含 PWA 相关 meta 标签
├── vite.config.js          # Vite 配置，集成了 vite-plugin-pwa
├── public/
│   ├── favicon.png
│   └── icons/               # PWA 图标（192/512/512-maskable）
└── src/
    ├── main.jsx             # React 入口
    ├── App.jsx              # 主应用逻辑（任务清单 + 英语学习）
    ├── app.css              # 样式
    └── storage.js           # 本地存储封装层
```

## 后续可以扩展的方向

- 英语学习内容库（`App.jsx` 里的 `VOCAB_BANK` / `PASSAGE_BANK`）目前是写死的几条，
  循环复用；可以扩充数量，或改成调用 AI API 每天动态生成新内容
- 任务清单可以加"每周/每月完成率"统计页面
- 想要多设备同步的话按上面"数据存储说明"里的思路替换存储层
- 想做推送提醒（比如每天固定时间提醒打卡），需要额外配置 Web Push，
  这部分逻辑相对独立，可以后续单独加
