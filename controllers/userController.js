require('../function/dayjs')
const global = require("../global/index")
const { validationResult } = require("express-validator");
const globals = require("../global");
const bcrypt = require("bcrypt");
const res = require("express/lib/response");
const { isEmptyStr, getToken, redisClient, stringRandom } = require("../global");
const axios = require('axios')
const iconv = require("iconv-lite");
const path = require('path')
const { Op, where, or } = require("sequelize");
const fs = require('fs')
const { error } = require("console");
const { User } = require("../models/user");
const { Log } = require("../models/log");
const { RegisterLog } = require("../models/registerLog");
const { Token } = require("../models/token");
const { App } = require("../models/app");
const { Card } = require("../models/card");
const svgCaptcha = require('svg-captcha');
const dayjs = require("../function/dayjs");
const { getVip } = require("../function/getVip");
const { Daily } = require("../models/daily");
const http = require('http');
const socketIO = require('socket.io')
const { getNextCustomId } = require("../function/getNextCustomId");
const { CustomIdLog } = require("../models/customIdLog");
const { findUserInfo, findUserByPassword } = require("../function/findUser");
const { isVip } = require("../function/isVip");
const { token } = require("morgan");
const { Banner } = require("../models/banner");
const exp = require('constants');
const { VersionChannel } = require('../models/versionChannel');
const { versionChannelUser } = require('../models/versionChannelUser');
const { Version } = require("../models/version");
const { Site } = require("../models/sites");
const crypto = require('crypto');
const { Goods } = require('../models/goods');
const { Order } = require('../models/goods/order');
const { SiteAudit } = require("../models/user/siteAudits");
const { SiteAward } = require("../models/user/siteAward");
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
            code: '201', message: '用户未授权', region: [{ result: result, ip: global.getClientIp(req) }]
        })
        return
    }

    // 如果请求已授权，查询所有用户数据
    await User.findAll().then(result => {
        // 返回查询成功的所有用户数据
        res.json({
            code: "200", message: "获取所有数据成功", // 发送json数据类型
            list: JSON.stringify(result, null, 2),
        });
    }).catch(error => {
        // 如果查询失败，返回错误信息
        res.json({
            code: "500", message: error,
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
exports.register = async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const [{ msg }] = errors.errors;
        return res.json({ code: 400, message: msg });
    }

    const appId = req.params.appid || req.body.appid;
    const app = await App.findByPk(appId);
    if (!app) {
        return res.json({ code: 400, message: '无法找到该应用' });
    }

    if (!app.registerStatus) {
        const reason = isEmptyStr(app.disabledRegisterReason) ? '无原因' : app.disabledRegisterReason;
        return res.json({ code: 400, message: '应用已暂停注册', data: { reason } });
    }

    const { account, username, password, invite_code, markcode } = req.body;

    const userExists = await User.count({ where: { account } });
    if (userExists >= 1) {
        return res.json({ code: 401, message: '用户已存在' });
    }

    if (app.registerCheckIp) {
        const ipExists = await User.count({ where: { register_ip: req.clientIp } });
        if (ipExists >= 1) {
            return res.json({ code: 401, message: 'IP已注册过账号' });
        }
    }

    let userConfig;
    const info = await global.lookupAllGeoInfo(req.clientIp);

    if (app.register_award === 'integral') {
        userConfig = {
            name: username,
            account: account,
            password: bcrypt.hashSync(password, 10),
            register_ip: req.clientIp,
            register_province: info.provinceName,
            register_city: info.cityNameZh,
            register_isp: info.autonomousSystemOrganization,
            appid: appId,
            integral: app.register_award_num,
            invite_code: stringRandom(16),
            markcode: markcode
        };
    } else {
        userConfig = {
            name: username,
            account: account,
            password: bcrypt.hashSync(password, 10),
            register_ip: req.clientIp,
            register_province: info.provinceName,
            register_city: info.cityNameZh,
            register_isp: info.autonomousSystemOrganization,
            appid: appId,
            invite_code: stringRandom(16),
            vip_time: dayjs().add(app.register_award_num, 'm').unix(),
            markcode: markcode
        };
    }

    if (invite_code) {
        const inviter = await User.findOne({ where: { invite_code, appid: appId } });
        if (!inviter) {
            return res.json({ code: 400, message: '邀请码无效' });
        }

        userConfig.parent_invite_account = inviter.account;
        if (app.invite_award === 'integral') {
            userConfig.integral = (userConfig.integral || 0) + app.invite_award_num;
        } else {
            userConfig.vip_time = dayjs(userConfig.vip_time || dayjs()).add(app.invite_award_num, 'm').valueOf();
        }
    }

    try {
        const newUser = await User.create(userConfig);
        await Log.create({
            log_type: 'register',
            log_content: global.logString('register', req.clientIp, markcode, global.moment().format('YYYY-MM-DD HH:mm:ss')),
            log_ip: req.clientIp,
            log_time: dayjs().toDate(),
            log_user_id: newUser.account,
            appid: appId,
            UserId: newUser.id
        });
        const customId = await getNextCustomId(appId, newUser.id);
        await newUser.update({ customId: customId });
        await RegisterLog.create({
            user_id: newUser.account,
            register_time: dayjs().toDate(),
            register_ip: req.clientIp,
            register_address: `${info.provinceName} ${info.cityNameZh}`,
            register_isp: info.autonomousSystemOrganization,
            appid: appId,
            register_device: markcode
        });
        res.status(200).json({
            code: 200, message: '用户注册成功', result: {
                account: newUser.account,
                customId: newUser.customId,
                password: newUser.password,
                avatar: newUser.avatar,
                name: newUser.username,
                register_ip: newUser.register_ip,
                register_time: newUser.register_time,
                vip_time: newUser.vip_time,
            }
        });
    } catch (err) {
        res.json({ code: 500, message: '用户注册失败', error: err.message });
    }
};

exports.devices = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        findUserInfo(req, res, (token, user, app) => {
            const whereCondition = {
                appid: token.appid, // appid 是必需的
            };

            if (token.account) {
                whereCondition.account = token.account;
            }
            if (token.open_qq) {
                whereCondition.open_qq = token.open_qq;
            }
            if (token.open_wechat) {
                whereCondition.open_wechat = token.open_wechat;
            }
            Token.findAll({
                where: whereCondition
            }).then(result => {
                return res.status(200).json({
                    code: 200, message: '已找到所有设备', data: result
                })
            })
        })
    }
}

