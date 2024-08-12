const winston = require('winston');
const expressWinston = require('express-winston');

// 创建带有颜色的 winston 日志格式
const colorizeFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, meta }) => {
        return `${timestamp} ${level}: ${message} ${meta ? JSON.stringify(meta) : ''}`;
    })
);

// 创建 winston 日志记录器
const logger = winston.createLogger({
    level: 'info',
    format: colorizeFormat,
    transports: [
        new winston.transports.Console(),
    ],
});

// 创建 express-winston 中间件
const expressLogger = expressWinston.logger({
    winstonInstance: logger,
    meta: true, // 是否记录 meta 数据
    msg: "HTTP {{req.method}} {{req.url}} - IP: {{req.ip}} - UserAgent: {{req.headers['user-agent']}} - Status: {{res.statusCode}} - ResponseTime: {{res.responseTime}}ms", // 自定义日志消息
    expressFormat: true, // 使用 express-winston 默认的日志格式
    colorize: false, // 颜色化日志输出
});

module.exports = expressLogger;