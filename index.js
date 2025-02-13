process.env.TZ = 'Asia/Shanghai'
const dayjs = require('./function/dayjs')
const express = require("express");
const routes = require("./routes/index");
const app = express();
const sequelize = require('sequelize')
const { Sequelize, DataTypes, Op, QueryTypes } = require("sequelize");
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const helmet = require('helmet')
const fileUpload = require('express-fileupload');
const boom = require('express-boom')
const path = require('path');
const ejs = require('ejs');
const { promisify } = require('util');
const schedule = require('node-schedule');
const SystemLogService = require('./function/systemLogService');
const { initLotteryTasks } = require('./controllers/appControllers');
const { Worker } = require('worker_threads');
const os = require('os');
const autoSignService = require('./function/autoSignService');

// 配置 helmet
app.use(helmet({
    crossOriginResourcePolicy: false
}))

const requestIp = require('request-ip');
app.use(requestIp.mw())
app.use(boom())

const { resolve } = require("node:path");
const { expressjwt } = require("express-jwt");
const expressLogger = require("./middleware/logger");
const { AdminRegistrationCode } = require("./models/adminRegistrationCode");
const { Admin } = require("./models/admin");
const { User } = require("./models/user");
const { Log } = require("./models/log");
const { urlencoded, json } = require("body-parser");
const { mysql, initializeDatabase } = require("./database");
const session = require("express-session");
const { Token } = require("./models/token");
const { Daily } = require("./models/daily");
const { CustomIdLog } = require("./models/customIdLog");
const { App } = require("./models/app");
const http = require("http");
const socketIO = require("socket.io");
const jwt = require('jsonwebtoken');
const { Counter } = require("./models/counter");
const { VersionChannel } = require("./models/versionChannel");
const { versionChannelUser } = require("./models/versionChannelUser");
const { Version } = require("./models/version");
const { AdminLog } = require("./models/adminLog");
const { AdminToken } = require("./models/adminToken");
const { Banner } = require("./models/banner");
const { Card } = require("./models/card");
const { Goods } = require("./models/goods");
const { LoginLog } = require("./models/loginLog");
const { Notification } = require("./models/notification");
const { Site } = require("./models/sites");
const { RegisterLog } = require("./models/registerLog");
const { SiteAudit } = require('./models/user/siteAudits');
const { SiteAward } = require("./models/user/siteAward");
const { RoleToken } = require("./models/user/roleToken");
const sm4 = require('sm-crypto').sm4;
const axios = require('axios');
const { fs, redisClient } = require('./global');
const { UserLog } = require("./models/userLog");
const RedisService = require('./function/redisService');
const taskService = require('./function/taskService');
const {DeviceModel, DeviceBrand} = require("./models/deviceModel");
const {Whitelist} = require("./models/whitelist");
const autoCheckTokenService = require("./function/autoCheckToken");

// Disable caching for avatars directory
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars'), {
    maxAge: 0, // Disable caching
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store'); // Set custom cache control header
    }
}));

// Optimize static file serving
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 0, // Disable caching
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store'); // Set custom cache control header
    }
}));

// Optimize body parser limits
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));

app.use(cors());
app.use(expressLogger)
app.set('trust proxy', '1');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(fileUpload());
app.use(session({
    secret: process.env.ADMIN_TOKEN_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // 设置为 true 以支持 HTTPS
}));

// 配置 CSP
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://openfpcdn.io; " +
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
        "font-src 'self' https://cdn.jsdelivr.net; " +
        "connect-src 'self' https://restapi.amap.com https://openfpcdn.io https://api.ipify.org;"
    );
    next();
});

// Create an object to store our exports
const exportObject = {};

// Initialize server
const server = http.createServer(app);
exportObject.server = server;

// Add routes and error handling
app.use("/", routes); // 使用路由

// 添加API路由处理

// 中间件函数，用于检查请求是否来自本机
function allowLocalhostOnly(req, res, next) {
    const clientIp = req.ip || req.connection.remoteAddress;
    if (clientIp === '127.0.0.1' || clientIp === '::1') {
        next(); // 允许访问
    } else {
        res.status(403).send('Forbidden');
    }
}

// 日志文件路径
const logFilePath = path.join(__dirname, 'visitorLogs.txt');

