const crypto = require("crypto");
const global = require("../global");
const globals = require("../global");
const {jwt} = require("../global");
exports.login = async function (req, res) {
    if (!req.body.account || !req.body.password) {
        res.status(400).json({
            code: '400',
            message: 'Username and password are required'
        })
    } else {
        await global.User.findAll({
            where: {
                account: req.body.account,
            }
        }).then(result => {
                const user = result[0];
                if (user instanceof globals.User) {
                    if (user.disabledEndTime >= Date.now()) {
                        res.status(401).json({
                            code: '401',
                            message: '用户已被禁用',
                            data: {
                                id: user.id,
                                account: user.account,
                                endTime: user.disabledEndTime,
                                reason: user.reason,
                            }
                        })
                    } else {
                        res.status(200).json({
                            code: 200,
                            message: '登录成功',
                            data: [
                                {
                                    token: jwt.sign({
                                        account: req.body.account,
                                        password: req.body.password
                                    }, req.body.account, {
                                        expiresIn: '7d',
                                    }),
                                    userInfo: [{
                                        account: result[0].account,
                                        username: result[0].username,
                                        avatar: result[0].avatar,
                                        register_ip: result[0].register_ip,
                                        register_province: result[0].register_province,
                                        register_city: result[0].register_city,
                                        register_time: result[0].register_time
                                    }],
                                }
                            ]
                        })
                    }
                }
            }
        ).catch(error => {
                res.status(500).json({
                    code: "500",
                    message: error.message
                })
            }
        )
    }
}

exports.register = function (req, res) {
    res.send("Got a POST request");
}