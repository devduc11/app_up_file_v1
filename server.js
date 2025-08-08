require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mongoose = require('mongoose');
const File = require('./models/File'); // Đường dẫn đến mô hình tệp
// const backup_Data_Game = require('./models/Backup_Data');
// const upload_GoogleApi = require('./models/upload_GoogleApi');
// const { updateNode, updateNpm } = require('./models/update-node-npm');
const cors = require('cors');
const axios = require('axios');
const AdmZip = require('adm-zip');
const fs = require('fs');
const { saveAs } = require('file-saver');
const { google } = require('googleapis');
const extract = require('extract-zip');
const MongoClient = require('mongodb').MongoClient;

const app = express();
const port = process.env.PORT || 3000;

// Gọi hàm cập nhật từ update.js
// updateNode();
// updateNpm();

// Kết nối với cơ sở dữ liệu MongoDB
const uri = process.env.MONGODB_URI;
mongoose.connect(uri, {
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
}).then(() => {
    console.log("Mongo connected successfully");
    checkAndDownloadFiles();
}).catch((error) => {
    console.error("Mongo error:", error);
});

/* phần login */
// Payload mẫu cho token
const payload = {
    userId: 123,
    username: 'exampleUser',
};

// Khóa bí mật cố định cho việc tạo và xác thực token
const secretKey = 'your-secret-key'; // Thay thế bằng khóa bí mật thực tế

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Tạo một token cố định cho việc test
// const fixedToken = jwt.sign(payload, secretKey);
const fixedTokenUser = "123";
const fixedTokenAdmin = "123456"; // admin

app.post('/login', async (req, res) => {
    const { token } = req.body;

    // Kiểm tra xem token gửi lên có trùng khớp với fixedToken hay không
    if (token === fixedTokenUser) {
        console.log('Đăng nhập thành công User');
        // Lấy thông tin người dùng từ payload của token
        const user = {
            name: '',
            role: 'user',
        };
        res.json(user);
    } else if (token === fixedTokenAdmin) {
        console.log('Đăng nhập thành công Admin');
        // Lấy thông tin người dùng từ payload của token
        const user = {
            name: 'Duc',
            role: 'admin',
        };
        res.json(user);
    } else {
        // Token không hợp lệ, in ra thông báo đăng nhập không thành công
        console.log('Đăng nhập không thành công');
        // res.status(401).json({ error: 'Invalid token' });
    }
});

// Xử lý tất cả các yêu cầu GET và gửi trang login.html
app.get('/', (req, res) => {
    // res.sendFile(path.join(__dirname, 'public', 'login.html'));
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

/* phần upload file*/
// Định nghĩa nơi lưu trữ tệp tải lên
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/upload_game/'); // Thay đổi 'upload_game/' thành thư mục lưu trữ tệp của bạn
    },
    filename: function (req, file, cb) {
        const extname = path.extname(file.originalname);
        cb(null, Date.now() + extname); // Đổi tên tệp nếu cần
    }
});

const upload = multer({ storage: storage });

// Middleware để cho phép CORS (nếu bạn cần)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(express.json());
app.use(cors());

