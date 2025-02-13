const global = require("../global/index");
const {validationResult} = require("express-validator");
const globals = require("../global");
const bcrypt = require("bcrypt");
const res = require("express/lib/response");
const {
    isEmptyStr,
    getToken,
    redisClient,
    stringRandom,
} = require("../global");
const axios = require("axios");
const iconv = require("iconv-lite");
const path = require("path");
const {Op, where, or} = require("sequelize");
const fs = require("fs");
const {error} = require("console");
const {User} = require("../models/user");
const {Log} = require("../models/log");
const {RegisterLog} = require("../models/registerLog");
const {Token} = require("../models/token");
const {App} = require("../models/app");
const {Card} = require("../models/card");
const svgCaptcha = require("svg-captcha");
const dayjs = require("../function/dayjs");
const {getVip} = require("../function/getVip");
const {Daily} = require("../models/daily");
const http = require("http");
const socketIO = require("socket.io");
const {getNextCustomId} = require("../function/getNextCustomId");
const {CustomIdLog} = require("../models/customIdLog");
const {findUserInfo, findUserByPassword} = require("../function/findUser");
const {isVip} = require("../function/isVip");
const {token} = require("morgan");
const {Banner} = require("../models/banner");
const {VersionChannel} = require("../models/versionChannel");
const {versionChannelUser} = require("../models/versionChannelUser");
const {Version} = require("../models/version");
const {Site} = require("../models/sites");
const crypto = require("crypto");
const {Goods} = require("../models/goods");
const {Order} = require("../models/goods/order");
const {SiteAudit} = require("../models/user/siteAudits");
const {SiteAward} = require("../models/user/siteAward");
const {Notice} = require("../models/notice");
const {Splash} = require("../models/splash");
const {Lottery} = require("../models/lottery");
// 引入配置好的 multerConfig
// 上传到服务器地址
const BaseURL = process.env.BASE_URL;
// 上传到服务器的目录
const avatarPath = "/public/avatar";
const extractIPv4 = (ip) => {
    const ipv4Regex = /::ffff:(\d+\.\d+\.\d+\.\d+)/;
    const match = ip.match(ipv4Regex);
    if (match) {
        return match[1];
    } else {
        return ip;
    }
};

const RandomService = require('../function/randomService');
const UserLogService = require('../function/userLogService');
const {getIpLocation} = require('../function/ipLocation');
const NSFWService = require('../function/nsfwService');
const mailService = require('../function/mailService');
const RedisService = require('../function/redisService');
const {AppAnalyzer} = require("../models/appAnalyzer");

/**
 * 生成密码学安全的随机整数
 * @param {number} min 最小值（包含）
 * @param {number} max 最大值（包含）
 * @returns {number} 在[min, max]范围内的随机整数
 * @throws {Error} 参数无效时抛出错误
 */
function randomNumber(min, max) {
    // 参数验证
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
        throw new TypeError('参数必须是安全整数');
    }
    if (min > max) {
        throw new RangeError('最小值不能大于最大值');
    }

    const range = max - min + 1;
    // 使用 Number.isSafeInteger 确保范围在安全整数内
    if (!Number.isSafeInteger(range)) {
        throw new RangeError('范围超出安全整数限制');
    }

    // 计算需要的字节数和掩码
    const mask = range - 1;
    const bytes = Math.ceil(Math.log2(range) / 8);

    // 使用 TypedArray 提高性能
    const view = new DataView(new ArrayBuffer(bytes));

    let result;
    do {
        // 一次性生成所需字节，减少系统调用
        crypto.randomFillSync(view.buffer);

        result = 0;
        // 使用 DataView 读取字节，处理字节序
        for (let i = 0; i < bytes; i++) {
            result = (result << 8) | view.getUint8(i);
        }

        // 使用位运算优化性能
        result = result & mask;

    } while (result >= range);

    return min + result;
}

/**
 * 用户注册接口
 * 使用async函数处理异步操作
 * @param {Object} req 请求对象，包含注册信息
 * @param {Object} res 响应对象，用于返回注册结果
 */
exports.register = async function (req, res) {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const [{msg}] = errors.errors;
            return res.json({code: 400, message: msg});
        }

        const appId = req.params.appid || req.body.appid;
        const app = await App.findByPk(appId);
        if (!app) {
            return res.json({code: 400, message: "无法找到该应用"});
        }

        if (!app.registerStatus) {
            const reason = isEmptyStr(app.disabledRegisterReason)
                ? "无原因"
                : app.disabledRegisterReason;
            return res.json({code: 400, message: "应用已暂停注册", data: {reason}});
        }

        const {account, username, password, invite_code, markcode} = req.body;

        const userExists = await User.count({where: {account}});
        if (userExists >= 1) {
            return res.json({code: 401, message: "用户已存在"});
        }

        if (app.registerCheckIp) {
            const ipExists = await User.count({where: {register_ip: req.clientIp}});
            if (ipExists >= 1) {
                return res.json({code: 401, message: "IP已注册过账号"});
            }
        }

        let userConfig;
        const info = await getIpLocation(req.clientIp);

        if (app.register_award === "integral") {
            userConfig = {
                name: username,
                account: account,
                password: bcrypt.hashSync(password, 10),
                register_ip: req.clientIp,
                register_province: info.region,
                register_city: info.city,
                register_isp: info.isp,
                appid: appId,
                integral: app.register_award_num,
                invite_code: stringRandom(16),
                markcode: markcode,
            };
        } else {
            userConfig = {
                name: username,
                account: account,
                password: bcrypt.hashSync(password, 10),
                register_ip: req.clientIp,
                register_province: info.region,
                register_city: info.city,
                register_isp: info.isp,
                appid: appId,
                vip_time: dayjs().add(app.register_award_num, "m").unix(),
                markcode: markcode,
            };
        }

        if (invite_code) {
            const inviter = await User.findOne({
                where: {invite_code, appid: appId},
            });
            if (!inviter) {
                return res.json({code: 400, message: "邀请码无效"});
            }

            userConfig.parent_invite_account = inviter.account;
            if (app.invite_award === "integral") {
                userConfig.integral = (userConfig.integral || 0) + app.invite_award_num;
            } else {
                userConfig.vip_time = dayjs(userConfig.vip_time || dayjs())
                    .add(app.invite_award_num, "m")
                    .valueOf();
            }
        }

        // 创建用户
        const newUser = await User.create(userConfig);

        // 记录注册日志
        await UserLogService.quickLog({
            appid: appId,
            userId: newUser.id,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, 'register', '用户注册', {
            registerType: 'normal',
            inviteCode: req.body.inviteCode || '无'
        });

        const customId = await getNextCustomId(appId, newUser.id);
        await newUser.update({customId: customId});
        await RegisterLog.create({
            user_id: newUser.account,
            register_time: dayjs().toDate(),
            register_ip: req.clientIp,
            register_address: info.location,
            register_isp: info.isp,
            appid: appId,
            register_device: markcode,
        });
        res.status(200).json({
            code: 200,
            message: "用户注册成功",
            result: {
                account: newUser.account,
                customId: newUser.customId,
                password: newUser.password,
                avatar: newUser.avatar,
                name: newUser.username,
                register_ip: newUser.register_ip,
                register_time: newUser.register_time,
                vip_time: newUser.vip_time,
            },
        });
    } catch (error) {
        // 记录错误日志
        await UserLogService.quickError({
            appid: req.body?.appid,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, '注册失败', error);

        return res.json({
            code: 500,
            message: error.message
        });
    }
};

exports.devices = function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user, app) => {
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

            const devices = await Token.findAll({
                where: whereCondition,
            });

            if (devices.length === 0) {
                return res.json({
                    code: 404,
                    message: "未找到设备",
                });
            }

            return res.json({
                code: 200,
                message: "成功",
                data: devices,
            });
        });
    }
};

exports.deleteDevice = function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            try {
                const targetToken = await Token.findOne({
                    where: {
                        token: req.body.token,
                        markcode: req.body.markcode,
                        appid: req.body.appid,
                    },
                })

                if (!targetToken) {
                    return res.json({
                        code: 404,
                        message: "未找到设备",
                    });
                }

                await targetToken.destroy();

                await RedisService.del(req.body.token);

                return res.status(200).json({
                    code: 200,
                    message: "登出成功",
                    data: {
                        account: targetToken.account,
                        token: targetToken.token,
                        markcode: targetToken.markcode,
                    },
                });
            } catch (error) {
                return res.json({
                    code: 500,
                    message: error.message,
                });
            }

        });
    }
};

exports.logout = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 404,
            msg: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        await App.findByPk(req.params.appid || req.body.appid)
            .then((app) => {
                if (app == null) {
                    return res.json({
                        code: 400,
                        message: "无法找到该应用",
                    });
                }
                if (app instanceof App) {
                    Token.findOne({
                        where: {
                            token: token,
                            markcode: req.body.markcode,
                            appid: req.body.appid,
                        },
                    })
                        .then((result) => {
                            if (result == null) {
                                res.json({
                                    code: 201,
                                    message: "该登录状态不存在",
                                });
                            } else {
                                result
                                    .destroy()
                                    .then(async (result) => {
                                        await redisClient.del(token);
                                        return res.status(200).json({
                                            code: 200,
                                            message: "登出成功",
                                            data: [
                                                {
                                                    account: result.account,
                                                    token: result.token,
                                                    markcode: result.markcode,
                                                },
                                            ],
                                        });
                                    })
                                    .catch((error) => {
                                        res.json({
                                            code: 201,
                                            message: "登出失败",
                                            error: error.message,
                                        });
                                    });
                            }
                        })
                        .catch((error) => {
                            res.json({
                                code: 201,
                                message: error.message,
                            });
                        });
                }
            })
            .catch((error) => {
                res.json({
                    code: 500,
                    message: "查找应用出错",
                    error: error,
                });
            });
    }
};

exports.delete = async function (req, res, next) {
};

const generateEncryptedUserId = (userId) => {
    return crypto.createHash("sha256").update(userId.toString()).digest("hex");
};