exports.deleteDevice = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app == null) {
                return res.json({
                    code: 400, message: '无法找到该应用'
                })
            }
            if (app instanceof App) {
                Token.findOne({
                    where: {
                        token: req.body.token, markcode: req.body.markcode, appid: req.body.appid
                    }
                }).then(result => {
                    if (result == null) {
                        res.json({
                            code: 201, message: '该登录状态不存在'
                        })
                    } else {
                        result.destroy().then(async result => {
                            await redisClient.del(req.body.token)
                            res.status(200).json({
                                code: 200, message: '登出成功', data: {
                                    account: result.account, token: result.token, markcode: result.markcode
                                }
                            })
                        }).catch(error => {
                            res.json({
                                code: 201, message: '登出失败', error: error.message
                            })
                        })
                    }
                }).catch(error => {
                    res.json({
                        code: 201, message: error.message
                    })
                })
            }

        }).catch(error => {
            res.json({
                code: 500, message: '查找应用出错', error: error
            })
        })
    }
}

exports.logout = async function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 404, msg: msg,
        })
    } else {
        const token = getToken(req.headers.authorization)
        await App.findByPk(req.params.appid || req.body.appid).then(app => {
            if (app == null) {
                return res.json({
                    code: 400, message: '无法找到该应用'
                })
            }
            if (app instanceof App) {
                Token.findOne({
                    where: {
                        token: token, markcode: req.body.markcode, appid: req.body.appid
                    }
                }).then(result => {
                    if (result == null) {
                        res.json({
                            code: 201, message: '该登录状态不存在'
                        })
                    } else {
                        result.destroy().then(async result => {
                            await redisClient.del(token)
                            return res.status(200).json({
                                code: 200, message: '登出成功', data: [{
                                    account: result.account, token: result.token, markcode: result.markcode
                                }]
                            })
                        }).catch(error => {
                            res.json({
                                code: 201, message: '登出失败', error: error.message
                            })
                        })
                    }
                }).catch(error => {
                    res.json({
                        code: 201, message: error.message
                    })
                })
            }

        }).catch(error => {
            res.json({
                code: 500, message: '查找应用出错', error: error
            })
        })
    }
}

exports.delete = async function (req, res, next) {

}

const generateEncryptedUserId = (userId) => {
    return crypto.createHash('sha256').update(userId.toString()).digest('hex');
};

exports.uploadAvatar = async function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        const token = getToken(req.headers.authorization)
        await App.findByPk(req.params.appid || req.body.appid).then(async app => {
            if (app == null) {
                return res.json({
                    code: 400, message: '无法找到该应用'
                })
            }
            if (app instanceof App) {
                await Token.findOne({
                    where: {
                        token: token, appid: req.body.appid
                    }
                }).then(async user => {
                    if (user == null) {
                        return res.json({
                            code: 400, message: '无法找到该登录状态'
                        })
                    } else {
                        if (user instanceof Token) {
                            if (!req.files) {
                                return res.json({
                                    code: 400, message: '没有上传文件'
                                })
                            } else {
                                try {
                                    let fileName;
                                    let uploadPath;
                                    console.log(req.files);
                                    fileName = req.files.file;
                                    uploadPath = 'public/avatars/' + generateEncryptedUserId(user.account) + path.extname(fileName.name);
                                    await fileName.mv(uploadPath, function (err) {
                                        if (err) {
                                            res.json({
                                                code: 201, message: '上传失败', error: err.message
                                            })
                                        } else {
                                            User.findOne({
                                                where: {
                                                    id: user.account, appid: req.body.appid
                                                }
                                            }).then(user => {
                                                user.update({
                                                    avatar: process.env.BASE_SERVER_URL + '/avatars/' + path.basename(uploadPath)
                                                }).then(result => {
                                                    res.status(200).json({
                                                        code: 200, message: '上传成功', data: [{
                                                            avatar: result.avatar
                                                        }]
                                                    })
                                                }).catch(error => {
                                                    res.json({
                                                        code: 201, message: '更新用户失败', error: error.message
                                                    })
                                                })
                                            }).catch(error => {
                                                res.json({
                                                    code: 201, message: '查找用户出错', error: error.message
                                                })
                                            })
                                        }
                                    });
                                    //res.send('successfully')
                                } catch (error) {
                                    res.json({
                                        code: 201, message: '上传失败', error: error.message
                                    })
                                }

                            }
                        } else {
                            res.json({
                                code: 201, message: '无法找到该用户'
                            })
                            console.log(req.body.token)
                        }
                    }
                }).catch(error => {
                    res.json({
                        code: 201, message: error.message
                    })
                })
            }

        }).catch(error => {
            res.json({
                code: 500, message: '查找应用出错', error: error
            })
        })
    }
}

