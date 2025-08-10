const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const mime = require('mime'); // npm install mime

// === CẤU HÌNH FIREBASE ADMIN SDK ===
try {
    const serviceAccountPath = path.join(__dirname, './models/server-game-app-up-file-firebase.json');

    if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`Không tìm thấy file service account tại: ${serviceAccountPath}`);
    }

    const serviceAccount = require(serviceAccountPath);

    if (!serviceAccount.project_id) {
        throw new Error('File service account JSON không chứa project_id.');
    }

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: `${serviceAccount.project_id}.appspot.com`
        });
        console.log(`Firebase Admin đã khởi tạo cho project: ${serviceAccount.project_id}`);
    }
} catch (error) {
    console.error('Lỗi khởi tạo Firebase Admin:', error.message);
    process.exit(1); // Dừng chương trình nếu khởi tạo thất bại
}

const bucket = admin.storage().bucket();
const folderPath = 'BackupDataGame/';

// === CÁC HÀM QUẢN LÝ FILE TRÊN STORAGE ===
module.exports = {
    // Upload file
    uploadFile: async (filename, makePublic = false) => {
        try {
            const localPath = path.join(__dirname, '../public/upload_game', filename);

            if (!fs.existsSync(localPath)) {
                throw new Error(`Không tìm thấy file cần upload: ${localPath}`);
            }

            const contentType = mime.getType(localPath) || 'application/octet-stream';

            await bucket.upload(localPath, {
                destination: `${folderPath}${filename}`,
                gzip: true,
                metadata: { contentType }
            });

            if (makePublic) {
                await bucket.file(`${folderPath}${filename}`).makePublic();
                console.log(`${filename} uploaded and made public.`);
            } else {
                console.log(`${filename} uploaded successfully.`);
            }

            return module.exports.getPublicUrl(filename);
        } catch (err) {
            console.error('Error uploading file:', err.message);
            throw err;
        }
    },

    // Xóa file
    deleteFile: async (filename) => {
        try {
            await bucket.file(`${folderPath}${filename}`).delete();
            console.log(`${filename} deleted successfully.`);
        } catch (err) {
            console.error('Error deleting file:', err.message);
            throw err;
        }
    },

    // Tải file
    downloadFile: async (filename, destination) => {
        try {
            await bucket.file(`${folderPath}${filename}`).download({ destination });
            console.log(`${filename} downloaded successfully to ${destination}.`);
        } catch (err) {
            console.error('Error downloading file:', err.message);
            throw err;
        }
    },

    // Lấy link public cố định
    getPublicUrl: (filename) => {
        return `https://storage.googleapis.com/${bucket.name}/${folderPath}${filename}`;
    },

    // Lấy link tạm thời có thời hạn
    getSignedUrl: async (filename, expiresIn = 3600) => {
        try {
            const [url] = await bucket.file(`${folderPath}${filename}`).getSignedUrl({
                action: 'read',
                expires: Date.now() + expiresIn * 1000
            });
            return url;
        } catch (err) {
            console.error('Error generating signed URL:', err.message);
            throw err;
        }
    }
};
