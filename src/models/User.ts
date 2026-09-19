import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

userSchema.set('toJSON', {
  transform: function (_doc, ret) {
    delete (ret as any).password;
    delete (ret as any).__v;
    return ret;
  },
});

export const User = model<IUser>('User', userSchema);
