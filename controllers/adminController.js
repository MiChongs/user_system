const global = require("../global");
const {jwt} = require("../global");


/**
 * # 管理员登录
 * ## 参数
 * 1. account
 * 1. password
 *
 * 管理员账号、密码在环境变量文件中设置(根目录 .env 文件)
 */

exports.login = (req, res) => {
    if (req.body.account === process.env.ADMIN_USERNAME && req.body.password === process.env.ADMIN_PASSWORD) {
        const token = "Bearer " + jwt.sign({
            account: process.env.ADMIN_USERNAME,
            password: process.env.ADMIN_PASSWORD,
        }, process.env.ADMIN_PASSWORD, {
            expiresIn: process.env.ADMIN_EXPIRES_IN,
        });
        res.status(200).json({
            code: '200',
            message: '登录成功',
            data: [
                {
                    token: token,
                    expiresIn: process.env.ADMIN_EXPIRES_IN,
                }
            ]
        })
    }
}