exports.uploadAvatar = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            msg: msg,
        });
    }

    const token = getToken(req.headers.authorization);
    const transaction = await mysql.transaction();
    let uploadPath; // 声明在这里，使其在整个函数作用域内可访问

    try {
        const app = await App.findByPk(req.params.appid || req.body.appid, {
            transaction,
        });
        if (!app) {
            throw new Error("无法找到该应用");
        }

        const user = await Token.findOne({
            where: {token: token, appid: req.body.appid},
            transaction,
        });
        if (!user) {
            throw new Error("无法找到该登录状态");
        }

        if (!req.files || !req.files.file) {
            throw new Error("没有上传文件");
        }

        const file = req.files.file;

        // 获取文件信息
        const fileInfo = {
            name: file.name,
            size: file.size,
            mimeType: file.mimetype || 'application/octet-stream',
            encoding: file.encoding
        };

        // 验证文件类型和大小
        if (!fileInfo.mimeType.startsWith('image/')) {
            throw new Error("只能上传图片文件");
        }

        const maxSize = 5 * 1024 * 1024; // 5MB
        if (fileInfo.size > maxSize) {
            throw new Error("文件大小不能超过5MB");
        }

        // NSFW 内容检测
        const nsfwResult = await NSFWService.checkContent({
            file: file.data,
            fileName: fileInfo.name,
            mimeType: fileInfo.mimeType,
            fileSize: fileInfo.size
        });

        if (!nsfwResult.success) {
            throw new Error("图片检测失败: " + nsfwResult.error);
        }

        if (nsfwResult.isNSFW) {
            throw new Error("图片内容不适合作为头像");
        }

        // 生成安全的文件名
        const fileExt = path.extname(fileInfo.name).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        if (!allowedExts.includes(fileExt)) {
            throw new Error("不支持的图片格式");
        }

        const fileName = `avatar_${user.account}_${Date.now()}${fileExt}`;
        uploadPath = path.join(__dirname, "../public/avatars", fileName); // 赋值给之前声明的变量

        // 确保目录存在
        const uploadDir = path.dirname(uploadPath);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, {recursive: true});
        }

        // 保存文件
        await file.mv(uploadPath);

        const userRecord = await User.findOne({
            where: {id: user.account, appid: req.body.appid},
            transaction,
        });
        if (!userRecord) {
            throw new Error("无法找到该用户");
        }

        // 删除旧头像
        const oldAvatarPath = userRecord.avatar;
        if (oldAvatarPath && !oldAvatarPath.endsWith('/0.png')) {
            const oldFilePath = path.join(__dirname, "../public", oldAvatarPath.replace(process.env.BASE_SERVER_URL, ''));
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }
        }

        await userRecord.update(
            {
                avatar: process.env.BASE_SERVER_URL + "/avatars/" + fileName,
            },
            {transaction}
        );

        await transaction.commit();

        res.status(200).json({
            code: 200,
            message: "上传成功",
            data: [
                {
                    avatar: userRecord.avatar,
                },
            ],
        });
    } catch (error) {
        await transaction.rollback();
        // 清理可能已上传的文件
        if (uploadPath && fs.existsSync(uploadPath)) {
            fs.unlinkSync(uploadPath);
        }
        res.json({
            code: 500,
            message: error.message,
        });
    }
};

/**
 * Handles the daily check-in process for a user.
 *
 * @param {object} req - The request object containing user information and app ID.
 * @param {object} res - The response object for sending the result of the check-in process.
 *
 * @description
 * This function validates the request parameters, checks if the user has already performed the daily check-in
 * for the current day, and if not, creates a new daily record. It updates the user's integral or VIP time
 * based on the app's daily award settings. It also logs the daily check-in event.
 *
 * @throws {Error} If an internal server error occurs during the check-in process.
 */
exports.daily = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg,
        });
    }
    findUserInfo(req, res, async (token, user, app) => {
        try {
            const startOfDay = dayjs().startOf("day").toDate();
            const endOfDay = dayjs().endOf("day").toDate();

            const existingDaily = await Daily.findOne({
                where: {
                    userId: user.id,
                    date: {
                        [Op.between]: [startOfDay, endOfDay],
                    },
                    appid: req.body.appid,
                },
            });

            if (existingDaily) {
                return res.status(200).json({
                    code: 200,
                    message: "已经签到过了",
                });
            }

            // 创建签到记录
            const daily = await Daily.create({
                userId: user.id,
                date: dayjs().toDate(),
                integral: app.daily_award_num,
                appid: req.body.appid,
            });

            // 更新用户记录
            let userConfig = {};
            if (app.daily_award === "integral") {
                userConfig.integral = user.integral + app.daily_award_num;
            } else {
                userConfig.vip_time = dayjs(user.vip_time)
                    .add(app.daily_award_num, "m")
                    .toDate();
            }

            await user.update(userConfig);

            // 创建日志记录
            const log = await Log.create({
                log_user_id: user.account,
                appid: req.body.appid,
                log_type: "daily",
                log_ip: req.clientIp,
                open_qq: user.open_qq,
                open_wechat: user.open_wechat,
                log_content: global.logString(
                    "daily",
                    req.clientIp,
                    user.markcode,
                    dayjs().format("YYYY-MM-DD HH:mm:ss")
                ),
                UserId: user.id,
            });

            return res.status(200).json({
                code: 200,
                message: "签到成功",
                data: {
                    account: user.account,
                    integral: user.integral,
                    vip_time: dayjs(user.vip_time).format("YYYY-MM-DD HH:mm:ss"),
                    daily_time: dayjs(daily.date).format("YYYY-MM-DD HH:mm:ss"),
                },
            });
        } catch (error) {
            console.error("Error processing daily check-in:", error);
            return res.json({
                code: 500,
                message: "内部服务器错误",
                error: error.message,
            });
        }
    });
};

/**
 * Handles the card use process for a user.
 *
 * @param {object} req - The request object containing the card code and app ID.
 * @param {object} res - The response object for sending the result of the card use process.
 *
 * @description
 * This function validates the request parameters, checks if the card exists and has not been used,
 * and if not, marks the card as used, updates the user's integral or VIP time based on the card's award settings,
 * and logs the card use event.
 *
 * @throws {Error} If an internal server error occurs during the card use process.
 */
exports.useCard = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg,
        });
    }

    try {
        const token = getToken(req.headers.authorization);
        const app = await App.findByPk(req.body.appid);

        if (!app) {
            return res.json({
                code: 404,
                message: "应用未找到",
            });
        }

        const card = await Card.findOne({
            where: {
                card_code: req.body.card_code,
                appid: req.body.appid,
            },
        });

        if (!card) {
            return res.json({
                code: 404,
                message: "卡密不存在",
            });
        }

        if (dayjs(card.card_code_expire).isBefore(dayjs())) {
            return res.json({
                code: 400,
                message: "该卡已过期",
            });
        }

        if (card.card_status === "used") {
            return res.json({
                code: 400,
                message: "该卡已使用",
            });
        }

        const tokenRecord = await Token.findOne({
            where: {
                token: token,
                appid: req.body.appid,
            },
        });

        if (!tokenRecord) {
            return res.json({
                code: 404,
                message: "无法找到该登录状态",
            });
        }

        // 动态构建查询条件
        const whereCondition = {
            appid: req.body.appid,
        };

        if (tokenRecord.account) whereCondition.id = tokenRecord.account;
        if (tokenRecord.open_qq) whereCondition.open_qq = tokenRecord.open_qq;
        if (tokenRecord.open_wechat)
            whereCondition.open_wechat = tokenRecord.open_wechat;

        const user = await User.findOne({where: whereCondition});

        if (!user) {
            return res.json({
                code: 404,
                message: "无法找到该用户",
            });
        }

        // 记录卡券使用日志
        await Log.create({
            log_type: "card_use",
            log_time: dayjs().format("YYYY-MM-DD HH:mm:ss"),
            log_content: global.logString(
                "card_use",
                user.account,
                dayjs().format("YYYY-MM-DD HH:mm:ss"),
                card.card_code
            ),
            log_ip: req.clientIp,
            log_user_id: user.account,
            appid: req.body.appid,
        });

        let responseMessage = "使用成功";
        let responseData = {};

        if (card.card_type === "integral") {
            // 更新用户积分
            user.integral += card.card_award_num;
            await user.save();

            // 记录积分增加日志
            await Log.create({
                log_type: "integral_add",
                log_time: dayjs().format("YYYY-MM-DD HH:mm:ss"),
                log_content: global.logString(
                    "integral_add",
                    user.account,
                    dayjs().format("YYYY-MM-DD HH:mm:ss"),
                    card.card_code,
                    card.card_award_num,
                    user.integral
                ),
                log_ip: req.clientIp,
                log_user_id: user.account,
                appid: req.body.appid,
            });

            responseData.integral = user.integral;
        } else {
            // 更新用户 VIP 时间
            if (user.vip_time === 999999999) {
                return res.json({
                    code: 400,
                    message: "该用户已是永久会员",
                });
            }
            if (
                user.vip_time === 0 ||
                !user.vip_time ||
                dayjs().isAfter(dayjs(user.vip_time))
            ) {
                user.vip_time = dayjs().unix();
            }

            if (card.card_award_num >= 9999) {
                user.vip_time = 999999999;
            } else {
                // 检查 vip_time 是 Unix 时间戳还是 Date 对象
                const currentVipTime = dayjs.unix(user.vip_time);

                // 添加天数到 VIP 时间
                user.vip_time = currentVipTime.add(card.card_award_num, "days").unix();
            }

            await user.save();

            // 记录 VIP 时间增加日志
            await Log.create({
                log_type: "vip_time_add",
                log_time: dayjs().toDate(),
                log_content: global.logString(
                    "vip_time_add",
                    user.account,
                    dayjs().format("YYYY-MM-DD HH:mm:ss"),
                    card.card_code,
                    card.card_award_num,
                    dayjs.unix(user.vip_time).format("YYYY-MM-DD HH:mm:ss")
                ),
                log_ip: req.clientIp,
                log_user_id: user.account,
                appid: req.body.appid,
            });

            responseData.vip_time = dayjs
                .unix(user.vip_time)
                .format("YYYY-MM-DD HH:mm:ss");
        }

        // 更新卡券状态
        await card.update({
            card_status: "used",
            used_time: dayjs().toDate(),
            account: user.id,
            card_use_time: dayjs().toDate(),
        });

        return res.status(200).json({
            code: 200,
            message: responseMessage,
            data: responseData,
        });
    } catch (error) {
        console.error("Error using card:", error);
        return res.json({
            code: 500,
            message: "服务器错误",
            error: error.message,
        });
    }
};

exports.sendMail = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            msg: msg,
        });
    }

    try {
        const app = await App.findByPk(req.body.appid);
        if (!app) {
            return res.json({
                code: 201,
                message: "无法找到该应用",
            });
        }

        if (!app.status) {
            return res.json({
                code: 201,
                message: "该应用已禁用",
            });
        }

        if (
            isEmptyStr(app.smtpHost) ||
            isEmptyStr(app.smtpUser) ||
            isEmptyStr(app.smtpPassword) ||
            isEmptyStr(app.smtpPort)
        ) {
            return res.json({
                code: 201,
                message: "请先配置邮件服务器",
            });
        }

        const token = await Token.findOne({
            where: {
                token: req.body.token,
                appid: req.body.appid,
            },
        });
        if (!token) {
            return res.json({
                code: 201,
                message: "登录状态不存在",
            });
        }

        const user = await User.findOne({
            where: {
                account: token.account,
                appid: req.body.appid,
            },
        });
        if (!user) {
            return res.json({
                code: 201,
                message: "无法找到该用户",
            });
        }

        if (req.body.email.indexOf("@") <= 0) {
            return res.json({
                code: 400,
                msg: "无效的电子邮件地址",
            });
        }

        if (req.body.mail_type !== "forgot") {
            return res.json({
                code: 400,
                msg: "无效的邮件类型",
            });
        }

        await global.redisClient.connect();
        const result = await global.redisClient.get(req.body.email);
        // 已存在此邮箱数据
        if (result) {
            await global.redisClient.disconnect();
            return res.status(409).json({
                msg: "请不要重复发起请求，15分钟后可以再次发起。",
            });
        }

        const transporter = global.nodemailer.createTransport({
            host: app.smtpHost,
            port: app.smtpPort,
            secure: app.smtpSecure,
            auth: {
                user: app.smtpUser,
                pass: app.smtpPassword,
            },
        });

        const verificationCode = RandomService.generateVerificationCode();
        const templatePath = path.join(__dirname, "../template/theme.ejs");
        const template = fs.readFileSync(templatePath, "utf-8");
        const html = global.ejs.render(template, {
            username: user.name,
            verificationCode,
            senderName: app.name,
        });
        const mailOptions = {
            from: app.smtpForm,
            to: req.body.email,
            subject: `${app.name} - 找回密码`,
            html,
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log("验证电子邮件已成功发送。");
            await global.redisClient.set(req.body.email, verificationCode, {
                EX: 60 * 15,
                NX: true,
            });
            res.status(200).json({
                msg: "验证电子邮件已成功发送。",
            });
        } catch (error) {
            console.error("发送电子邮件时出错：", error);
            res.json({
                msg: "发送电子邮件时出错：" + error,
            });
        } finally {
            await global.redisClient.disconnect();
        }
    } catch (error) {
        console.error(error);
        res.json({
            code: 500,
            msg: "服务器内部错误",
            error: error.message,
        });
    }
};

