const global = require("../global/index")
const {validationResult} = require("express-validator");
const globals = require("../global");
const bcrypt = require("bcrypt");
const res = require("express/lib/response");
const {isEmptyStr} = require("../global");
const axios = require('axios')
const iconv = require("iconv-lite");
const path = require('path')
const {Op} = require("sequelize");
const fs = require('fs')
const {error} = require("console");
// 引入配置好的 multerConfig
// 上传到服务器地址
const BaseURL = process.env.BASE_URL
// 上传到服务器的目录
const avatarPath = '/public/avatar'
const extractIPv4 = (ip) => {
    const ipv4Regex = /::ffff:(\d+\.\d+\.\d+\.\d+)/;
    const match = ip.match(ipv4Regex);
    if (match) {
        return match[1];
    } else {
        return ip;
    }
};

/**
 * 异步处理列表请求的路由中间件。
 * 该函数主要用于处理客户端请求，根据请求是否授权，返回不同的响应。
 * 如果请求未授权，返回用户未授权的信息及客户端IP对应的地域信息。
 * 如果请求已授权，查询并返回所有用户数据。
 *
 * @param {Error} err 错误对象，用于传递中间件过程中可能出现的错误。
 * @param {Object} req 请求对象，包含客户端的请求信息。
 * @param {Object} res 响应对象，用于向客户端发送响应。
 * @param {Function} next 中间件函数，用于传递控制权给下一个中间件。
 */
exports.list = async function (err, req, res, next) {
    // 初始化IP查询对象
    const query = new global.ipRegion();
    // 异步查询客户端IP的地域信息
    const result = await query.search(global.getClientIp(req));

    // 检查请求是否授权
    if (!req.headers.authorization) {
        // 如果未授权，返回未授权信息及客户端IP对应的地域信息
        res.json({
            code: '201',
            message: '用户未授权',
            region: [{result: result, ip: global.getClientIp(req)}]
        })
        return
    }

    // 如果请求已授权，查询所有用户数据
    await global.User.findAll().then(result => {
        // 返回查询成功的所有用户数据
        res.json({
            code: "200",
            message: "获取所有数据成功",
            // 发送json数据类型
            list: JSON.stringify(result, null, 2),
        });
    }).catch(error => {
        // 如果查询失败，返回错误信息
        res.json({
            code: "500",
            message: error,
        })
    });
}

/**
 * 用户注册接口
 * 使用async函数处理异步操作
 * @param {Object} req 请求对象，包含注册信息
 * @param {Object} res 响应对象，用于返回注册结果
 * @param {Function} next 中间件函数，用于处理下一个中间件或路由
 */
