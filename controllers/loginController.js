require('../function/dayjs')
const crypto = require("crypto");
const global = require("../global");
const globals = require("../global");
const {jwt, isEmptyStr, moment, stringRandom, lookupAllGeoInfo, redisClient, getToken} = require("../global");
const {validationResult} = require("express-validator");
const bcrypt = require("bcrypt");
const {format: stringFormat} = require("string-kit");
const {QueryTypes} = require("sequelize");
const axios = require("axios");
const {App} = require("../models/app");
const {User} = require("../models/user");
const {LoginLog} = require("../models/loginLog");
const {Token} = require("../models/token");
const {mysql} = require("../database");
const dayjs = require("../function/dayjs");
const {getNextCustomId} = require("../function/getNextCustomId");
const {v4: uuidv4} = require('uuid');
const QRCode = require('qrcode');
const {Log} = require('../models/log');
const UserLogService = require('../function/userLogService');
const DeviceService = require('../function/deviceService');
const {DeviceBrand} = require('../models/deviceBrand');
const {DeviceModel} = require('../models/deviceModel');
const {getIpLocation} = require("../function/ipLocation");
const RedisService = require("../function/redisService");

/**
 * 处理用户登录请求
 * @param {object} req 请求对象，包含登录所需信息
 * @param {object} res 响应对象，用于向客户端发送响应
 */
