const crypto = require("crypto");
const global = require("../global");
const bcrypt = require("bcrypt");
const { validationResult } = require("express-validator");

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
        const [{ msg }] = err.errors
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
        const [{ msg }] = err.errors
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
        const [{ msg }] = err.errors
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
        const [{ msg }] = err.errors
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