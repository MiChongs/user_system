require('../function/dayjs')
const crypto = require("crypto");
const global = require("../global");
const globals = require("../global");
const { jwt, isEmptyStr, moment, stringRandom, lookupAllGeoInfo, redisClient, getToken } = require("../global");
const { validationResult } = require("express-validator");
const bcrypt = require("bcrypt");
const { format: stringFormat } = require("string-kit");
const { QueryTypes } = require("sequelize");
const axios = require("axios");
const { App } = require("../models/app");
const { User } = require("../models/user");
const { LoginLog } = require("../models/loginLog");
const { Token } = require("../models/token");
const { mysql } = require("../database");
const dayjs = require("../function/dayjs");
const { getNextCustomId } = require("../function/getNextCustomId");


/**
 * 处理用户登录请求
 * @param {object} req 请求对象，包含登录所需信息
 * @param {object} res 响应对象，用于向客户端发送响应
 */
exports.login = async function (req, res) {
    // 验证请求参数是否符合规则
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{ msg }] = err.errors;
        return res.json({
            code: 404, message: msg,
        });
    }

    const { appid, markcode, account, password } = req.body;

    try {
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404, message: '无法找到该应用'
            });
        }

        if (!app.loginStatus || !app.status) {
            const reason = app.disableLoginReason || app.disabledReason || '无原因';
            return res.json({
                code: 404, message: '应用异常', data: { reason }
            });
        }

        const existingTokens = await Token.findAndCountAll({
            where: { account, appid }
        });

        // 优先限制设备数为 1，如果多设备登录已开启，则使用 app.multiDeviceLoginNum
        const maxDevices = app.multiDeviceLogin ? app.multiDeviceLoginNum : 1;
        if (existingTokens.count >= maxDevices) {
            return res.json({
                code: 404, message: '该账号已达最大设备登录数'
            });
        }

        let user = await User.findOne({
            where: { account, appid }
        });

        if (!user) {
            // 查询旧数据库
            const oldUserSql = `SELECT *
                                FROM eruyi_user
                                WHERE eruyi_user.user = :user
                                  AND eruyi_user.pwd = :pwd
                                  AND eruyi_user.appid = :appid LIMIT 1`;
            const oldUserResult = await mysql.query(oldUserSql, {
                replacements: {
                    user: account, pwd: crypto.createHash('md5').update(password).digest('hex'), appid: appid
                }, type: QueryTypes.SELECT
            });

            if (oldUserResult.length === 0) {
                // 旧用户不存在，返回用户不存在
                return res.json({
                    code: 404, message: '该用户不存在'
                });
            } else {
                // 旧用户存在，将其信息转移到新表中
                const oldUser = oldUserResult[0];
                oldUser.vip = oldUser.vip || 0;
                const geo = await lookupAllGeoInfo(req.clientIp);
                const vipTime = oldUser.vip === 0 ? dayjs().unix() : oldUser.vip;
                user = await User.create({
                    account,
                    email: oldUser.email,
                    name: oldUser.name,
                    password: bcrypt.hashSync(password, 10),
                    avatar: oldUser.pic,
                    register_ip: oldUser.reg_ip,
                    markcode,
                    register_time: dayjs(oldUser.reg_time * 1000).format('YYYY-MM-DD HH:mm:ss'),
                    register_province: geo.provinceName,
                    register_city: geo.cityNameZh,
                    register_isp: geo.autonomousSystemOrganization,
                    reason: oldUser.ban_notice,
                    enabled: !oldUser.is_recycle,
                    vip_time: vipTime,
                    invite_code: stringRandom(24),
                    integral: oldUser.fen,
                    appid,
                    open_qq: oldUser.openid_qq,
                    open_wechat: oldUser.openid_wx,
                });
                console.log("用户注册成功", user.dataValues);
                const customId = await getNextCustomId(user.appid, user.id);
                console.log("自定义ID", customId);
                await user.update({ customId: customId });
            }
        }

        if (!user.enabled || dayjs(user.disabledEndTime).isAfter(dayjs())) {
            return res.json({
                code: 404, message: '用户已被禁用', data: {
                    id: user.id,
                    account: user.account,
                    endTime: dayjs(user.disabledEndTime).format("YYYY年MM月DD日 HH:mm:ss"),
                    reason: user.reason
                }
            });
        }

        if (!bcrypt.compareSync(password, user.password)) {
            return res.json({
                code: 404, message: '用户密码错误'
            });
        }

        return handleLoginSuccess(user, req, res);

    } catch (error) {
        console.error('Error during login:', error);
        return res.json({
            code: 500, message: error.message
        });
    }
};