exports.daily = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors;
        return res.json({
            code: 400, message: msg,
        });
    }

    const token = getToken(req.headers.authorization);

    try {
        const app = await App.findOne({ where: { id: req.body.appid } });
        if (!app) {
            return res.json({
                code: 404, message: '无法找到该应用',
            });
        }

        const tokens = await Token.findOne({ where: { token: token, appid: req.body.appid } });
        if (!tokens) {
            return res.json({
                code: 404, message: '无效的令牌',
            });
        }

        const whereCondition = {
            appid: req.body.appid, // appid 是必需的
        };
        if (tokens.account) {
            whereCondition.id = tokens.account;
        }
        if (tokens.open_qq) {
            whereCondition.open_qq = tokens.open_qq;
        }
        if (tokens.open_wechat) {
            whereCondition.open_wechat = tokens.open_wechat;
        }

        const user = await User.findOne({ where: whereCondition });
        if (!user) {
            return res.json({
                code: 404, message: '无法找到该用户',
            });
        }

        const startOfDay = dayjs().startOf('day').toDate();
        const endOfDay = dayjs().endOf('day').toDate();

        const existingDaily = await Daily.findOne({
            where: {
                userId: user.id, date: {
                    [Op.between]: [startOfDay, endOfDay],
                }, appid: req.body.appid,
            },
        });

        if (existingDaily) {
            return res.status(200).json({
                code: 200, message: '已经签到过了',
            });
        }

        // 创建签到记录
        const daily = await Daily.create({
            userId: user.id, date: dayjs().toDate(), integral: app.daily_award_num, appid: req.body.appid,
        });

        // 更新用户记录
        let userConfig = {};
        if (app.daily_award === 'integral') {
            userConfig.integral = user.integral + app.daily_award_num;
        } else {
            userConfig.vip_time = dayjs(user.vip_time).add(app.daily_award_num, 'm').toDate();
        }

        await user.update(userConfig);

        // 创建日志记录
        const log = await Log.create({
            log_user_id: user.account,
            appid: req.body.appid,
            log_type: 'daily',
            log_ip: req.clientIp,
            open_qq: user.open_qq,
            open_wechat: user.open_wechat,
            log_content: global.logString('daily', req.clientIp, user.markcode, dayjs().format('YYYY-MM-DD HH:mm:ss')),
            UserId: user.id,
        });

        return res.status(200).json({
            code: 200, message: '签到成功', data: {
                account: user.account,
                integral: user.integral,
                vip_time: dayjs(user.vip_time).format('YYYY-MM-DD HH:mm:ss'),
                daily_time: dayjs(daily.date).format('YYYY-MM-DD HH:mm:ss'),
            },
        });
    } catch (error) {
        console.error('Error processing daily check-in:', error);
        return res.json({
            code: 500, message: '内部服务器错误', error: error.message,
        });
    }
};

exports.useCard = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors;
        return res.json({
            code: 400, message: msg,
        });
    }

    try {
        const token = getToken(req.headers.authorization);
        const app = await App.findByPk(req.body.appid);

        if (!app) {
            return res.json({
                code: 404, message: '应用未找到',
            });
        }

        const card = await Card.findOne({
            where: {
                card_code: req.body.card_code, appid: req.body.appid,
            },
        });

        if (!card) {
            return res.json({
                code: 404, message: '卡密不存在',
            });
        }

        if (dayjs(card.card_code_expire).isBefore(dayjs())) {
            return res.json({
                code: 400, message: '该卡已过期',
            });
        }

        if (card.card_status === 'used') {
            return res.json({
                code: 400, message: '该卡已使用',
            });
        }

        const tokenRecord = await Token.findOne({
            where: {
                token: token, appid: req.body.appid,
            },
        });

        if (!tokenRecord) {
            return res.json({
                code: 404, message: '无法找到该登录状态',
            });
        }

        // 动态构建查询条件
        const whereCondition = {
            appid: req.body.appid,
        };

        if (tokenRecord.account) whereCondition.id = tokenRecord.account;
        if (tokenRecord.open_qq) whereCondition.open_qq = tokenRecord.open_qq;
        if (tokenRecord.open_wechat) whereCondition.open_wechat = tokenRecord.open_wechat;

        const user = await User.findOne({ where: whereCondition });

        if (!user) {
            return res.json({
                code: 404, message: '无法找到该用户',
            });
        }

        // 记录卡券使用日志
        await Log.create({
            log_type: 'card_use',
            log_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            log_content: global.logString('card_use', user.account, dayjs().format('YYYY-MM-DD HH:mm:ss'), card.card_code),
            log_ip: req.clientIp,
            log_user_id: user.account,
            appid: req.body.appid,
        });

        let responseMessage = '使用成功';
        let responseData = {};

        if (card.card_type === 'integral') {
            // 更新用户积分
            user.integral += card.card_award_num;
            await user.save();

            // 记录积分增加日志
            await Log.create({
                log_type: 'integral_add',
                log_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                log_content: global.logString('integral_add', user.account, dayjs().format('YYYY-MM-DD HH:mm:ss'), card.card_code, card.card_award_num, user.integral),
                log_ip: req.clientIp,
                log_user_id: user.account,
                appid: req.body.appid,
            });

            responseData.integral = user.integral;
        } else {
            // 更新用户 VIP 时间
            if (user.vip_time === 999999999) {
                return res.json({
                    code: 400, message: '该用户已是永久会员',
                });
            }

            if (user.vip_time === 0 || !user.vip_time || dayjs().isAfter(dayjs.unix(user.vip_time))) {
                user.vip_time = dayjs.unix();
            }

            if (card.card_award_num >= 99999) {
                user.vip_time = 999999999;
            } else {
                // 检查 vip_time 是 Unix 时间戳还是 Date 对象
                const currentVipTime = dayjs.unix(user.vip_time);

                // 添加天数到 VIP 时间
                const newVipTime = currentVipTime.add(card.card_award_num, 'day').unix();


                user.vip_time = newVipTime;
            }

            await user.save();

            // 记录 VIP 时间增加日志
            await Log.create({
                log_type: 'vip_time_add',
                log_time: dayjs().toDate(),
                log_content: global.logString('vip_time_add', user.account, dayjs().format('YYYY-MM-DD HH:mm:ss'), card.card_code, card.card_award_num, dayjs.unix(user.vip_time).format('YYYY-MM-DD HH:mm:ss')),
                log_ip: req.clientIp,
                log_user_id: user.account,
                appid: req.body.appid,
            });

            responseData.vip_time = dayjs.unix(user.vip_time).format('YYYY-MM-DD HH:mm:ss');
        }

        // 更新卡券状态
        await card.update({
            card_status: 'used', used_time: dayjs().toDate(), account: user.id, card_use_time: dayjs().toDate(),
        });

        return res.status(200).json({
            code: 200, message: responseMessage, data: responseData,
        });
    } catch (error) {
        console.error('Error using card:', error);
        return res.json({
            code: 500, message: '服务器错误', error: error.message,
        });
    }
};

