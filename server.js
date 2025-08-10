require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const File = require('./models/File');
const backup_Data_Game = require('./models/Backup_Data');
const cors = require('cors');
const fs = require('fs');
const extract = require('extract-zip');

const app = express();
const port = process.env.PORT || 3000;

// Tạo folder upload_game nếu chưa tồn tại
const uploadDir = path.join(__dirname, 'upload_game');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Middleware serve folder upload_game cho client truy cập file
app.use('/upload_game', express.static(uploadDir));

// ====================== KẾT NỐI MONGODB ======================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("Mongo connected successfully");
        checkAndDownloadFiles();
    })
    .catch((error) => console.error("Mongo error:", error));

// ====================== MIDDLEWARE ======================
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// ====================== TOKEN AUTH TEST ======================
const fixedTokenUser = "123";
const fixedTokenAdmin = "123456"; // admin

// ====================== UPLOAD CONFIG ======================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ====================== ROUTES ======================

// Login API
app.post('/login', (req, res) => {
    const { token } = req.body;
    if (token === fixedTokenUser) {
        res.json({ name: '', role: 'user' });
    } else if (token === fixedTokenAdmin) {
        res.json({ name: 'Duc', role: 'admin' });
    } else {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Trang mặc định
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// Upload file game
app.post('/upload_game', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('Không có tệp nào được tải lên.');

    try {
        const { name, type } = req.body;
        const existingFile = await File.findOne({ name, type });
        const zipPath = path.join(uploadDir, req.file.filename);
        const extractToPath = path.join(uploadDir, name);

        if (existingFile) {
            // Xóa bản cũ trên cloud & local
            await backup_Data_Game.deleteFile(existingFile.filename);
            if (fs.existsSync(path.join(uploadDir, existingFile.filename))) {
                fs.unlinkSync(path.join(uploadDir, existingFile.filename));
            }
            if (fs.existsSync(path.join(uploadDir, existingFile.name))) {
                fs.rmSync(path.join(uploadDir, existingFile.name), { recursive: true, force: true });
            }

            // Cập nhật DB
            existingFile.filename = req.file.filename;
            existingFile.originalname = req.file.originalname;
            await existingFile.save();
        } else {
            // Thêm mới DB
            const newFile = new File({
                filename: req.file.filename,
                originalname: req.file.originalname,
                type,
                name
            });
            await newFile.save();
        }

        // Upload cloud & giải nén local
        await backup_Data_Game.uploadFile(req.file.filename, true);

        // Giải nén file zip (dùng extract-zip async)
        await extract(zipPath, { dir: path.resolve(extractToPath) });

        res.json({ message: 'Upload thành công', filename: req.file.filename });
    } catch (error) {
        console.error('Lỗi upload:', error);
        res.status(500).send('Lỗi xử lý file.');
    }
});

// Lấy danh sách game
app.get('/games', async (req, res) => {
    try {
        const games = await File.find().exec();
        res.json(games);
    } catch (error) {
        console.error(error);
        res.status(500).send('Lỗi truy vấn dữ liệu.');
    }
});

// Lọc danh sách active
app.get('/updateListActive', async (req, res) => {
    const { category, key } = req.query;
    try {
        const filter = { type: category, key, active: true };
        const games = await File.find(filter).exec();
        res.json(games);
    } catch (error) {
        console.error(error);
        res.status(500).send('Lỗi truy vấn dữ liệu.');
    }
});

// Test game
app.get('/testGame', async (req, res) => {
    const { selected } = req.query;
    try {
        const game = await File.findOne({ _id: selected }).exec();
        if (!game) return res.status(404).send('Không tìm thấy trò chơi.');

        const { name, filename } = game;
        const zipPath = path.join(uploadDir, filename);
        const extractToPath = path.join(uploadDir, name);

        // Giải nén file trước khi redirect
        await extract(zipPath, { dir: path.resolve(extractToPath) });

        res.redirect(`/upload_game/${name}/`);
    } catch (error) {
        console.error('Lỗi test game:', error);
        await checkAndDownloadFiles();
        res.status(500).send('Lỗi khi xử lý test game.');
    }
});

// Xóa game
app.delete('/games', async (req, res) => {
    const { id, token } = req.query;
    if (token !== fixedTokenAdmin) {
        return res.status(401).send('Không có quyền xóa trò chơi.');
    }

    try {
        const deletedGame = await File.findOneAndDelete({ _id: id }).exec();
        if (!deletedGame) return res.status(404).send('Không tìm thấy trò chơi để xóa.');

        const { name, filename } = deletedGame;

        // Xóa trên cloud & local
        await backup_Data_Game.deleteFile(filename);
        if (fs.existsSync(path.join(uploadDir, filename))) fs.unlinkSync(path.join(uploadDir, filename));
        if (fs.existsSync(path.join(uploadDir, name))) fs.rmSync(path.join(uploadDir, name), { recursive: true, force: true });

        res.json({ message: 'Xóa thành công', deletedGame });
    } catch (error) {
        console.error('Lỗi xóa game:', error);
        res.status(500).send('Lỗi khi xóa trò chơi.');
    }
});

// ====================== HÀM CHECK & DOWNLOAD CLOUD FILE ======================
async function checkAndDownloadFiles() {
    console.log('Đang tải file từ cloud...');
    try {
        const filesToDownload = await File.find({ filename: { $exists: true, $ne: null } });
        for (const file of filesToDownload) {
            const destinationPath = path.join(uploadDir, file.filename);
            const extractPath = path.join(uploadDir, file.name);

            await backup_Data_Game.downloadFile(file.filename, destinationPath);
            await extract(destinationPath, { dir: path.resolve(extractPath) });
        }
        console.log('Hoàn tất tải và giải nén.');
    } catch (err) {
        console.error('Lỗi khi tải file:', err);
    }
}

// ====================== START SERVER ======================
app.listen(port, () => console.log(`Server running on port ${port}`));