async function handleLoginSuccess(user, req, res) {
    const geo = await lookupAllGeoInfo(req.clientIp);
    const token = jwt.sign({ account: user.account, password: req.body.password }, process.env.APP_TOKEN_KEY);

    const tokenWithMarkcode = await Token.findOne({
        where: { markcode: req.body.markcode, appid: req.body.appid }
    });

    if (tokenWithMarkcode) {
        if (tokenWithMarkcode.account !== user.id) {

            return res.json({
                code: 404, message: '设备已被其他用户绑定'
            });
        }

        await tokenWithMarkcode.update({ token: token });

        await LoginLog.create({
            user_id: user.id,
            appid: req.body.appid,
            login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            login_ip: req.clientIp,
            login_address: `${geo.provinceName} ${geo.cityNameZh}`,
            login_device: req.body.markcode,
            login_isp: geo.autonomousSystemOrganization
        });

        await redisClient.set(token, req.body.markcode);

        //登录成功
        await tokenWithMarkcode.save()
        return res.json({
            code: 200, message: '登录成功', data: { token: token }
        });
    }

    await Token.create({
        token: token, appid: req.body.appid, account: user.id, markcode: req.body.markcode, device: req.body.device
    });
    await LoginLog.create({
        user_id: user.id,
        appid: req.body.appid,
        login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        login_ip: req.clientIp,
        login_address: `${geo.provinceName} ${geo.cityNameZh}`,
        login_device: req.body.markcode,
        login_isp: geo.autonomousSystemOrganization
    });
    await redisClient.set(token, req.body.markcode);
    return res.json({
        code: 200, message: '登录成功', data: { token: token }
    });
}

exports.QQLogin = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{ msg }] = err.errors;
        return res.json({
            code: 404, message: msg,
        });
    }

    const { appid, openid, access_token, qqappid, markcode, device } = req.body;
    console.log(appid, openid, access_token, qqappid, markcode);

    try {
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404, message: '无法找到该应用'
            });
        }

        const response = await axios.get('https://graph.qq.com/user/get_user_info', {
            params: {
                access_token: access_token, oauth_consumer_key: qqappid, openid: openid, format: 'json'
            }
        });

        if (response.data.ret === -1) {
            return res.json({
                code: 404, message: response.data.msg || '错误的身份信息'
            });
        }

        if (!app.loginStatus || !app.status) {
            return res.json({
                code: 404, message: '应用异常', data: {
                    reason: app.disableLoginReason || app.disabledReason || '无原因'
                }
            });
        }

        const user = await User.findOne({
            where: {
                open_qq: openid, appid: appid
            }
        });

        if (user) {
            await handleExistingUser(req, res, app, user, markcode, device, openid);
        } else {
            await handleNewUser(req, res, app, openid, response.data, markcode, device);
        }
    } catch (error) {
        console.error(error);
        return res.json({
            code: 500, message: '服务器出现错误', err: error.message
        });
    }
};

