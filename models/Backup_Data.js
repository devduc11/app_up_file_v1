const path = require('path');
const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');
require('dotenv').config(); // Load biến môi trường từ .env

// Chỉ init Firebase Admin 1 lần
if (!admin.getApps().length) {
    admin.initializeApp({
        credential: admin.cert({
            type: process.env.FIREBASE_TYPE,
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Fix xuống dòng
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID,
            auth_uri: process.env.FIREBASE_AUTH_URI,
            token_uri: process.env.FIREBASE_TOKEN_URI,
            auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
            client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
        }),
        storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
    });
}

const bucket = getStorage().bucket();
const folderPath = 'BackupDataGame/';

module.exports = {
    uploadFile: async (filename, makePublic = false) => {
        try {
            const localPath = path.join(__dirname, '../upload_game', filename);
            await bucket.upload(localPath, {
                destination: folderPath + filename,
                gzip: true,
                metadata: { contentType: 'application/zip' }
            });

            if (makePublic) {
                await bucket.file(folderPath + filename).makePublic();
                console.log(`${filename} uploaded and made public.`);
            } else {
                console.log(`${filename} uploaded successfully.`);
            }
        } catch (err) {
            console.error('Error uploading file:', err);
        }
    },

    deleteFile: async (filename) => {
        try {
            await bucket.file(folderPath + filename).delete();
            console.log(`${filename} deleted successfully.`);
        } catch (err) {
            console.error('Error deleting file:', err);
        }
    },

    downloadFile: async (filename, destination) => {
        try {
            await bucket.file(folderPath + filename).download({ destination });
            console.log(`${filename} downloaded successfully to ${destination}.`);
        } catch (err) {
            console.error('Error downloading file:', err);
        }
    },

    getPublicUrl: (filename) => {
        return `https://storage.googleapis.com/${bucket.name}/${folderPath}${filename}`;
    }
};
