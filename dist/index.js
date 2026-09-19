"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("./config/env");
const SocketService_1 = require("./services/SocketService");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const videoRoutes_1 = __importDefault(require("./routes/videoRoutes"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Initialize WebSockets
SocketService_1.socketService.init(server);
// Security Middlewares
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: '*',
    credentials: true,
}));
// Rate Limiting
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests from this IP, please try again later.' },
});
app.use('/api', apiLimiter);
// Parsers
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/videos', videoRoutes_1.default);
// Health Check
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mongoConnected: mongoose_1.default.connection.readyState === 1,
    });
});
// Global Error Handler
app.use((err, _req, res, _next) => {
    console.error('Unhandled Server Error:', err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    res.status(status).json({ error: message });
});
// Connect Database & Start Server
const startServer = async () => {
    let targetUri = env_1.config.mongoUri;
    try {
        console.log(`Connecting to MongoDB at ${targetUri}...`);
        await mongoose_1.default.connect(targetUri, { serverSelectionTimeoutMS: 3000 });
        console.log('MongoDB connected successfully.');
    }
    catch (primaryError) {
        console.warn(`Primary MongoDB connection failed (${targetUri}).`);
        console.log('Spinning up embedded MongoMemoryServer fallback for local development...');
        try {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            const mongod = await MongoMemoryServer.create();
            targetUri = mongod.getUri();
            console.log(`Connecting to in-memory MongoDB at ${targetUri}...`);
            await mongoose_1.default.connect(targetUri);
            console.log('In-memory MongoDB connected successfully!');
        }
        catch (fallbackError) {
            console.error('Failed to start in-memory MongoDB fallback:', fallbackError);
            process.exit(1);
        }
    }
    server.listen(env_1.config.port, () => {
        console.log(`Backend server running on http://localhost:${env_1.config.port}`);
    });
};
startServer();
