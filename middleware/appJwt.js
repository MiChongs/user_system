const {jwt, adminPath, redisClient} = require("../global");
const dayjs = require('dayjs');
const {AdminLog} = require("../models/adminLog");

/**
 * 验证并解析应用Token
 * @param {string} token - JWT token
 * @returns {Promise<Object>} 解析后的token数据
 */
const verifyAppToken = async (token) => {
    let newToken = token;
    if (newToken.indexOf('Bearer') >= 0) {
        newToken = newToken.replace('Bearer ', '');
    }

    try {
        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(newToken, process.env.ADMIN_TOKEN_KEY, (err, decoded) => {
                if (err) reject(err);
                else resolve(decoded);
            });
        });

        return {valid: true, decoded};
    } catch (err) {
        console.error('应用Token验证失败:', err);
        return {valid: false, error: err.message};
    }
};

/**
 * 检查Redis中的应用Token状态
 * @param {string} token - 原始token
 * @returns {Promise<Object>} token状态和数据
 */
const checkAppTokenInRedis = async (token) => {
    try {
        const tokenKey = `admin_token:${token}`;
        const tokenData = await redisClient.get(tokenKey);

        if (!tokenData) {
            return {valid: false, message: 'Token已过期或无效'};
        }

        const data = JSON.parse(tokenData);
        

        // 检查是否有应用管理权限
        if (!data.permissions?.includes('admin')) {
            return {valid: false, message: '没有应用管理权限'};
        }

        return {valid: true, data};
    } catch (error) {
        console.error('Redis应用token检查失败:', error);
        return {valid: false, error: error.message};
    }
};

/**
 * 更新应用Token状态
 * @param {string} token - 原始token
 * @param {Object} tokenData - token数据
 */
const updateAppTokenStatus = async (req, token, tokenData) => {
    try {
        const tokenKey = `admin_token:${token}`;
        const updatedData = {
            ...tokenData,
            lastActive: Date.now(),
            lastChecked: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            lastPath: req.path
        };

        await redisClient.set(tokenKey, JSON.stringify(updatedData), 'EX', 86400);
    } catch (error) {
        console.error('更新应用Token状态失败:', error);
    }
};

/**
 * 应用JWT中间件
 */
const appJwt = async function (req, res, next) {
    // 检查是否是白名单路径
    if (adminPath.some(path => {
        return path instanceof RegExp ? path.test(req.path) : path === req.path;
    })) {
        return next();
    }

    // 检查Authorization头
    if (!req.headers.authorization) {
        return res.status(401).json({
            code: 401,
            message: "未提供认证信息"
        });
    }

    const token = req.headers.authorization.replace('Bearer ', '');

    try {
        // 验证JWT
        const {valid, decoded, error} = await verifyAppToken(token);
        if (!valid) {
            return res.status(401).json({
                code: 401,
                message: "Token验证失败",
                error: process.env.NODE_ENV === 'development' ? error : undefined
            });
        }

        // 检查Redis中的token状态
        const redisCheck = await checkAppTokenInRedis(token);
        if (!redisCheck.valid) {
            return res.status(401).json({
                code: 401,
                message: redisCheck.message || "Token状态无效",
                error: process.env.NODE_ENV === 'development' ? redisCheck.error : undefined
            });
        }

        // 安全检查
        const tokenData = redisCheck.data;
        const securityChecks = {
            ipChanged: tokenData.ip && tokenData.ip !== req.clientIp,
            deviceChanged: tokenData.userAgent && tokenData.userAgent !== req.headers['user-agent'],
            expired: tokenData.expiresAt && dayjs().isAfter(dayjs(tokenData.expiresAt))
        };

        if (securityChecks.expired) {
            return res.status(401).json({
                code: 401,
                message: "Token已过期"
            });
        }

        // 记录安全警告
        if (securityChecks.ipChanged || securityChecks.deviceChanged) {
            console.warn('应用Token安全警告:', {
                adminId: tokenData.id,
                account: tokenData.account,
                ipChanged: securityChecks.ipChanged,
                deviceChanged: securityChecks.deviceChanged,
                oldIp: tokenData.ip,
                newIp: req.clientIp,
                oldDevice: tokenData.userAgent,
                newDevice: req.headers['user-agent'],
                path: req.path
            });

            // 可以在这里添加安全日志记录
            await AdminLog.create({
                log_type: 'security_warning',
                log_content: `管理员 ${tokenData.account} 的应用Token出现安全警告`,
                log_ip: req.clientIp,
                log_user_id: tokenData.id,
                log_location: tokenData.location,
                log_device: req.headers['user-agent'],
                log_markcode: tokenData.markcode
            });
        }

        // 更新token状态
        await updateAppTokenStatus(req, token, {
            ...tokenData,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        });

        // 将管理员信息附加到请求对象
        req.admin = {
            id: decoded.id,
            account: decoded.account,
            permissions: tokenData.permissions || [],
            lastActive: tokenData.lastActive
        };

        next();
    } catch (error) {
        console.error('应用Token处理错误:', error);
        return res.status(500).json({
            code: 500,
            message: "Token验证过程出错",
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

module.exports = appJwt;