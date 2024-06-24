const crypto = require("crypto");
const global = require("../global");
const globals = require("../global");
const {jwt, isEmptyStr} = require("../global");
const {validationResult} = require("express-validator");
const bcrypt = require("bcrypt");


/**
 * 处理用户登录请求
 * @param {object} req 请求对象，包含登录所需信息
 * @param {object} res 响应对象，用于向客户端发送响应
 * @param {function} next 中间件函数，用于传递控制权至下一个中间件
 */
exports.login = function (req, res, next) {
    // 验证请求参数是否符合规则
    const err = validationResult(req);
    // 如果存在验证错误
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            msg: msg,
        });
    } else {
        // 根据appid查询应用信息
        global.App.findByPk(req.params.appid || req.body.appid).then(result => {
            // 如果应用不存在
            if (result == null) {
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                });
            }
            // 如果应用实例存在
            if (result instanceof global.App) {
                // 如果应用登录状态为禁用
                if (!result.loginStatus) {
                    let reason;
                    // 如果禁用登录原因为空，则默认为'无原因'
                    if (isEmptyStr(result.disableLoginReason)) {
                        reason = '无原因';
                    } else {
                        reason = result.disableLoginReason;
                    }
                    // 返回400错误，表示应用已暂停登录
                    return res.status(400).json({
                        code: 400,
                        message: '应用已暂停登录',
                        data: {
                            reason: reason
                        }
                    });
                } else if (result.multiDeviceLogin) {
                    // 如果应用支持多设备登录，检查当前账号登录设备数是否达到上限
                    global.Token.findAndCountAll({
                        where: {
                            account: req.body.account,
                            appid: req.body.appid,
                        }
                    }).then(tokenCount => {
                        // 如果设备数达到上限
                        if (tokenCount.count === result.multiDeviceLoginNum) {
                            return res.status(500).json({
                                code: 500,
                                message: '该账号已达最大设备登录数'
                            });
                        } else {
                            // 检查设备标记码是否已存在
                            global.Token.findOne({
                                where: {
                                    markcode: req.body.markcode
                                }
                            }).then(result => {
                                // 如果设备标记码不存在
                                if (result == null) {
                                    // 查询用户信息
                                    global.User.findOne({
                                        where: {
                                            account: req.body.account,
                                            appid: req.body.appid,
                                        }
                                    }).then(async result => {
                                            const user = result;
                                            // 如果用户不存在
                                            if (result == null) {
                                                return res.status(401).json({
                                                    code: 401,
                                                    message: '该用户不存在'
                                                });
                                            }
                                            // 如果用户实例存在
                                            if (user instanceof global.User) {
                                                // 如果用户被禁用
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
                                                    });
                                                } else {
                                                    // 校验密码
                                                    if (bcrypt.compareSync(req.body.password, user.password)) {
                                                        // 生成登录令牌
                                                        global.lookupAllGeoInfo(req.clientIp, {
                                                            watchForUpdates: true
                                                        }).then(
                                                            async geo => {
                                                                const token = jwt.sign({
                                                                    account: req.body.account,
                                                                    password: req.body.password
                                                                }, process.env.APP_TOKEN_KEY, {
                                                                    expiresIn: '7d',
                                                                });
                                                                await global.Token.create({
                                                                    token: token,
                                                                    appid: req.body.appid,
                                                                    account: req.body.account,
                                                                    markcode: req.body.markcode
                                                                });
                                                                await global.LoginLog.create({
                                                                    user_id: req.body.account,
                                                                    appid: req.body.appid,
                                                                    login_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                                    login_ip: req.clientIp,
                                                                    login_address: geo.city.provinceName + geo.city.cityNameZh,
                                                                    login_device: req.body.markcode,
                                                                    login_isp: geo.asn.autonomousSystemOrganization,
                                                                })
                                                                return res.status(200).json({
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
                                                                            }]
                                                                        }
                                                                    ]
                                                                });
                                                            }

                                                        ).catch(error => {
                                                            return res.status(500).json({
                                                                code: 500,
                                                                message: '获取地理位置信息失败',
                                                                error: error.message
                                                            });
                                                        })
                                                    } else {
                                                        // 密码错误，返回401
                                                        return res.status(401).json({
                                                            code: 401,
                                                            message: '用户密码错误'
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    ).catch(error => {
                                            // 处理查询错误
                                            return res.status(500).json({
                                                code: 500,
                                                message: error.message
                                            });
                                        }
                                    )
                                } else {
                                    // 设备标记码已存在，表示设备已登录，返回401
                                    return res.status(401).json({
                                        code: 401,
                                        message: '该设备已登录'
                                    });
                                }
                            }).catch(error => {
                                // 处理查询错误
                                res.status(500).json({
                                    code: 500,
                                    message: error.message
                                });
                            });
                        }
                    }).catch(error => {
                        // 处理查询错误
                        res.status(500).json({
                            code: 500,
                            message: error
                        });
                    })
                } else {
                    // 如果应用不支持多设备登录，检查登录设备数是否达到上限
                    global.Token.findAndCountAll({
                        where: {
                            account: req.body.account,
                            appid: req.body.appid,
                        }
                    }).then(token => {
                        // 如果设备数达到上限
                        if (token.count === 1) {
                            return res.status(500).json({
                                code: 500,
                                message: '该账号已达最大设备登录数'
                            });
                        } else {
                            // 查询用户信息
                            global.User.findOne({
                                where: {
                                    account: req.body.account,
                                    appid: req.body.appid,
                                }
                            }).then(result => {
                                    const user = result;
                                    // 如果用户不存在
                                    if (result == null) {
                                        return res.status(401).json({
                                            code: 401,
                                            message: '该用户不存在'
                                        });
                                    }
                                    // 如果用户实例存在
                                    if (user instanceof global.User) {
                                        // 如果用户被禁用
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
                                            });
                                        } else {
                                            // 校验密码
                                            if (bcrypt.compareSync(req.body.password, user.password)) {
                                                // 生成登录令牌
                                                const token = jwt.sign({
                                                    account: req.body.account,
                                                    password: req.body.password
                                                }, process.env.APP_TOKEN_KEY, {
                                                    expiresIn: '7d',
                                                });
                                                // 创建令牌记录
                                                global.Token.create({
                                                    token: token,
                                                    appid: req.body.appid,
                                                    account: req.body.account,
                                                    markcode: req.body.markcode
                                                });
                                                // 返回200成功，包含登录令牌和用户信息
                                                return res.status(200).json({
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
                                                            }]
                                                        }
                                                    ]
                                                });
                                            } else {
                                                // 密码错误，返回401
                                                return res.status(401).json({
                                                    code: 401,
                                                    message: '用户密码错误'
                                                });
                                            }
                                        }
                                    }
                                }
                            ).catch(error => {
                                    // 处理查询错误
                                    return res.status(500).json({
                                        code: "500",
                                        message: error.message
                                    });
                                }
                            )
                        }
                    }).catch(error => {
                        // 处理查询错误
                        res.status(500).json({
                            code: 500,
                            message: error
                        });
                    })
                }
            }
        });
    }
}