exports.forgotPassword = function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        App.findByPk(req.body.appid).then(async (app) => {
            if (app === null) {
                return res.json({
                    code: 201,
                    message: "无法找到该应用",
                });
            } else {
                if (!app.status) {
                    return res.json({
                        code: 201,
                        message: "该应用已禁用",
                    });
                } else {
                    if (
                        !isEmptyStr(app.smtpHost) &&
                        !isEmptyStr(app.smtpUser) &&
                        !isEmptyStr(app.smtpPassword) &&
                        !isEmptyStr(app.smtpPort)
                    ) {
                        Token.findOne({
                            where: {
                                token: req.body.token,
                                appid: req.body.appid,
                            },
                        })
                            .then(async (token) => {
                                if (token === null) {
                                    return res.json({
                                        code: 201,
                                        message: "无法找到该登录状态",
                                    });
                                } else {
                                    User.findOne({
                                        where: {
                                            id: token.account,
                                            appid: req.body.appid,
                                        },
                                    })
                                        .then(async (user) => {
                                            if (user === null) {
                                                return res.json({
                                                    code: 201,
                                                    message: "无法找到该用户",
                                                });
                                            } else {
                                                await global.redisClient.connect();
                                                const result = await global.redisClient.get(
                                                    req.body.email
                                                );
                                                // 已存在此邮箱数据
                                                if (result) {
                                                    if (result === req.body.verify_code) {
                                                        if (
                                                            bcrypt.compareSync(
                                                                req.body.new_password,
                                                                user.password
                                                            )
                                                        ) {
                                                            res.json({
                                                                code: 201,
                                                                msg: "新密码不能与旧密码相同",
                                                            });
                                                            return global.redisClient.disconnect();
                                                        } else {
                                                            await user
                                                                .update({
                                                                    password: bcrypt.hashSync(
                                                                        req.body.new_password,
                                                                        10
                                                                    ),
                                                                })
                                                                .then(async () => {
                                                                    res.status(200).json({
                                                                        code: 200,
                                                                        msg: "密码修改成功",
                                                                    });
                                                                })
                                                                .catch((error) => {
                                                                    res.json({
                                                                        code: 201,
                                                                        message: "修改密码出错",
                                                                        error: error.message,
                                                                    });
                                                                });
                                                            return global.redisClient.disconnect();
                                                        }
                                                    } else {
                                                        res.json({
                                                            code: 201,
                                                            msg: "验证码错误",
                                                        });
                                                        return global.redisClient.disconnect();
                                                    }
                                                } else {
                                                    res.json({
                                                        code: 201,
                                                        msg: "未向该邮箱发送验证码，请检查邮箱是否正确。",
                                                    });
                                                    return global.redisClient.disconnect();
                                                }
                                            }
                                        })
                                        .catch((error) => {
                                            return res.json({
                                                code: 201,
                                                message: "查找用户出错",
                                                error: error.message,
                                            });
                                        });
                                }
                            })
                            .catch((error) => {
                                return res.json({
                                    code: 201,
                                    message: "无法找到该登录状态",
                                });
                            });
                    } else {
                        return res.json({
                            code: 201,
                            message: "该应用未配置邮件服务器",
                        });
                    }
                }
            }
        });
    }
};

exports.verifyVip = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        findUserInfo(req, res, (token, user) => {
            if (!isVip(user.vip_time)) {
                return res.json({
                    code: 201,
                    message: "用户不是会员",
                });
            }

            return res.json({
                code: 200,
                message: "用户是会员",
            });
        });
    }
};

async function autoSign(req, res, callback) {
    const token = getToken(req.headers.authorization);
    const appid = req.body.appid;
    const app = await App.findByPk(appid);
    const tokens = await Token.findOne({
        where: {token: token, appid: appid},
    });
    const user = await User.findOne({
        where: {id: tokens.account, appid: appid},
    })
    if (!user) {
        return res.json({
            code: 404,
            message: "无法找到该登录状态",
        });
    }
    if (isVip(user.vip_time)) {
        try {
            const startOfDay = dayjs().startOf("day").toDate();
            const endOfDay = dayjs().endOf("day").toDate();

            const existingDaily = await Daily.findOne({
                where: {
                    userId: user.id,
                    date: {
                        [Op.between]: [startOfDay, endOfDay],
                    },
                    appid: req.body.appid,
                },
            });

            if (existingDaily) {
                return;
            }

            if (!existingDaily) {
                // 创建签到记录
                const daily = await Daily.create({
                    userId: user.id,
                    date: dayjs().toDate(),
                    integral: app.daily_award_num,
                    appid: req.body.appid,
                });

                // 更新用户记录
                let userConfig = {};
                if (app.daily_award === "integral") {
                    userConfig.integral = user.integral + app.daily_award_num;
                } else {
                    userConfig.vip_time = dayjs(user.vip_time)
                        .add(app.daily_award_num, "m")
                        .toDate();
                }

                await user.update(userConfig);

                // 创建日志记录
                const log = await Log.create({
                    log_user_id: user.account,
                    appid: req.body.appid,
                    log_type: "daily",
                    log_ip: req.clientIp,
                    open_qq: user.open_qq,
                    open_wechat: user.open_wechat,
                    log_content: global.logString(
                        "daily",
                        req.clientIp,
                        user.markcode,
                        dayjs().format("YYYY-MM-DD HH:mm:ss")
                    ),
                    UserId: user.id,
                });
            }
        } catch (error) {
            console.error("Error processing daily check-in:", error);
        }
    }
}

exports.my = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        res.json({
            code: 404,
            message: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user, app) => {
                const isMember = isVip(user.vip_time);
                user.vip_time = getVip(user.vip_time);
                try {
                    let effectiveCustomIdLimit;
                    let userStatus;
                    if (isMember) {
                        userStatus = "vip";
                    } else {
                        userStatus = "normal";
                    }

                    const securityScore = await SecurityScoreService.calculateUserScore({
                        appid: req.body.appid,
                        userId: user.id
                    });

                    if (isMember) {
                        await autoSign(req, res)
                        // 会员用户，优先使用app.viperCustomIdCount
                        effectiveCustomIdLimit = app.viperCustomIdCount;
                        // 如果user.customIdCount和app.viperCustomIdCount不相等，选择较大的一个
                        if (user.customIdCount !== app.viperCustomIdCount) {
                            effectiveCustomIdLimit = Math.max(
                                user.customIdCount,
                                app.viperCustomIdCount
                            );
                        }
                    } else {
                        // 普通用户，优先使用app.normalCustomIdCount
                        effectiveCustomIdLimit = app.normalCustomIdCount;
                        // 如果user.customIdCount和app.normalCustomIdCount不相等，选择较大的一个
                        if (user.customIdCount !== app.normalCustomIdCount) {
                            effectiveCustomIdLimit = Math.max(
                                user.customIdCount,
                                app.normalCustomIdCount
                            );
                        }
                    }

                    const startOfDay = dayjs().startOf("day").toDate();
                    const endOfDay = dayjs().endOf("day").toDate();

                    const existingDaily = await Daily.findOne({
                        where: {
                            userId: user.id,
                            date: {
                                [Op.between]: [startOfDay, endOfDay],
                            },
                            appid: req.body.appid,
                        },
                    });

                    const existingDailies = await Daily.findAndCountAll({
                        where: {
                            userId: user.id,
                            date: {
                                [Op.between]: [startOfDay, endOfDay],
                            },
                            appid: req.body.appid,
                        },
                    });

                    if (existingDailies.count >= 2) {
                        const randomDays = randomNumber(30, 365);
                        await user.update({
                            disabledEndTime: dayjs().add(randomDays, "day").toDate(),
                        });
                        return res.json({
                            code: 401,
                            message: "账号已被封禁",
                        });
                    }

                    let isDaily = false;

                    if (existingDaily) {
                        isDaily = true;
                    }

                    let needSetup = false;

                    if (!user.account || !user.password) {
                        needSetup = true;
                    }

                    const customIdChangeCount = await CustomIdLog.findAndCountAll({
                        where: {
                            userId: user.id,
                            appid: req.body.appid,
                        },
                        replacements: {
                            userStatus: userStatus,
                        },
                    });

                    user.customIdCount = effectiveCustomIdLimit - customIdChangeCount.count;

                    if (user.register_city.toString().includes("未知") || user.register_province.toString().includes("未知") || user.register_isp.toString().includes("未知")) {
                        const geo = await getIpLocation(user.register_ip);
                        user.update({
                            register_city: geo.city,
                            register_province: geo.region,
                            register_isp: geo.isp,
                        });
                    }

                    console.log(user);

                    return res.status(200).json({
                        code: 200,
                        message: "获取成功",
                        data: user,
                        counts: {
                            customIdCount: user.customIdCount,
                            customIdChangeCount: customIdChangeCount.count,
                            records: customIdChangeCount.rows,
                        },
                        security: {
                            score: securityScore.score,
                            level: securityScore.level,
                            details: securityScore.details,
                            recommendations: securityScore.recommendations,
                            lastCheck: securityScore.lastCheck
                        },
                        isMember: isMember,
                        isDaily: isDaily,
                        needSetup: needSetup,
                    });
                } catch
                    (e) {
                    console.error("Error fetching user info:", e);
                    return res.json({
                        code: 500,
                        msg: "服务器错误",
                        err: e.message,
                    });
                }
            }
        );
    }
};

exports.dailyRank = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg,
        });
    }

    const {appid} = req.body;
    const token = getToken(req.headers.authorization);

    try {
        const tokenRecord = await Token.findOne({
            where: {token: token, appid: appid},
        });
        if (!tokenRecord) {
            return res.json({
                code: 404,
                message: "无法找到该登录状态",
            });
        }

        const startOfToday = dayjs().startOf("day").toDate();
        const endOfToday = dayjs().endOf("day").toDate();

        const dailyLogs = await Daily.findAndCountAll({
            where: {
                appid: appid,
                date: {
                    [Op.between]: [startOfToday, endOfToday],
                },
            },
            order: [["date", "ASC"]],
            attributes: ["date"],
            include: [
                {
                    model: User,
                    attributes: ["avatar", "name", "id"],
                },
            ],
        });

        if (dailyLogs.count === 0) {
            return res.json({
                code: 404,
                message: "无法找到该用户",
            });
        }

        // 格式化日期并修改字段名为 time
        const formattedLogs = dailyLogs.rows.map((log) => ({
            log_time: dayjs(log.date).format("YYYY-MM-DD HH:mm:ss"),
            User: {
                avatar: log.User.avatar,
                name: log.User.name,
                id: log.User.id,
            },
        }));

        return res.json({
            code: 200,
            message: "获取签到排行榜成功",
            data: formattedLogs,
        });
    } catch (error) {
        console.error("Error fetching daily rank:", error);
        return res.json({
            code: 500,
            message: "内部服务器错误",
            error: error.message,
        });
    }
};

