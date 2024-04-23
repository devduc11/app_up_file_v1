const { initializeApp } = require('firebase/app');
const { getAnalytics } = require('firebase/analytics');
const { getStorage } = require('firebase/storage');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBktX-GbKBt79Ja94QQpDR1A_fkjbfuxME",
  authDomain: "server-game-app-up-file.firebaseapp.com",
  projectId: "server-game-app-up-file",
  storageBucket: "server-game-app-up-file.appspot.com",
  messagingSenderId: "563214407654",
  appId: "1:563214407654:web:684c233934f9ec87642827",
  measurementId: "G-16SQ6RV0XT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
let analytics = null;
if (typeof window !== 'undefined') {
    analytics = getAnalytics(app);
}

const fs = require('fs');
const admin = require('firebase-admin');

// Khởi tạo Firebase Admin với tệp sao lưu cấu hình của Firebase
const serviceAccount = require('./models/server-game-app-up-file-firebase-adminsdk-5pkvx-8c9d6dc959.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'gs://server-game-app-up-file.appspot.com'// server-game-app-up-file-firebase-adminsdk-5pkvx-8c9d6dc959.json
});

const bucketName = 'gs://server-game-app-up-file.appspot.com'; // Đường dẫn bucket mới
const folderPath = 'BackupDataGame/'; // Đường dẫn đến thư mục trong Firebase Storage

module.exports = {
    uploadFile: async (filename) => {
        const zipFilePath = `public/upload_game/${filename}`;
        const fileContent = fs.readFileSync(zipFilePath);
        const storage = admin.storage();
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(folderPath + filename); // Thêm tên thư mục vào đường dẫn

        file.save(fileContent, {
            gzip: true,
            metadata: {
                contentType: 'application/zip' // Đặt contentType cho tệp zip
            },
            public: true // Có thể public cho mọi người xem hay không
        }).then(() => {
            console.log(`${filename} uploaded successfully.`);
        }).catch(err => {
            console.error('Error uploading file:', err);
        });
    }
}