exports.sendMail = function (req, res) {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        App.findByPk(req.body.appid).then(async app => {
            if (app != null) {
                if (app.status) {
                    if (!isEmptyStr(app.smtpHost) && !isEmptyStr(app.smtpUser) && !isEmptyStr(app.smtpPassword) && !isEmptyStr(app.smtpPort)) {
                        Token.findOne({
                            where: {
                                token: req.body.token, appid: req.body.appid,
                            }
                        }).then(async token => {
                            if (token != null) {
                                User.findOne({
                                    where: {
                                        account: token.account, appid: req.body.appid,
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
                                                    return res.status(409).json({ msg: '请不要重复发起请求，15分钟后可以再次发起。' });
                                                }
                                                // 创建nodemailer transporter
                                                const transporter = global.nodemailer.createTransport({
                                                    host: app.smtpHost,
                                                    port: app.smtpPort,
                                                    secure: app.smtpSecure,
                                                    auth: {
                                                        user: app.smtpUser, pass: app.smtpPassword,
                                                    },
                                                });
                                                const sendVerificationEmail = async (to, verificationCode) => {
                                                    const templatePath = path.join(__dirname, '../template/theme.ejs');
                                                    const template = fs.readFileSync(templatePath, 'utf-8');
                                                    const html = global.ejs.render(template, {
                                                        username: user.name, verificationCode, senderName: app.name
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
                                                        return res.status(200).json({ msg: '验证电子邮件已成功发送。' });
                                                    } catch (error) {
                                                        console.error('发送电子邮件时出错：', error);
                                                        await global.redisClient.disconnect();
                                                        return res.json({ msg: '发送电子邮件时出错：' + error });
                                                    }
                                                };

                                                const storeVerificationCode = async (email, code) => {
                                                    await global.redisClient.set(email, code, {
                                                        EX: 60 * 15, NX: true,
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
                                        return res.json({
                                            code: 201, message: '无法找到该用户'
                                        })
                                    }
                                }).catch(error => {
                                    console.error(error)
                                })
                            } else {
                                return res.json({
                                    code: 201, message: '登录状态不存在'
                                })
                            }
                        }).catch(error => {
                            return res.json({
                                code: 201, message: '查找登录状态出错', error: error.message
                            })
                        })
                    } else {
                        return res.json({
                            code: 201, message: '请先配置邮件服务器'
                        })
                    }
                } else {
                    return res.json({
                        code: 201, message: '该应用已禁用'
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
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        App.findByPk(req.body.appid).then(async app => {
            if (app === null) {
                return res.json({
                    code: 201, message: '无法找到该应用'
                })
            } else {
                if (!app.status) {
                    return res.json({
                        code: 201, message: '该应用已禁用'
                    })
                } else {
                    if (!isEmptyStr(app.smtpHost) && !isEmptyStr(app.smtpUser) && !isEmptyStr(app.smtpPassword) && !isEmptyStr(app.smtpPort)) {
                        Token.findOne({
                            where: {
                                token: req.body.token, appid: req.body.appid,
                            }
                        }).then(async token => {
                            if (token === null) {
                                return res.json({
                                    code: 201, message: '无法找到该登录状态'
                                })
                            } else {
                                User.findOne({
                                    where: {
                                        id: token.account, appid: req.body.appid,
                                    }
                                }).then(async user => {
                                    if (user === null) {
                                        return res.json({
                                            code: 201, message: '无法找到该用户'
                                        })
                                    } else {
                                        await global.redisClient.connect();
                                        const result = await global.redisClient.get(req.body.email);
                                        // 已存在此邮箱数据
                                        if (result) {
                                            if (result === req.body.verify_code) {
                                                if (bcrypt.compareSync(req.body.new_password, user.password)) {
                                                    res.json({
                                                        code: 201, msg: '新密码不能与旧密码相同'
                                                    });
                                                    return global.redisClient.disconnect()
                                                } else {
                                                    await user.update({
                                                        password: bcrypt.hashSync(req.body.new_password, 10)
                                                    }).then(async () => {
                                                        res.status(200).json({
                                                            code: 200, msg: '密码修改成功'
                                                        });
                                                    }).catch(error => {
                                                        res.json({
                                                            code: 201, message: '修改密码出错', error: error.message
                                                        })
                                                    })
                                                    return global.redisClient.disconnect();
                                                }
                                            } else {
                                                res.json({
                                                    code: 201, msg: '验证码错误'
                                                });
                                                return global.redisClient.disconnect()
                                            }
                                        } else {
                                            res.json({
                                                code: 201, msg: '未向该邮箱发送验证码，请检查邮箱是否正确。'
                                            });
                                            return global.redisClient.disconnect()
                                        }
                                    }
                                }).catch(error => {
                                    return res.json({
                                        code: 201, message: '查找用户出错', error: error.message
                                    })
                                })
                            }
                        }).catch(error => {
                            return res.json({
                                code: 201, message: '无法找到该登录状态'
                            })
                        })
                    } else {
                        return res.json({
                            code: 201, message: '该应用未配置邮件服务器'
                        })
                    }
                }
            }
        })
    }
}


exports.verifyVip = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 400, msg: msg,
        })
    } else {
        findUserInfo(req, res, (token, user) => {
            if (!isVip(user.vip_time)) {
                return res.json({
                    code: 201, message: '用户不是会员'
                })
            }

            return res.json({
                code: 200, message: '用户是会员'
            })
        })
    }
}

exports.my = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 404, message: msg,
        })
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            const isMember = isVip(user.vip_time);
            user.vip_time = getVip(user.vip_time)
            try {
                let effectiveCustomIdLimit;
                let userStatus;
                if (isMember) {
                    userStatus = 'vip';
                } else {
                    userStatus = 'normal';
                }

                if (isMember) {
                    // 会员用户，优先使用app.viperCustomIdCount
                    effectiveCustomIdLimit = app.viperCustomIdCount;
                    // 如果user.customIdCount和app.viperCustomIdCount不相等，选择较大的一个
                    if (user.customIdCount !== app.viperCustomIdCount) {
                        effectiveCustomIdLimit = Math.max(user.customIdCount, app.viperCustomIdCount);
                    }
                } else {
                    // 普通用户，优先使用app.normalCustomIdCount
                    effectiveCustomIdLimit = app.normalCustomIdCount;
                    // 如果user.customIdCount和app.normalCustomIdCount不相等，选择较大的一个
                    if (user.customIdCount !== app.normalCustomIdCount) {
                        effectiveCustomIdLimit = Math.max(user.customIdCount, app.normalCustomIdCount);
                    }
                }

                const startOfDay = dayjs().startOf('day').toDate();
                const endOfDay = dayjs().endOf('day').toDate();

                const existingDaily = await Daily.findOne({
                    where: {
                        userId: user.id, date: {
                            [Op.between]: [startOfDay, endOfDay],
                        }, appid: req.body.appid,
                    },
                });

                let isDaily = false;

                if (existingDaily) {
                    isDaily = true
                }

                let needSetup = false;

                if (!user.account || !user.password) {
                    needSetup = true
                }

                const customIdChangeCount = await CustomIdLog.findAndCountAll({
                    where: {
                        userId: user.id, appid: req.body.appid
                    }, replacements: {
                        userStatus: userStatus
                    }
                });
                user.customIdCount = effectiveCustomIdLimit - customIdChangeCount.count;

                return res.status(200).json({
                    code: 200, message: '获取成功', data: user, counts: {
                        customIdCount: user.customIdCount,
                        customIdChangeCount: customIdChangeCount.count,
                        records: customIdChangeCount.rows,
                    }, isMember: isMember, isDaily: isDaily, needSetup: needSetup,
                });
            } catch (e) {
                return res.json({
                    code: 500, msg: '服务器错误', err: e.message
                });
            }
        })
    }
}