async function handleExistingUser(req, res, app, user, markcode, device, openid) {
    const tokenCount = await Token.findAndCountAll({
        where: {
            open_qq: openid, appid: app.id
        }
    });

    if (!app.multiDeviceLogin && tokenCount.count >= 1) {
        return res.json({
            code: 404, message: '设备数量已满'
        });
    }

    if (app.multiDeviceLogin && tokenCount.count >= app.multiDeviceLoginNum) {
        return res.json({
            code: 404, message: '设备数量已满'
        });
    }

    const token = jwt.sign({
        openid: openid, markcode: markcode, appid: app.id
    }, process.env.APP_TOKEN_KEY);

    await redisClient.set(token, markcode);

    await Token.create({
        appid: app.id, account: user.id, markcode: markcode, token: token, open_qq: openid, device: device
    });

    let needSetup = false;

    if (!user.account || !user.password) {
        needSetup = true
    }

    const geo = await lookupAllGeoInfo(req.clientIp);
    await LoginLog.create({
        user_id: user.id,
        appid: req.body.appid,
        login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        login_ip: req.clientIp,
        login_address: `${geo.provinceName} ${geo.cityNameZh}`,
        login_device: req.body.markcode,
        login_isp: geo.autonomousSystemOrganization
    });
    return res.json({
        code: 200, message: '登录成功', data: {
            token: token
        }, needSetup: needSetup
    });
}

async function handleNewUser(req, res, app, openid, userInfo, markcode, device) {
    const sql = `SELECT *
                 FROM eruyi_user
                 WHERE openid_qq = '${openid}'
                   AND appid = ${app.id} LIMIT 1`;
    const result = await mysql.query(sql, { type: QueryTypes.SELECT });

    if (result.length === 0) {
        await createNewUser(req, res, app, openid, userInfo, markcode, device);
    } else {
        const user = result[0];
        await migrateExistingUser(req, res, app, user, markcode, device);
    }
}

async function createNewUser(req, res, app, openid, userInfo, markcode, device) {
    const geo = await lookupAllGeoInfo(req.clientIp);
    const newUser = await User.create({
        appid: app.id,
        name: userInfo.nickname,
        avatar: userInfo.figureurl_qq_2,
        open_qq: openid,
        register_ip: req.clientIp,
        markcode: markcode,
        invite_code: stringRandom(24),
        register_province: geo.provinceName,
        register_city: geo.cityNameZh,
        register_isp: geo.autonomousSystemOrganization,
        register_time: dayjs().toDate(),
    });


    const customId = await getNextCustomId(req.body.appid, newUser.id);
    await newUser.update({ customId: customId });

    const token = jwt.sign({
        openid: openid, markcode: markcode, appid: app.id
    }, process.env.APP_TOKEN_KEY);

    await redisClient.set(token, markcode);

    await Token.create({
        appid: app.id, account: newUser.id, markcode: markcode, token: token, open_qq: openid, device: device
    });

    await LoginLog.create({
        user_id: newUser.id,
        appid: req.body.appid,
        login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        login_ip: req.clientIp,
        login_address: `${geo.provinceName} ${geo.cityNameZh}`,
        login_device: req.body.markcode,
        login_isp: geo.autonomousSystemOrganization
    });
    return res.json({
        code: 200, message: '登录成功', data: {
            token: token
        }, needSetup: true
    });
}

async function migrateExistingUser(req, res, app, user, markcode, device) {
    const geo = await lookupAllGeoInfo(user.reg_ip);
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
        register_province: geo.provinceName,
        register_city: geo.cityNameZh,
        register_isp: geo.autonomousSystemOrganization,
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
    await newUser.update({ customId: customId });
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
    });
    await LoginLog.create({
        user_id: newUser.id,
        appid: app.id,
        login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        login_ip: req.clientIp,
        login_address: `${geo.provinceName} ${geo.cityNameZh}`,
        login_device: markcode,
        login_isp: geo.autonomousSystemOrganization,
    });
    await redisClient.set(token, markcode);

    await LoginLog.create({
        user_id: newUser.id,
        appid: req.body.appid,
        login_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        login_ip: req.clientIp,
        login_address: `${geo.provinceName} ${geo.cityNameZh}`,
        login_device: req.body.markcode,
        login_isp: geo.autonomousSystemOrganization
    });
    return res.status(200).json({
        code: 200, message: '登录成功', data: {
            token: token,
        }, needSetup: true
    });
}