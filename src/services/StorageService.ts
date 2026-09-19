import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface IStorageService {
  saveFile(localTempPath: string, targetCategory: 'uploads' | 'processed' | 'thumbnails', filename: string): Promise<string>;
  getFileStream(filePath: string): fs.ReadStream;
  deleteFile(filePath: string): Promise<void>;
  getPublicUrl(filePath: string): string;
}

export class LocalStorageService implements IStorageService {
  constructor() {
    [config.uploadsDir, config.processedDir, config.thumbnailsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async saveFile(localTempPath: string, targetCategory: 'uploads' | 'processed' | 'thumbnails', filename: string): Promise<string> {
    const targetDir =
      targetCategory === 'uploads'
        ? config.uploadsDir
        : targetCategory === 'processed'
        ? config.processedDir
        : config.thumbnailsDir;

    const destPath = path.join(targetDir, filename);

    if (localTempPath !== destPath) {
      await fs.promises.copyFile(localTempPath, destPath);
    }
    return destPath;
  }

  getFileStream(filePath: string): fs.ReadStream {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return fs.createReadStream(filePath);
  }

  async deleteFile(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  getPublicUrl(filePath: string): string {
    const filename = path.basename(filePath);
    if (filePath.includes(config.processedDir)) {
      return `/api/videos/media/processed/${filename}`;
    } else if (filePath.includes(config.thumbnailsDir)) {
      return `/api/videos/media/thumbnails/${filename}`;
    }
    return `/api/videos/media/uploads/${filename}`;
  }
}

export class S3StorageService implements IStorageService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = config.s3Bucket;
    this.s3Client = new S3Client({
      endpoint: config.s3Endpoint || undefined,
      credentials: {
        accessKeyId: config.s3AccessKey,
        secretAccessKey: config.s3SecretKey,
      },
      region: 'us-east-1',
      forcePathStyle: true,
    });
  }

  async saveFile(localTempPath: string, targetCategory: 'uploads' | 'processed' | 'thumbnails', filename: string): Promise<string> {
    const key = `${targetCategory}/${filename}`;
    const fileStream = fs.createReadStream(localTempPath);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
      })
    );
    return key;
  }

  getFileStream(_filePath: string): fs.ReadStream {
    throw new Error('Streaming directly from S3 via getFileStream not supported in simple mode; use S3 URL or presigned GET.');
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: filePath,
      })
    );
  }

  getPublicUrl(filePath: string): string {
    return `${config.s3Endpoint}/${this.bucket}/${filePath}`;
  }
}

export const storageService: IStorageService =
  config.storageProvider === 's3' ? new S3StorageService() : new LocalStorageService();