exports.register = async function (req, res, next) {
    // 验证请求参数是否符合规则
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        // 根据appid查询应用信息
        await global.App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app == null) {
                // 如果应用不存在，返回400错误并提示应用无法找到
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            }
            if (app instanceof global.App) {
                // 检查应用是否允许注册
                if (app.status) {
                    if (!app.registerStatus) {
                        let reason;
                        // 如果有禁用注册的原因，则显示原因，否则显示无原因
                        if (isEmptyStr(app.disabledRegisterReason)) {
                            reason = '无原因'
                        } else {
                            reason = app.disabledRegisterReason
                        }
                        res.status(400).json({
                            code: 400,
                            message: '应用已暂停注册',
                            data: {
                                reason: reason
                            }
                        })
                        return
                    }

                    // 检查用户账号是否已存在
                    global.User.count({
                        where: {
                            account: req.body.account,
                        }
                    }).then(async count => {
                        if (count >= 1) {
                            // 如果账号已存在，返回401错误并提示用户已存在
                            res.status(401).json({code: "401", msg: "用户已存在"});
                        } else {
                            // 查询用户注册IP所在地区
                            // 检查是否已存在相同IP注册的用户
                            if (app.registerCheckIp) {
                                global.User.count({
                                    where: {
                                        register_ip: req.clientIp
                                    }
                                }).then(count => {
                                    if (count >= 1) {
                                        // 如果IP已注册过账号，返回401错误并提示IP已注册过账号
                                        res.status(401).json({
                                            code: 401,
                                            message: "IP已注册过账号"
                                        })
                                    } else {
                                        // 创建新用户
                                        const options = {
                                            watchForUpdates: true
                                        };
                                        let userConfig;
                                        global.lookupAllGeoInfo(req.clientIp, options).then(async info => {
                                            if (app.register_award === 'integral') {
                                                userConfig = {
                                                    name: req.body.username,
                                                    account: req.body.account,
                                                    password: bcrypt.hashSync(req.body.password, 10),
                                                    register_ip: req.clientIp,
                                                    register_province: info.city.provinceName,
                                                    register_city: info.city.cityNameZh,
                                                    register_isp: info.asn.autonomousSystemOrganization,
                                                    appid: req.body.appid,
                                                    integral: app.register_award_num,
                                                    invite_code: bcrypt.hashSync(global.stringRandom(16), 10),
                                                    markcode: req.body.markcode
                                                }
                                            } else {
                                                userConfig = {
                                                    name: req.body.username,
                                                    account: req.body.account,
                                                    password: bcrypt.hashSync(req.body.password, 10),
                                                    register_ip: req.clientIp,
                                                    register_province: info.city.provinceName,
                                                    register_city: info.city.cityNameZh,
                                                    register_isp: info.asn.autonomousSystemOrganization,
                                                    appid: req.body.appid,
                                                    markcode: req.body.markcode,
                                                    invite_code: bcrypt.hashSync(global.stringRandom(16), 10),
                                                    vip_time: global.moment().add(app.register_award_num, 'm'),
                                                }
                                            }
                                            if (req.body.invite_code) {
                                                await global.User.findOne({
                                                    where: {
                                                        invite_code: req.body.invite_code,
                                                        appid: req.body.appid,
                                                    }
                                                }).then(user => {
                                                    if (user) {
                                                        userConfig.parent_invite_account = user.account
                                                        if (app.invite_award === 'integral') {
                                                            if (userConfig.integral == null) {
                                                                userConfig.integral = 0;
                                                            }
                                                            userConfig.integral += app.invite_award_num
                                                        } else {
                                                            if (userConfig.vip_time == null) {
                                                                userConfig.vip_time = global.moment().format('YYYY-MM-DD HH:mm:ss')
                                                            }
                                                            userConfig.vip_time += global.moment().add(app.invite_award_num, 'm')
                                                        }
                                                    } else {
                                                        res.status(400).json({
                                                            code: 400,
                                                            message: '邀请码无效'
                                                        })
                                                    }
                                                })
                                                return
                                            }
                                            global.User.create(userConfig).then(async (result) => {
                                                // 用户创建成功，返回200成功码和用户信息
                                                await global.Log.create({
                                                    log_type: 'register',
                                                    log_content: global.logString('register', req.clientIp, req.body.markcode, global.moment().format('YYYY-MM-DD HH:mm:ss')),
                                                    log_ip: req.clientIp,
                                                    log_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                    log_user_id: result.account,
                                                    appid: req.body.appid,
                                                })
                                                await global.RegisterLog.create({
                                                    user_id: result.account,
                                                    register_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                    register_ip: req.clientIp,
                                                    register_address: info.city.provinceName + info.city.cityNameZh,
                                                    register_isp: info.asn.autonomousSystemOrganization,
                                                    appid: req.body.appid,
                                                    register_device: req.body.markcode,
                                                })
                                                res.json({
                                                    code: 200,
                                                    message: '用户注册成功',
                                                    result: [{
                                                        account: result.account,
                                                        password: result.password,
                                                        avatar: result.avatar,
                                                        name: result.username,
                                                        register_ip: result.register_ip,
                                                        register_time: result.register_time,
                                                        vip_time: result.vip_time,
                                                    }]
                                                });
                                            })
                                        }).catch(err => {
                                            res.status(500).json({
                                                code: 500,
                                                message: '查询IP所在地区失败',
                                                error: err.message
                                            })

                                        })
                                    }
                                }).catch(error => {
                                    // 处理数据库查询错误
                                    res.status(500).json({
                                        code: 500,
                                        message: error
                                    })
                                })
                            } else {
                                // 创建新用户
                                const options = {
                                    watchForUpdates: true
                                };
                                let userConfig;
                                global.lookupAllGeoInfo(req.clientIp, options).then(async info => {
                                    if (app.register_award === 'integral') {
                                        userConfig = {
                                            name: req.body.username,
                                            account: req.body.account,
                                            password: bcrypt.hashSync(req.body.password, 10),
                                            register_ip: req.clientIp,
                                            register_province: info.city.provinceName,
                                            register_city: info.city.cityNameZh,
                                            register_isp: info.asn.autonomousSystemOrganization,
                                            appid: req.body.appid,
                                            integral: app.register_award_num,
                                            invite_code: bcrypt.hashSync(global.stringRandom(16), 10),
                                            markcode: req.body.markcode
                                        }
                                    } else {
                                        userConfig = {
                                            name: req.body.username,
                                            account: req.body.account,
                                            password: bcrypt.hashSync(req.body.password, 10),
                                            register_ip: req.clientIp,
                                            register_province: info.city.provinceName,
                                            register_city: info.city.cityNameZh,
                                            register_isp: info.asn.autonomousSystemOrganization,
                                            appid: req.body.appid,
                                            markcode: req.body.markcode,
                                            invite_code: bcrypt.hashSync(global.stringRandom(16), 10),
                                            vip_time: global.moment().add(app.register_award_num, 'm'),
                                        }
                                    }
                                    if (req.body.invite_code) {
                                        await global.User.findOne({
                                            where: {
                                                invite_code: req.body.invite_code,
                                                appid: req.body.appid,
                                            }
                                        }).then(async user => {
                                            if (user) {
                                                userConfig.parent_invite_account = user.account
                                                if (app.invite_award === 'integral') {
                                                    if (userConfig.integral == null) {
                                                        userConfig.integral = 0;
                                                    }
                                                    userConfig.integral += app.invite_award_num
                                                } else {
                                                    if (userConfig.vip_time == null) {
                                                        userConfig.vip_time = global.moment().format('YYYY-MM-DD HH:mm:ss')
                                                    }
                                                    userConfig.vip_time += global.moment().add(app.invite_award_num, 'm')
                                                }
                                                await global.User.create(userConfig).then(async (result) => {
                                                    // 用户创建成功，返回200成功码和用户信息
                                                    await global.Log.create({
                                                        log_type: 'register',
                                                        log_content: global.logString('register', req.clientIp, req.body.markcode, global.moment().format('YYYY-MM-DD HH:mm:ss')),
                                                        log_ip: req.clientIp,
                                                        log_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                        log_user_id: result.account,
                                                        appid: req.body.appid,
                                                    })
                                                    await global.RegisterLog.create({
                                                        user_id: result.account,
                                                        register_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                        register_ip: req.clientIp,
                                                        register_address: info.city.provinceName + info.city.cityNameZh,
                                                        register_isp: info.asn.autonomousSystemOrganization,
                                                        appid: req.body.appid,
                                                        register_device: req.body.markcode,
                                                    })
                                                    res.status(200).json({
                                                        code: 200,
                                                        message: '用户注册成功',
                                                        result: [{
                                                            account: result.account,
                                                            password: result.password,
                                                            avatar: result.avatar,
                                                            name: result.username,
                                                            register_ip: result.register_ip,
                                                            register_time: result.register_time,
                                                            vip_time: result.vip_time,
                                                        }]
                                                    });
                                                })
                                                return
                                            } else {
                                                return res.status(400).json({
                                                    code: 400,
                                                    message: '邀请码无效'
                                                })
                                            }
                                        })
                                    } else {
                                        await global.User.create(userConfig).then(async (result) => {
                                            // 用户创建成功，返回200成功码和用户信息
                                            await global.Log.create({
                                                log_type: 'register',
                                                log_content: global.logString('register', req.clientIp, req.body.markcode, global.moment().format('YYYY-MM-DD HH:mm:ss')),
                                                log_ip: req.clientIp,
                                                log_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                log_user_id: result.account,
                                                appid: req.body.appid,
                                            })
                                            await global.RegisterLog.create({
                                                user_id: result.account,
                                                register_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                register_ip: req.clientIp,
                                                register_address: info.city.provinceName + info.city.cityNameZh,
                                                register_isp: info.asn.autonomousSystemOrganization,
                                                appid: req.body.appid,
                                                register_device: req.body.markcode,
                                            })
                                            res.status(200).json({
                                                code: 200,
                                                message: '用户注册成功',
                                                result: [{
                                                    account: result.account,
                                                    password: result.password,
                                                    avatar: result.avatar,
                                                    name: result.username,
                                                    register_ip: result.register_ip,
                                                    register_time: result.register_time,
                                                    vip_time: result.vip_time,
                                                }]
                                            });

                                        })
                                    }
                                }).catch(err => {
                                    res.status(500).json({
                                        code: 500,
                                        message: '查询IP所在地区失败',
                                        error: err.message
                                    })

                                })

                            }
                        }
                    }).catch(error => {
                        // 处理数据库查询错误
                        res.json({code: "403", msg: "查询数据库出现错误" + error.message});
                        globals.User.sync().then(r => {
                            console.debug(r)
                        }).catch(
                            error => {
                                console.error(err)
                            }
                        )
                    });
                } else {
                    res.status(201).json({
                        code: 201,
                        message: '应用已停止'
                    })
                }
            }

        }).catch(error => {
            // 处理查找应用的错误
            res.status(500).json({
                code: 500,
                message: '查找应用出错',
                error: error
            })
        })
    }
}

