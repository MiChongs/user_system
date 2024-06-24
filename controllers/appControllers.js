const crypto = require("crypto");
const global = require("../global");
const bcrypt = require("bcrypt");
const {validationResult} = require("express-validator");

/**
 * # 创建应用
 * ## 参数
 * 1. appid
 * 1. name
 *
 * 请求该接口需要管理员Token，在请求头设置即可
 */
exports.create = (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findOne({
            where: {
                id: req.body.id,
            }
        }).then(result => {
            if (result != null) {
                res.status(401).json({
                    code: 401,
                    message: '该应用已存在'
                })
            } else {
                global.App.create({
                    id: req.body.id,
                    name: req.body.name,
                    key: bcrypt.hashSync(req.body.id + req.body.id, 10),
                }).then(result => {
                    res.status(200).json({
                        code: 200,
                        message: result,
                    })
                }).catch(error => {
                    res.status(400).json({
                        code: 400,
                        message: error,
                    })
                })
            }
        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: error
            })
        })
    }
}


exports.createNotification = async function (req, res) {
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
                // 如果应用不存在，返回400错误并提示应用无法找到
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            }
            if (app instanceof global.App) {
                if (app.status) {
                    global.Notification.create({
                        appid: app.id,
                        title: req.body.title,
                        summary: req.body.content,
                    }).then(result => {
                        res.status(200).json({
                            code: 200,
                            message: '成功创建通知',
                        })
                    }).catch(err => {
                        res.status(201).json({
                            code: 201,
                            message: '创建通知失败',
                        })
                    })
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

exports.notifications = async function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app) {
                global.Notification.findAll({
                    where: {
                        appid: app.id
                    }
                }).then(result => {
                    res.status(200).json({
                        code: 200,
                        message: result,
                    })
                }).catch(error => {
                    res.status(400).json({
                        code: 400,
                        message: '查找应用通知失败',
                        data: error.message
                    })
                })
            } else {
                res.status(401).json({
                    code: 401,
                    message: '应用不存在'
                })
            }
        })
    }
}

/**
 * # 删除应用
 * ## 参数
 * 1. appid
 *
 * 请求该接口需要管理员Token，在请求头设置即可
 */

exports.deleteApp = (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findAll({
            where: {
                id: req.body.appid,
            }
        }).then(result => {
            if (result[0] != null) {
                result[0].destroy().then(r => res.status(200).json({
                    code: 200,
                    message: '应用删除成功'
                })).catch(error => {
                    res.status(201).json({
                        code: 201,
                        message: '应用删除失败'
                    })
                })
            } else {
                res.status(401).json({
                    code: 401,
                    message: '该应用不存在'
                })
            }
        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: error
            })
        })
    }
}

exports.apps = function (req, res) {
    global.App.findAll().then(result => {
        res.status(200).json({
            code: 200,
            message: result
        })
    }).catch(error => {
        res.status(500).json({
            code: 500,
            message: error
        })
    })
}

exports.appConfig = function (req, res) {
    global.App.findByPk(req.params.appid || req.body.appid).then(app => {
        if (app == null) {
            // 如果应用不存在，返回400错误并提示应用无法找到
            return res.status(400).json({
                code: 400,
                message: '无法找到该应用'
            })
        }
        if (app instanceof global.App) {
            res.status(200).json({
                code: 200,
                message: app
            })
        }
    })
}


exports.updateAppConfig = function (req, res) {
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
                // 如果应用不存在，返回400错误并提示应用无法找到
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            } else {
                if (app instanceof global.App) {
                    app.update({
                        name: req.body.name,
                        status: req.body.status || app.status,
                        disabledReason: req.body.disabledReason || app.disabledReason,
                        registerStatus: req.body.registerStatus || app.registerStatus,
                        disabledRegisterStatus: req.body.disabledRegisterStatus || app.disabledRegisterStatus,
                        loginStatus: req.body.loginStatus || app.loginStatus,
                        disabledLoginReason: req.body.disabledLoginReason || app.disabledLoginReason,
                        loginCheckDevice: req.body.loginCheckDevice || app.loginCheckDevice,
                        loginCheckUser: req.body.loginCheckUser || app.loginCheckUser,
                        loginCheckDeviceTimeOut: req.body.loginCheckDeviceTimeOut || app.loginCheckDeviceTimeOut,
                        multiDeviceLogin: req.body.multiDeviceLogin || app.multiDeviceLogin,
                        multiDeviceLoginNum: req.body.multiDeviceLoginNum || app.multiDeviceLoginNum,
                        register_award: req.body.register_award || app.register_award,
                        register_award_num: req.body.register_award_num || app.register_award_num,
                        invite_award: req.body.invite_award || app.invite_award,
                        invite_award_num: req.body.invite_award_num || app.invite_award_num,
                        daily_award: req.body.daily_award || app.daily_award,
                        daily_award_num: req.body.daily_award_num || app.daily_award_num,
                    }).then(result => {
                        res.status(200).json({
                            code: 200,
                            message: '更新配置成功',
                            data: result
                        })
                    }).catch(error => {
                        res.status(500).json({
                            code: 500,
                            message: error
                        })
                    })
                }
            }
        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: error
            })
        })
    }
}

exports.generateCard = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app instanceof global.App) {
                const num = parseInt(req.body.num) || 1
                const length = parseInt(req.body.length) || 12
                if (length < 6) {
                    res.status(201).json({
                        code: 201,
                        message: '卡号长度不能小于6位'
                    })
                    return
                }
                if (num > 1000) {
                    res.status(201).json({
                        code: 201,
                        message: '一次最多生成1000张卡'
                    })
                    return
                }
                try {
                    for (let i = 0; i < num; i++) {
                        const card = global.stringRandom(length)
                        global.Card.create({
                            card_code: card,
                            card_status: 'normal',
                            card_type: req.body.card_type,
                            appid: req.body.appid,
                            card_award_num: req.body.card_award_num,
                            card_memo: req.body.card_memo,
                            card_code_expire: global.moment().add(parseInt(req.body.card_code_expire), 'days').format('YYYY-MM-DD HH:mm:ss'),
                            card_time: global.moment().format('YYYY-MM-DD HH:mm:ss')
                        }).then(r => {
                            console.log(r)
                        })
                    }
                    return res.status(200).json({
                        code: 200,
                        message: '生成卡成功',
                        data: {
                            num: num,
                            length: length
                        }
                    })
                } catch (e) {

                }

            } else {
                res.status(201).json({
                    code: 201,
                    message: '无法查找该应用',
                })
            }
        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: '查找应用失败',
                error: error.message
            })
        })
    }
}

exports.cards = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        global.App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app instanceof global.App) {
                global.Card.findAll({
                    where: {
                        appid: req.params.appid || req.body.appid
                    }
                }).then(cards => {
                    res.status(200).json({
                        code: 200,
                        message: '获取卡成功',
                        data: cards
                    })
                }).catch(error => {
                    res.status(500).json({
                        code: 500,
                        message: '获取卡失败',
                       error: error.message
                   })
               })
            }
        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: '查找应用失败',
                error: error.message
            })
        })
    }
}