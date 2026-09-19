import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/watermark_removal',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_watermark_removal_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  storageProvider: process.env.STORAGE_PROVIDER || 'local', // 'local' or 's3'
  s3Endpoint: process.env.S3_ENDPOINT || '',
  s3Bucket: process.env.S3_BUCKET || '',
  s3AccessKey: process.env.S3_ACCESS_KEY || '',
  s3SecretKey: process.env.S3_SECRET_KEY || '',
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000',
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10),
  maxVideoDurationSeconds: parseInt(process.env.MAX_VIDEO_DURATION_SECONDS || '600', 10),
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || './uploads'),
  processedDir: path.resolve(process.env.PROCESSED_DIR || './processed'),
  thumbnailsDir: path.resolve(process.env.THUMBNAILS_DIR || './thumbnails'),
};
