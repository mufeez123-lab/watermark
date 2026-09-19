"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMiddleware = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, env_1.config.uploadsDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + crypto_1.default.randomBytes(8).toString('hex');
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        cb(null, `video-${uniqueSuffix}${ext}`);
    },
});
const allowedMimeTypes = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    'video/avi',
    'video/mkv',
];
const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const fileFilter = (_req, file, cb) => {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid video format. Supported formats: MP4, MOV, AVI, MKV, WEBM.'));
    }
};
exports.uploadMiddleware = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: env_1.config.maxFileSizeMb * 1024 * 1024,
    },
    fileFilter,
});