exports.devices = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app == null) {
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            }
            if (app instanceof global.App) {
                global.Token.findAll({
                    where: {
                        account: req.body.account,
                        appid: req.body.appid
                    }
                }).then(result => {
                    if (global.emptinessCheck(result)) {
                        res.status(201).json({
                            code: 201,
                            message: '该账号没有登录设备'
                        })
                    } else {
                        res.status(200).json({
                            code: 200,
                            message: '已找到所有设备',
                            data: result
                        })
                    }
                }).catch(error => {
                    res.status(201).json({
                        code: 201,
                        message: error.message
                    })
                })
            }

        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: '查找应用出错',
                error: error
            })
        })
    }
}

exports.deleteDevice = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app == null) {
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            }
            if (app instanceof global.App) {
                global.Token.findOne({
                    where: {
                        token: req.body.token,
                        markcode: req.body.markcode,
                        appid: req.body.appid
                    }
                }).then(result => {
                    if (result == null) {
                        res.status(201).json({
                            code: 201,
                            message: '该登录状态不存在'
                        })
                    } else {
                        result.destroy().then(result => {
                            res.status(200).json({
                                code: 200,
                                message: '登出成功',
                                data: {
                                    account: result.account,
                                    token: result.token,
                                    markcode: result.markcode
                                }
                            })
                        }).catch(error => {
                            res.status(201).json({
                                code: 201,
                                message: '登出失败',
                                error: error.message
                            })
                        })
                    }
                }).catch(error => {
                    res.status(201).json({
                        code: 201,
                        message: error.message
                    })
                })
            }

        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: '查找应用出错',
                error: error
            })
        })
    }
}

