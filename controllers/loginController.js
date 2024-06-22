const crypto = require("crypto");
const global = require("../global");
const globals = require("../global");
const {jwt, isEmptyStr} = require("../global");
const {validationResult} = require("express-validator");
const bcrypt = require("bcrypt");


exports.login = async function (req, res, next) {
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
                } else if (result.multiDeviceLogin) {
                    global.Token.findAndCountAll({
                        where: {
                            account: req.body.account,
                            appid: req.body.appid,
                        }
                    }).then(tokenCount => {
                        if (tokenCount.count === result.multiDeviceLoginNum) {
                            return res.status(500).json({
                                code: 500,
                                message: '该账号已达最大设备登录数'
                            })
                        } else {
                            global.Token.findOne({
                                where: {
                                    markcode: req.body.markcode
                                }
                            }).then(result => {
                                if (result == null) {
                                    global.User.findOne({
                                        where: {
                                            account: req.body.account,
                                            appid: req.body.appid,
                                        }
                                    }).then(result => {
                                            const user = result;
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
                                                    if (bcrypt.compareSync(req.body.password, user.password)) {
                                                        const token = jwt.sign({
                                                            account: req.body.account,
                                                            password: req.body.password
                                                        }, req.body.account, {
                                                            expiresIn: '7d',
                                                        })
                                                        global.Token.create({
                                                            token: token,
                                                            appid: req.body.appid,
                                                            account: req.body.account,
                                                            markcode: req.body.markcode
                                                        })
                                                        res.status(200).json({
                                                            code: 200,
                                                            message: '登录成功',
                                                            data: [
                                                                {
                                                                    token: token,
                                                                    userInfo: [{
                                                                        account: result.account,
                                                                        username: result.name,
                                                                        avatar: result.avatar,
                                                                        register_ip: result.register_ip,
                                                                        register_province: result.register_province,
                                                                        register_city: result.register_city,
                                                                        register_time: result.register_time
                                                                    }],
                                                                }
                                                            ]
                                                        })
                                                    } else {
                                                        res.status(401).json({
                                                            code: 401,
                                                            message: '用户密码错误'
                                                        })
                                                    }
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
                                } else {
                                    res.status(401).json({
                                        code: 401,
                                        message: '该设备已登录'
                                    })
                                }
                            }).catch(error => {
                                res.status(500).json({
                                    code: 500,
                                    message: error.message
                                })
                            })
                        }
                    }).catch(error => {
                        res.status(500).json({
                            code: 500,
                            message: error
                        })
                    })
                } else {
                    global.Token.findAndCountAll({
                        where: {
                            account: req.body.account,
                            appid: req.body.appid,
                        }
                    }).then(token => {
                        if (token.count === 1) {
                            return res.status(500).json({
                                code: 500,
                                message: '该账号已达最大设备登录数'
                            })
                        } else {
                            global.User.findOne({
                                where: {
                                    account: req.body.account,
                                    appid: req.body.appid,
                                }
                            }).then(result => {
                                    const user = result;
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
                                            if (bcrypt.compareSync(req.body.password, user.password)) {
                                                const token = jwt.sign({
                                                    account: req.body.account,
                                                    password: req.body.password
                                                }, req.body.account, {
                                                    expiresIn: '7d',
                                                })
                                                global.Token.create({
                                                    token: token,
                                                    appid: req.body.appid,
                                                    account: req.body.account,
                                                    markcode: req.body.markcode
                                                })
                                                res.status(200).json({
                                                    code: 200,
                                                    message: '登录成功',
                                                    data: [
                                                        {
                                                            token: token,
                                                            userInfo: [{
                                                                account: result.account,
                                                                username: result.name,
                                                                avatar: result.avatar,
                                                                register_ip: result.register_ip,
                                                                register_province: result.register_province,
                                                                register_city: result.register_city,
                                                                register_time: result.register_time
                                                            }],
                                                        }
                                                    ]
                                                })
                                            } else {
                                                res.status(401).json({
                                                    code: 401,
                                                    message: '用户密码错误'
                                                })
                                            }
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
                    }).catch(error => {
                        res.status(500).json({
                            code: 500,
                            message: error
                        })
                    })
                }
            }
        });
    }
}