const folderPath = 'public/upload_game/'; // Định nghĩa đường dẫn thư mục lưu trữ tệp và thư mục giải nén
// Xử lý tệp tải lên khi POST được gửi từ trình duyệt /upload_game
app.post('/public/upload_game', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('Không có tệp nào được tải lên.');
    }

    try {
        // Tìm tệp trong cơ sở dữ liệu dựa trên các thông tin như tên và loại
        const existingFile = await File.findOne({
            name: req.body.name,
            type: req.body.type,
        });

        if (existingFile) {
            // upload_GoogleApi.deleteFile(existingFile.filename);
            // backup_Data_Game.deleteFile(existingFile.filename);
            // Lấy đường dẫn đầy đủ đến tệp cũ và thư mục cũ
            const folderPath = 'public/upload_game/';
            const oldFilePath = path.join(folderPath, existingFile.filename);
            const oldFolderPath = path.join(folderPath, existingFile.name);

            // Kiểm tra và xóa tệp cũ
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
                console.log(`Đã xóa tệp tin nén (zip) cũ ở thư mục upload_game: ${existingFile.filename}`);
            }

            // Kiểm tra và xóa thư mục cũ
            if (fs.existsSync(oldFolderPath)) {
                fs.rmSync(oldFolderPath, { recursive: true });
                console.log(`Đã xóa thư mục cũ ở thư mục upload_game: ${existingFile.name}`);
            }

            // Cập nhật thông tin của tệp
            existingFile.filename = req.file.filename;
            existingFile.originalname = req.file.originalname;
            await existingFile.save();
            // upload_GoogleApi.uploadFile(req.file.filename);
            // backup_Data_Game.uploadFile(req.file.filename);

            // Giải nén tệp ZIP
            const zipPath = path.join(folderPath, req.file.filename);
            const extractToPath = path.join(folderPath, req.body.name);
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extractToPath, true);

            // In ra thông báo "Tải lên thành công" cùng với tên tệp
            console.log('Cập nhật tệp thành công:', req.file.filename);

            // Trả về phản hồi cho máy khách
            res.json({ message: 'Cập nhật tệp thành công', filename: req.file.filename });
        } else {
            // Nếu tệp chưa tồn tại, tạo tệp mới
            const newFile = new File({
                filename: req.file.filename,
                originalname: req.file.originalname,
                type: req.body.type,
                name: req.body.name,
            });
            await newFile.save();

            // upload_GoogleApi.uploadFile(req.file.filename);
            // backup_Data_Game.uploadFile(req.file.filename);

            // Giải nén tệp ZIP
            const zipPath = path.join(folderPath, req.file.filename);
            const extractToPath = path.join(folderPath, req.body.name);
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extractToPath, true);

            // In ra thông báo "Tải lên thành công" cùng với tên tệp
            console.log('Tải lên thành công:', req.file.filename);

            // Trả về phản hồi cho máy khách
            res.json({ message: 'Tải lên thành công', filename: req.file.filename });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Đã xảy ra lỗi trong quá trình xử lý tệp.');
    }
});

// Xử lý yêu cầu GET để lấy danh sách trò chơi từ MongoDB
app.get('/games', async (req, res) => {
    try {
        const games = await File.find().exec();
        res.json(games);
        // console.log("games: ", games)
    } catch (error) {
        console.error(error);
        res.status(500).send('Đã xảy ra lỗi khi truy vấn dữ liệu.');
    }
});

// Xử lý yêu cầu từ phương thức updateListActive
app.get('/updateListActive', async (req, res) => {
    const { token, category, key } = req.query;
    try {
        const filter = {
            type: category,
            key: key,
            active: true,
        };
        const games = await File.find(filter).exec();
        res.json(games);
    } catch (error) {
        console.error(error);
        res.status(500).send('Đã xảy ra lỗi khi truy vấn dữ liệu.');
    }
});

// Xử lý yêu cầu từ phương thức testGame
app.get('/testGame', async (req, res) => {
    const { token, selected } = req.query;
    const selectedGameId = req.query.selected;
    // console.log(selectedGameId);
    try {
        const game = await File.findOne({ _id: selected }).exec();
        // console.log(game);
        if (!game) {
            res.status(404).send('Không tìm thấy trò chơi.');
        } else {
            const { name, type, filename } = game;
            // Đường dẫn đến tệp zip
            const zipPath = `public/upload_game/${filename}`;

            // Đường dẫn đến thư mục mà bạn muốn giải nén tệp zip vào
            const extractToPath = `public/upload_game/${name}`;

            // Giải nén tệp zip
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extractToPath, true);

            // Chuyển hướng sang đường dẫn thích hợp để kiểm tra trò chơi
            // const url = `/upload_game/${name}/web-mobile`;
            const url = `/upload_game/${name}/`;
            res.redirect(url);
            // res.redirect(`/${type}/${name}`);
        }
    } catch (error) {
        // const game = await File.findOne({ _id: selected }).exec();
        // const { name, type, filename } = game;
        // const destinationFolder = 'public/upload_game/';
        // const destinationPath = path.join(destinationFolder, filename);
        // upload_GoogleApi.downloadFile(filename, destinationPath, name);
        checkAndDownloadFiles();
        console.error(error);
        res.status(500).send('Đã xảy ra lỗi khi xử lý yêu cầu (Tệp bị lỗi). Vui lòng tải lại trang web');
    }
});