exports.integralRank = (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        res.json({
            code: 404,
            msg: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            const page = parseInt(req.body.page) || 1; // 当前页码
            const pageSize = parseInt(req.body.pageSize) || 50; // 每页记录数
            const offset = (page - 1) * pageSize; // 计算偏移量
            try {
                const {count, rows} = await User.findAndCountAll({
                    limit: pageSize,
                    offset: offset,
                    order: [["integral", "DESC"]],
                    attributes: ["avatar", "name", "id", "integral", "customId"],
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
                console.error("Error fetching logs:", error);
                return res.json({
                    code: 404,
                    message: "An error occurred while fetching logs.",
                });
            }
        });
    }
};

exports.getCaptcha = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        res.json({
            code: 404,
            msg: msg,
        });
    } else {
        const {appid} = req.body;
        try {
            const app = await App.findByPk(appid);
            if (!app) {
                return res.json({
                    code: 404,
                    msg: "无法找到该应用",
                });
            }
            const captcha = await svgCaptcha.create({
                size: 6, // 验证码长度
                ignoreChars: "0o1i", // 排除一些容易混淆的字符
                noise: 4, // 干扰线条数
                color: true, // 验证码是否有颜色
                background: "#cc9966", // 背景颜色
            });
            req.session.captcha = captcha.text; // 将验证码文本存储在会话中
            req.session.cookie.expires = new Date(
                Date.now() + app.registerCaptchaTimeOut * 60 * 1000
            );
            req.session.cookie.maxAge = app.registerCaptchaTimeOut * 60 * 1000;

            res.type("svg"); // 返回的数据类型
            res.status(200).send(captcha.data); // 返回验证码svg数据
        } catch (e) {
            return res.json({
                code: 404,
                msg: "服务器出现错误",
                err: e,
            });
        }
    }
};

exports.updateCustomId = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }

    const {appid, customId} = req.body;
    const token = getToken(req.headers.authorization);

    try {
        const app = await App.findByPk(appid);

        if (!app) {
            return res.json({
                code: 404,
                message: "无法找到该应用",
            });
        }

        const tokens = await Token.findOne({
            where: {
                token: token,
                appid: appid,
            },
        });

        if (!tokens) {
            return res.json({
                code: 404,
                message: "无法找到该登录状态",
            });
        }

        const whereCondition = {
            appid: appid,
        };

        if (tokens.account) {
            whereCondition.account = tokens.account;
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
                code: 404,
                msg: "无法找到该用户",
            });
        }

        const isExists = await User.findAndCountAll({
            where: {
                customId: customId,
            },
        });

        const isMember = await isVip(user.vip_time);
        let userStatus;
        if (isMember) {
            userStatus = "vip";
        } else {
            userStatus = "normal";
        }

        const customIdChangeCount = await CustomIdLog.findAndCountAll({
            where: {userId: user.id, appid, userStatus},
        });

        let effectiveCustomIdLimit;

        if (isMember) {
            // 会员用户，优先使用app.viperCustomIdCount，然后再使用user.customIdCount
            effectiveCustomIdLimit =
                user.customIdCount > app.viperCustomIdCount
                    ? user.customIdCount
                    : app.viperCustomIdCount;
        } else {
            // 普通用户，优先使用app.normalCustomIdCount，然后再使用user.customIdCount
            effectiveCustomIdLimit =
                user.customIdCount > app.normalCustomIdCount
                    ? user.customIdCount
                    : app.normalCustomIdCount;
        }

        if (customIdChangeCount.count >= effectiveCustomIdLimit) {
            return res.json({
                code: 404,
                message: "您的ID修改次数已达上限",
            });
        } else {
            if (isExists.count > 0) {
                return res.json({
                    code: 200,
                    message: "自定义ID已存在",
                });
            }
            const customIdLog = await CustomIdLog.create({
                userId: user.id,
                appid: appid,
                customId: customId,
                userStatus: userStatus,
            });

            user.customId = customId;
            await user.save();

            return res.json({
                code: 200,
                message: "修改成功",
                data: customIdLog,
            });
        }
    } catch (e) {
        return res.json({
            code: 500,
            message: "服务器出现错误",
            err: e.message,
        });
    }
};

exports.searchUser = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            msg: msg,
        });
    }

    const {appid, keyword, page = 1, pageSize = 100} = req.body;
    const token = getToken(req.headers.authorization);

    try {
        const [app, tokens] = await Promise.all([
            App.findByPk(appid),
            Token.findOne({
                where: {
                    token: token,
                    appid: appid,
                },
            }),
        ]);

        if (!tokens) {
            return res.json({
                code: 404,
                msg: "无法找到该登录状态",
            });
        }
        if (!app) {
            return res.json({
                code: 404,
                msg: "无法找到该应用",
            });
        }

        // 计算偏移量
        const offset = (page - 1) * pageSize;

        // 查询用户和总记录数
        const {count: totalRecords, rows: users} = await User.findAndCountAll({
            where: {
                appid: appid,
                [Op.or]: [
                    {name: {[Op.like]: `%${keyword}%`}},
                    {account: {[Op.like]: `%${keyword}%`}},
                    {customId: {[Op.like]: `%${keyword}%`}},
                ],
            },
            attributes: ["customId", "name", "avatar"],
            limit: pageSize,
            offset: offset,
        });

        if (totalRecords === 0) {
            return res.json({
                code: 404,
                msg: "没有找到用户",
            });
        }

        // 计算总页数
        const totalPages = Math.ceil(totalRecords / pageSize);

        return res.status(200).json({
            code: 200,
            message: "搜索成功",
            data: users,
            current_page: page,
            current_records: users.length,
            total_pages: totalPages,
            total_records: totalRecords,
        });
    } catch (e) {
        return res.json({
            code: 500,
            msg: "服务器出现错误",
            err: e.message,
        });
    }
};