exports.login = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg
        });
    }

    try {
        const app = await App.findByPk(req.body.appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        if (!app.status) {
            return res.json({
                code: 403,
                message: app.disabledReason || "应用已禁用"
            });
        }

        if (!app.loginStatus) {
            return res.json({
                code: 403,
                message: app.disableLoginReason || "登录功能已禁用"
            });
        }

        // 查找用户
        const user = await User.findOne({
            where: {
                account: req.body.account,
                appid: req.body.appid
            }
        });

        if (!user || !bcrypt.compareSync(req.body.password, user.password)) {
            return res.json({
                code: 401,
                message: "账号或密码错误"
            });
        }

        // 检查账号状态
        if (!user.enabled || dayjs(user.disabledEndTime).isAfter(dayjs())) {
            await UserLogService.quickLog({
                appid: app.id,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent']
            }, 'login', '登录失败-用户已禁用', {
                userId: user.id,
                account: user.account,
                name: user.name,
                endTime: dayjs(user.disabledEndTime).format("YYYY年MM月DD日 HH:mm:ss"),
                reason: user.reason
            });

            return res.json({
                code: 404,
                message: '用户已被禁用，原因:' + user.reason,
                data: {
                    id: user.id,
                    account: user.account,
                    endTime: dayjs(user.disabledEndTime).format("YYYY年MM月DD日 HH:mm:ss"),
                    reason: user.reason
                }
            });
        }
        return handleLoginSuccess(user, req, res);
    } catch (error) {
        console.error('登录失败:', error);
        return res.status(500).json({
            code: 500,
            message: '登录失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

async function handleLoginSuccess(user, req, res) {
    try {
        // 检查是否启用了两步验证
        if (user.twoFactorSecret) {
            // 生成临时 token，用于后续验证
            const tempToken = jwt.sign(
                {
                    userId: user.id,
                    appid: req.body.appid,
                    type: 'two_factor_temp',
                    exp: Math.floor(Date.now() / 1000) + (5 * 60) // 5分钟有效期
                },
                process.env.APP_TOKEN_KEY
            );

            // 记录两步验证请求日志
            await UserLogService.quickLog({
                appid: req.body.appid,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent']
            }, 'security', '需要两步验证', {
                method: user.two_factor_method,
                tempToken
            });

            return res.json({
                code: 201, // 使用特殊状态码表示需要两步验证
                message: '需要两步验证',
                data: {
                    requireTwoFactor: true,
                    twoFactorMethod: user.two_factor_method, // 'email' 或 'authenticator'
                    tempToken // 用于后续验证
                }
            });
        }

        // 如果没有启用两步验证，继续原有的登录流程
        const geo = await getIpLocation(req.clientIp);
        const token = jwt.sign(
            {account: user.account, password: req.body.password},
            process.env.APP_TOKEN_KEY
        );

        const tokenWithMarkcode = await Token.findOne({
            where: {markcode: req.body.markcode, appid: req.body.appid}
        });

        if (tokenWithMarkcode) {
            if (tokenWithMarkcode.account !== user.id) {
                return res.json({
                    code: 404, message: '设备已被其他用户绑定,请更换设备,被绑定用户账号:' + tokenWithMarkcode.account
                });
            }

            await tokenWithMarkcode.update({
                token: token,
                expireTime: dayjs().add(30, 'days').toDate()
            });

            await LoginLog.create({
                user_id: user.id,
                appid: req.body.appid,
                login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                login_ip: req.clientIp,
                login_address: geo.location,
                login_province: geo.region,
                login_city: geo.city,
                login_device: req.body.markcode,
                login_isp: geo.isp
            });

            await RedisService.set(token, req.body.markcode, 30, RedisService.TimeUnit.DAYS);

            //登录成功
            await tokenWithMarkcode.save()
            return res.json({
                code: 200, message: '登录成功', data: {token: token}
            });
        }

        await Token.create({
            token: token,
            appid: req.body.appid,
            account: user.id,
            markcode: req.body.markcode,
            device: req.body.device,
            expireTime: dayjs().add(30, 'days').toDate()
        });

        await LoginLog.create({
            user_id: user.id,
            appid: req.body.appid,
            login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            login_ip: req.clientIp,
            login_address: geo.location,
            login_device: req.body.markcode,
            login_province: geo.region,
            login_city: geo.city,
            login_isp: geo.isp
        });
        await RedisService.set(token, req.body.markcode, 30, RedisService.TimeUnit.DAYS);

        // 记录登录成功日志
        await UserLogService.quickLog({
            appid: req.body.appid,
            userId: user.id,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, 'login', '登录成功', {
            loginType: 'password',
            device: req.body.device,
            markcode: req.body.markcode
        });

        return res.json({
            code: 200,
            message: '登录成功',
            data: {token}
        });
    } catch (error) {
        await UserLogService.quickError({
            appid: req.body.appid,
            userId: user.id,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, '登录处理失败', error);

        throw error;
    }
}

exports.QQLogin = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.json({
                code: 404,
                message: msg,
            });
        }

        const {appid, openid, access_token, qqappid, markcode, device} = req.body;

        const app = await App.findByPk(appid);
        if (!app) {

            return res.json({
                code: 404,
                message: '无法找到该应用'
            });
        }

        // QQ API 验证
        const response = await axios.get('https://graph.qq.com/user/get_user_info', {
            params: {
                access_token,
                oauth_consumer_key: qqappid,
                openid,
                format: 'json'
            }
        });

        if (response.data.ret === -1) {

            return res.json({
                code: 404,
                message: response.data.msg || '错误的身份信息'
            });
        }

        // 应用状态检查
        if (!app.loginStatus || !app.status) {

            return res.json({
                code: 404,
                message: '应用异常',
                data: {
                    reason: app.disableLoginReason || app.disabledReason || '无原因'
                }
            });
        }

        const user = await User.findOne({
            where: {
                open_qq: openid,
                appid: appid
            }
        });

        if (user) {
            return await handleExistingUser(req, res, app, user, markcode, device, openid);
        } else {
            return await handleNewUser(req, res, app, openid, response.data, markcode, device);
        }
    } catch (error) {

        return res.json({
            code: 500,
            message: '服务器出现错误',
            err: error.message
        });
    }
};

async function handleExistingUser(req, res, app, user, markcode, device, openid) {
    try {
        // 获取地理位置信息
        const geo = await getIpLocation(req.clientIp);

        // 检查用户状态
        if (!user.enabled || dayjs(user.disabledEndTime).isAfter(dayjs())) {
            console.log(user.id)
            await UserLogService.quickLog({
                appid: app.id,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent']
            }, 'login', '登录失败-用户已禁用', {
                userId: user.id,
                account: user.account,
                name: user.name,
                endTime: dayjs(user.disabledEndTime).format("YYYY年MM月DD日 HH:mm:ss"),
                reason: user.reason
            });

            return res.json({
                code: 404,
                message: '用户已被禁用，原因:' + user.reason,
                data: {
                    id: user.id,
                    account: user.account,
                    endTime: dayjs(user.disabledEndTime).format("YYYY年MM月DD日 HH:mm:ss"),
                    reason: user.reason
                }
            });
        }

        // 检查设备数量
        const tokenCount = await Token.findAndCountAll({
            where: {
                open_qq: openid,
                appid: app.id
            }
        });

        if ((!app.multiDeviceLogin && tokenCount.count >= 1) ||
            (app.multiDeviceLogin && tokenCount.count >= app.multiDeviceLoginNum)) {
            await UserLogService.quickLog({
                appid: app.id,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent']
            }, 'login', '登录失败-设备数量超限', {
                currentDevices: tokenCount.count,
                maxDevices: app.multiDeviceLogin ? app.multiDeviceLoginNum : 1
            });

            return res.json({
                code: 404,
                message: '设备数量已满'
            });
        }

        // 创建新token
        const token = jwt.sign({
            openid,
            markcode,
            appid: app.id
        }, process.env.APP_TOKEN_KEY);

        await RedisService.set(token, markcode, 30, RedisService.TimeUnit.DAYS);
        await Token.create({
            appid: app.id,
            account: user.id,
            markcode,
            token,
            open_qq: openid,
            device,
            expireTime: dayjs().add(30, 'days').toDate()
        });

        // 记录登录日志
        await UserLogService.quickLog({
            appid: app.id,
            userId: user.id,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, 'login', 'QQ登录成功', {
            loginType: 'qq',
            device,
            markcode,
            needSetup: !user.account || !user.password
        });
        await LoginLog.create({
            user_id: user.id,
            appid: app.id,
            login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            login_ip: req.clientIp,
            login_device: device,
            login_isp: geo.isp,
            login_status: 'success',
            user_agent: req.headers['user-agent'],
            session_id: token,
            login_country: geo.country,
            login_province: geo.region,
            login_city: geo.city,

        });

        return res.json({
            code: 200,
            message: '登录成功',
            data: {
                token: token
            },
            needSetup: !user.account || !user.password
        });
    } catch (error) {
        console.error('登录处理失败:', error);
        throw error;
    }
}

async function handleNewUser(req, res, app, openid, userInfo, markcode, device) {
    const sql = `SELECT *
                 FROM eruyi_user
                 WHERE openid_qq = '${openid}'
                   AND appid = ${app.id} LIMIT 1`;
    const result = await mysql.query(sql, {type: QueryTypes.SELECT});

    if (result.length === 0) {
        await createNewUser(req, res, app, openid, userInfo, markcode, device);
    } else {
        const user = result[0];
        await migrateExistingUser(req, res, app, user, markcode, device);
    }
}

async function createNewUser(req, res, app, openid, userInfo, markcode, device) {
    const geo = await getIpLocation(req.clientIp);
    const newUser = await User.create({
        appid: app.id,
        name: userInfo.nickname,
        avatar: userInfo.figureurl_qq_2,
        open_qq: openid,
        register_ip: req.clientIp,
        markcode: markcode,
        invite_code: stringRandom(24),
        register_province: geo.region,
        register_city: geo.city,
        register_isp: geo.isp,
        register_time: dayjs().toDate(),
    });

    const customId = await getNextCustomId(req.body.appid, newUser.id);
    await newUser.update({customId: customId});

    const token = jwt.sign({
        openid: openid, markcode: markcode, appid: app.id
    }, process.env.APP_TOKEN_KEY);

    await RedisService.set(token, markcode, 30, RedisService.TimeUnit.DAYS);

    await Token.create({
        appid: app.id, account: newUser.id, markcode: markcode, token: token, open_qq: openid, device: device,
        expireTime: dayjs().add(30, 'days').toDate()
    });

    await LoginLog.create({
        user_id: newUser.id,
        appid: req.body.appid,
        login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        login_ip: req.clientIp,
        login_address: geo.location,
        login_device: req.body.markcode,
        login_isp: geo.isp
    });

    return res.json({
        code: 200, message: '登录成功', data: {
            token: token
        }, needSetup: true
    });
}

async function migrateExistingUser(req, res, app, user, markcode, device) {
    const geo = await getIpLocation(user.reg_ip);
    const vipTime = user.vip === 0 ? dayjs().unix() : user.vip;
    const newUser = await User.create({
        account: user.user,
        email: user.email,
        name: user.name,
        password: user.password,
        avatar: user.pic,
        register_ip: user.reg_ip,
        markcode: markcode,
        register_time: dayjs(user.reg_time * 1000).toDate(),
        register_province: geo.region,
        register_city: geo.city,
        register_isp: geo.isp,
        reason: user.ban_notice,
        enabled: !user.is_recycle,
        vip_time: vipTime,
        invite_code: stringRandom(24),
        integral: user.fen,
        appid: app.id,
        open_qq: user.openid_qq,
        open_wechat: user.openid_wx,
    });
    const customId = await getNextCustomId(req.body.appid, newUser.id);
    await newUser.update({customId: customId});
    const token = jwt.sign({
        account: newUser.account, password: newUser.password, openid: newUser.open_qq
    }, process.env.APP_TOKEN_KEY);
    await Token.create({
        token: token,
        appid: app.id,
        account: newUser.id,
        markcode: markcode,
        device: device,
        open_qq: newUser.open_qq,
        open_wechat: newUser.open_wechat,
        expireTime: dayjs().add(30, 'days').toDate()
    });
    await LoginLog.create({
        user_id: newUser.id,
        appid: app.id,
        login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        login_ip: req.clientIp,
        login_address: geo.location,
        login_device: markcode,
        login_isp: geo.isp,
    });
    await RedisService.set(token, markcode, 30, RedisService.TimeUnit.DAYS);
    await LoginLog.create({
        user_id: newUser.id,
        appid: req.body.appid,
        login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        login_ip: req.clientIp,
        login_address: geo.location,
        login_device: req.body.markcode,
        login_isp: geo.isp
    });
    return res.status(200).json({
        code: 200, message: '登录成功', data: {
            token: token,
        }, needSetup: true
    });
}

/**
 * Generate a QR code for login
 * @param {object} req Request object containing appId
 * @param {object} res Response object
 */
exports.generateQRCode = async function (req, res) {
    const {appid} = req.body;

    try {
        // Validate app
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: '无法找到该应用'
            });
        }

        // Generate unique identifier for QR code
        const qrId = uuidv4();

        // Create QR code data object
        const qrData = {
            qrId,
            appid,
            timestamp: dayjs().unix(),
            type: 'login'
        };

        // Generate QR code from data
        const qrCodeData = await QRCode.toDataURL(JSON.stringify(qrData));

        // Store QR status in Redis with 5 minutes expiration
        await redisClient.set(`qr:${qrId}`, JSON.stringify({
            status: 'pending',
            appid,
            timestamp: dayjs().unix()
        }), 'EX', 300);

        return res.json({
            code: 200,
            message: 'QR Code generated successfully',
            data: {
                qrCodeData,
                qrId
            }
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        return res.json({
            code: 500,
            message: 'Error generating QR code'
        });
    }
};

/**
 * Check QR code status
 * @param {object} req Request object
 * @param {object} res Response object
 */
exports.checkQRStatus = async function (req, res) {
    const {qrId} = req.body;

    try {
        const qrData = await redisClient.get(`qr:${qrId}`);
        if (!qrData) {
            return res.json({
                code: 404,
                message: 'QR Code expired or invalid'
            });
        }

        const qrInfo = JSON.parse(qrData);
        return res.json({
            code: 200,
            message: 'QR status retrieved',
            data: {
                status: qrInfo.status,
                token: qrInfo.token
            }
        });
    } catch (error) {
        console.error('Error checking QR status:', error);
        return res.json({
            code: 500,
            message: 'Error checking QR status'
        });
    }
};

/**
 * Scan QR code from mobile app
 * @param {object} req Request object
 * @param {object} res Response object
 */
exports.scanQRCode = async function (req, res) {
    const {qrId, userId, appid, device} = req.body;

    try {
        // Validate QR code
        const qrData = await redisClient.get(`qr:${qrId}`);
        if (!qrData) {
            return res.json({
                code: 404,
                message: 'QR Code expired or invalid'
            });
        }

        const qrInfo = JSON.parse(qrData);
        if (qrInfo.status !== 'pending') {
            return res.json({
                code: 404,
                message: 'QR Code already used'
            });
        }

        // Validate app
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: '无法找到该应用'
            });
        }

        // Get user information
        const user = await User.findByPk(userId);
        if (!user) {
            return res.json({
                code: 404,
                message: '用户不存在'
            });
        }

        // Generate token
        const token = jwt.sign({
            userId: user.id,
            account: user.account,
            appid
        }, process.env.APP_TOKEN_KEY);

        // Create token record
        await Token.create({
            token,
            appid,
            account: user.id,
            device,
            markcode: device
        });

        // Update QR status in Redis
        await redisClient.set(`qr:${qrId}`, JSON.stringify({
            status: 'scanned',
            token,
            userId: user.id,
            timestamp: dayjs().unix()
        }), 'EX', 300);

        // Log login
        const geo = await lookupAllGeoInfo(req.clientIp);
        await LoginLog.create({
            user_id: user.id,
            appid,
            login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            login_ip: req.clientIp,
            login_address: `${geo.provinceName} ${geo.cityNameZh}`,
            login_device: device,
            login_isp: geo.autonomousSystemOrganization
        });

        return res.json({
            code: 200,
            message: 'QR Code scanned successfully',
            data: {token}
        });
    } catch (error) {
        console.error('Error scanning QR code:', error);
        return res.json({
            code: 500,
            message: 'Error scanning QR code'
        });
    }
};