exports.dailyRank = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors;
        return res.json({
            code: 400, message: msg,
        });
    }

    const { appid } = req.body;
    const token = getToken(req.headers.authorization);

    try {
        const tokenRecord = await Token.findOne({ where: { token: token, appid: appid } });
        if (!tokenRecord) {
            return res.json({
                code: 404, message: '无法找到该登录状态'
            });
        }

        const startOfToday = dayjs().startOf('day').toDate();
        const endOfToday = dayjs().endOf('day').toDate();

        const dailyLogs = await Daily.findAndCountAll({
            where: {
                appid: appid, date: {
                    [Op.between]: [startOfToday, endOfToday],
                },
            }, order: [['date', 'ASC']], attributes: ['date'], include: [{
                model: User, attributes: ['avatar', 'name', 'id'],
            }],
        });

        if (dailyLogs.count === 0) {
            return res.json({
                code: 404, message: '无法找到该用户'
            });
        }

        // 格式化日期并修改字段名为 time
        const formattedLogs = dailyLogs.rows.map(log => ({
            log_time: dayjs(log.date).format('YYYY-MM-DD HH:mm:ss'), User: {
                avatar: log.User.avatar, name: log.User.name, id: log.User.id
            }
        }));

        return res.json({
            code: 200, message: '获取签到排行榜成功', data: formattedLogs
        });
    } catch (error) {
        console.error('Error fetching daily rank:', error);
        return res.json({
            code: 500, message: '内部服务器错误', error: error.message,
        });
    }
};

exports.integralRank = (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 404, msg: msg,
        })
    } else {
        const { appid } = req.body
        const token = getToken(req.headers.authorization)
        Token.findOne({
            where: {
                token: token, appid: appid,
            }
        }).then(async token => {
            if (token === null) {
                return res.json({
                    code: 404, message: '无法找到该登录状态'
                })
            } else {
                const page = parseInt(req.body.page) || 1; // 当前页码
                const pageSize = parseInt(req.body.pageSize) || 50; // 每页记录数
                const offset = (page - 1) * pageSize; // 计算偏移量
                try {
                    const { count, rows } = await User.findAndCountAll({
                        limit: pageSize,
                        offset: offset,
                        order: [['integral', 'DESC'],],
                        attributes: ['avatar', 'name', 'id', 'integral', 'customId'],
                    });
                    return res.json({
                        code: 200,
                        message: "获取成功",
                        total: count,
                        pages: Math.ceil(count / pageSize),
                        currentPage: page,
                        pageSize: pageSize,
                        rank: rows,
                    });
                } catch (error) {
                    console.error('Error fetching logs:', error);
                    return res.json({ code: 404, message: 'An error occurred while fetching logs.' });
                }
            }
        })
    }
}

exports.getCaptcha = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 404, msg: msg,
        })
    } else {
        const { appid } = req.body
        try {
            const app = await App.findByPk(appid)
            if (!app) {
                return res.json({
                    code: 404, msg: '无法找到该应用',
                })
            }
            const captcha = await svgCaptcha.create({
                size: 6, // 验证码长度
                ignoreChars: '0o1i', // 排除一些容易混淆的字符
                noise: 4, // 干扰线条数
                color: true, // 验证码是否有颜色
                background: '#cc9966', // 背景颜色
            });
            req.session.captcha = captcha.text; // 将验证码文本存储在会话中
            req.session.cookie.expires = new Date(Date.now() + app.registerCaptchaTimeOut * 60 * 1000);
            req.session.cookie.maxAge = app.registerCaptchaTimeOut * 60 * 1000;

            res.type('svg'); // 返回的数据类型
            res.status(200).send(captcha.data); // 返回验证码svg数据
        } catch (e) {
            return res.json({
                code: 404, msg: '服务器出现错误', err: e
            })
        }
    }
};