exports.setUpdateUser = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user) => {
            if (!user.account) {
                // 清理和净化账号
                let sanitizedAccount = req.body.account
                    // 移除HTML标签和特殊字符
                    .replace(/<[^>]*>/g, '')  // 移除HTML标签
                    .replace(/[<>=\\\/\n\r\t`~!@#$%^&*()+{}|:"?]/g, '')  // 移除特殊字符
                    // 移除控制字符
                    .replace(/[\x00-\x1F\x7F]/g, '')
                    // 移除零宽字符
                    .replace(/[\u200B-\u200D\uFEFF]/g, '')
                    // 移除脚本相关字符
                    .replace(/javascript:|data:|vbscript:|expression\(|@import/gi, '')
                    // 移除多余空格
                    .trim();

                // 验证账号格式
                if (!sanitizedAccount || sanitizedAccount.length < 4) {
                    return res.json({
                        code: 400,
                        message: "账号无效或长度不足4位",
                    });
                }

                // 仅允许字母、数字和下划线
                if (!/^[a-zA-Z0-9_]+$/.test(sanitizedAccount)) {
                    return res.json({
                        code: 400,
                        message: "账号只能包含字母、数字和下划线",
                    });
                }

                user.account = sanitizedAccount;
            }

            if (!user.password) {
                // 验证密码长度
                if (!req.body.password || req.body.password.length < 6) {
                    return res.json({
                        code: 400,
                        message: "密码不能为空且长度不能小于6位",
                    });
                }
                user.password = bcrypt.hashSync(req.body.password, 10);
            }

            await user.save();
            res.json({
                code: 200,
                message: "用户设置成功",
                data: user,
            });
        });
    }
};

exports.banner = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    try {
        const app = await App.findByPk(req.query.appid);
        if (!app) {
            return res.json({
                code: "404",
                message: "无法找到该应用",
            });
        }
        const banners = await Banner.findAndCountAll({
            where: {
                appid: app.id,
            },
            attributes: ["header", "title", "content", "url", "type"],
            order: [["position", "ASC"]],
        });

        if (banners.count <= 0) {
            return res.json({
                code: "404",
                message: "该应用暂无广告",
            });
        }
        return res.json({
            code: "200",
            message: "成功获取广告列表",
            data: banners.rows,
        });
    } catch (e) {
        return res.json({
            code: "404",
            message: "服务器内部错误",
        });
    }
};

exports.analyzer = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 200,
            message: msg,
        });
    }
    findUserInfo(req, res, async (token, user, app) => {
        const analyzer = await AppAnalyzer.findOne({
            where: {
                appid: app.id,
            },
        })
        if (!analyzer) {
            return res.json({
                code: 404,
                message: "未找到该应用的解析配置",
            });
        }

        if (!analyzer.enable) {
            return res.json({
                code: 404,
                message: analyzer.disabledReason || "解析功能已禁用",
            });
        }

        if (!isVip(user.vip_time)) {
            const analyzerCount = await UserLog.count({
                where: {
                    appid: app.id,
                    userId: user.id,
                    type: "content_analysis",
                    time: {
                        [Op.gt]: dayjs().subtract(1, "day").toDate(),
                    },
                }
            })

            if (analyzerCount >= analyzer.normalUserInDayMax) {
                return res.json({
                    code: 404,
                    message: "解析次数已达上限",
                });
            }

            if (user.integral < analyzer.analyzerIntegral) {
                return res.json({
                    code: 404,
                    message: "积分不足",
                });
            } else {
                user.integral -= parseInt(analyzer.analyzerIntegral);
                await user.save();
            }
        }

        try {

            // const response = await axios.get(
            //     "" + req.body.link);
            const response = await axios.get(
                analyzer.url + req.body.link);
            if (!response) {
                // 记录解析失败日志
                await UserLogService.logAnalysisFailed({
                    appid: app.id,
                    userId: user.id,
                    ip: req.clientIp,
                    userAgent: req.headers['user-agent']
                }, req.body.link, UserLogService.detectPlatform(req.body.link), new Error('获取数据失败'));

                return res.json({
                    code: 404,
                    message: "获取数据失败",
                });
            }

            if (response.data.code === "0001") {
                // 记录解析成功日志
                await UserLogService.logContentAnalysis({
                    appid: app.id,
                    userId: user.id,
                    ip: req.clientIp,
                    userAgent: req.headers['user-agent']
                }, {
                    type: 'video',
                    ...response.data.data,
                    success: true
                }, req.body.link);

                return res.json({
                    code: 200,
                    message: "获取成功",
                    data: response.data.data,
                });
            }

            // 记录解析失败日志
            await UserLogService.logAnalysisFailed({
                appid: app.id,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent']
            }, req.body.link, UserLogService.detectPlatform(req.body.link), new Error('API返回失败'));

            return res.json({
                code: 404,
                message: "获取数据失败",
                data: response.data.data,
            });
        } catch (e) {
            // 记录错误日志
            await UserLogService.logAnalysisFailed({
                appid: app.id,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent']
            }, req.body.link, UserLogService.detectPlatform(req.body.link), e);

            return res.json({
                code: 404,
                message: "服务器内部错误",
                error: e.message,
            });
        }
    })
};

exports.createSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }

    findUserInfo(req, res, async (token, user) => {
        const isContains = await Site.findOne({
            where: {
                appid: req.body.appid,
                userId: user.id,
                [Op.or]: [
                    {name: {[Op.like]: `%${req.body.name}%`}},
                    {url: {[Op.like]: `%${req.body.url}%`}},
                ],
            },
        });

        if (isContains) {
            return res.json({
                code: 404,
                message: "该站点已存在",
            });
        }

        const site = await Site.create({
            appid: req.body.appid,
            header: req.body.image || "",
            name: req.body.name,
            url: req.body.url,
            description: req.body.description || "",
            type: req.body.type,
            userId: user.id,
        });

        await SiteAudit.create({
            site_id: site.id,
            userId: user.id,
            appId: req.body.appid,
        });

        return res.json({
            code: 200,
            message: "创建成功，请等待审核。",
            data: site,
        });
    });
};

exports.siteList = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }

    findUserInfo(req, res, async (token, user) => {
        const sites = await Site.findAndCountAll({
            where: {
                appid: user.appid,
                status: "normal",
            },
            attributes: ["header", "name", "url", "type", "description", "id"],
            include: [
                {
                    model: User,
                    attributes: ["name", "avatar"],
                },
            ],
            order: [["createdAt", "DESC"]],
        });

        if (sites.count <= 0) {
            return res.json({
                code: 404,
                message: "暂无数据",
            });
        }
        return res.json({
            code: 200,
            message: "获取成功",
            data: sites.rows,
        });
    });
};

exports.getSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }

    findUserInfo(req, res, async (token, user) => {
        const sites = await Site.findAndCountAll({
            where: {
                userId: user.id,
                appid: req.body.appid,
            },
            attributes: ["header", "name", "url", "type", "description", "id"],
            include: [
                {
                    model: User,
                    attributes: ["name", "avatar"],
                },
            ],
            include: [
                {
                    model: App,
                    attributes: ["name"],
                },
            ],
        });

        if (sites.count <= 0) {
            return res.json({
                code: 404,
                message: "暂无数据",
            });
        }

        return res.json({
            code: 200,
            message: "获取成功",
            data: sites.rows,
        });
    });
};

exports.searchSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg,
        });
    }

    const page = Math.abs(parseInt(req.body.page)) || 1;
    const pageSize = Math.abs(parseInt(req.body.pageSize)) || 50;
    const offset = (page - 1) * pageSize;

    findUserInfo(req, res, async (token, user) => {
        const sites = await Site.findAndCountAll({
            where: {
                appid: req.body.appid,
                status: "normal",
                [Op.or]: [
                    {name: {[Op.like]: `%${req.body.keyword}%`}},
                    {url: {[Op.like]: `%${req.body.keyword}%`}},
                    {description: {[Op.like]: `%${req.body.keyword}%`}},
                ],
            },
            attributes: ["header", "name", "url", "type", "description", "id"],
            include: [
                {
                    model: User,
                    attributes: ["name", "avatar"],
                },
            ],
            limit: pageSize,
            offset: offset,
        });

        if (sites.count <= 0) {
            return res.json({
                code: 404,
                message: "暂无数据",
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
            totalCount: sites.count,
        });
    });
};

exports.deleteSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }

    findUserInfo(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.body.id,
                userId: user.id,
                appid: req.body.appid,
            },
        });

        if (!site) {
            return res.json({
                code: 404,
                message: "无法找到该站点",
            });
        }

        if (site.userId !== user.id) {
            return res.json({
                code: 404,
                message: "无法删除该站点，原因是您不是该站点的创建者",
            });
        }

        await site.destroy();

        return res.json({
            code: 200,
            message: "删除成功",
        });
    });
};

exports.updateSite = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }

    findUserInfo(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.body.id,
                userId: user.id,
                appid: req.body.appid,
            },
        });

        if (!site) {
            return res.json({
                code: 404,
                message: "无法找到该站点",
            });
        }

        if (site.userId !== user.id) {
            return res.json({
                code: 404,
                message: "无法更新该站点，原因是您不是该站点的创建者",
            });
        }
        site.header = req.body.image;
        site.name = req.body.name;
        site.url = req.body.url;
        site.type = req.body.type;
        site.description = req.body.description;

        await site.save();

        return res.json({
            code: 200,
            message: "更新成功",
            data: site,
        });
    });
};

exports.getSiteById = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }

    findUserInfo(req, res, async (token, user) => {
        const site = await Site.findOne({
            where: {
                id: req.query.id,
                userId: user.id,
                appid: req.query.appid,
            },
            attributes: ["header", "name", "url", "type", "description", "id"],
            include: [
                {
                    model: User,
                    attributes: ["name", "avatar"],
                },
            ],
        });

        if (!site) {
            return res.json({
                code: 404,
                message: "无法找到该站点",
            });
        }

        return res.json({
            code: 200,
            message: "获取成功",
            data: site,
        });
    });
};

exports.checkVersion = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    try {
        const token = getToken(req.headers.authorization);
        const {versionCode} = req.query;
        const app = await App.findByPk(req.query.appid);

        if (!app) {
            return res.json({
                code: 404,
                message: "无法找到该应用",
            });
        }

        if (token) {
            findUserInfo(req, res, async (token, user, app) => {
                const count = await VersionChannel.findAndCountAll({
                    where: {
                        bindAppid: req.query.appid,
                    },
                });

                if (count.count <= 0) {
                    return res.json({
                        code: 404,
                        message: "该应用未配置版本渠道",
                    });
                }

                const channelUser = await versionChannelUser.findAndCountAll({
                    where: {
                        userId: user.id,
                    },
                });

                if (channelUser.count <= 0) {
                    const version = await Version.findOne({
                        where: {
                            bindAppid: req.query.appid,
                            bindBand: app.defaultBand || 1,
                            [Op.or]: [{version: {[Op.gt]: versionCode}}],
                        },
                    });

                    if (!version) {
                        return res.json({
                            code: 404,
                            message: "暂无新版本信息",
                        });
                    }

                    return res.json({
                        code: 200,
                        message: "有新版本",
                        data: version,
                    });
                }

                const version = await Version.findOne({
                    where: {
                        bindAppid: req.query.appid,
                        bindBand: channelUser.rows[0].channelId || 0,
                        [Op.or]: [{version: {[Op.gt]: versionCode}}],
                    },
                });

                if (!version) {
                    return res.json({
                        code: 404,
                        message: "暂无新版本信息",
                    });
                }

                if (version.version > versionCode) {
                    return res.json({
                        code: 200,
                        message: "有新版本",
                        data: version,
                    });
                }
            });
        } else {
            const version = await Version.findOne({
                where: {
                    bindAppid: req.query.appid,
                    bindBand: app.defaultBand || 1,
                    [Op.or]: [{version: {[Op.gt]: versionCode}}],
                },
            });

            if (!version) {
                return res.json({
                    code: 404,
                    message: "暂无新版本信息",
                });
            }

            return res.json({
                code: 200,
                message: "有新版本",
                data: version,
            });
        }
    } catch (error) {
        return res.json({
            code: 404,
            message: "服务器内部错误",
        });
    }
};

exports.devicesByPassword = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        res.json({
            code: 404,
            msg: msg,
        });
    } else {
        findUserByPassword(req, res, async (user, app) => {
            const devices = await Token.findAndCountAll({
                where: {
                    account: user.id,
                    appid: req.body.appid,
                },
                attributes: ["token", "markcode", "device", "time"],
            });

            if (devices.count <= 0) {
                return res.json({
                    code: 404,
                    message: "该账号暂无登录设备信息",
                });
            }

            return res.json({
                code: 200,
                message: "获取成功",
                data: devices.rows,
            });
        });
    }
};

exports.logoutDeviceByPassword = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        res.json({
            code: 404,
            msg: msg,
        });
    } else {
        findUserByPassword(req, res, async (user, app) => {
            try {
                const device = await Token.findOne({
                    where: {
                        account: user.id,
                        appid: req.body.appid,
                        token: req.body.token,
                        markcode: req.body.markcode,
                        device: req.body.device,
                    },
                });

                if (!device) {
                    return res.json({
                        code: 404,
                        message: "无法找到该设备",
                    });
                }

                await device.destroy();

                return res.json({
                    code: 200,
                    message: "注销成功",
                    data: {
                        device,
                    },
                });
            } catch (error) {
                return res.json({
                    code: 404,
                    message: "服务器内部错误",
                });
            }
        });
    }
};

exports.modifyName = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        res.json({
            code: 404,
            message: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            // 清理和净化用户名
            let sanitizedName = req.body.name
                // 移除HTML标签和特殊字符
                .replace(/<[^>]*>/g, '')  // 移除HTML标签
                .replace(/[<>=\\\/\n\r]/g, '')  // 移除特殊字符
                // 移除控制字符
                .replace(/[\x00-\x1F\x7F]/g, '')
                // 移除零宽字符
                .replace(/[\u200B-\u200D\uFEFF]/g, '')
                // 移除脚本相关字符
                .replace(/javascript:|data:|vbscript:|expression\(|@import/gi, '')
                // 移除多余空格
                .trim();

            // 确保清理后的名字不为空
            if (!sanitizedName) {
                return res.json({
                    code: 400,
                    message: "无效的用户名",
                });
            }

            user.name = sanitizedName;
            await user.save();

            return res.json({
                code: 200,
                message: "修改成功",
                data: user,
            });
        });
    }
};

exports.modifyPassword = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 404,
            msg: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            if (bcrypt.compareSync(req.body.oldPassword, user.password)) {
                user.password = bcrypt.hashSync(req.body.newPassword, 10);
                await user.save();
                return res.json({
                    code: 200,
                    message: "修改成功",
                    data: user,
                });
            } else {
                return res.json({
                    code: 404,
                    message: "旧密码错误",
                });
            }
        });
    }
};

exports.getGoods = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            msg: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            const goods = await Goods.findAndCountAll({
                where: {
                    bindAppid: req.body.appid,
                },
                attributes: [
                    "name",
                    "integral",
                    "price",
                    "description",
                    "id",
                    "num",
                    "exchange_num",
                    "imageUrl",
                ],
            });

            if (goods.count <= 0) {
                return res.json({
                    code: 404,
                    message: "暂无商品",
                });
            }

            return res.json({
                code: 200,
                message: "获取成功",
                data: goods.rows,
            });
        });
    }
};

exports.order = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            msg: msg,
        });
    } else {
        findUserInfo(req, res, async (token, user, app) => {
            const goods = await Goods.findOne({
                where: {
                    id: req.body.goodsId,
                    bindAppid: req.body.appid,
                },
            });

            if (!goods) {
                return res.json({
                    code: 404,
                    message: "无法找到该商品",
                });
            }

            if (goods.num <= goods.exchange_num) {
                return res.json({
                    code: 404,
                    message: "商品已兑换完",
                });
            }

            const order = await Order.create({
                userId: user.id,
                goodsId: goods.id,
                appid: req.body.appid,
                orderNo: global.generateOrderNumber(),
            });

            if (user.integral < goods.integral) {
                return res.json({
                    code: 404,
                    message: "积分不足",
                });
            }

            if (goods.payType === "integral") {
                user.integral -= goods.integral;
                order.price = goods.integral;
                order.payType = "integral";
                await order.save();
            }

            if (goods.award_type === "vip") {
                if (user.vip_time === 999999999) {
                    await order.destroy();
                    return res.json({
                        code: 404,
                        message: "该用户已是永久会员，无法再兑换该物品",
                    });
                }
                if (
                    user.vip_time === 0 ||
                    !user.vip_time ||
                    dayjs().isAfter(dayjs(user.vip_time))
                ) {
                    user.vip_time = dayjs().unix();
                }

                if (goods.award_num >= 9999) {
                    user.vip_time = 999999999;
                } else {
                    // 检查 vip_time 是 Unix 时间戳还是 Date 对象
                    const currentVipTime = dayjs.unix(user.vip_time);

                    // 添加天数到 VIP 时间
                    user.vip_time = currentVipTime.add(goods.award_num, "day")
                        .unix();
                }
                order.num = goods.award_num;
                order.status = "success";
            }
            goods.num -= 1;
            goods.exchange_num += 1;

            await goods.save();
            await order.save();
            await user.save();

            return res.json({
                code: 200,
                message: "兑换成功",
            });
        });
    }
};

exports.mySites = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    findUserInfo(req, res, async (token, user, app) => {
        const sites = await Site.findAndCountAll({
            where: {
                userId: user.id,
                appid: req.body.appid,
            },
            attributes: ["header", "name", "url", "type", "description", "id"],
            include: [
                {
                    model: User,
                    attributes: ["name", "avatar"],
                },
            ],
        });

        if (sites.count <= 0) {
            return res.json({
                code: 404,
                message: "暂无数据",
            });
        }

        return res.json({
            code: 200,
            message: "获取成功",
            data: sites.rows,
        });
    });
};

exports.myOrders = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    findUserInfo(req, res, async (token, user, app) => {
        const orders = await Order.findAndCountAll({
            where: {
                userId: user.id,
                appid: req.body.appid,
            },
            attributes: ["orderNo", "price", "payType", "status", "num", "createdAt"],
            include: [
                {
                    model: Goods,
                    attributes: [
                        "name",
                        "integral",
                        "price",
                        "description",
                        "id",
                        "num",
                        "exchange_num",
                        "imageUrl",
                    ],
                },
            ],
        });

        if (orders.count <= 0) {
            return res.json({
                code: 404,
                message: "暂无订单",
            });
        }

        return res.json({
            code: 200,
            message: "获取成功",
            data: orders.rows,
        });
    });
};

exports.bonusIntegral = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    findUserInfo(req, res, async (token, user, app) => {
        const targetUser = await User.findOne({
            where: {
                customId: req.body.account,
                appid: req.body.appid,
            },
        });

        if (!targetUser) {
            return res.json({
                code: 404,
                message: "无法找到该用户",
            });
        }

        if (targetUser.id === user.id) {
            return res.json({
                code: 404,
                message: "无法给自己转账",
            });
        }

        if (user.integral < req.body.integral) {
            return res.json({
                code: 404,
                message: "积分不足",
            });
        }

        const integral = Math.abs(parseInt(req.body.integral));

        user.integral -= integral;

        targetUser.integral += integral;

        await user.save();

        await targetUser.save();

        return res.json({
            code: 200,
            message: "转账成功",
        });
    });
};

exports.accountInfoByCustomId = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    findUserInfo(req, res, async (token, user, app) => {
        const targetUser = await User.findOne({
            where: {
                customId: req.body.account,
                appid: req.body.appid,
            },
            attributes: ["name", "avatar", "integral", "customId", "vip_time"],
        });

        if (!targetUser) {
            return res.json({
                code: 404,
                message: "无法找到该用户",
            });
        }

        targetUser.vip_time = getVip(targetUser.vip_time);

        return res.json({
            code: 200,
            message: "获取成功",
            data: targetUser,
        });
    });
};

exports.banList = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    const bans = await User.findAndCountAll({
        where: {
            appid: req.body.appid || req.query.appid,
            [Op.or]: [
                {enabled: false},
                {disabledEndTime: {[Op.gt]: dayjs().toDate()}},
            ],
        },
        attributes: ["name", "avatar", "customId", "reason", "disabledEndTime"],
    });

    if (bans.count <= 0) {
        return res.json({
            code: 404,
            message: "暂无封禁用户",
        });
    }

    return res.json({
        code: 200,
        message: "获取成功",
        data: bans.rows,
    });
};

exports.notice = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    const app = await App.findByPk(req.body.appid || req.query.appid);
    if (!app) {
        res.json({
            code: 201,
            message: "获取失败",
        });
    }

    const notices = await Notice.findAll({
        where: {
            appid: app.id,
        },
    });

    if (notices.length <= 0 || !notices) {
        return res.json({
            code: 201,
            message: "暂无数据",
        });
    }

    res.status(200).json({
        code: 200,
        message: "获取成功",
        data: notices,
    });
};

exports.splash = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    const app = await App.findByPk(req.body.appid || req.query.appid);
    if (!app) {
        res.json({
            code: 201,
            message: "获取失败",
        });
    }

    const notices = await Splash.findAll({
        where: {
            appid: app.id,
            startDate: {
                [Op.lte]: dayjs().toDate(),
            },
            endDate: {
                [Op.gte]: dayjs().add(7, 'days').toDate(),
            },
        },
    });

    if (notices.length <= 0 || !notices) {
        return res.json({
            code: 201,
            message: "暂无数据",
        });
    }

    res.status(200).json({
        code: 200,
        message: "获取成功",
        data: notices,
    });
};

exports.getUserOnlineStatus = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.json({
                code: 404,
                message: msg,
            });
        }

        findUserInfo(req, res, async (token, user, app) => {
            // 从 appControllers 中的 onlineUsers Map 获取在线状态
            const onlineStatus = global.onlineUsers
                ? global.onlineUsers.get(user.id)
                : null;

            res.json({
                code: 200,
                message: "获取成功",
                data: {
                    isOnline: !!onlineStatus,
                    lastActive: onlineStatus ? onlineStatus.lastActive : null,
                    ip: onlineStatus ? onlineStatus.ip : null,
                    userAgent: onlineStatus ? onlineStatus.userAgent : null,
                },
            });
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: "获取在线状态失败",
            error: error.message,
        });
    }
};

exports.getAppOnlineUsers = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.json({
                code: 404,
                message: msg,
            });
        }

        findUserInfo(req, res, async (token, user, app) => {
            // 从 appControllers 中的 onlineUsers Map 获取在线用户
            const onlineUsersList = global.onlineUsers
                ? Array.from(global.onlineUsers.entries())
                    .filter(([_, userData]) => userData.appid === req.body.appid)
                    .map(([userId, userData]) => ({
                        userId,
                        lastActive: userData.lastActive,
                        ip: userData.ip,
                        userAgent: userData.userAgent,
                    }))
                : [];

            res.json({
                code: 200,
                message: "获取成功",
                data: {
                    totalOnline: onlineUsersList.length,
                    users: onlineUsersList,
                },
            });
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: "获取在线用户列表失败",
            error: error.message,
        });
    }
};

exports.setUserOnlineStatus = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.json({
                code: 404,
                message: msg,
            });
        }

        findUserInfo(req, res, async (token, user, app) => {
            // 检查是否为管理员
            if (!user.isAdmin) {
                return res.json({
                    code: 403,
                    message: "无权限操作",
                });
            }

            const {targetUserId, status} = req.body;

            if (status === "online") {
                // 手动设置用户为在线
                global.onlineUsers.set(targetUserId, {
                    lastActive: Date.now(),
                    ip: req.ip,
                    userAgent: req.headers["user-agent"],
                    appid: req.body.appid,
                });
            } else if (status === "offline") {
                // 手动设置用户为离线
                global.onlineUsers.delete(targetUserId);
            }

            res.json({
                code: 200,
                message: `用户 ${targetUserId} 状态已更新为 ${status}`,
                onlineCount: global.onlineUsers.size,
            });
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: "更新用户在线状态失败",
            error: error.message,
        });
    }
};

const {io} = require("../index");
const {mysql} = require("../database");
const SecurityScoreService = require("../function/securityScoreService");
const {UserLog} = require("../models/userLog");

exports.getQQInfo = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            message: msg,
        });
    }
    try {
        const app = await App.findByPk(req.body.appid || req.query.appid);
        if (!app) {
            res.json({
                code: 201,
                message: "获取失败",
            });
        }
        axios
            .get(`https://apii.lolimi.cn/api/qqzc/api?qq=${req.body.qq}&key=${global.SANGBO_API_KEY}`)
            .then((response) => {
                if (!response) {
                    return res.json({
                        code: 201,
                        message: "获取失败",
                    });
                } else if (response.status !== 200) {
                    return res.json({
                        code: 201,
                        message: "获取失败",
                    });
                } else if (!response.data) {
                    return res.json({
                        code: 201,
                        message: "获取失败",
                    });
                } else {
                    return res.json({
                        code: 200,
                        message: "获取成功",
                        data: response.data,
                    });
                }
            })
            .catch((error) => {
                res.json({
                    code: 201,
                    message: "获取失败",
                });
            });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: "获取失败",
            error: error.message,
        });
    }
};

