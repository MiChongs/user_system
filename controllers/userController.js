const global = require("../global/index")
const {validationResult} = require("express-validator");
const globals = require("../global");
const bcrypt = require("bcrypt");
const res = require("express/lib/response");
const {isEmptyStr} = require("../global");
const axios = require('axios')
const iconv = require("iconv-lite");
const geoip = require('geoip-lite');
const extractIPv4 = (ip) => {
    const ipv4Regex = /::ffff:(\d+\.\d+\.\d+\.\d+)/;
    const match = ip.match(ipv4Regex);
    if (match) {
        return match[1];
    } else {
        return ip;
    }
};

const getGeoInfo = (ip) => {
    const ipv4Address = extractIPv4(ip);
    const geo = geoip.lookup(ipv4Address);
    if (geo) {
        return {
            country: geo.country,
            region: geo.region,
            city: geo.city
        };
    } else {
        return {error: '无法获取地理位置信息'};
    }
};

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
            if (result instanceof global.App) {
                if (!result.registerStatus) {
                    let reason;
                    if (isEmptyStr(result.disabledRegisterReason)) {
                        reason = '无原因'
                    } else {
                        reason = result.disabledRegisterReason
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
                                const info = getGeoInfo(global.getClientIp(req))
                                global.User.create({
                                    name: req.body.username,
                                    account: req.body.account,
                                    password: bcrypt.hashSync(req.body.password, 10),
                                    register_ip: globals.getClientIp(req),
                                    register_province: info.region,
                                    register_city: info.city,
                                    register_isp: info.country,
                                    appid: req.body.id,
                                }).then((result) => {
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

exports.deleteUser = function (req, res) {
    res.send("Got a DELETE request at /user"); //发送各种类型的响应
}
