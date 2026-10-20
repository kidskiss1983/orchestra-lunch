# 弦樂團假日加練訂餐網站（獨立版）

這是一個獨立網站，不會修改既有弦樂團官網。前端使用 GitHub Pages，資料保存使用 Firebase Authentication + Cloud Firestore。

## 功能

- 家長共用連結，免手動註冊：第一次打開時由 Firebase Anonymous Auth 背景建立匿名識別。
- 團員名冊長期保存：新增、停用、批次匯入。
- 每次加練可建立獨立場次，設定餐廳、日期、截止時間。
- 菜單來源支援照片、PDF、直接貼文字；OCR 後可編輯品名與價格。
- 自動統計餐點份數、預估金額、每位團員訂單及未訂餐名單。
- 匯出 Excel（訂單明細、餐點統計兩張工作表）。
- 列印或另存 PDF。

## 重要限制與安全說明

1. 本版本不要求家長自行註冊，但會在背景使用 Firebase 匿名登入，讓資料庫能辨識同一瀏覽器的訂單擁有者。
2. 共用連結持有人可能替任何團員建立尚未存在的訂單；因此它適合一般團體訂餐，不是強身分驗證。已被其他瀏覽器先建立的訂單不能被另一個匿名識別碼直接覆蓋，需請管理者協助。
3. OCR 只是初步辨識，模糊照片、手寫、複雜排版可能出錯。請管理者逐項校正品名與價格後再儲存。
4. 管理者必須同時出現在 `firebase-config.js` 的 `ADMIN_UIDS` 和 `firestore.rules` 的 UID 清單。前端隱藏按鈕不等於安全防護，真正的權限由 Firestore Rules 執行。
5. `firestore.rules` 是給這個獨立 Firebase 專案使用的規則範本。若選用既有官網正在使用的 Firebase 專案，請先備份並合併原規則，不要直接覆蓋，否則可能影響打卡、集點等既有功能。
6. 前端使用 Firebase、PDF.js、Tesseract.js、SheetJS 的 CDN 模組；初次載入 OCR 會下載相關程式與語言資料，需要網路連線。

---

# 初學者部署步驟

## 第 1 步：建立獨立 GitHub Repository

1. 登入 GitHub。
2. 右上角按 `+` → `New repository`。
3. Repository name 輸入 `orchestra-lunch`（或你喜歡的名稱）。
4. 選 `Public`，勾選 `Add a README file`，按 `Create repository`。
5. 在新 repository 按 `Add file` → `Upload files`。
6. 上傳 ZIP 解壓後的所有檔案：`index.html`、`app.js`、`styles.css`、`firebase-config.js`、`firestore.rules`、`.nojekyll`、`README_繁體中文.md`。
7. 按 `Commit changes`。

## 第 2 步：建立 Firebase 專案

建議先建立「專用於訂餐」的 Firebase 專案，這樣不會碰到官網原本的打卡與集點資料。

1. 開啟 https://console.firebase.google.com/
2. 按新增專案，命名例如 `orchestra-lunch-2027`。
3. 建立專案後，在專案總覽按網頁圖示 `</>`，新增 Web App，名稱例如 `orchestra-lunch-web`。
4. Firebase 會顯示 `firebaseConfig`。複製設定值，稍後填入 `firebase-config.js`。
5. 開啟 `Build → Authentication → Get started`。
6. 在 Sign-in method 啟用 **Google** 與 **Anonymous**。
7. 開啟 `Build → Firestore Database → Create database`，選擇正式模式（production mode），再選擇適當區域。
8. 到 `Authentication → Settings → Authorized domains`，確認 GitHub Pages 網域已授權。若未列出，加入 `你的GitHub帳號.github.io`。

## 第 3 步：填 Firebase 前端設定

1. 在 GitHub repository 打開 `firebase-config.js`。
2. 點鉛筆編輯，把 Firebase Console 提供的 `apiKey`、`authDomain`、`projectId`、`storageBucket`、`messagingSenderId`、`appId` 貼上。
3. 先保留 `ADMIN_UIDS` 的佔位值。
4. 按 `Commit changes`。

## 第 4 步：開啟 GitHub Pages

1. Repository → `Settings` → `Pages`。
2. `Build and deployment` 的 Source 選 `Deploy from a branch`。
3. Branch 選 `main`，資料夾選 `/ (root)`，按 `Save`。
4. 等待部署完成。網址通常是 `https://你的GitHub帳號.github.io/orchestra-lunch/`。

## 第 5 步：取得管理者 UID

1. 開啟剛部署的網站，切到「管理者專區」並按「使用 Google 登入」。
2. 如果尚未授權，頁面會顯示目前帳號 UID。複製這串 UID。
3. 在 `firebase-config.js` 的 `ADMIN_UIDS` 陣列，將佔位文字替換成 UID，例如 `"abc123..."`，Commit。
4. 編輯 `firestore.rules`，將 `isAdmin()` 裡的 UID 佔位文字也替換成相同 UID。
5. Firebase Console → Firestore Database → Rules，貼上更新後的 `firestore.rules` 全文，按 Publish。
6. 等 GitHub Pages 部署完成後，重新整理網站。確認管理者能看到管理功能。

**請勿把佔位 UID 留在正式環境。** 如需多人管理，兩處都加入每位管理者 UID。

## 第 6 步：建立團員與第一次訂餐

1. 管理者登入後，在「長期團員名冊」逐一新增，或每行貼一位，格式可為 `姓名,班別` 後按匯入。
2. 在「建立或編輯加練場次」輸入名稱、日期、截止時間及餐廳。
3. 上傳菜單照片／PDF，按「辨識照片／PDF 文字」；或直接貼文字菜單。
4. OCR 結果會出現在文字框。檢查錯字後按「從文字解析餐點」。
5. 檢查餐點編輯區的品名、價格；也可以手動新增或刪除餐點。
6. 按「儲存場次與菜單」。
7. 把 GitHub Pages 網址傳給家長。家長打開後選場次、團員、份數與備註，按送出。
8. 管理者在訂單統計選場次，核對每道菜份數及未訂餐名單，再下載 Excel 或列印／另存 PDF。
9. 截止後按「關閉訂餐」。

## 菜單文字格式建議

一行一個餐點，名稱後面放價格，以下格式最容易自動解析：

```text
雞腿便當 100
排骨便當 110
素食便當 100
```

若解析不正確，可直接修改文字再解析，或用手動新增餐點。

## 上線前測試清單

- [ ] 未登入家長可以開啟場次及讀取團員名單。
- [ ] 家長能送出訂單，重新整理後訂單仍存在。
- [ ] 家長不能讀取其他匿名使用者的訂單內容。
- [ ] 非管理者 Google 帳號不能建立／修改場次或名冊。
- [ ] 管理者可看到全部訂單並匯出 Excel。
- [ ] 列印預覽版面正常，能另存 PDF。
- [ ] 截止或關閉後，家長不能提交新訂單。
- [ ] OCR 結果經人工校正後才儲存。

## 後續整合官網

未來只需把訂餐網站的連結加入官網導航，或將本專案的頁面與 Firebase 資料模型整合。請先維持獨立專案，等穩定使用後再決定是否共用官網的 Firebase 專案。