exports.updateCustomId = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors;
        return res.json({
            code: 404, message: msg,
        });
    }

    const { appid, customId } = req.body;
    const token = getToken(req.headers.authorization);

    try {
        const app = await App.findByPk(appid);

        if (!app) {
            return res.json({
                code: 404, message: '无法找到该应用',
            });
        }

        const tokens = await Token.findOne({
            where: {
                token: token, appid: appid,
            }
        });

        if (!tokens) {
            return res.json({
                code: 404, message: '无法找到该登录状态'
            });
        }

        const whereCondition = {
            appid: appid,
        };

        if (tokens.account) {
            whereCondition.id = tokens.account;
        }
        if (tokens.open_qq) {
            whereCondition.open_qq = tokens.open_qq;
        }
        if (tokens.open_wechat) {
            whereCondition.open_wechat = tokens.open_wechat;
        }

        const user = await User.findOne({
            where: whereCondition,
        });

        if (!user) {
            return res.json({
                code: 404, msg: '无法找到该用户'
            });
        }

        const isExists = await User.findAndCountAll({
            where: {
                customId: customId
            }
        });

        const isMember = await isVip(user.vip_time);
        let userStatus;
        if (isMember) {
            userStatus = 'vip';
        } else {
            userStatus = 'normal';
        }

        const customIdChangeCount = await CustomIdLog.findAndCountAll({ where: { userId: user.id, appid, userStatus } });

        let effectiveCustomIdLimit;

        if (isMember) {
            // 会员用户，优先使用app.viperCustomIdCount，然后再使用user.customIdCount
            effectiveCustomIdLimit = user.customIdCount > app.viperCustomIdCount ? user.customIdCount : app.viperCustomIdCount;
        } else {
            // 普通用户，优先使用app.normalCustomIdCount，然后再使用user.customIdCount
            effectiveCustomIdLimit = user.customIdCount > app.normalCustomIdCount ? user.customIdCount : app.normalCustomIdCount;
        }

        if (customIdChangeCount.count >= effectiveCustomIdLimit) {
            return res.json({
                code: 404, message: '您的ID修改次数已达上限'
            });
        } else {
            if (isExists.count > 0) {
                return res.json({
                    code: 200, message: '自定义ID已存在'
                });
            }
            const customIdLog = await CustomIdLog.create({
                userId: user.id, appid: appid, customId: customId, userStatus: userStatus,
            });

            user.customId = customId;
            await user.save();

            return res.json({
                code: 200, message: '修改成功', data: customIdLog
            });
        }
    } catch (e) {
        return res.json({
            code: 500, message: '服务器出现错误', err: e.message
        });
    }
};

exports.searchUser = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors;
        return res.json({
            code: 404, msg: msg,
        });
    } else {
        const { appid, keyword, page = 1, pageSize = 100 } = req.body;
        const token = getToken(req.headers.authorization);
        try {
            const app = await App.findByPk(appid);
            const tokens = await Token.findOne({
                where: {
                    token: token, appid: appid,
                }
            });
            if (!tokens) {
                return res.json({
                    code: 404, msg: '无法找到该登录状态'
                });
            }
            if (!app) {
                return res.json({
                    code: 404, msg: '无法找到该应用',
                });
            }

            // 计算偏移量
            const offset = (page - 1) * pageSize;

            // 获取总记录数
            const totalRecords = await User.count({
                where: {
                    appid: appid, [Op.or]: [{ name: { [Op.like]: `%${keyword}%` } }, { customId: { [Op.like]: `%{keyword}%` } }]
                }
            });

            // 计算总页数
            const totalPages = Math.ceil(totalRecords / pageSize);

            const users = await User.findAndCountAll({
                where: {
                    appid: appid,
                    [Op.or]: [{ name: { [Op.like]: `%${keyword}%` } }, { customId: { [Op.like]: `%${keyword}%` } }]
                }, attributes: ['customId', 'name', 'avatar'], limit: pageSize, offset: offset
            });

            if (users.count === 0) {
                return res.json({
                    code: 404, msg: '没有找到用户',
                });
            }

            return res.status(200).json({
                code: 200,
                message: '搜索成功',
                data: users.rows,
                current_page: page,
                current_records: users.count,
                total_pages: totalPages,
                total_records: totalRecords
            });
        } catch (e) {
            return res.json({
                code: 500, msg: '服务器出现错误', err: e.message
            });
        }
    }
};

exports.setUpdateUser = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors;
        return res.json({
            code: 404, message: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user) => {
            if (!user.account) {
                user.account = req.body.account;
            }

            if (!user.password) {
                user.password = bcrypt.hashSync(req.body.password, 10);
            }

            await user.save();
            res.json({
                code: 200, message: '用户设置成功', data: user
            });
        });
    }
};


exports.banner = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }
    try {
        const app = await App.findByPk(req.query.appid)
        if (!app) {
            return res.json({
                code: 404, message: "无法找到该应用"
            })
        }
        const banners = await Banner.findAndCountAll({
            where: {
                appid: app.id
            }, attributes: ['header', 'title', 'content', 'url', 'type']
        })
        if (banners.count <= 0) {
            return res.json({
                code: 404, message: "该应用暂无广告"
            })
        }
        return res.json({
            code: 200, message: "成功获取广告列表", data: banners.rows
        })
    } catch (e) {
        return res.json({
            code: 404, message: "服务器内部错误"
        })
    }
}

exports.analyzer = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 200, message: msg
        })
    }
    findUserInfo(req, res, async (token, user) => {
        if (!isVip(user.vip_time)) {
            return res.json({
                code: 404, message: "该用户不是会员用户"
            })
        }

        const response = await axios.get("https://proxy.layzz.cn/lyz/getAnalyse", {
            params: {
                token: "uewqwwuic-qackd-fga-zycy51", link: req.body.link
            }
        }, {})

        if (!response) {
            return res.json({
                code: 404, message: "获取数据失败"
            })
        }

        if (response.data.code !== "0001") {
            return res.json({
                code: 404, message: response.data.message
            })
        }

        return res.json({
            code: 200, message: "获取数据成功", data: response.data.data
        })

    })
}

exports.createSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserInfo(req, res, async (token, user) => {

        const isContains = await Site.findOne({
            where: {
                appid: req.body.appid,
                userId: user.id,
                [Op.or]: [{ name: { [Op.like]: `%${req.body.name}%` } }, { url: { [Op.like]: `%${req.body.url}%` } }]
            }
        })

        if (isContains) {
            return res.json({
                code: 404, message: "该站点已存在"
            })
        }

        const site = await Site.create({
            appid: req.body.appid,
            header: req.body.image || "",
            name: req.body.name,
            url: req.body.url,
            description: req.body.description || "",
            type: req.body.type,
            userId: user.id,
        })

        await SiteAudit.create({
            site_id: site.id, userId: user.id, appId: req.body.appid,
        })

        return res.json({
            code: 200, message: "创建成功，请等待审核。", data: site
        })
    })

}

