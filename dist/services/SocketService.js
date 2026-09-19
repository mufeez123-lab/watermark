"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketService = exports.SocketService = void 0;
const socket_io_1 = require("socket.io");
const console_1 = __importDefault(require("console"));
class SocketService {
    static instance;
    io = null;
    constructor() { }
    static getInstance() {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }
    init(httpServer) {
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
        });
        this.io.on('connection', (socket) => {
            console_1.default.log(`Client connected to WebSocket: ${socket.id}`);
            socket.on('join_job', (jobId) => {
                console_1.default.log(`Socket ${socket.id} joined room for job ${jobId}`);
                socket.join(`job_${jobId}`);
            });
            socket.on('leave_job', (jobId) => {
                socket.leave(`job_${jobId}`);
            });
            socket.on('disconnect', () => {
                console_1.default.log(`Client disconnected from WebSocket: ${socket.id}`);
            });
        });
    }
    emitJobProgress(jobId, payload) {
        if (this.io) {
            this.io.to(`job_${jobId}`).emit('job_progress', {
                jobId,
                ...payload,
            });
        }
    }
}
exports.SocketService = SocketService;
exports.socketService = SocketService.getInstance();
