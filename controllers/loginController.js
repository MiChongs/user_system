const crypto = require("crypto");
const global = require("../global");
const globals = require("../global");
const {jwt, isEmptyStr} = require("../global");
const {validationResult} = require("express-validator");
const bcrypt = require("bcrypt");


exports.login = async function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        await global.App.findByPk(req.params.appid || req.body.appid).then(result => {
            if (result == null) {
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            }
            if (result instanceof global.App) {
                if (!result.loginStatus) {
                    let reason;
                    if (isEmptyStr(result.disableLoginReason)) {
                        reason = '无原因'
                    } else {
                        reason = result.disableLoginReason
                    }
                    res.status(400).json({
                        code: 400,
                        message: '应用已暂停登录',
                        data: {
                            reason: reason
                        }
                    })
                    return
                }
                global.User.findAll({
                    where: {
                        account: req.body.account,
                        appid: req.body.appid,
                    }
                }).then(result => {
                        const user = result[0];
                        if (result == null) {
                            return res.status(401).json({
                                code: 401,
                                message: '该用户不存在'
                            })
                        }
                        if (user instanceof global.User) {
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
                                return res.status(200).json({
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
                                                username: result[0].name,
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
                        return res.status(500).json({
                            code: "500",
                            message: error.message
                        })
                    }
                )
            }
        });
    }
}