// Socket.IO 用户状态管理方法
exports.socketUserStatus = {
    /**
     * 用户上线
     * @param {Socket} socket Socket.IO 连接实例
     * @param {Object} data 用户数据
     */
    online: async (socket, data) => {
        try {
            const {userId, appid} = data;

            // 验证用户
            const user = await User.findOne({
                where: {id: userId, appid: appid},
            });

            if (!user) {
                socket.emit("user_online_error", {
                    message: "用户验证失败",
                });
                return;
            }

            // 记录用户在线状态
            global.onlineUsers.set(userId, {
                socketId: socket.id,
                appid: appid,
                lastActive: Date.now(),
                ip: socket.handshake.address,
            });

            // 广播用户上线
            io.emit("user_status_change", {
                userId,
                status: "online",
                appid,
            });

            socket.emit("user_online_success", {
                message: "上线成功",
                data: {
                    userId,
                    appid,
                    lastActive: Date.now(),
                },
            });

            console.log(`用户 ${userId} 上线`);
        } catch (error) {
            console.error("用户上线错误:", error);
            socket.emit("user_online_error", {
                message: "上线处理发生错误",
                error: error.message,
            });
        }
    },

    /**
     * 用户下线
     * @param {Socket} socket Socket.IO 连接实例
     * @param {Object} data 用户数据
     */
    offline: async (socket, data) => {
        try {
            const {userId, appid} = data;

            // 验证用户
            const user = await User.findOne({
                where: {id: userId, appid: appid},
            });

            if (!user) {
                socket.emit("user_offline_error", {
                    message: "用户验证失败",
                });
                return;
            }

            // 删除用户在线状态
            global.onlineUsers.delete(userId);

            // 广播用户下线
            io.emit("user_status_change", {
                userId,
                status: "offline",
                appid,
            });

            socket.emit("user_offline_success", {
                message: "下线成功",
                data: {
                    userId,
                    appid,
                },
            });

            console.log(`用户 ${userId} 下线`);
        } catch (error) {
            console.error("用户下线错误:", error);
            socket.emit("user_offline_error", {
                message: "下线处理发生错误",
                error: error.message,
            });
        }
    },

    /**
     * 获取用户在线状态
     * @param {Socket} socket Socket.IO 连接实例
     * @param {Object} data 用户数据
     */
    getStatus: async (socket, data) => {
        try {
            const {userId, appid} = data;

            // 验证用户
            const user = await User.findOne({
                where: {id: userId, appid: appid},
            });

            if (!user) {
                socket.emit("get_user_status_error", {
                    message: "用户验证失败",
                });
                return;
            }

            // 获取用户在线状态
            const onlineStatus = global.onlineUsers.get(userId);

            socket.emit("user_status", {
                userId,
                appid,
                isOnline: !!onlineStatus,
                lastActive: onlineStatus ? onlineStatus.lastActive : null,
                ip: onlineStatus ? onlineStatus.ip : null,
            });

            console.log(`获取用户 ${userId} 在线状态`);
        } catch (error) {
            console.error("获取用户状态错误:", error);
            socket.emit("get_user_status_error", {
                message: "获取用户状态发生错误",
                error: error.message,
            });
        }
    },

    /**
     * 获取应用内在线用户列表
     * @param {Socket} socket Socket.IO 连接实例
     * @param {Object} data 应用数据
     */
    getOnlineUsers: async (socket, data) => {
        try {
            const {appid} = data;

            // 验证应用
            const app = await App.findByPk(appid);
            if (!app) {
                socket.emit("get_online_users_error", {
                    message: "应用验证失败",
                });
                return;
            }

            // 获取应用内在线用户
            const appOnlineUsers = Array.from(global.onlineUsers.entries())
                .filter(([_, userInfo]) => userInfo.appid === appid)
                .map(([userId, userInfo]) => ({
                    userId,
                    lastActive: userInfo.lastActive,
                    ip: userInfo.ip,
                }));

            socket.emit("online_users_list", {
                appid,
                total: appOnlineUsers.length,
                users: appOnlineUsers,
            });

            console.log(`获取应用 ${appid} 在线用户列表`);
        } catch (error) {
            console.error("获取在线用户列表错误:", error);
            socket.emit("get_online_users_error", {
                message: "获取在线用户列表发生错误",
                error: error.message,
            });
        }
    },
};

