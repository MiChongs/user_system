const {jwt, redisClient, getToken, userPath} = require("../global");

redisClient.connect().catch(err => {
    console.error("redisClient connect error", err);
});

const verifyTokenUser = async function (token) {
    let newToken = token;
    if (newToken.indexOf('Bearer') >= 0) {
        newToken = newToken.replace('Bearer ', '');
    }
    try {
        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(newToken, process.env.APP_TOKEN_KEY, (err, decoded) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(decoded);
                }
            });
        });

        console.log("verify decoded", decoded);
        return true;
    } catch (err) {
        console.log("verify error", err);
        return false;
    }
};

// JWT 验证中间件
const userJwt = async function (req, res, next) {
    if (userPath.includes(req.path)) {
        console.log("userJwt", req.path);
        return next();
    }

    if (!req.headers.authorization) {
        return res.json({
            code: 401, message: "请求头必填"
        });
    }

    let token = req.headers.authorization;
    if (token.indexOf('Bearer') >= 0) {
        token = token.replace('Bearer ', '');
    }

    try {
        const flag = await verifyTokenUser(token);
        console.log("flag", flag);

        if (!flag) {
            console.log('验证Token', token);
            return res.json({
                code: 401, message: "该 Token 验证失败"
            });
        }

        const tokenExists = await redisClient.exists(token);
        console.log("token", token);

        if (!tokenExists) {
            return res.json({
                code: 401, message: "未找到该Token，可能是已过期"
            });
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