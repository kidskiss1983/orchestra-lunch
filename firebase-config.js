// 請在 Firebase Console 建立「網頁應用程式」，將設定值貼到下方。
// apiKey 等前端設定值不是資料庫安全邊界；真正的保護在 Firestore Security Rules。
export const firebaseConfig = {
  apiKey: "請填入 Firebase apiKey",
  authDomain: "請填入專案.firebaseapp.com",
  projectId: "請填入 Firebase projectId",
  storageBucket: "請填入 Firebase storageBucket",
  messagingSenderId: "請填入 Firebase messagingSenderId",
  appId: "請填入 Firebase appId"
};

// 管理者登入一次後，從 Firebase Console → Authentication → Users 複製 UID，貼在這裡。
// 同一個 UID 也必須加入 firestore.rules 的 ADMIN_UIDS 清單。
export const ADMIN_UIDS = [
  "請替換成管理者Firebase UID"
];