exports.siteList = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserInfo(req, res, async (token, user) => {
        const sites = await Site.findAndCountAll({
            where: {
                appid: user.appid, status: 'normal'
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }], order: [['createdAt', 'DESC']]
        })

        if (sites.count <= 0) {
            return res.json({
                code: 404, message: "暂无数据"
            })
        }
        return res.json({
            code: 200, message: "获取成功", data: sites.rows
        })
    })
}


exports.getSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserInfo(req, res, async (token, user) => {
        const sites = await Site.findAndCountAll({
            where: {
                userId: user.id, appid: req.body.appid
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }], include: [{
                model: App, attributes: ['name']
            }]
        })

        if (sites.count <= 0) {
            return res.json({
                code: 404, message: "暂无数据"
            })
        }

        return res.json({
            code: 200, message: "获取成功", data: sites.rows
        })
    })
}

exports.searchSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors;
        return res.json({
            code: 400, message: msg
        });
    }

    const page = Math.abs(parseInt(req.body.page)) || 1;
    const pageSize = Math.abs(parseInt(req.body.pageSize)) || 50;
    const offset = (page - 1) * pageSize;

    findUserInfo(req, res, async (token, user) => {
        const sites = await Site.findAndCountAll({
            where: {
                appid: req.body.appid,
                status: 'normal',
                [Op.or]: [{ name: { [Op.like]: `%${req.body.keyword}%` } }, { url: { [Op.like]: `%${req.body.keyword}%` } }, { description: { [Op.like]: `%${req.body.keyword}%` } }]
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }], limit: pageSize, offset: offset
        });

        if (sites.count <= 0) {
            return res.json({
                code: 404, message: "暂无数据"
            });
        }

        const totalPages = Math.ceil(sites.count / pageSize);

        return res.json({
            code: 200,
            message: "获取成功",
            data: sites.rows,
            currentPage: page,
            pageSize: sites.count,
            totalPages: totalPages,
            totalCount: sites.count
        });
    });
};

exports.deleteSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserInfo(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.body.id, userId: user.id, appid: req.body.appid
            }
        })

        if (!site) {
            return res.json({
                code: 404, message: "无法找到该站点"
            })
        }

        if (site.userId !== user.id) {
            return res.json({
                code: 404, message: "无法删除该站点，原因是您不是该站点的创建者"
            })
        }

        await site.destroy()

        return res.json({
            code: 200, message: "删除成功"
        })
    })
}

exports.updateSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserInfo(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.body.id, userId: user.id, appid: req.body.appid
            }
        })

        if (!site) {
            return res.json({
                code: 404, message: "无法找到该站点"
            })
        }

        if (site.userId !== user.id) {
            return res.json({
                code: 404, message: "无法更新该站点，原因是您不是该站点的创建者"
            })
        }
        site.header = req.body.image
        site.name = req.body.name
        site.url = req.body.url
        site.type = req.body.type
        site.description = req.body.description

        await site.save()

        return res.json({
            code: 200, message: "更新成功", data: site
        })
    })
}

exports.getSiteById = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }

    findUserInfo(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.query.id, userId: user.id, appid: req.query.appid
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }]
        })

        if (!site) {
            return res.json({
                code: 404, message: "无法找到该站点"
            })
        }

        return res.json({
            code: 200, message: "获取成功", data: site
        })
    })
}

exports.checkVersion = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }
    try {
        const token = getToken(req.headers.authorization)
        const { versionCode } = req.query
        const app = await App.findByPk(req.query.appid)

        if (!app) {
            return res.json({
                code: 404, message: "无法找到该应用"
            })
        }

        if (token) {
            findUserInfo(req, res, async (token, user, app) => {

                const count = await VersionChannel.findAndCountAll({
                    where: {
                        bindAppid: req.query.appid
                    }
                })


                if (count.count <= 0) {
                    return res.json({
                        code: 404, message: "该应用未配置版本渠道"
                    })
                }

                const channelUser = await versionChannelUser.findAndCountAll({
                    where: {
                        userId: user.id
                    }
                })

                if (channelUser.count <= 0) {
                    const version = await Version.findOne({
                        where: {
                            bindAppid: req.query.appid,
                            bindBand: app.defaultBand || 1,
                            [Op.or]: [{ version: { [Op.gt]: versionCode } }]
                        }
                    })

                    if (!version) {
                        return res.json({
                            code: 404, message: "暂无新版本信息"
                        })
                    }

                    return res.json({
                        code: 200, message: "有新版本", data: version
                    })
                }

                const version = await Version.findOne({
                    where: {
                        bindAppid: req.query.appid,
                        bindBand: channelUser.rows[0].channelId || 0,
                        [Op.or]: [{ version: { [Op.gt]: versionCode } }]
                    }
                })

                if (!version) {
                    return res.json({
                        code: 404, message: "暂无新版本信息"
                    })
                }

                if (version.version > versionCode) {
                    return res.json({
                        code: 200, message: "有新版本", data: version
                    })
                }
            })
        } else {

            const version = await Version.findOne({
                where: {
                    bindAppid: req.query.appid,
                    bindBand: app.defaultBand || 1,
                    [Op.or]: [{ version: { [Op.gt]: versionCode } }]
                }
            })

            if (!version) {
                return res.json({
                    code: 404, message: "暂无新版本信息"
                })
            }

            return res.json({
                code: 200, message: "有新版本", data: version
            })
        }
    } catch (error) {
        return res.json({
            code: 404, message: "服务器内部错误"
        })

    }
}

exports.devicesByPassword = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 404, msg: msg,
        })
    } else {
        findUserByPassword(req, res, async (user, app) => {
            const devices = await Token.findAndCountAll({
                where: {
                    account: user.id, appid: req.body.appid
                }, attributes: ['token', 'markcode', 'device', 'time']
            })

            if (devices.count <= 0) {
                return res.json({
                    code: 404, message: "该账号暂无登录设备信息"
                })
            }

            return res.json({
                code: 200, message: "获取成功", data: devices.rows
            })
        })
    }
}

