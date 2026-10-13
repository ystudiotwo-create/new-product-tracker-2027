# 2027 新品開發進度

2026/6 – 2027/9 年度新品開發的進度追蹤網站：總覽、工作台、甘特圖、產品進度、儀表、Email 提醒規則與流程規則。

網站：https://ystudiotwo-create.github.io/new-product-tracker-2027/

## 架構

- 前端：GitHub Pages 上的靜態檔案，無需建置
  - `index.html`：版面與樣式，含登入畫面
  - `app.js`：頁面邏輯（沿用原 Claude Artifact 版本）
  - `backend.js`：Supabase 登入、資料同步與檔案上傳，提供 `app.js` 使用的 `db` / `user` / `assets` 介面
  - `config.js`：Supabase 專案網址與公開金鑰（anon key 本來就是公開的，權限由資料庫規則控管）
- 後端：Supabase
  - 所有資料存在 `docs` 資料表（collection, id, data），即時同步
  - 檔案存在私人 bucket `files`，以有時效的簽章網址讀取
  - 結構與權限規則見 `supabase/schema.sql`

## 權限

- 只有 `@ystudiostyle.com` 的 Google 帳號能登入與讀寫。
- 登入後依 Email 自動對應人員名冊。
- 人員名冊與寄送紀錄只有 `admins` 資料表中的管理員能修改。
