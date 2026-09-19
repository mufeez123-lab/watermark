"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = exports.S3StorageService = exports.LocalStorageService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const client_s3_1 = require("@aws-sdk/client-s3");
class LocalStorageService {
    constructor() {
        [env_1.config.uploadsDir, env_1.config.processedDir, env_1.config.thumbnailsDir].forEach((dir) => {
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
        });
    }
    async saveFile(localTempPath, targetCategory, filename) {
        const targetDir = targetCategory === 'uploads'
            ? env_1.config.uploadsDir
            : targetCategory === 'processed'
                ? env_1.config.processedDir
                : env_1.config.thumbnailsDir;
        const destPath = path_1.default.join(targetDir, filename);
        if (localTempPath !== destPath) {
            await fs_1.default.promises.copyFile(localTempPath, destPath);
        }
        return destPath;
    }
    getFileStream(filePath) {
        if (!fs_1.default.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        return fs_1.default.createReadStream(filePath);
    }
    async deleteFile(filePath) {
        if (fs_1.default.existsSync(filePath)) {
            await fs_1.default.promises.unlink(filePath);
        }
    }
    getPublicUrl(filePath) {
        const filename = path_1.default.basename(filePath);
        if (filePath.includes(env_1.config.processedDir)) {
            return `/api/videos/media/processed/${filename}`;
        }
        else if (filePath.includes(env_1.config.thumbnailsDir)) {
            return `/api/videos/media/thumbnails/${filename}`;
        }
        return `/api/videos/media/uploads/${filename}`;
    }
}
exports.LocalStorageService = LocalStorageService;
class S3StorageService {
    s3Client;
    bucket;
    constructor() {
        this.bucket = env_1.config.s3Bucket;
        this.s3Client = new client_s3_1.S3Client({
            endpoint: env_1.config.s3Endpoint || undefined,
            credentials: {
                accessKeyId: env_1.config.s3AccessKey,
                secretAccessKey: env_1.config.s3SecretKey,
            },
            region: 'us-east-1',
            forcePathStyle: true,
        });
    }
    async saveFile(localTempPath, targetCategory, filename) {
        const key = `${targetCategory}/${filename}`;
        const fileStream = fs_1.default.createReadStream(localTempPath);
        await this.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: fileStream,
        }));
        return key;
    }
    getFileStream(_filePath) {
        throw new Error('Streaming directly from S3 via getFileStream not supported in simple mode; use S3 URL or presigned GET.');
    }
    async deleteFile(filePath) {
        await this.s3Client.send(new client_s3_1.DeleteObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        }));
    }
    getPublicUrl(filePath) {
        return `${env_1.config.s3Endpoint}/${this.bucket}/${filePath}`;
    }
}
exports.S3StorageService = S3StorageService;
exports.storageService = env_1.config.storageProvider === 's3' ? new S3StorageService() : new LocalStorageService();