/**
 * 同步数据到云端
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
exports.syncData = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            msg: msg,
        });
    }

    try {
        const {settings, watchHistory} = req.body;
        const userId = req.user.id; // 假设用户ID从认证中获取

        // 模拟将数据同步到云端
        const cloudResponse = await axios.post(`${process.env.CLOUD_API_URL}/sync`, {
            userId,
            settings,
            watchHistory,
        });

        // 记录同步历史
        await Log.create({
            log_type: "sync",
            log_time: dayjs().format("YYYY-MM-DD HH:mm:ss"),
            log_content: `User ${userId} synced data to cloud`,
            log_ip: req.clientIp,
            log_user_id: userId,
            appid: req.body.appid,
        });

        res.status(200).json({
            code: 200,
            message: "数据同步成功",
            data: cloudResponse.data,
        });
    } catch (error) {
        console.error("同步数据时出错：", error);
        res.json({
            code: 500,
            message: "服务器内部错误",
            error: error.message,
        });
    }
};

/**
 * 获取音乐支持的音质列表
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function getMusicQualities(req, res) {
    try {
        // 验证白名单权限
        const whitelistCheck = await checkWhitelist(req, res, null, 'qq_music_quality');
        if (whitelistCheck && whitelistCheck.code !== 200) {
            return res.json(whitelistCheck);
        }

        const {url} = req.query;

        // 验证URL参数
        if (!url) {
            return res.json({
                code: 400,
                message: 'URL参数不能为空'
            });
        }

        // 验证是否为QQ音乐链接
        if (!url.includes('qq.com') && !url.includes('y.qq.com')) {
            return res.json({
                code: 400,
                message: '请输入有效的QQ音乐链接'
            });
        }

        // 调用第三方API
        const apiUrl = `https://apii.lolimi.cn/api/wsyy/index`;
        const response = await axios.get(apiUrl, {
            params: {
                key: global.SANGBO_API_KEY,
                url: url
            }
        });

        // 检查API响应
        if (!response.data || response.data.code === 404) {
            return res.json({
                code: 404,
                message: '无法解析该音乐链接'
            });
        }

        // 提取所有可用音质
        const qualities = Object.entries(response.data.music_url).map(([format, info]) => ({
            format,
            bitrate: info.bitrate,
            type: format.split('_')[0] || 'mp3'
        }));

        return res.json({
            code: 200,
            message: '获取音质列表成功',
            data: {
                songName: response.data.music_info.name,
                qualities: qualities
            }
        });
    } catch (error) {
        console.error('获取音质列表错误:', error);
        return res.json({
            code: 500,
            message: '获取音质列表服务异常'
        });
    }
}

/**
 * QQ音乐链接解析
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function parseMusicUrl(req, res) {
    try {
        // 验证白名单权限
        const whitelistCheck = await checkWhitelist(req, res, null, 'qq_music');
        if (whitelistCheck && whitelistCheck.code !== 200) {
            return res.json(whitelistCheck);
        }

        const {url, quality} = req.query;

        // 验证URL参数
        if (!url) {
            return res.json({
                code: 400,
                message: 'URL参数不能为空'
            });
        }

        // 验证是否为QQ音乐链接
        if (!url.includes('qq.com') && !url.includes('y.qq.com')) {
            return res.json({
                code: 400,
                message: '请输入有效的QQ音乐链接'
            });
        }

        const apiUrl = `https://apii.lolimi.cn/api/wsyy/index`;
        const response = await axios.get(apiUrl, {
            params: {
                key: global.SANGBO_API_KEY,
                url: url
            }
        });

        // 检查API响应
        if (!response.data || response.data.code === 404) {
            return res.json({
                code: 404,
                message: '无法解析该音乐链接'
            });
        }

        // 处理音质选择
        let selectedQuality = null;
        if (quality) {
            // 查找指定音质
            const qualities = Object.entries(response.data.music_url);
            const found = qualities.find(([format]) => format === quality);
            if (found) {
                selectedQuality = {
                    format: found[0],
                    ...found[1]
                };
            }
        }

        // 如果没有指定音质或指定音质不可用，返回所有音质
        const urls = {};
        if (selectedQuality) {
            urls[selectedQuality.format] = {
                url: selectedQuality.url,
                bitrate: selectedQuality.bitrate
            };
        } else {
            Object.entries(response.data.music_url).forEach(([format, info]) => {
                urls[format] = {
                    url: info.url,
                    bitrate: info.bitrate
                };
            });
        }

        // 返回处理后的数据
        return res.json({
            code: 200,
            message: '解析成功',
            data: {
                name: response.data.music_info.name,
                singer: response.data.music_info.singer,
                album: response.data.music_info.album,
                cover: response.data.music_info.pic,
                duration: response.data.music_info.interval,
                urls: urls,
                lyric: response.data.music_lyric.lyric,
                selectedQuality: quality || 'all'
            }
        });
    } catch (error) {
        console.error('音乐解析错误:', error);
        return res.json({
            code: 500,
            message: '音乐解析服务异常'
        });
    }
}

/**
 * 下载QQ音乐
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function downloadMusic(req, res) {
    try {
        // 验证白名单权限
        const whitelistCheck = await checkWhitelist(req, res, null, 'qq_music_download');
        if (whitelistCheck && whitelistCheck.code !== 200) {
            return res.json(whitelistCheck);
        }

        const {url, quality} = req.query;

        // 验证URL参数
        if (!url) {
            return res.json({
                code: 400,
                message: 'URL参数不能为空'
            });
        }

        // 验证是否为QQ音乐链接
        if (!url.includes('qq.com') && !url.includes('y.qq.com')) {
            return res.json({
                code: 400,
                message: '请输入有效的QQ音乐链接'
            });
        }

        const apiUrl = `https://apii.lolimi.cn/api/wsyy/index`;
        const response = await axios.get(apiUrl, {
            params: {
                key: global.SANGBO_API_KEY,
                url: url
            }
        });

        // 检查API响应
        if (!response.data || response.data.code === 404) {
            return res.json({
                code: 404,
                message: '无法解析该音乐链接'
            });
        }

        // 获取音乐信息
        const musicInfo = response.data.music_info;
        const musicUrls = response.data.music_url;

        // 选择下载质量
        let downloadUrl;
        let fileFormat;
        let contentType;

        if (quality && musicUrls[quality]) {
            downloadUrl = musicUrls[quality].url;
            fileFormat = quality.includes('ogg') ? 'ogg' :
                quality.includes('aac') ? 'm4a' : 'mp3';
            contentType = quality.includes('ogg') ? 'audio/ogg' :
                quality.includes('aac') ? 'audio/mp4' : 'audio/mpeg';
        } else {
            // 默认使用最高质量
            const bestQuality = Object.entries(musicUrls)
                .sort((a, b) => {
                    const bitrateA = parseInt(a[1].bitrate);
                    const bitrateB = parseInt(b[1].bitrate);
                    return bitrateB - bitrateA;
                })[0];

            downloadUrl = bestQuality[1].url;
            fileFormat = bestQuality[0].includes('ogg') ? 'ogg' :
                bestQuality[0].includes('aac') ? 'm4a' : 'mp3';
            contentType = bestQuality[0].includes('ogg') ? 'audio/ogg' :
                bestQuality[0].includes('aac') ? 'audio/mp4' : 'audio/mpeg';
        }

        // 构建文件名
        const fileName = `${musicInfo.name} - ${musicInfo.singer}.${fileFormat}`
            .replace(/[<>:"/\\|?*]/g, '_'); // 替换不合法的文件名字符

        // 获取音频文件
        const audioResponse = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream'
        });

        // 设置响应头
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);

        // 流式传输音频数据
        audioResponse.data.pipe(res);

        // 处理错误
        audioResponse.data.on('error', (error) => {
            console.error('音频流错误:', error);
            if (!res.headersSent) {
                res.json({
                    code: 500,
                    message: '下载音频文件时发生错误'
                });
            }
        });

    } catch (error) {
        console.error('音乐下载错误:', error);
        if (!res.headersSent) {
            return res.json({
                code: 500,
                message: '音乐下载服务异常'
            });
        }
    }
}

/**
 * 查询快递物流信息
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
async function queryExpress(req, res) {
    try {
        const {dh} = req.body;

        // 验证运单号参数
        if (!dh) {
            return res.json({
                code: 400,
                message: '快递单号不能为空'
            });
        }

        // 调用第三方API获取物流信息
        const apiUrl = `https://apii.lolimi.cn/api/wlv2/index`;
        const response = await axios.get(apiUrl, {
            params: {
                key: global.SANGBO_API_KEY,
                dh: dh
            }
        });

        // 检查API响应
        if (!response.data || response.data.code === 404) {
            return res.json({
                code: 404,
                message: '未查询到该快递单号信息'
            });
        }

        // 优化返回数据结构
        const result = {
            code: 200,
            message: 'success',
            data: {
                expressCompany: response.data.kdname, // 快递公司名称
                trackingNumber: dh, // 运单号
                status: response.data.Pathway?.[0]?.statusDesc || '暂无状态', // 当前状态
                traces: (response.data.Pathway || []).map(item => ({
                    time: item.time, // 时间
                    location: [item.city, item.district].filter(Boolean).join(' '), // 地点
                    status: item.statusDesc, // 状态
                    description: item.desc, // 详细描述
                    facility: item.facilityName, // 设施名称
                    operator: item.operator || '', // 操作员
                    operatorContact: item.operatorContact || '' // 操作员联系方式
                })).reverse() // 按时间正序排列
            },
            timestamp: new Date().toISOString(),
            debugInfo: response.data.debug
        };

        return res.json(result);

    } catch (error) {
        console.error('快递查询错误:', error);
        return res.json({
            code: 500,
            message: '快递查询服务异常'
        });
    }
}


/**
 * 心跳检测
 */