exports.logout = async function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        await global.App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app == null) {
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            }
            if (app instanceof global.App) {
                global.Token.findOne({
                    where: {
                        token: req.body.token,
                        markcode: req.body.markcode,
                        appid: req.body.appid
                    }
                }).then(result => {
                    if (result == null) {
                        res.status(201).json({
                            code: 201,
                            message: '该登录状态不存在'
                        })
                    } else {
                        result.destroy().then(result => {
                            res.status(200).json({
                                code: 200,
                                message: '登出成功',
                                data: [
                                    {
                                        account: result.account,
                                        token: result.token,
                                        markcode: result.markcode
                                    }
                                ]
                            })
                        }).catch(error => {
                            res.status(201).json({
                                code: 201,
                                message: '登出失败',
                                error: error.message
                            })
                        })
                    }
                }).catch(error => {
                    res.status(201).json({
                        code: 201,
                        message: error.message
                    })
                })
            }

        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: '查找应用出错',
                error: error
            })
        })
    }
}

exports.delete = async function (req, res, next) {

}

exports.uploadAvatar = async function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        await global.App.findByPk(req.params.appid || req.body.appid).then(async app => {
            if (app == null) {
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            }
            if (app instanceof global.App) {
                await global.Token.findOne({
                    where: {
                        token: req.body.token,
                        appid: req.body.appid
                    }
                }).then(async user => {
                    if (user == null) {
                        return res.status(400).json({
                            code: 400,
                            message: '无法找到该登录状态'
                        })
                    } else {
                        if (user instanceof global.Token) {
                            if (!req.files) {
                                return res.status(400).json({
                                    code: 400,
                                    message: '没有上传文件'
                                })
                            } else {
                                try {
                                    let fileName;
                                    let uploadPath;
                                    console.log(req.files);
                                    fileName = req.files.file;
                                    uploadPath = 'public/avatars/' + user.account + path.extname(fileName.name);
                                    fileName.mv(uploadPath, function (err) {
                                        if (err) {
                                            res.status(201).json({
                                                code: 201,
                                                message: '上传失败',
                                                error: err.message
                                            })
                                        } else {
                                            global.User.findOne({
                                                where: {
                                                    account: user.account,
                                                    appid: req.body.appid
                                                }
                                            }).then(user => {
                                                user.update({
                                                    avatar: process.env.BASE_SERVER_URL + '/avatars/' + path.basename(uploadPath)
                                                }).then(result => {
                                                    res.status(200).json({
                                                        code: 200,
                                                        message: '上传成功',
                                                        data: [
                                                            {
                                                                avatar: result.avatar
                                                            }
                                                        ]
                                                    })
                                                }).catch(error => {
                                                    res.status(201).json({
                                                        code: 201,
                                                        message: '更新用户失败',
                                                        error: error.message
                                                    })
                                                })
                                            }).catch(error => {
                                                res.status(201).json({
                                                    code: 201,
                                                    message: '查找用户出错',
                                                    error: error.message
                                                })
                                            })
                                        }
                                    });
                                    //res.send('successfully')
                                    return
                                } catch (error) {
                                    res.status(201).json({
                                        code: 201,
                                        message: '上传失败',
                                        error: error.message
                                    })
                                    return
                                }

                            }
                        } else {
                            res.status(201).json({
                                code: 201,
                                message: '无法找到该用户'
                            })
                            console.log(req.body.token)
                            return
                        }
                    }
                }).catch(error => {
                    res.status(201).json({
                        code: 201,
                        message: error.message
                    })
                    return
                })
            }

        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: '查找应用出错',
                error: error
            })
        })
    }
}

