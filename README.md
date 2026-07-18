# 宝宝记录

一个运行在 iPhone 上的网页 App（PWA），记录新生儿的**喂养 / 尿布 / 睡眠**，按**早 8:00 → 次日早 8:00** 的 24 小时周期实时统计，并可回看历史周期。无需 Xcode、无需开发者账号，离线可用，数据存在手机本机。

## 功能

- **喂养记录**：点一下按钮即记下当前时间；稍后在记录列表里点开这条，补充母乳时长（分钟）和/或配方奶奶量（毫升）。
- **尿布情况**：点一下即记下时间；稍后点开选择 大便 / 小便 / 都有。
- **睡眠记录**：点一下开始记录；再点一下（按钮会变成「结束睡眠」）记录结束时间。
- **所有记录**都可随时编辑时间与数值，也可删除。
- **首页实时统计**当前周期：总母乳时长、总配方奶奶量、总大便次数、总小便次数、总尿布次数、总睡眠时长。
- **历史周期**：查看每个过往周期的统计与全部单条记录。
- 未填详情的记录会标「待补」，提醒你回去补。

## 在 iPhone 上使用（推荐：托管后添加到主屏幕）

PWA 需要 HTTPS 才能离线使用，所以最简单的方式是把整个 `宝宝喂养app` 文件夹托管到一个免费静态网站服务，再用 iPhone Safari 打开。

### 方式 A：Netlify Drop（最简单，不用注册也能试）

1. 浏览器打开 https://app.netlify.com/drop
2. 把整个 `宝宝喂养app` 文件夹拖进去（拖文件夹本身，不要拖里面的文件）
3. 几秒后会得到一个 https 网址，复制到 iPhone 的 Safari 打开
4. Safari 底部「分享」按钮 →「添加到主屏幕」→ 像原生 App 一样使用，离线也能记

> 想长期固定网址：注册一个免费 Netlify 账号即可保留该站点。

### 方式 B：GitHub Pages / Vercel

把文件夹推到 GitHub 仓库，开启 Pages（或导入 Vercel），同样会得到 https 网址，再按上面第 4 步添加到主屏幕。

## 在 Mac 上本地预览（调试用）

打开「终端」，执行：

```bash
cd /Users/fuxiaoxin/Documents/project/宝宝喂养app
python3 -m http.server 8000
```

然后 Mac 的 Safari 打开 http://localhost:8000 预览。

> 注意：`localhost` 仅用于 Mac 上预览。iPhone 上需要上面的 https 网址，PWA 的离线缓存才会生效。

## 数据说明

- 默认所有记录只存在**手机本机**（浏览器 localStorage），不上传任何服务器，不联网也能用。
- 开启「多设备共享」（见下）后，记录会同步到 Supabase 云端，本机仍保留一份。
- 清除 Safari 网站数据会删除本机记录，请避免清除该站点的数据（云端那份不受影响）。

## 多设备共享数据（多台手机看同一份，可选）

已接入 **Supabase** 作为云端共享数据库。多台安卓 / 苹果手机登录**同一个账号**（邮箱 + 密码），即可共享同一份数据，约 30 秒内自动同步。

### 一次性配置（代码我已写好，你做这步）

1. 打开 https://supabase.com 用邮箱或 GitHub 注册（免费）。新建项目：名称随意、**区域选 Singapore（新加坡，离国内最近）**、数据库密码记好。等 2～3 分钟建成。
2. 项目左侧「**SQL Editor**」→ New query，粘贴下面这段 SQL → Run：

   ```sql
   create table baby_record (
     local_id text primary key,
     owner uuid not null,
     type text not null,
     start text not null,
     end_time text,
     breast_minutes int,
     formula_ml int,
     pee boolean,
     poop boolean,
     created_at timestamptz default now(),
     updated_at timestamptz default now()
   );
   alter table baby_record enable row level security;
   create policy "owner all" on baby_record
     for all using (auth.uid() = owner) with check (auth.uid() = owner);
   ```

3. 左侧「**Authentication**」→「Providers」→「Email」：确保开关打开，**关掉「Confirm email」**（注册后不用点邮件确认，直接能登录）。
4. 左下齿轮「**Project Settings**」→「API」：复制 **Project URL** 和 **anon public** key。
5. 把这两个值填进 `src/config.js`（`supabaseUrl`、`anonKey`），重新上传到 GitHub Pages。
6. 手机打开 App →「第一次使用？点此注册」→ 输入邮箱 + 密码 → 注册并登录。第一台手机注册，**其它手机用同一邮箱密码「登录」**即可共享。第一次会把本机已有记录自动传到云端。

### 使用

- 每台手机都用**同一个邮箱 + 密码**登录，看到的是同一份数据。
- 一台新增 / 修改 / 删除，其它台打开 App 或等约 30 秒自动同步；顶栏「☁ 已同步」可点一下手动刷新。
- 没网时照常记录，联网后自动同步上去。
- 「登出」可退出当前手机，不影响其它设备和云端数据。

## 目录结构

```
宝宝喂养app/
├── index.html            # 应用页面
├── styles.css            # 淡蓝色主题样式
├── src/
│   ├── app.js            # 入口：登录态、路由、事件、记录操作、同步
│   ├── storage.js        # 本机数据读写 + 同步辅助
│   ├── stats.js          # 周期划分与统计
│   ├── ui.js             # 界面渲染（含登录页）
│   ├── config.js         # LeanCloud 配置（你填 AppID/AppKey/地址）
│   ├── cloud.js          # LeanCloud REST 客户端
│   └── sync.js           # 本机 ↔ 云端 同步编排
├── manifest.json         # PWA 清单
├── service-worker.js     # 离线缓存
├── icons/                # App 图标
├── generate_icons.py     # 重新生成图标的脚本（可选）
└── README.md
```
