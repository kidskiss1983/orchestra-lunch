// 請在 Firebase Console 建立「網頁應用程式」，將設定值貼到下方。
// apiKey 等前端設定值不是資料庫安全邊界；真正的保護在 Firestore Security Rules。
export const firebaseConfig = {
  apiKey: "AIzaSyAO7zytydbcpBtY9ces0GASg00t52glJaE",
  authDomain: "orchestra-lunch-2027.firebaseapp.com",
  projectId: "orchestra-lunch-2027",
  storageBucket: "orchestra-lunch-2027.firebasestorage.app",
  messagingSenderId: "550445432919",
  appId: "1:550445432919:web:a12f67dd1485df2c326312",
  measurementId: "G-N7QZXNFJZQ"
};

// 管理者登入一次後，從 Firebase Console → Authentication → Users 複製 UID，貼在這裡。
// 同一個 UID 也必須加入 firestore.rules 的 ADMIN_UIDS 清單。
export const ADMIN_UIDS = [
  "請替換成管理者Firebase UID"
];