exports.daily = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findOne({
            where: {
                id: req.body.appid
            }
        }).then(app => {
            if (app) {
                global.Token.findOne({
                    where: {
                        token: req.body.token,
                        appid: req.body.appid
                    }
                }).then(user => {
                    if (user instanceof global.Token) {
                        global.Log.findOne({
                            where: {
                                log_time: {
                                    [Op.notLike]: global.moment(Date.now()).format('YYYY-MM-DD')
                                },
                                log_type: 'daily',
                                log_user_id: user.account,
                                appid: req.body.appid
                            }
                        }).then(async log => {
                            if (log) {
                                return res.status(201).json({
                                    code: 201,
                                    message: '已经签到过了'
                                })
                            } else {
                                global.Log.create({
                                    log_user_id: user.account,
                                    appid: req.body.appid,
                                    log_type: 'daily',
                                    log_ip: req.clientIp,
                                    log_content: global.logString('daily', req.clientIp, user.markcode, global.moment().format('YYYY-MM-DD HH:mm:ss')),
                                    log_time: global.moment(Date
                                        .now()
                                    ).format('YYYY-MM-DD')
                                }).then(log => {
                                    global.User.findOne({
                                        where: {
                                            account: user.account,
                                            appid: req.body.appid
                                        }
                                    }).then(user => {
                                        let userConfig = {}
                                        if (app.daily_award === 'integral') {
                                            userConfig = {
                                                integral: user.integral + app.daily_award_num,
                                            }
                                        } else {
                                            userConfig = {
                                                vip_time: user.vip_time + global.moment().add(app.daily_award_num, 'm'),
                                            }
                                        }
                                        if (user) {
                                            user.update(userConfig).then(
                                                user => {
                                                    return res.status(200).json({
                                                        code: 200,
                                                        message: '签到成功',
                                                        data: {
                                                            account: user.account,
                                                            integral: user.integral,
                                                            vip_time: global.moment(user.vip_time).format('YYYY-MM-DD HH:mm:ss'),
                                                            daily_time: global.moment(log.log_time).format('YYYY-MM-DD HH:mm:ss')
                                                        }
                                                    })
                                                }
                                            ).catch(error => {
                                                return res.status(201).json({
                                                    code: 201,
                                                    message: '签到失败',
                                                    error: error.message
                                                })
                                            })
                                        }
                                    })
                                }).catch(error => {
                                    return res.status(201).json({
                                        code: 201,
                                        message: '创建日志失败',
                                        error: error.message
                                    })
                                })
                                return
                            }
                        }).catch(error => {
                            return res.status(201).json({
                                code: 201,
                                message: '无法找到该登录状态',
                                error: error.message
                            })
                        })
                    } else {
                        return res.status(201).json({
                            code: 201,
                            message: '无法找到该用户'
                        })
                    }
                }).catch(error => {
                    return res.status(201).json({
                        code: 201,
                        message: '查找用户出错',
                        error: error.message
                    })
                })
            } else {
                return res.status(201).json({
                    code: 201,
                    message: '无法找到该应用'
                })
            }
        }).catch(error => {
            return res.status(500).json({
                code: 500,
                message: '查找应用出错',
                error: error
            })
        })
    }
}