exports.heartbeat = async (req, res) => {
    try {
        const {appid} = req.body;
        const token = getToken(req.headers.authorization);

        // 验证用户身份
        const tokenRecord = await Token.findOne({
            where: {token, appid}
        });

        if (!tokenRecord) {
            return res.json({
                code: 401,
                message: "登录状态已失效"
            });
        }

        // 更新用户在线状态
        const onlineUser = global.onlineUsers.get(tokenRecord.account);
        if (onlineUser) {
            onlineUser.lastActive = Date.now();
            onlineUser.ip = req.clientIp;
            onlineUser.userAgent = req.headers['user-agent'];
            global.onlineUsers.set(tokenRecord.account, onlineUser);
        } else {
            // 如果用户不在在线列表中，重新添加
            global.onlineUsers.set(tokenRecord.account, {
                socketId: null,
                appid,
                lastActive: Date.now(),
                ip: req.clientIp,
                userAgent: req.headers['user-agent'],
                device: tokenRecord.device,
                markcode: tokenRecord.markcode
            });
        }

        // 清理超时用户
        cleanInactiveUsers();

        // 返回在线统计
        const onlineCount = Array.from(global.onlineUsers.values())
            .filter(user => user.appid === parseInt(appid)).length;

        // 记录心跳日志
        await UserLogService.quickLog({
            appid,
            userId: tokenRecord.account,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, 'heartbeat', '心跳检测', {
            timestamp: Date.now(),
            onlineCount,
            device: tokenRecord.device,
            markcode: tokenRecord.markcode
        });

        return res.json({
            code: 200,
            message: "心跳检测成功",
            data: {timestamp: Date.now(), onlineCount}
        });

    } catch (error) {
        await UserLogService.quickError({
            appid: req.body.appid,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, '心跳检测失败', error);

        return res.status(500).json({
            code: 500,
            message: '心跳检测失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 获取当前有效的开屏页面
 */
exports.getActiveSplash = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {appid} = req.body;
        const now = dayjs().toDate();

        // 尝试从缓存获取
        const cacheKey = `active_splash:${appid}`;
        try {
            const cachedSplash = await redisClient.get(cacheKey);
            if (cachedSplash) {
                return res.json({
                    code: 200,
                    message: '获取开屏页面成功',
                    data: JSON.parse(cachedSplash)
                });
            }
        } catch (error) {
            console.error('Redis cache error:', error);
        }

        // 获取当前有效的开屏页面
        const splash = await Splash.findOne({
            where: {
                appid,
                startDate: {[Op.lte]: now},
                endDate: {[Op.gte]: now}
            },
            order: [['startDate', 'DESC']] // 如果有多个，获取最新的
        });

        if (!splash) {
            return res.json({
                code: 404,
                message: '当前没有有效的开屏页面'
            });
        }

        const response = {
            id: splash.id,
            title: splash.title,
            background: splash.background,
            skip: splash.skip,
            time: splash.time,
            remainingTime: dayjs(splash.endDate).diff(now, 'second'),
            startDate: dayjs(splash.startDate).format('YYYY-MM-DD HH:mm:ss'),
            endDate: dayjs(splash.endDate).format('YYYY-MM-DD HH:mm:ss')
        };

        // 缓存结果
        try {
            // 缓存到最近的整点，但不超过结束时间
            const expiryTime = Math.min(
                dayjs().endOf('hour').diff(dayjs(), 'second'),
                dayjs(splash.endDate).diff(dayjs(), 'second')
            );
            await redisClient.set(cacheKey, JSON.stringify(response), 'EX', expiryTime);
        } catch (error) {
            console.error('Redis cache error:', error);
        }

        // 记录访问日志
        if (splash) {
            await UserLogService.quickLog({
                appid: req.body.appid,
                ip: req.clientIp,
                userAgent: req.headers['user-agent']
            }, 'splash_view', '访问开屏页面', {
                splashId: splash.id,
                title: splash.title
            });
        }

        return res.json({
            code: 200,
            message: '获取开屏页面成功',
            data: response
        });
    } catch (error) {
        await UserLogService.quickError({
            appid: req.body.appid,
            ip: req.clientIp,
            userAgent: req.headers['user-agent']
        }, '获取开屏页面失败', error);

        return res.status(500).json({
            code: 500,
            message: '获取失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 获取抽奖结果
 */
exports.getLotteryResult = async (req, res) => {
    try {
        const {lotteryId} = req.params;
        const {appid} = req.query;
        const userId = req.user.id; // 从token中获取用户ID

        // 查找抽奖任务
        const lottery = await Lottery.findOne({
            where: {
                lotteryId,
                appid
            },
            attributes: [
                'id', 'lotteryId', 'name', 'status', 'drawTime',
                'rewardType', 'rewardAmount', 'rewardUnit',
                'winners', 'completedAt'
            ]
        });

        if (!lottery) {
            return res.status(404).json({
                code: 404,
                message: '抽奖任务不存在'
            });
        }

        // 如果抽奖未完成
        if (lottery.status !== 'completed') {
            return res.json({
                code: 200,
                message: '抽奖尚未开奖',
                data: {
                    lotteryId: lottery.lotteryId,
                    name: lottery.name,
                    status: lottery.status,
                    drawTime: dayjs(lottery.drawTime).format('YYYY-MM-DD HH:mm:ss')
                }
            });
        }

        // 检查用户是否中奖
        const isWinner = lottery.winners.some(winner => winner.id === userId);

        // 格式化中奖名单（只展示部分信息）
        const formattedWinners = lottery.winners.map(winner => ({
            name: winner.name || winner.account,
            avatar: winner.avatar,
            reward: {
                type: winner.reward.type,
                amount: winner.reward.amount,
                unit: winner.reward.unit
            }
        }));

        // 记录查询日志
        await UserLogService.quickLog({
            appid,
            userId
        }, 'lottery_query', '查询抽奖结果', {
            lotteryId,
            isWinner,
            queryTime: new Date()
        });

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                lotteryId: lottery.lotteryId,
                name: lottery.name,
                status: lottery.status,
                drawTime: dayjs(lottery.drawTime).format('YYYY-MM-DD HH:mm:ss'),
                completedAt: dayjs(lottery.completedAt).format('YYYY-MM-DD HH:mm:ss'),
                isWinner,
                myReward: isWinner ? lottery.winners.find(w => w.id === userId).reward : null,
                winners: formattedWinners
            }
        });

    } catch (error) {
        console.error('获取抽奖结果失败:', error);

        // 记录错误日志
        await UserLogService.quickError({
            appid: req.query.appid,
            userId: req.user.id
        }, 'lottery_query', '查询抽奖结果失败', error);

        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 获取指定抽奖结果
 */
exports.getLotteryResultById = async (req, res) => {
    try {
        const {lotteryId} = req.params;
        const {appid} = req.query;
        const userId = req.user.id;

        // 查找抽奖任务
        const lottery = await Lottery.findOne({
            where: {
                lotteryId,
                appid,
                status: 'completed' // 只查询已完成的抽奖
            },
            attributes: [
                'id', 'lotteryId', 'name', 'status', 'drawTime',
                'rewardType', 'rewardAmount', 'rewardUnit',
                'winners', 'completedAt', 'participantsCount'
            ]
        });

        if (!lottery) {
            return res.status(404).json({
                code: 404,
                message: '未找到已完成的抽奖结果'
            });
        }

        // 检查用户是否中奖
        const isWinner = lottery.winners.some(winner => winner.id === userId);

        // 格式化中奖名单（只展示部分信息）
        const formattedWinners = lottery.winners.map(winner => ({
            id: winner.id === userId ? winner.id : undefined, // 只返回当前用户的ID
            name: winner.name || winner.account,
            avatar: winner.avatar,
            reward: {
                type: winner.reward.type,
                amount: winner.reward.amount,
                unit: winner.reward.unit
            },
            isMe: winner.id === userId
        }));

        // 记录查询日志
        await UserLogService.quickLog({
            appid,
            userId
        }, 'lottery_query', '查询指定抽奖结果', {
            lotteryId,
            isWinner,
            queryTime: new Date()
        });

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                lotteryId: lottery.lotteryId,
                name: lottery.name,
                status: lottery.status,
                drawTime: dayjs(lottery.drawTime).format('YYYY-MM-DD HH:mm:ss'),
                completedAt: dayjs(lottery.completedAt).format('YYYY-MM-DD HH:mm:ss'),
                participantsCount: lottery.participantsCount || 0,
                rewardInfo: {
                    type: lottery.rewardType,
                    amount: lottery.rewardAmount,
                    unit: lottery.rewardUnit
                },
                isWinner,
                myReward: isWinner ? lottery.winners.find(w => w.id === userId).reward : null,
                winners: formattedWinners,
                statistics: {
                    totalWinners: lottery.winners.length,
                    totalRewardAmount: lottery.winners.reduce((sum, winner) =>
                        sum + winner.reward.amount, 0)
                }
            }
        });

    } catch (error) {
        console.error('获取指定抽奖结果失败:', error);

        // 记录错误日志
        await UserLogService.quickError({
            appid: req.query.appid,
            userId: req.user.id
        }, 'lottery_query', '查询指定抽奖结果失败', error);

        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 发送邮箱验证码
 */
exports.sendEmailVerificationCode = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg
        });
    }

    try {
        const {email} = req.body;
        const token = getToken(req.headers.authorization);

        const allUser = await User.findOne({
            where: {
                email: email
            }
        })

        if (allUser) {
            return res.json({
                code: 400,
                message: "该邮箱已被绑定"
            });
        }

        findUserInfo(req, res, (token, user, app) => {
            // 检查邮箱格式
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new Error("邮箱格式不正确");
            }

            // 生成验证码
            const verificationCode = RandomService.generateNumber(6);

            // 使用 RedisService 存储验证码，设置5分钟过期
            const redisKey = `email_verification:${user.id}:${email}`;
            RedisService.set(redisKey, verificationCode);
            RedisService.expire(redisKey, 300, RedisService.TimeUnit.SECONDS);

            // 发送验证码邮件
            mailService.sendVerificationCode(app, email, verificationCode);

            // 记录日志
            UserLogService.logEmailVerification({
                appid: user.appid,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent'],
                email
            });

            res.json({
                code: 200,
                message: "验证码已发送到邮箱"
            });
        });
    } catch (error) {
        console.error('发送邮箱验证码失败:', error);
        res.json({
            code: 500,
            message: error.message
        });
    }
};

/**
 * 绑定邮箱
 */
exports.bindEmail = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg
        });
    }

    try {
        const {email, code} = req.body;
        const token = getToken(req.headers.authorization);

        findUserInfo(req, res, async (token, user, app) => {
            const transaction = await mysql.transaction();

            // 检查邮箱格式
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new Error("邮箱格式不正确");
            }

            // 检查验证码
            const redisKey = `email_verification:${user.id}:${email}`;
            const storedCode = await RedisService.get(redisKey);
            if (!storedCode || storedCode !== parseInt(code)) {

                console.log(storedCode, " + ", code)

                return res.json({
                    code: 400,
                    message: "验证码错误或已过期"
                })
            }

            // 检查邮箱是否已被其他用户使用
            const existingUser = await User.findOne({
                where: {
                    email,
                    id: {[Op.ne]: user.id}
                },
                transaction
            });

            if (existingUser) {
                throw new Error("该邮箱已被其他用户绑定");
            }

            // 更新用户邮箱
            await User.update({
                email
            }, {
                where: {id: user.id},
                transaction
            });

            // 删除验证码
            await RedisService.del(redisKey);

            // 记录日志
            await UserLogService.logEmailBind({
                appid: user.appid,
                userId: user.id,
                ip: req.clientIp,
                userAgent: req.headers['user-agent'],
                email
            });

            await transaction.commit();

            res.json({
                code: 200,
                message: "邮箱绑定成功"
            });
        })
    } catch (error) {
        await transaction.rollback();
        res.json({
            code: 500,
            message: error.message
        });
    }
};

module.exports = {
    ...exports,
    queryExpress,
    parseMusicUrl,
    getMusicQualities,
    downloadMusic,
};
