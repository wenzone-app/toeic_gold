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

進度與成績保存在瀏覽器 localStorage，並不跨裝置同步。朗讀使用瀏覽器語音合成。

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