exports.useCard = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findByPk(req.body.appid).then(app => {
            if (app) {
                global.Card.findOne({
                    where: {
                        card_code: req.body.card_code,
                        appid: req.body.appid
                    }
                }).then(card => {
                    if (card) {
                        global.Token.findOne({
                            where: {
                                token: req.body.token,
                                appid: req.body.appid
                            }
                        }).then(token => {
                            if (token) {
                                global.User.findOne({
                                    where: {
                                        account: token.account,
                                        appid: req.body.appid
                                    }
                                }).then(async user => {
                                    if (user) {
                                        await global.Log.create({
                                            log_type: 'card_use',
                                            log_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                            log_content: global.logString('card_use', user.account, global.moment().format('YYYY-MM-DD HH:mm:ss'), card.card_code),
                                            log_ip: req.clientIp,
                                            log_user_id: user.account,
                                            appid: req.body.appid,
                                        })
                                        if (card.card_type === 'integral') {
                                            user.update({
                                                integral: user.integral + card.card_award_num
                                            }).then(
                                                async user => {
                                                    await global.Log.create({
                                                        log_type: 'integral_add',
                                                        log_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                        log_content: global.logString('integral_add', user.account, global.moment().format('YYYY-MM-DD HH:mm:ss'), card.card_code, card.card_award_num, user.integral),
                                                        log_ip: req.clientIp,
                                                        log_user_id: user.account,
                                                        appid: req.body.appid,
                                                    })
                                                    return res.status(200).json({
                                                        code: 200,
                                                        message: '使用成功',
                                                        data: {
                                                            integral: user.integral,
                                                        }
                                                    })
                                                }
                                            ).catch(error => {
                                                return res.status(201).json({
                                                    code: 201,
                                                    message: '更新用户信息失败',
                                                    error: error.message
                                                })
                                            })
                                        } else {
                                            user.update({
                                                vip_time: global.moment(user.vip_time).add(card.card_award_num, 'days').format('YYYY-MM-DD HH:mm:ss')
                                            }).then(async user => {
                                                await global.Log.create({
                                                    log_type: 'vip_time_add',
                                                    log_time: global.moment().format('YYYY-MM-DD HH:mm:ss'),
                                                    log_content: global.logString('vip_time_add', user.account, global.moment().format('YYYY-MM-DD HH:mm:ss'), card.card_code, card.card_award_num, global.moment(user.vip_time).format('YYYY-MM-DD HH:mm:ss')),
                                                    log_ip: req.clientIp,
                                                    log_user_id: user.account,
                                                    appid: req.body.appid,
                                                })
                                                return res.status(200).json({
                                                    code: 200,
                                                    message: '使用成功'
                                                })
                                            })
                                        }
                                    } else {
                                        return res.status(201).json({
                                            code: 201,
                                            message: '无法找到该用户'
                                        })
                                    }
                                }).catch(error => {
                                    return res.status(201).json({
                                        code: 201,
                                        message: '查找用户出错',
                                        error: error.message
                                    })
                                })
                            } else {
                                return res.status(201).json({
                                    code: 201,
                                    message: '无法找到该登录状态'
                                })
                            }
                        }).catch(
                            error => {
                                return res.status(201).json({
                                    code: 201,
                                    message: '查找登录状态出错',
                                    error: error.message
                                })
                            }
                        )
                    } else {
                        return res.status(201).json({
                            code: 201,
                            message: '卡密不存在'
                        })
                    }
                }).catch(error => {
                    return res.status(201).json({
                        code: 201,
                        message: '查找卡密出错',
                        error: error.message
                    })
                })
            }
        })
    }
}

