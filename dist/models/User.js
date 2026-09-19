"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
}, {
    timestamps: true,
});
userSchema.set('toJSON', {
    transform: function (_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
    },
});
exports.User = (0, mongoose_1.model)('User', userSchema);
