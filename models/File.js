const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: String,
  originalname: String,
  type: String,
  name: String,
  createdAt: { type: Date, default: Date.now },
});

const File = mongoose.model('File', fileSchema);

module.exports = File;