exports.sendMail = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findByPk(req.body.appid).then(async app => {
            if (app != null) {
                if (app.status) {
                    if (!isEmptyStr(app.smtpHost) && !isEmptyStr(app.smtpUser) && !isEmptyStr(app.smtpPassword) && !isEmptyStr(app.smtpPort)) {
                        global.Token.findOne({
                            where: {
                                token: req.body.token,
                                appid: req.body.appid,
                            }
                        }).then(async token => {
                            if (token != null) {
                                global.User.findOne({
                                    where: {
                                        account: token.account,
                                        appid: req.body.appid,
                                    }
                                }).then(async user => {
                                    if (user != null) {
                                        if (req.body.email.indexOf('@') > 0) {
                                            if (req.body.mail_type === 'forgot') {
                                                await global.redisClient.connect();
                                                const result = await global.redisClient.get(req.body.email);
                                                // 已存在此邮箱数据
                                                if (result) {
                                                    await global.redisClient.disconnect();
                                                    return res.status(409).json({msg: '请不要重复发起请求，15分钟后可以再次发起。'});
                                                }
                                                // 创建nodemailer transporter
                                                const transporter = global.nodemailer.createTransport({
                                                    host: app.smtpHost,
                                                    port: app.smtpPort,
                                                    secure: app.smtpSecure,
                                                    auth: {
                                                        user: app.smtpUser,
                                                        pass: app.smtpPassword,
                                                    },
                                                });
                                                const sendVerificationEmail = async (to, verificationCode) => {
                                                    const templatePath = path.join(__dirname, '../template/theme.ejs');
                                                    const template = fs.readFileSync(templatePath, 'utf-8');
                                                    const html = global.ejs.render(template, {
                                                        username: user.name,
                                                        verificationCode,
                                                        senderName: app.name
                                                    });
                                                    const mailOptions = {
                                                        from: app.smtpForm,
                                                        to: req.body.email,
                                                        subject: app.name + ' - 找回密码',
                                                        html,
                                                    };

                                                    try {
                                                        await transporter.sendMail(mailOptions);
                                                        console.log('验证电子邮件已成功发送。');
                                                        return res.status(200).json({msg: '验证电子邮件已成功发送。'});
                                                    } catch (error) {
                                                        console.error('发送电子邮件时出错：', error);
                                                        await global.redisClient.disconnect();
                                                        return res.status(500).json({msg: '发送电子邮件时出错：' + error});
                                                    }
                                                };

                                                const storeVerificationCode = async (email, code) => {
                                                    await global.redisClient.set(email, code, {
                                                        EX: 60 * 15,
                                                        NX: true,
                                                    }); // 设置有效期为15分钟
                                                    await global.redisClient.disconnect();
                                                };
                                                // 发送验证码邮件
                                                // 生成验证码
                                                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                                                await sendVerificationEmail(req.body.email, verificationCode);
                                                // 存储验证码至 redis
                                                await storeVerificationCode(req.body.email, verificationCode);
                                            }
                                        }
                                    } else {
                                        return res.status(201).json({
                                            code: 201,
                                            message: '无法找到该用户'
                                        })
                                    }
                                }).catch(error => {
                                    console.error(error)
                                })
                            } else {
                                return res.status(201).json({
                                    code: 201,
                                    message: '登录状态不存在'
                                })
                            }
                        }).catch(error => {
                            return res.status(201).json({
                                code: 201,
                                message: '查找登录状态出错',
                                error: error.message
                            })
                        })
                    } else {
                        return res.status(201).json({
                            code: 201,
                            message: '请先配置邮件服务器'
                        })
                    }
                } else {
                    return res.status(201).json({
                        code: 201,
                        message: '该应用已禁用'
                    })
                }
            }
        })
    }
}

