const {jwt, adminPath, redisClient, userPath} = require("../global");
const {App} = require("../models/app");
const {AdminToken} = require("../models/adminToken");
const {Admin} = require("../models/admin");

redisClient.connect().catch(err => {
    console.error("redisClient connect error", err);
});


const verifyTokenIndex = async function (token) {
    let newToken = token;
    if (newToken.indexOf('Bearer') >= 0) {
        newToken = newToken.replace('Bearer ', '');
    }
    try {
        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(newToken, process.env.ADMIN_TOKEN_KEY, (err, decoded) => {
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


const appJwt = async function (req, res, next) {
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
        const flag = await verifyTokenIndex(token);
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

        const adminToken = await AdminToken.findOne({
            where: {
                token: token
            }
        })

        if (!token) {
            return res.json({
                code: 401, message: "未找到该Token，可能是已过期"
            });
        }

        const admin = await Admin.findOne({
            where: {
                account: adminToken.account
            }
        })


        if (!admin) {
            return res.json({
                code: 401, message: "未找到该管理员"
            });
        }

        if (req.body.appid || req.query.appid) {
            const isYourApp = await App.findByPk(req.body.appid || req.query.appid)

            if (!isYourApp) {
                return res.json({
                    code: 404, message: "无法找到该应用"
                });
            }

            if (isYourApp.bind_admin_account !== admin.id) {
                return res.json({
                    code: 404, message: "该应用不属于您"
                });
            }
        }

        return next();
    } catch (e) {
        console.log("e", e);
        return res.json({
            code: 404, message: "连接出错"
        });
    }
};

process.on('SIGINT', async () => {
    await redisClient.quit();
    process.exit(0);
});

module.exports = appJwt;