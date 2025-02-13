const { jwt, adminPath, redisClient, userPath, rolePath } = require("../global");
const dayjs = require('dayjs');

/**
 * 验证并解析Token
 * @param {string} token - JWT token
 * @param {string} type - token类型 (admin|user|role)
 * @returns {Promise<Object>} 解析后的token数据
 */
const verifyToken = async (token, type = 'user') => {
    let newToken = token;
    if (newToken.indexOf('Bearer') >= 0) {
        newToken = newToken.replace('Bearer ', '');
    }

    try {
        // 根据类型选择不同的密钥
        const secret = process.env.ADMIN_TOKEN_KEY

        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(newToken, secret, (err, decoded) => {
                if (err) reject(err);
                else resolve(decoded);
            });
        });

        return { valid: true, decoded };
    } catch (err) {
        console.error('Token 验证失败:', err);
        return                 { valid: false, error: err.message };
    }
};

/**
 * 检查Redis中的Token状态
 * @param {string} token - 原始token
 * @param {string} type - token类型
 * @returns {Promise<Object>} token状态和数据
 */
const checkRedisToken = async (token, type) => {
    try {
        const tokenKey = `${type}_token:${token}`;
        const tokenData = await redisClient.get(tokenKey);

        if (!tokenData) {
            return { valid: false, message: 'Token 已过期或无效' };
        }

        const data = JSON.parse(tokenData);
        return { valid: true, data };
    } catch (error) {
        console.error('Redis token检查失败:', error);
        return { valid: false, error: error.message };
    }
};

/**
 * 更新Token状态
 * @param {string} token - 原始token
 * @param {Object} tokenData - token数据
 * @param {string} type - token类型
 */
const updateTokenStatus = async (token, tokenData, type) => {
    try {
        const tokenKey = `${type}_token:${token}`;
        const updatedData = {
            ...tokenData,
            lastActive: Date.now(),
            lastChecked: dayjs().format('YYYY-MM-DD HH:mm:ss')
        };

        await redisClient.set(tokenKey, JSON.stringify(updatedData), 'EX', 86400);
    } catch (error) {
        console.error('更新Token状态失败:', error);
    }
};

/**
 * JWT中间件
 */
const indexJwt = async function (req, res, next) {
    // 检查是否是白名单路径
    if ([...adminPath, ...userPath, ...rolePath].some(path => {
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
        // 确定token类型
        const tokenType = 'admin'

        // 验证JWT
        const { valid, decoded, error } = await verifyToken(token, tokenType);
        if (!valid) {
            return res.status(401).json({
                code: 401,
                message: "Token验证失败",
                error: process.env.NODE_ENV === 'development' ? error : undefined
            });
        }

        // 检查Redis中的token状态
        const redisCheck = await checkRedisToken(token, tokenType);
        if (!redisCheck.valid) {
            return res.status(401).json({
                code: 401,
                message: redisCheck.message || "Token 状态无效",
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
            console.warn('安全警告:', {
                userId: tokenData.id,
                account: tokenData.account,
                ipChanged: securityChecks.ipChanged,
                deviceChanged: securityChecks.deviceChanged,
                oldIp: tokenData.ip,
                newIp: req.clientIp,
                oldDevice: tokenData.userAgent,
                newDevice: req.headers['user-agent']
            });
        }

        // 更新token状态
        await updateTokenStatus(token, {
            ...tokenData,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, tokenType);

        // 将用户信息附加到请求对象
        req.user = {
            id: decoded.id,
            account: decoded.account,
            type: tokenType,
            permissions: tokenData.permissions || []
        };

        next();
    } catch (error) {
        console.error('Token处理错误:', error);
        return res.status(500).json({
            code: 500,
            message: "Token验证过程出错",
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

// 优雅退出处理
process.on('SIGINT', async () => {
    try {
        await redisClient.quit();
        console.log('Redis连接已关闭');
    } catch (error) {
        console.error('Redis关闭错误:', error);
    }
    process.exit(0);
});

module.exports = indexJwt;