exports.forgotPassword = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findByPk(req.body.appid).then(async app => {
            if (app === null) {
                return res.status(201).json({
                    code: 201,
                    message: '无法找到该应用'
                })
            } else {
                if (!app.status) {
                    return res.status(201).json({
                        code: 201,
                        message: '该应用已禁用'
                    })
                } else {
                    if (!isEmptyStr(app.smtpHost) && !isEmptyStr(app.smtpUser) && !isEmptyStr(app.smtpPassword) && !isEmptyStr(app.smtpPort)) {
                        global.Token.findOne({
                            where: {
                                token: req.body.token,
                                appid: req.body.appid,
                            }
                        }).then(
                            async token => {
                                if (token === null) {
                                    return res.status(201).json({
                                        code: 201,
                                        message: '无法找到该登录状态'
                                    })
                                } else {
                                    global.User.findOne({
                                        where: {
                                            account: token.account,
                                            appid: req.body.appid,
                                        }
                                    }).then(async user => {
                                        if (user === null) {
                                            return res.status(201).json({
                                                code: 201,
                                                message: '无法找到该用户'
                                            })
                                        } else {
                                            await global.redisClient.connect();
                                            const result = await global.redisClient.get(req.body.email);
                                            // 已存在此邮箱数据
                                            if (result) {
                                                if (result === req.body.verify_code) {
                                                    if (bcrypt.compareSync(req.body.new_password, user.password)) {
                                                        res.status(201).json({
                                                            code: 201,
                                                            msg: '新密码不能与旧密码相同'
                                                        });
                                                        return global.redisClient.disconnect()
                                                    } else {
                                                        await user.update({
                                                            password: bcrypt.hashSync(req.body.new_password, 10)
                                                        }).then(async () => {
                                                            res.status(200).json({
                                                                code: 200,
                                                                msg: '密码修改成功'
                                                            });
                                                        }).catch(error => {
                                                            res.status(201).json({
                                                                code: 201,
                                                                message: '修改密码出错',
                                                                error: error.message
                                                            })
                                                        })
                                                        return global.redisClient.disconnect();
                                                    }
                                                } else {
                                                    res.status(201).json({
                                                        code: 201,
                                                        msg: '验证码错误'
                                                    });
                                                    return global.redisClient.disconnect()
                                                }
                                            } else {
                                                res.status(201).json({
                                                    code: 201,
                                                    msg: '未向该邮箱发送验证码，请检查邮箱是否正确。'
                                                });
                                                return global.redisClient.disconnect()
                                            }
                                        }
                                    }).catch(error => {
                                        return res.status(201).json({
                                            code: 201,
                                            message: '查找用户出错',
                                            error: error.message
                                        })
                                    })
                                }
                            }
                        ).catch(
                            error => {
                                return res.status(201).json({
                                    code: 201,
                                    message: '无法找到该登录状态'
                                })
                            }
                        )
                    } else {
                        return res.status(201).json({
                            code: 201,
                            message: '该应用未配置邮件服务器'
                        })
                    }
                }
            }
        })
    }
}