exports.logoutDeviceByPassword = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 404, msg: msg,
        })
    } else {
        findUserByPassword(req, res, async (user, app) => {
            try {
                const device = await Token.findOne({
                    where: {
                        account: user.id,
                        appid: req.body.appid,
                        token: req.body.token,
                        markcode: req.body.markcode,
                        device: req.body.device
                    },
                })

                if (!device) {
                    return res.json({
                        code: 404, message: "无法找到该设备"
                    })
                }

                await device.destroy()

                return res.json({
                    code: 200, message: "注销成功", data: {
                        device
                    }
                })
            } catch (error) {
                return res.json({
                    code: 404, message: "服务器内部错误"
                })

            }
        })
    }
}

exports.modifyName = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors
        res.json({
            code: 404, message: msg,
        })
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            user.name = req.body.name
            await user.save()

            return res.json({
                code: 200, message: "修改成功", data: user
            })
        })
    }
}

exports.modifyPassword = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 404, msg: msg,
        })
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            if (bcrypt.compareSync(req.body.oldPassword, user.password)) {
                user.password = bcrypt.hashSync(req.body.newPassword, 10)
                await user.save()
                return res.json({
                    code: 200, message: "修改成功", data: user
                })
            } else {
                return res.json({
                    code: 404, message: "旧密码错误"
                })
            }
        })
    }
}

exports.getGoods = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 404, msg: msg,
        })
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            const goods = await Goods.findAndCountAll({
                where: {
                    bindAppid: req.body.appid
                }, attributes: ['name', 'integral', 'price', 'description', 'id', 'num', 'exchange_num', 'imageUrl']
            })

            if (goods.count <= 0) {
                return res.json({
                    code: 404, message: "暂无商品"
                })
            }

            return res.json({
                code: 200, message: "获取成功", data: goods.rows
            })
        })
    }
}

exports.order = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        res.json({
            code: 404, msg: msg,
        })
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            const goods = await Goods.findOne({
                where: {
                    id: req.body.goodsId, bindAppid: req.body.appid
                }
            })

            if (!goods) {
                return res.json({
                    code: 404, message: "无法找到该商品"
                })
            }

            if (goods.num <= goods.exchange_num) {
                return res.json({
                    code: 404, message: "商品已兑换完"
                })
            }

            const order = await Order.create({
                userId: user.id, goodsId: goods.id, appid: req.body.appid, orderNo: global.generateOrderNumber(),
            })

            if (user.integral < goods.integral) {
                return res.json({
                    code: 404, message: "积分不足"
                })
            }

            if (goods.payType === 'integral') {
                user.integral -= goods.integral
                order.price = goods.integral
                order.payType = 'integral'
                await order.save()
            }


            if (goods.award_type === 'vip') {
                if (user.vip_time === 999999999) {
                    await order.destroy()
                    return res.json({
                        code: 404, message: "该用户已是永久会员，无法再兑换该物品"
                    })
                }
                if (user.vip_time === 0 || !user.vip_time || dayjs().isAfter(dayjs.unix(user.vip_time))) {
                    user.vip_time = dayjs().unix();
                }
                if (goods.award_num >= 9999) {
                    user.vip_time = 999999999
                } else {
                    user.vip_time = dayjs.unix(user.vip_time).add(goods.award_num, 'day').unix()
                }
                order.num = goods.award_num
                order.status = 'success'
            }
            goods.num -= 1
            goods.exchange_num += 1

            await goods.save()
            await order.save()
            await user.save()

            return res.json({
                code: 200, message: "兑换成功"
            })
        })
    }
}

exports.mySites = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }
    findUserInfo(req, res, async (token, user, app) => {
        const sites = await Site.findAndCountAll({
            where: {
                userId: user.id, appid: req.body.appid
            }, attributes: ['header', 'name', 'url', 'type', 'description', 'id'], include: [{
                model: User, attributes: ['name', 'avatar']
            }]
        })

        if (sites.count <= 0) {
            return res.json({
                code: 404, message: "暂无数据"
            })
        }

        return res.json({
            code: 200, message: "获取成功", data: sites.rows
        })
    })
}

exports.myOrders = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }
    findUserInfo(req, res, async (token, user, app) => {
        const orders = await Order.findAndCountAll({
            where: {
                userId: user.id, appid: req.body.appid
            }, attributes: ['orderNo', 'price', 'payType', 'status', 'num', 'createdAt'], include: [{
                model: Goods,
                attributes: ['name', 'integral', 'price', 'description', 'id', 'num', 'exchange_num', 'imageUrl']
            }]
        })

        if (orders.count <= 0) {
            return res.json({
                code: 404, message: "暂无订单"
            })
        }

        return res.json({
            code: 200, message: "获取成功", data: orders.rows
        })
    })
}

exports.bonusIntegral = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }
    findUserInfo(req, res, async (token, user, app) => {
        const targetUser = await User.findOne({
            where: {
                customId: req.body.account, appid: req.body.appid
            }
        })

        if (!targetUser) {
            return res.json({
                code: 404, message: "无法找到该用户"
            })
        }

        if (targetUser.id === user.id) {
            return res.json({
                code: 404, message: "无法给自己转账"
            })
        }

        if (user.integral < req.body.integral) {
            return res.json({
                code: 404, message: "积分不足"
            })
        }

        const integral = Math.abs(parseInt(req.body.integral))

        user.integral -= integral

        targetUser.integral += integral

        await user.save()

        await targetUser.save()

        return res.json({
            code: 200, message: "转账成功"
        })
    })
}

exports.accountInfoByCustomId = async (req, res) => {
    const err = validationResult(req)
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors
        return res.json({
            code: 404, message: msg
        })
    }
    findUserInfo(req, res, async (token, user, app) => {
        const targetUser = await User.findOne({
            where: {
                customId: req.body.account, appid: req.body.appid
            }, attributes: ['name', 'avatar', 'integral', 'customId', 'vip_time']
        })

        if (!targetUser) {
            return res.json({
                code: 404, message: "无法找到该用户"
            })
        }

        targetUser.vip_time = getVip(targetUser.vip_time)

        return res.json({
            code: 200, message: "获取成功", data: targetUser
        })
    })
}