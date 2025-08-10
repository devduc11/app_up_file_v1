const path = require('path');
const admin = require('firebase-admin');

// Đảm bảo chỉ init 1 lần
if (!admin.apps.length) {
    const serviceAccount = require('./models/server-game-app-up-file-firebase.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: `${serviceAccount.project_id}.appspot.com`
    });
}

const bucket = admin.storage().bucket();
const folderPath = 'BackupDataGame/';

module.exports = {
    uploadFile: async (filename, makePublic = false) => {
        try {
            const localPath = path.join(__dirname, '../public/upload_game', filename);
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