// 记录访客信息的API
app.post('/logVisitorInfo', (req, res) => {
    const logData = req.body;
    const logEntry = `Visitor ID: ${logData.visitorId}, IP: ${logData.ipAddress}, OS: ${logData.os}, Browser: ${logData.browser}\n`;

    // 将日志信息追加到文件中
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
            return res.status(500).json({ message: 'Failed to write log' });
        }
        res.status(200).json({ message: 'Log written successfully' });
    });
});

// 提供加密后的 API 密钥，仅允许本机请求
app.get('/api/key', allowLocalhostOnly, (req, res) => {
    const apiKey = '721350d737fcd3a80f40738e87c4e36e'; // 原始 API 密钥
    const secretKey = 'your_secret_key_16_bytes'; // SM4 密钥，16 字节
    const encryptedKey = sm4.encrypt(apiKey, secretKey); // 使用 SM4 加密
    res.json({ key: encryptedKey });
});

// 提供天气信息的 API
app.get('/weather', async (req, res) => {
    const { cityCode } = req.query;
    const apiKey = '721350d737fcd3a80f40738e87c4e36e'; // 原始 API 密钥
    try {
        const response = await axios.get(`https://restapi.amap.com/v3/weather/weatherInfo`, {
            params: {
                key: apiKey,
                city: cityCode,
                extensions: 'base',
                output: 'JSON'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching weather:', error);
        res.status(500).json({ error: '无法获取天气信息' });
    }
});

// 提供逆地理编码的 API
app.get('/geocode', async (req, res) => {
    const { longitude, latitude } = req.query;
    const apiKey = '721350d737fcd3a80f40738e87c4e36e'; // 原始 API 密钥
    try {
        const response = await axios.get(`https://restapi.amap.com/v3/geocode/regeo`, {
            params: {
                key: apiKey,
                location: `${longitude},${latitude}`,
                extensions: 'base'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching geocode:', error);
        res.status(500).json({ error: '无法获取地理编码信息' });
    }
});

// 404 页面处理
app.use((req, res) => {
    res.status(404).render('404');
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { error: err });
});

const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    connectionStateRecovery: {},
    extraHeaders: {
        'X-Socket-Auth': true
    }
});
exportObject.io = io;

// Socket.IO connection middleware
io.use(async (socket, next) => {
    const token = socket.handshake.headers['authorization'];
    const appid = socket.handshake.headers['x-appid'];

    if (!token || !appid) {
        return next(new Error('Authentication error: Missing token or appid'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findOne({
            where: {
                id: decoded.id,
                appid: appid
            }
        });

        if (!user) {
            return next(new Error('Authentication error: Invalid user or app'));
        }

        socket.user = {
            id: user.id,
            appid: user.appid
        };

        next();
    } catch (error) {
        return next(new Error('Authentication error: ' + error.message));
    }
});

// Socket.IO event buffering
const socketEvents = new Map();
const BUFFER_TIME = 1000; // 1 second

function bufferSocketEvent(eventName, data) {
    if (!socketEvents.has(eventName)) {
        socketEvents.set(eventName, []);
        setTimeout(() => {
            const bufferedData = socketEvents.get(eventName);
            io.emit(eventName, bufferedData);
            socketEvents.delete(eventName);
        }, BUFFER_TIME);
    }
    socketEvents.get(eventName).push(data);
}

// 在线用户状态管理
const onlineUsers = new Map();
global.onlineUsers = onlineUsers;

io.on('connection', (socket) => {
    const { appid, userId, token } = socket.handshake.query;

    // 验证token
    if (!token) {
        socket.disconnect();
        return;
    }

    // 加入应用房间
    socket.join(`app:${appid}`);

    // 如果是登录用户，加入用户专属房间
    if (userId) {
        socket.join(`user:${appid}:${userId}`);
    }

    // 处理断开连接
    socket.on('disconnect', () => {
        socket.leave(`app:${appid}`);
        if (userId) {
            socket.leave(`user:${appid}:${userId}`);
        }
    });
});

// Optimize Socket.IO heartbeat
io.engine.pingTimeout = 30000; // 30 seconds
io.engine.pingInterval = 5000; // 5 seconds

// Add graceful shutdown
process.on('SIGTERM', () => {
    console.info('SIGTERM signal received.');
    console.log('Closing http server.');
    server.close(() => {
        console.log('Http server closed.');
        // Close database connection
        mysql.close().then(() => {
            console.log('Database connection closed.');
            process.exit(0);
        });
    });
});

// Initialize database and start server
async function initDatabase() {
    process.env.NODE_TLS_MIN_PROTOCOL_VERSION = "TLSv1.2";
    try {
        // Optimize database connection pooling
        const dbConfig = {
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000
            }
        };

        await mysql.authenticate(dbConfig);
        console.log("数据库测试成功");

        await mysql.sync({ force: false });
        console.log("数据库同步成功");

        // 定义关联关系
        const associations = [
            // Admin associations
            AdminRegistrationCode.hasMany(Admin, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'bindRegisterCode',
                sourceKey: 'code'
            }),
            Admin.belongsTo(AdminRegistrationCode, {
                foreignKey: 'bindRegisterCode',
                targetKey: 'code',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            }),
            Admin.hasMany(AdminLog, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'log_user_id',
                sourceKey: 'id'
            }),
            Admin.hasMany(App, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'bind_admin_account',
                sourceKey: 'id'
            }),
            Admin.hasMany(AdminToken, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'account',
                sourceKey: 'id'
            }),
            AdminLog.belongsTo(Admin, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'log_user_id',
                sourceKey: 'id'
            }),
            AdminToken.belongsTo(Admin, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'account',
                targetKey: 'id'
            }),

            // App associations
            App.hasMany(User, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id' }),
            User.belongsTo(App, { foreignKey: 'appid', targetKey: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
            App.hasMany(Daily, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid' }),
            App.hasMany(Version, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid' }),
            App.hasMany(VersionChannel, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid' }),
            App.hasMany(CustomIdLog, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid' }),
            App.hasMany(Counter, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid', sourceKey: 'id' }),
            App.belongsTo(Admin, {
                foreignKey: 'bind_admin_account',
                targetKey: 'id',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            }),
            App.hasMany(Banner, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id' }),
            App.hasMany(Token, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id' }),
            App.hasMany(Notification, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id' }),
            App.hasMany(Card, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id' }),

            // Other associations
            Banner.belongsTo(App, { foreignKey: 'appid', targetKey: 'id' }),
            CustomIdLog.belongsTo(User, { foreignKey: 'userId' }),
            CustomIdLog.belongsTo(App, { foreignKey: 'appid' }),
            Goods.belongsTo(App, { foreignKey: 'bindAppid', targetKey: 'id' }),
            Daily.belongsTo(User, { foreignKey: 'userId' }),
            Daily.belongsTo(App, { foreignKey: 'appid' }),
            Log.belongsTo(User, { foreignKey: 'log_user_id' }),
            LoginLog.belongsTo(User, { foreignKey: 'user_id', targetKey: 'id' }),
            Notification.belongsTo(App, { onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
            RegisterLog.belongsTo(User, { foreignKey: 'user_id', targetKey: 'id' }),
            Site.belongsTo(App, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', targetKey: 'id' }),
            Site.belongsTo(User, { foreignKey: 'userId', targetKey: 'id' }),
            Token.belongsTo(App, { foreignKey: 'appid', targetKey: 'id' }),
            Token.belongsTo(User, { foreignKey: 'account', targetKey: 'id' }),
            Token.belongsTo(User, { foreignKey: 'open_qq', targetKey: 'open_qq' }),
            Token.belongsTo(User, { foreignKey: 'open_wechat', targetKey: 'open_wechat' }),
            User.hasMany(Log, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'log_user_id' }),
            User.hasMany(Daily, { onUpdate: 'CASCADE', onDelete: 'CASCADE', foreignKey: 'userId' }),
            User.hasMany(CustomIdLog, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId' }),
            User.hasMany(versionChannelUser, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId' }),
            User.hasOne(Counter, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindUserid', sourceKey: 'id' }),
            User.hasOne(RegisterLog, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'user_id',
                sourceKey: 'id'
            }),
            User.hasMany(LoginLog, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'user_id', sourceKey: 'id' }),
            User.hasMany(Token, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'account',
                sourceKey: 'account'
            }),
            User.hasMany(Token, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'open_qq',
                sourceKey: 'open_qq'
            }),
            User.hasMany(Token, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'open_wechat',
                sourceKey: 'open_wechat'
            }),
            Version.belongsTo(App, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid' }),
            Version.belongsTo(VersionChannel, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindBand' }),
            VersionChannel.hasMany(versionChannelUser, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'channelId'
            }),
            VersionChannel.hasMany(Version, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindBand' }),
            VersionChannel.belongsTo(App, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'bindAppid' }),
            versionChannelUser.belongsTo(User, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId' }),
            versionChannelUser.belongsTo(VersionChannel, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'channelId'
            }),
            Card.belongsTo(App, { foreignKey: 'appid', targetKey: 'id' }),
            Card.belongsTo(User, { foreignKey: 'account', targetKey: 'id' }),
            Counter.belongsTo(App, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'bindAppid',
                sourceKey: 'id'
            }),
            Counter.belongsTo(User, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'bindUserid',
                sourceKey: 'id'
            }),
            App.hasMany(SiteAudit, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appId', sourceKey: 'id' }),
            User.hasMany(SiteAudit, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId', sourceKey: 'id' }),
            SiteAudit.belongsTo(User, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'userId',
                sourceKey: 'id'
            }),
            Site.hasOne(SiteAudit, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'site_id', sourceKey: 'id' }),
            SiteAudit.belongsTo(Site, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'site_id',
                sourceKey: 'id'
            }),
            SiteAudit.belongsTo(App, { foreignKey: 'appId', targetKey: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
            App.hasMany(SiteAward, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id' }),
            User.hasMany(SiteAward, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId', sourceKey: 'id' }),
            SiteAward.belongsTo(User, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'userId',
                targetKey: 'id'
            }),
            Site.hasOne(SiteAward, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'siteId', sourceKey: 'id' }),
            SiteAward.belongsTo(Site, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'siteId',
                targetKey: 'id'
            }),
            App.hasMany(RoleToken, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', sourceKey: 'id' }),
            User.hasOne(RoleToken, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'userId', sourceKey: 'id' }),
            RoleToken.belongsTo(User, {
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
                foreignKey: 'userId',
                targetKey: 'id'
            }),
            RoleToken.belongsTo(App, { onDelete: 'CASCADE', onUpdate: 'CASCADE', foreignKey: 'appid', targetKey: 'id' }),
            Whitelist.belongsTo(App, { foreignKey: 'appid', onDelete: 'CASCADE' }),
            // 添加关联

            // 关联关系
            LoginLog.belongsTo(User, {
                foreignKey: 'user_id',
                as: 'user'
            }),

            LoginLog.belongsTo(App, {
                foreignKey: 'appid',
                as: 'app'
            }),

            App.hasMany(LoginLog, {
                foreignKey: 'appid',
                as: 'loginLogs'
            }),

            User.hasMany(LoginLog, {
                foreignKey: 'user_id',
                as: 'loginLogs'
            }),
            Log.belongsTo(User, {
                foreignKey: 'UserId',
                as: 'user'
            }),
            UserLog.belongsTo(User, { foreignKey: 'userId', targetKey: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
            UserLog.belongsTo(App, { foreignKey: 'appid', targetKey: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
        ];

        // 执行所有关联
        await Promise.all(associations);

        console.log("数据库初始化完成");

        // Start server after database is ready
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`服务已启动 ${PORT} 端口`);
        });

        // Initialize memory monitoring
        const v8 = require('v8');
        const totalHeapSize = v8.getHeapStatistics().total_available_size;
        const totalHeapSizeInGB = (totalHeapSize / 1024 / 1024 / 1024).toFixed(2);
        console.log(`Total heap size (GB) = ${totalHeapSizeInGB}`);

        // Set garbage collection intervals
        if (global.gc) {
            setInterval(() => {
                global.gc();
                const heapUsed = process.memoryUsage().heapUsed / 1024 / 1024;
                console.log(`Memory usage: ${Math.round(heapUsed * 100) / 100} MB`);
            }, 30000); // Run every 30 seconds
        }

        // Add global error handling
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            // Implement error reporting service here
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            // Implement error reporting service here
        });

    } catch (error) {
        console.error("数据库同步失败", error);
        process.exit(1);
    }
}

/**
 * 生成指定范围内的安全随机数
 * @param {number} min - 最小值（包含）
 * @param {number} max - 最大值（包含）
 * @param {boolean} [secure=false] - 是否使用加密随机数
 * @returns {number} 生成的随机数
 * @throws {Error} 当参数无效时抛出错误
 */
function getRandomNum(min, max, secure = false) {
    // 参数验证
    if (typeof min !== 'number' || typeof max !== 'number') {
        throw new TypeError('最小值和最大值必须是数字类型');
    }

    if (min > max) {
        [min, max] = [max, min]; // 交换值确保 min <= max
    }

    const range = max - min + 1;

    if (secure) {
        // 使用加密安全的随机数生成
        const crypto = require('crypto');
        const maxUint32 = 4294967295; // 2^32 - 1
        const limit = maxUint32 - (maxUint32 % range);
        let num;
        do {
            num = parseInt(crypto.randomBytes(4).readUInt32LE(0));
        } while (num >= limit);
        return min + (num % range);
    } else {
        // 使用优化的 Math.random()
        return min + Math.floor(Math.random() * range);
    }
}

// 示例用法:
// const normalRandom = getRandomNum(1, 100);           // 普通随机数
// const secureRandom = getRandomNum(1, 100, true);     // 加密随机数

// 初始化用户冻结任务
function initFreezerUser() {
    const BATCH_SIZE = 100;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5秒

    schedule.scheduleJob({
        minute: [1, 10, 20, 30, 40, 50, 59]
    }, async function freezeUsers() {
        console.log("开始执行用户冻结任务:", dayjs().format("YYYY-MM-DD HH:mm:ss"));
        const startTime = process.hrtime();

        try {
            const startOfDay = dayjs().startOf('day').format("YYYY-MM-DD HH:mm:ss");
            const endOfDay = dayjs().endOf('day').format("YYYY-MM-DD HH:mm:ss");

            let offset = 0;
            let processedCount = 0;
            let retryCount = 0;

            // 使用事务确保数据一致性
            const transaction = await mysql.transaction();

            try {
                while (true) {
                    // 优化SQL查询，添加索引提示
                    const sql = `
                        SELECT d.userId,
                               COUNT(d.userId) AS count,
                            u.disabledEndTime
                        FROM dailies d
                            INNER JOIN user u
                        ON d.userId = u.id
                        WHERE (d.date BETWEEN :startOfDay AND :endOfDay)
                        GROUP BY d.userId, d.appid, u.disabledEndTime
                        HAVING count >= 2
                            LIMIT :limit
                        OFFSET :offset
                    `;

                    const users = await mysql.query(sql, {
                        replacements: {
                            startOfDay,
                            endOfDay,
                            limit: BATCH_SIZE,
                            offset
                        },
                        type: QueryTypes.SELECT,
                        transaction
                    });

                    if (!users || users.length === 0) break;

                    // 批量处理用户
                    const usersToUpdate = users.filter(user =>
                        !dayjs(user.disabledEndTime).isAfter(dayjs())
                    );

                    if (usersToUpdate.length > 0) {
                        const bulkUpdateData = usersToUpdate.map(user => {
                            const randomDays = getRandomNum(30, 365);
                            return {
                                id: user.userId,
                                disabledEndTime: dayjs().add(randomDays, 'days').toDate(),
                                reason: `频繁签到，被冻结${randomDays}天。`,
                                updatedAt: new Date()
                            };
                        });

                        // 批量更新用户状态
                        await User.bulkCreate(bulkUpdateData, {
                            updateOnDuplicate: ['disabledEndTime', 'reason', 'updatedAt'],
                            transaction
                        });

                        processedCount += bulkUpdateData.length;
                    }

                    offset += BATCH_SIZE;
                }

                // 提交事务
                await transaction.commit();

                // 计算执行时间
                const [seconds, nanoseconds] = process.hrtime(startTime);
                const executionTime = seconds + nanoseconds / 1e9;

                console.log(
                    "自动冻结用户完成",
                    "\n执行日期:", dayjs().format("YYYY年MM月DD日 HH时mm分ss秒"),
                    "\n处理用户数:", processedCount,
                    "\n执行时间:", executionTime.toFixed(2), "秒"
                );

            } catch (error) {
                // 回滚事务
                await transaction.rollback();

                // 重试机制
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`任务执行失败，${RETRY_DELAY / 1000}秒后进行第${retryCount}次重试, 错误:`, error);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    return freezeUsers();
                }
                throw error;
            }

        } catch (error) {
            console.error("用户冻结任务执行失败:", error);
            // 可以在这里添加报警通知逻辑
        }
    });
}

// 立即初始化用户冻结任务
initFreezerUser();

// 初始化临时用户检查任务
async function initTempUserCheck() {
    const BATCH_SIZE = 100;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5秒
    const GRACE_PERIOD = 90; // 90天冷静期
    const MAX_WORKERS = os.cpus().length - 1; // 使用CPU核心数-1的worker

    try {
        schedule.scheduleJob('0 0 */4 * * *', async function checkTempUsers() {
            console.log("开始执行临时用户检查任务:", dayjs().format("YYYY-MM-DD HH:mm:ss"));
            const startTime = process.hrtime();

            try {
                // 使用事务确保数据一致性
                const transaction = await mysql.transaction();

                try {
                    // 获取总用户数
                    const totalUsers = await User.count({
                        where: {
                            [Op.or]: [
                                { account: null },
                                { account: '' },
                                { password: null },
                                { password: '' }
                            ],
                            register_time: {
                                [Op.lt]: dayjs().subtract(GRACE_PERIOD, 'days').toDate()
                            },
                            enabled: true
                        },
                        transaction
                    });

                    if (totalUsers === 0) {
                        await transaction.commit();
                        return;
                    }

                    // 计算每个worker处理的用户数
                    const workersCount = Math.min(MAX_WORKERS, Math.ceil(totalUsers / BATCH_SIZE));
                    const usersPerWorker = Math.ceil(totalUsers / workersCount);

                    // 创建并启动workers
                    const workers = [];
                    const results = {
                        processedCount: 0,
                        frozenCount: 0,
                        errors: []
                    };

                    for (let i = 0; i < workersCount; i++) {
                        const worker = new Worker('./workers/tempUserCheckWorker.js');
                        const startOffset = i * usersPerWorker;

                        worker.postMessage({
                            startOffset,
                            batchSize: usersPerWorker,
                            gracePeriod: GRACE_PERIOD
                        });

                        worker.on('message', (data) => {
                            if (data.success) {
                                results.processedCount += data.processedCount;
                                results.frozenCount += data.frozenCount;
                            } else {
                                results.errors.push(data.error);
                            }
                        });

                        workers.push(worker);
                    }

                    // 等待所有workers完成
                    await Promise.all(workers.map(worker =>
                        new Promise((resolve) => worker.on('exit', resolve))
                    ));

                    // 提交事务
                    await transaction.commit();

                    // 计算执行时间
                    const executionTime = process.hrtime(startTime)[0];

                    // 记录任务执行日志
                    await SystemLogService.logTaskExecution('initTempUserCheck',
                        results.errors.length === 0 ? 'success' : 'partial_success',
                        executionTime,
                        {
                            totalUsers,
                            processedCount: results.processedCount,
                            frozenCount: results.frozenCount,
                            errors: results.errors
                        }
                    );

                    console.log(
                        "临时用户检查任务完成",
                        "\n执行日期:", dayjs().format("YYYY年MM月DD日 HH时mm分ss秒"),
                        "\n临时用户总数:", totalUsers,
                        "\n已冻结用户数:", results.frozenCount,
                        "\n处理用户总数:", results.processedCount,
                        "\n错误数:", results.errors.length,
                        "\n执行时间:", executionTime.toFixed(2), "秒"
                    );

                } catch (error) {
                    await transaction.rollback();
                    throw error;
                }

            } catch (error) {
                console.error("临时用户检查任务执行失败:", error);
                await SystemLogService.logTaskExecution('initTempUserCheck', 'failed', 0, {
                    error: error.message
                });
            }
        });
    } catch (error) {
        console.error("临时用户检查任务初始化失败:", error);
    }
}


// 在数据库初始化后调用
async function initApplication() {
    try {
        // 立即初始化临时用户检查任务
        await initTempUserCheck();
        // 初始化数据库
        await initializeDatabase();
        await initDatabase();

        // 初始化抽奖任务
        await initLotteryTasks();

        // 初始化其他任务
        await taskService.loadTasks();

        // 启动永久会员自动签到服务
        autoSignService.start();
        autoCheckTokenService.start();

        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        process.exit(1);
    }
}

// 优雅退出时停止服务
process.on('SIGINT', async () => {
    try {
        // ... 其他清理代码 ...
        
        // 停止自动签到服务
        autoSignService.stop();
        
        process.exit(0);
    } catch (error) {
        console.error('Shutdown error:', error);
        process.exit(1);
    }
});

// 启动应用
initApplication().catch(error => {
    console.error('Application startup failed:', error);
    process.exit(1);
});

// Export the object containing our server and io instance
module.exports = exportObject;