// Xử lý yêu cầu DELETE để xóa trò chơi
app.delete('/games', async (req, res) => {
    const { id, token } = req.query;

    // Kiểm tra xem token có trùng khớp với fixedTokenAdmin hay không
    if (token !== fixedTokenAdmin) {
        return res.status(401).send('Không có quyền xóa trò chơi.');
    }

    try {
        // Xóa trò chơi từ cơ sở dữ liệu dựa trên id
        const deletedGame = await File.findOneAndDelete({ _id: id }).exec();
        const { name, type, filename } = deletedGame;
        // upload_GoogleApi.deleteFile(filename);
        // backup_Data_Game.deleteFile(filename);
        const folderPath = 'public/upload_game/'; // Thay đổi đường dẫn này thành thư mục chứa tệp tin bạn muốn xóa
        const fileNameToDeleteFileZip = `${filename}`; //  tệp tin nén (zip) bạn muốn xóa
        const fileNameToDeleteFileName = `${name}`; // thư mục bạn muốn xóa

        const filePathToDeleteFileZip = path.join(folderPath, fileNameToDeleteFileZip); // Đường dẫn đầy đủ đến tệp tin nén (zip) cần xóa
        const filePathToDeleteFileName = path.join(folderPath, fileNameToDeleteFileName); // Đường dẫn đầy đủ đến thư mục cần xóa

        // Kiểm tra xem tệp tin nén (zip) tồn tại hay không
        if (fs.existsSync(filePathToDeleteFileZip)) {
            fs.unlinkSync(filePathToDeleteFileZip);
            console.log(`Đã xóa tệp tin nén (zip): ${fileNameToDeleteFileZip}`);
        } else {
            console.log(`Tệp tin nén (zip): ${fileNameToDeleteFileZip} không tồn tại trong thư mục upload_game.`);
        }


        // Kiểm tra xem thư mục tồn tại hay không
        if (fs.existsSync(filePathToDeleteFileName)) {
            if (fs.lstatSync(filePathToDeleteFileName).isDirectory()) {
                // Kiểm tra xem đối tượng cần xóa là một thư mục
                fs.rmSync(filePathToDeleteFileName, { recursive: true });
                console.log(`Đã xóa thư mục: ${fileNameToDeleteFileName}`);
            } else {
                // Nếu đối tượng không phải là thư mục
                fs.unlinkSync(filePathToDeleteFileName);
                console.log(`Đã xóa tệp tin:  ${fileNameToDeleteFileName}`);
            }
        } else {
            console.log(`Thư mục: ${fileNameToDeleteFileName} không tồn tại trong thư mục upload_game.`);
        }

        if (deletedGame) {
            res.json({ message: 'Xóa tệp trò chơi thành công', deletedGame });
        } else {
            res.status(404).send('Không tìm thấy trò chơi để xóa.');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Đã xảy ra lỗi khi xóa trò chơi.');
    }
});

// gọi checkAndDownloadFiles trong Mongo connected successfully

async function checkAndDownloadFiles() {
    console.log('đang tải');
    const uploadDir = 'public/upload_game/';

    try {
        // Fetch data from File.findOne (assuming you want to download files based on some criteria)
        const filesToDownload = await File.find({ filename: { $exists: true, $ne: null } }).exec();

        // Download each file from Google API
        for (const file of filesToDownload) {
            const { name, filename } = file;
            const destinationPath = path.join(uploadDir, filename);
            const destinationPathName = path.join(uploadDir, name);

            try {
                // await upload_GoogleApi.downloadFile(filename, destinationPath, name);
                // await backup_Data_Game.downloadFile(filename, destinationPath);
                console.log(`Tệp ${filename} đã được tải xuống thành công.`);

                // Convert the relative path to an absolute path
                const absoluteDestinationPathName = path.resolve(destinationPathName);

                // Giải nén tệp sau khi tải xuống
                await extract(destinationPath, { dir: absoluteDestinationPathName });
                console.log(`Tệp ${filename} đã được giải nén thành công.`);
            } catch (downloadError) {
                // console.error(`Lỗi tải tập tin xuống ${filename}:`, downloadError);
            }
        }
        console.log('Tất cả các tập tin được tải xuống và giải nén thành công.');
    } catch (error) {
        console.error('Lỗi lấy dữ liệu từ File.findOne:', error);
    }
}

// Call checkAndDownloadFiles every hour (adjust the interval as needed)
// setInterval(checkAndDownloadFiles, 1000 * 60 * 60); // 1 hour

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
