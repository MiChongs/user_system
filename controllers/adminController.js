const global = require("../global");
const {jwt} = require("../global");

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