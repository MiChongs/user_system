const {jwt, redisClient, getToken, userPath} = require("../global");
const {Token} = require("../models/token");
const dayjs = require("../function/dayjs");
const RedisService = require("../function/redisService");
const {TimeoutError} = require("sequelize");

redisClient.connect().catch(err => {
    console.error("redisClient connect error", err);
});

const verifyTokenUser = async function (token) {
    try {
        const decoded = await jwt.verify(token, process.env.APP_TOKEN_KEY);
        console.log("验证通过", decoded);
        return true;
    } catch (err) {
        console.log("验证失败", err);
        return false;
    }
};

// JWT 验证中间件
const userJwt = async function (req, res, next) {
    if (userPath.includes(req.path)) {
        console.log("userJwt", req.path);
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.json({
            code: 401, message: "请求头必填"
        });
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    try {
        const flag = await verifyTokenUser(token);
        if (!flag) {
            console.log('验证Token', token);
            return res.json({
                code: 401, message: "该 Token 验证失败"
            });
        }

        const tokenExists = await redisClient.exists(token);
        const tokenValue = await Token.findOne({where: {token: token}});


        if (!tokenExists || !tokenValue) {
            return res.json({
                code: 401, message: "未找到该Token，可能是已过期"
            });
        }

        if (dayjs().isAfter(dayjs(tokenValue.expireTime))) {
            return res.json({
                code: 401, message: "Token 已过期"
            });
        }

        if (dayjs(tokenValue.expireTime).diff(dayjs(), 'day') < 7) {
            const redisToken = await RedisService.expire(token, 30, RedisService.TimeUnit.DAYS);
            tokenValue.update({expireTime: dayjs().add(30, 'days').toDate()});
        }

        return next();
    } catch (e) {
        console.log("e", e);
        return res.json({
            code: 401, message: "连接出错"
        });
    }
};

// 处理 Redis 客户端的生命周期
process.on('SIGINT', async () => {
    await redisClient.quit();
    process.exit(0);
});

module.exports = userJwt;