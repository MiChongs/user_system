const global = require("../global/index")
const {validationResult} = require("express-validator");
const globals = require("../global");
const bcrypt = require("bcrypt");
const res = require("express/lib/response");
exports.list = async function (err, req, res, next) {
    const query = new global.ipRegion();
    const result = await query.search(global.getClientIp(req))
    if (!req.headers.authorization) {
        res.json({
            code: '201',
            message: '用户未授权',
            region: [{result: result, ip: global.getClientIp(req)}]
        })
        return
    }
    await global.User.findAll().then(result => {
        res.json({
            code: "200",
            message: "获取所有数据成功",
            //发送json数据类型
            list: JSON.stringify(result, null, 2),
        });
    }).catch(error => {
        res.json({
            code: "500",
            message: error,
        })
    });
}

exports.register = async function (req, res, next) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{msg}] = err.errors
        res.status(400).json({
            code: 400,
            msg: msg,
        })
    } else {
        await global.App.findByPk(req.params.id || req.body.id).then(result => {
            if (result == null) {
                return res.status(400).json({
                    code: 400,
                    message: '无法找到该应用'
                })
            }
            global.User.count({
                where: {
                    account: req.body.account,
                }
            }).then(async count => {
                if (count >= 1) {
                    res.status(401).json({code: "401", msg: "用户已存在"});
                } else {
                    const query = new global.ipRegion();
                    const result = await query.search(global.getClientIp(req))
                    await global.User.count({
                        where: {
                            register_ip: global.getClientIp(req)
                        }
                    }).then(count => {
                        if (count >= 1) {
                            res.status(401).json({
                                code: 401,
                                message: "IP已注册过账号"
                            })
                        } else {
                            global.User.create({
                                username: req.body.username,
                                account: req.body.account,
                                password: bcrypt.hashSync(req.body.password, 10),
                                register_ip: globals.getClientIp(req),
                                register_province: result.province,
                                register_city: result.city,
                                register_isp: result.isp,
                            }).then((result) => {
                                res.json({
                                    code: 200,
                                    message: '用户注册成功',
                                    result: [{
                                        username: result.username,
                                        account: result.account,
                                        password: result.password,
                                        avatar: result.avatar,
                                        name: result.name,
                                        register_ip: result.register_ip,
                                        register_time: result.register_time,
                                        vip_time: result.vip_time,
                                    }]
                                });
                            })
                        }
                    }).catch(error => {
                        res.status(500).json({
                            code: 500,
                            message: error
                        })
                    })
                }
            }).catch(error => {
                res.json({code: "403", msg: "查询数据库出现错误" + error.message});
                globals.User.sync().then(r => {
                    console.debug(r)
                }).catch(
                    error => {
                        console.error(err)
                    }
                )
            });
        }).catch(error => {
            res.status(500).json({
                code: 500,
                message: '查找应用出错',
                error: error
            })
        })
    }
}

exports.deleteUser = function (req, res) {
    res.send("Got a DELETE request at /user"); //发送各种类型的响应
}
