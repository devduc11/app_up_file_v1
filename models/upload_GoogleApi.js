require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URL = process.env.REDIRECT_URL;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const FOLDER_ID = '1DCHE9gwhnhxOoboEtp6ujYrWXG78Yj-c'; // https://drive.google.com/drive/u/4/folders/1DCHE9gwhnhxOoboEtp6ujYrWXG78Yj-c

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({
    version: 'v3',
    auth: oAuth2Client,
});

module.exports = {
    uploadFile: async (filename) => {
        const zipFilePath = `upload_game/${filename}`;

        try {
            // Set file metadata with parents property
            const fileMetadata = {
                name: filename,
                mimeType: 'application/zip',
                parents: [FOLDER_ID],
            };

            // Create file
            const createFile = await drive.files.create({
                resource: fileMetadata,
                media: {
                    mimeType: 'application/zip',
                    body: fs.createReadStream(zipFilePath),
                },
            });

            console.log('Tệp đã tải lên trên drive thành công', createFile.data);
        } catch (error) {
            console.error('Lỗi tải tập tin nén (zip) lên trên drive:', error);
        }
    },

    deleteFile: async (filename) => {
        try {
            // Find the file by name
            const fileList = await drive.files.list({
                q: `name='${filename}' and '${FOLDER_ID}' in parents`,
                fields: 'files(id)',
            });

            // Check if the file exists
            if (fileList.data.files.length > 0) {
                const fileId = fileList.data.files[0].id;

                // Delete the file by ID
                await drive.files.delete({
                    fileId: fileId,
                });

                console.log('Đã xóa tệp tin nén (zip) trên drive thành công');
            } else {
                console.log('Không tìm thấy tập tin nén (zip) trên drive');
            }
        } catch (error) {
            console.error('Lỗi xóa tập tin tin nén (zip) trên drive: ', error);
        }
    },

    downloadFile: async (filename, destinationPath, name) => {
        try {
            // Find the file by name
            const fileList = await drive.files.list({
                q: `name='${filename}' and '${FOLDER_ID}' in parents`,
                fields: 'files(id)',
            });

            // Check if the file exists
            if (fileList.data.files.length > 0) {
                const fileId = fileList.data.files[0].id;

                // Download the file by ID
                const dest = fs.createWriteStream(destinationPath);
                await drive.files.get(
                    { fileId: fileId, alt: 'media' },
                    { responseType: 'stream' }
                ).then(res => {
                    return new Promise((resolve, reject) => {
                        res.data
                            .on('end', () => {
                                console.log('Tệp được tải xuống thành công');
                                // Đường dẫn đến tệp zip
                                // const zipPath = `upload_game/${filename}`;
                                // const zipPath = destinationPath;
                                // console.log("zipPath: ", zipPath);
                                // // // Đường dẫn đến thư mục mà bạn muốn giải nén tệp zip vào
                                // const extractToPath = `upload_game/${name}`;
                                // console.log("extractToPath: ", extractToPath);

                                // // Giải nén tệp zip
                                // const zip = new AdmZip(zipPath);
                                // zip.extractAllTo(extractToPath, true);
                                resolve();
                            })
                            .on('error', err => {
                                console.error('Lỗi tải tập tin:', err);
                                reject(err);
                            })
                            .pipe(dest);
                    });
                });
            } else {
                console.log('Không tìm thấy tập tin');
            }
        } catch (error) {
            console.error('Lỗi tải tập tin:', error);
        }
    },
};
