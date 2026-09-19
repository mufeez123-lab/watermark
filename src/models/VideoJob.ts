import { Schema, model, Document, Types } from 'mongoose';

export interface IMaskRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IProcessingOptions {
  blurStrength?: number;
  featherAmount?: number;
  inpaintingMethod?: string;
  inpaintRadius?: number;
  cropRegion?: IMaskRegion;
}

export type JobStatus = 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed';
export type ProcessingType = 'ai_remove' | 'blur' | 'crop';

export interface IVideoJob extends Document {
  userId: Types.ObjectId;
  originalFilename: string;
  originalPath: string;
  processedPath?: string;
  thumbnailPath?: string;
  status: JobStatus;
  processingType: ProcessingType;
  masks: IMaskRegion[];
  options?: IProcessingOptions;
  progress: number;
  duration?: number;
  fileSize: number;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

const maskRegionSchema = new Schema<IMaskRegion>({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
});

const videoJobSchema = new Schema<IVideoJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalFilename: { type: String, required: true },
    originalPath: { type: String, required: true },
    processedPath: { type: String },
    thumbnailPath: { type: String },
    status: {
      type: String,
      enum: ['uploaded', 'queued', 'processing', 'completed', 'failed'],
      default: 'uploaded',
      index: true,
    },
    processingType: {
      type: String,
      enum: ['ai_remove', 'blur', 'crop'],
      default: 'ai_remove',
    },
    masks: { type: [maskRegionSchema], default: [] },
    options: { type: Schema.Types.Mixed },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    duration: { type: Number },
    fileSize: { type: Number, required: true },
    errorMessage: { type: String },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

export const VideoJob = model<IVideoJob>('VideoJob', videoJobSchema);