// 添加两步验证确认接口
exports.verifyTwoFactor = async (req, res) => {
    try {
        const {tempToken, code} = req.body;

        // 验证临时token
        const decoded = jwt.verify(tempToken, process.env.APP_TOKEN_KEY);
        if (decoded.type !== 'two_factor_temp') {
            return res.json({
                code: 400,
                message: '无效的验证请求'
            });
        }

        const user = await User.findByPk(decoded.userId);
        if (!user) {
            return res.json({
                code: 404,
                message: '用户不存在'
            });
        }

        // 根据不同的验证方式进行验证
        let verified = false;
        if (user.two_factor_method === 'authenticator') {
            // 验证 TOTP 代码
            verified = verifyTOTP(code, user.two_factor_secret);
        } else if (user.two_factor_method === 'email') {
            // 验证邮箱验证码
            verified = await verifyEmailCode(user.email, code);
        }

        if (!verified) {
            // 记录验证失败日志
            await UserLogService.quickLog({
                appid: decoded.appid,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent']
            }, 'security', '两步验证失败', {
                method: user.two_factor_method
            });

            return res.json({
                code: 400,
                message: '验证码错误'
            });
        }

        // 验证成功，生成正式token
        const token = jwt.sign(
            {account: user.account},
            process.env.APP_TOKEN_KEY
        );

        // 记录验证成功日志
        await UserLogService.quickLog({
            appid: decoded.appid,
            userId: user.id,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, 'security', '两步验证成功', {
            method: user.two_factor_method
        });

        return res.json({
            code: 200,
            message: '验证成功',
            data: {token}
        });

    } catch (error) {
        await UserLogService.quickError({
            appid: req.body?.appid,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, '两步验证处理失败', error);

        return res.json({
            code: 500,
            message: '验证失败',
            error: error.message
        });
    }
};