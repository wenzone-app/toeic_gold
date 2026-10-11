# TOEIC Studio｜90 天金色證書

純 HTML / CSS / JavaScript 網站，教材使用本地 JSON，無需安裝相依套件或建置。

## 本機啟動

在專案根目錄執行：

```sh
python3 -m http.server 8000 --directory dist
```

開啟 http://localhost:8000 。請透過 HTTP 開啟，直接雙擊 index.html 可能無法載入 JSON。

## 檔案

- dist/index.html：畫面
- dist/style.css：樣式
- dist/app.js：學習功能、語音朗讀、計分
- dist/data/day-N.json：各日教材
- dist/data/curriculum.json：90 天目錄與各日開放狀態

進度、成績、收藏與筆記皆保存在瀏覽器 `localStorage`，不會自動跨裝置同步。朗讀使用瀏覽器語音合成。

## 收藏與筆記

- 單字、教材章節與測驗題都可以個別收藏或加入純文字筆記。
- 側邊欄的「收藏筆記」可跨 Day 篩選並返回原始內容。
- 筆記會在輸入後自動儲存，每筆最多 2,000 字。
- 「匯出學習資料」會下載包含進度、成績、收藏與筆記的 JSON 備份。
- 匯入備份時會先顯示資料摘要；確認後採合併方式，相同項目由匯入資料覆蓋。

## 個人 Git

```sh
git init
git add .
git commit -m "Initial TOEIC Studio website"
git branch -M main
git remote add origin <你的儲存庫URL>
git push -u origin main
```

此下載包已排除原本 .git 紀錄、Sites 專案身分與執行環境設定。原始碼位於 dist/，請勿忽略此資料夾。部署至靜態網站服務時，發布目錄指定 dist。
