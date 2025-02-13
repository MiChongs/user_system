require("../function/dayjs");
const crypto = require("crypto");
const global = require("../global");
const bcrypt = require("bcrypt");
const {validationResult} = require("express-validator");
const {getToken, stringRandom} = require("../global");
const {AdminToken} = require("../models/adminToken");
const {App} = require("../models/app");
const {User} = require("../models/user");
const {Card} = require("../models/card");
const dayjs = require("../function/dayjs");
const path = require("node:path");
const fs = require("fs");
const columnify = require("columnify");
const {Admin} = require("../models/admin");
const {getAvatar} = require("../function");
const {getVip} = require("../function/getVip");
const {Banner} = require("../models/banner");
const {hashSync} = require("bcrypt");
const winston = require("winston");
const {findUserInfo} = require("../function/findUser");
const {mysql} = require("../database");
const {Op, Sequelize} = require("sequelize");
const {
    sendEmailUpdateNotification,
    sendUpdateNotification,
    sendCustomIdUpdateNotification,
    sendVipExpirationNotification,
    sendPasswordUpdateNotification,
    sendMembershipUpdateNotification,
    sendLotteryWinningNotification
} = require("../function/mailService");
const {Log} = require("../models/log");
const {Token} = require("../models/token");
const {Daily} = require("../models/daily");
const {Notice} = require("../models/notice");
const logger = winston.createLogger({
    level: "info",
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({filename: "app.log"}),
    ],
});

// 在文件开头添加常量配置
const HEARTBEAT_INTERVAL = 30000; // 心跳间隔 30 秒
const HEARTBEAT_TIMEOUT = 60000;  // 心跳超时 60 秒

const AppLogService = require('../function/appLogService');
const RedisService = require('../function/redisService');
const {Splash} = require("../models/splash");

// 在文件开头添加地区映射配置
const REGION_MAPPINGS = require('../function/regionMappings');

const schedule = require('node-schedule');
const SystemLogService = require('../function/systemLogService');
const taskService = require('../function/taskService');
const SecurityScoreService = require("../function/securityScoreService");
const {Lottery} = require('../models/lottery');
const UserLogService = require("../function/userLogService");

// 存储定时任务的Map
const lotteryJobs = new Map();

// 在文件开头添加
const cleanupLotteryJobs = () => {
    for (const [id, job] of lotteryJobs.entries()) {
        job.cancel();
    }
    lotteryJobs.clear();
};

// 添加进程退出处理
process.on('SIGINT', async () => {
    console.log('Cleaning up lottery jobs...');
    cleanupLotteryJobs();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Cleaning up lottery jobs...');
    cleanupLotteryJobs();
    process.exit(0);
});

/**
 * # 创建应用
 * ## 参数
 * 1. appid
 * 1. name
 *
 * 请求该接口需要管理员Token，在请求头设置即可
 */
exports.create = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({code: 400, msg: msg});
    }

    try {
        const tokenValue = getToken(req.headers.authorization);
        const token = await AdminToken.findOne({where: {token: tokenValue}});

        if (!token) {
            logger.warn("Invalid admin token");
            return res.json({code: 401, message: "管理员Token错误"});
        }

        const existingApp = await App.findOne({where: {id: req.body.id}});

        if (existingApp) {
            logger.warn("App already exists");
            return res.json({code: 401, message: "该应用已存在"});
        }

        const admin = await Admin.findOne({where: {account: token.account}});

        if (!admin) {
            logger.warn("Admin does not exist");
            return res.json({code: 401, message: "管理员不存在"});
        }

        const newApp = await App.create({
            id: req.body.id,
            name: req.body.name,
            key: stringRandom(32),
            bind_admin_account: admin.id,
        });

        // 使用 AppLogService 记录应用创建
        await AppLogService.builder({
            appid: newApp.id,
            adminId: admin.id,
            ip: req.clientIp,
            device: req.headers['user-agent']
        })
            .type('app_create')
            .content(`创建应用: ${newApp.name}`)
            .details({
                appId: newApp.id,
                appName: newApp.name,
                creator: admin.account
            })
            .save();

        logger.info("App created successfully", {appId: newApp.id});
        res.status(200).json({code: 200, message: newApp});
    } catch (error) {
        logger.error("Error creating app", {error: error.message});
        res.status(500).json({code: 500, message: error.message});
    }
};

exports.createNotification = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        await App.findByPk(req.params.appid || req.body.appid)
            .then((app) => {
                if (app == null) {
                    // 如果应用不存在，返回400错误并提示应用无法找到
                    return res.json({
                        code: 400,
                        message: "无法找到该应用",
                    });
                }
                if (app instanceof App) {
                    if (app.status) {
                        Notification.create({
                            appid: app.id,
                            title: req.body.title,
                            summary: req.body.content,
                        })
                            .then((result) => {
                                res.status(200).json({
                                    code: 200,
                                    message: "成功创建通知",
                                });
                            })
                            .catch((err) => {
                                res.json({
                                    code: 201,
                                    message: "创建通知失败",
                                });
                            });
                    } else {
                        res.json({
                            code: 201,
                            message: "应用已停止",
                        });
                    }
                }
            })
            .catch((error) => {
                // 处理查找应用的错误
                res.json({
                    code: 500,
                    message: "查找应用出错",
                    error: error,
                });
            });
    }
};

exports.notifications = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        App.findByPk(req.params.appid || req.body.appid).then((app) => {
            if (app) {
                Notification.findAll({
                    where: {
                        appid: app.id,
                    },
                })
                    .then((result) => {
                        res.status(200).json({
                            code: 200,
                            message: result,
                        });
                    })
                    .catch((error) => {
                        res.json({
                            code: 400,
                            message: "查找应用通知失败",
                            data: error.message,
                        });
                    });
            } else {
                res.json({
                    code: 401,
                    message: "应用不存在",
                });
            }
        });
    }
};

/**
 * # 删除应用
 * ## 参数
 * 1. appid
 *
 * 请求该接口需要管理员Token，在请求头设置即可
 */

exports.deleteApp = (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        App.findAll({
            where: {
                id: req.body.appid,
            },
        })
            .then((result) => {
                if (result[0] != null) {
                    result[0]
                        .destroy()
                        .then((r) =>
                            res.status(200).json({
                                code: 200,
                                message: "应用删除成功",
                            })
                        )
                        .catch((error) => {
                            res.json({
                                code: 201,
                                message: "应用删除失败",
                            });
                        });
                } else {
                    res.json({
                        code: 401,
                        message: "该应用不存在",
                    });
                }
            })
            .catch((error) => {
                res.json({
                    code: 500,
                    message: error,
                });
            });
    }
};

exports.apps = function (req, res) {
    App.findAll()
        .then((result) => {
            res.status(200).json({
                code: 200,
                message: result,
            });
        })
        .catch((error) => {
            res.json({
                code: 500,
                message: error,
            });
        });
};

exports.appConfig = function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        App.findByPk(req.params.appid || req.body.appid)
            .then((app) => {
                if (app == null) {
                    // 如果应用不存在，返回400错误并提示应用无法找到
                    return res.json({
                        code: 400,
                        message: "无法找到该应用",
                    });
                } else {
                    res.status(200).json({
                        code: 200,
                        message: "获取配置成功",
                        data: app,
                    });
                }
            })
            .catch((error) => {
                res.json({
                    code: 500,
                    message: error,
                });
            });
    }
};

exports.updateAppConfig = function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        App.findByPk(req.params.appid || req.body.appid)
            .then((app) => {
                if (app == null) {
                    // 如果应用不存在，返回400错误并提示应用无法找到
                    return res.json({
                        code: 400,
                        message: "无法找到该应用",
                    });
                } else {
                    if (app instanceof App) {
                        const oldConfig = {...app.toJSON()};
                        app
                            .update({
                                name: req.body.name,
                                status: req.body.status || app.status,
                                disabledReason: req.body.disabledReason || app.disabledReason,
                                registerStatus: req.body.registerStatus || app.registerStatus,
                                disabledRegisterStatus:
                                    req.body.disabledRegisterStatus || app.disabledRegisterStatus,
                                loginStatus: req.body.loginStatus || app.loginStatus,
                                disabledLoginReason:
                                    req.body.disabledLoginReason || app.disabledLoginReason,
                                loginCheckDevice:
                                    req.body.loginCheckDevice || app.loginCheckDevice,
                                loginCheckUser: req.body.loginCheckUser || app.loginCheckUser,
                                loginCheckDeviceTimeOut:
                                    req.body.loginCheckDeviceTimeOut ||
                                    app.loginCheckDeviceTimeOut,
                                multiDeviceLogin:
                                    req.body.multiDeviceLogin || app.multiDeviceLogin,
                                multiDeviceLoginNum:
                                    req.body.multiDeviceLoginNum || app.multiDeviceLoginNum,
                                register_award: req.body.register_award || app.register_award,
                                register_award_num:
                                    req.body.register_award_num || app.register_award_num,
                                invite_award: req.body.invite_award || app.invite_award,
                                invite_award_num:
                                    req.body.invite_award_num || app.invite_award_num,
                                daily_award: req.body.daily_award || app.daily_award,
                                daily_award_num:
                                    req.body.daily_award_num || app.daily_award_num,
                            })
                            .then(async (result) => {
                                // 记录配置更新
                                await AppLogService.appConfig({
                                    appid: app.id,
                                    adminId: req.admin.id,
                                    ip: req.clientIp,
                                    device: req.headers['user-agent']
                                }, {
                                    before: oldConfig,
                                    after: app.toJSON(),
                                    changedFields: Object.keys(result)
                                }).save();

                                res.status(200).json({
                                    code: 200,
                                    message: "更新配置成功",
                                    data: result,
                                });
                            })
                            .catch((error) => {
                                res.json({
                                    code: 500,
                                    message: error,
                                });
                            });
                    }
                }
            })
            .catch((error) => {
                res.json({
                    code: 500,
                    message: error,
                });
            });
    }
};
exports.generateCard = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg,
        });
    }

    try {
        const app = await App.findByPk(req.params.appid || req.body.appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "无法查找该应用",
            });
        }

        const num = Math.abs(parseInt(req.body.num)) || 1;
        const length = Math.abs(parseInt(req.body.length)) || 12;

        if (length < 6) {
            return res.json({
                code: 400,
                message: "卡号长度不能小于6位",
            });
        }

        if (num > 1000) {
            return res.json({
                code: 400,
                message: "一次最多生成1000张卡",
            });
        }

        const cards = [];
        for (let i = 0; i < num; i++) {
            const cardCode = stringRandom(length);
            const card = {
                card_code: cardCode,
                card_status: "normal",
                card_type: req.body.card_type,
                appid: req.body.appid,
                card_award_num: Math.abs(req.body.card_award_num) || 0,
                card_memo: req.body.card_memo,
                card_code_expire: dayjs()
                    .add(Math.abs(parseInt(req.body.card_code_expire)), "days")
                    .toDate(),
                card_time: dayjs().toDate(),
            };
            const createdCard = await Card.create(card);
            cards.push(createdCard);
        }

        // Format the cards data into a table
        const cardData = cards.map((card) => {
            const cardType = card.card_type === "vip" ? "会员" : "积分";
            const cardUnit = card.card_type === "vip" ? "天" : "个";
            return {
                卡密: card.card_code,
                过期时间: dayjs(card.card_code_expire).format("YYYY-MM-DD HH:mm:ss"),
                卡密奖励类型: cardType,
                卡密奖励数量: `${card.card_award_num} ${cardUnit}`,
            };
        });

        const columnifiedData = columnify(cardData, {
            columnSplitter: " | ",
            config: {
                卡密: {minWidth: 15},
                过期时间: {minWidth: 20},
                卡密奖励类型: {minWidth: 10},
                卡密奖励数量: {minWidth: 15},
            },
        });

        // Create a text file with the generated cards
        const fileName = `cards_${dayjs().format("YYYYMMDD_HHmmss")}.txt`;
        const filePath = path.join(__dirname, "../generated_cards", fileName);

        // Ensure the directory exists
        fs.mkdirSync(path.dirname(filePath), {recursive: true});

        // Write the header and cards to the file
        const header = "本文件用于记录生成的卡密信息\n\n";
        const fileContent = header + columnifiedData;

        fs.writeFileSync(filePath, fileContent);

        // Schedule file deletion after 1 hour (3600000 milliseconds)
        const deleteAfter = 3600000; // 1 hour in milliseconds
        setTimeout(() => {
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`Failed to delete file ${filePath}:`, err);
                } else {
                    console.log(`File ${filePath} deleted successfully.`);
                }
            });
        }, deleteAfter);

        // Trigger file download
        res.download(filePath, fileName, (err) => {
            if (err) {
                console.error("File download error:", err);
                res.json({
                    code: 500,
                    message: "文件下载失败",
                    error: err.message,
                });
            } else {
                console.log("File download succeeded");
            }
        });
    } catch (error) {
        console.error("Error generating cards:", error);
        res.json({
            code: 500,
            message: "服务器错误",
            error: error.message,
        });
    }
};

/**
 * 获取卡密列表
 */
exports.cards = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg
        });
    }

    try {
        // 获取并验证参数
        const appid = parseInt(req.params.appid || req.body.appid);
        const page = parseInt(req.query.page || 1);
        const pageSize = parseInt(req.query.pageSize || 10);

        // 验证参数
        if (isNaN(appid)) {
            throw new Error("无效的应用ID");
        }
        if (isNaN(page) || page < 1) {
            throw new Error("无效的页码");
        }
        if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
            throw new Error("无效的每页数量");
        }

        // 查找应用
        const app = await App.findByPk(appid);
        if (!app) {
            throw new Error("应用不存在");
        }

        // 构建查询条件
        const where = {appid};

        // 添加可选的筛选条件
        if (req.query.status) {
            where.card_status = req.query.status;
        }
        if (req.query.type) {
            where.card_type = req.query.type;
        }
        if (req.query.search) {
            where[Op.or] = [
                {card_code: {[Op.like]: `%${req.query.search}%`}},
                {remark: {[Op.like]: `%${req.query.search}%`}}
            ];
        }

        // 分页查询
        const {count, rows: cards} = await Card.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });

        // 计算总页数
        const totalPages = Math.ceil(count / pageSize);

        res.json({
            code: 200,
            message: "获取卡密列表成功",
            data: {
                cards,
                pagination: {
                    currentPage: page,
                    pageSize,
                    totalItems: count,
                    totalPages
                }
            }
        });

    } catch (error) {
        res.json({
            code: 500,
            message: error.message
        });
    }
};

exports.userList = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        res.json({
            code: 400,
            msg: msg,
        });
    } else {
        try {
            const appid = req.params.appid || req.body.appid;
            const app = await App.findByPk(appid);
            if (app instanceof App) {
                // 处理排序参数
                const sortFields = req.body.sort || []; // 期望格式: [{field: 'integral', order: 'DESC'}, ...]
                const order = [];

                // 验证和处理排序字段
                const validSortFields = ["integral", "custom_id_count", "exp"];

                if (Array.isArray(sortFields) && sortFields.length > 0) {
                    sortFields.forEach((sort) => {
                        if (sort.field && validSortFields.includes(sort.field)) {
                            const direction =
                                (sort.order || "").toUpperCase() === "ASC" ? "ASC" : "DESC";
                            order.push([sort.field, direction]);
                        }
                    });
                }

                // 如果没有指定排序，默认按ID降序
                if (order.length === 0) {
                    order.push(["id", "DESC"]);
                }

                // 检查是否需要返回所有数据
                const returnAll = req.body.all === true;

                // 分页参数
                const page = returnAll ? 1 : Math.abs(parseInt(req.body.page)) || 1;
                const limit = returnAll
                    ? null
                    : Math.abs(parseInt(req.body.pageSize)) || 50;
                const offset = returnAll ? 0 : (page - 1) * limit;

                // 获取总条数
                const totalItems = await User.count({
                    where: {
                        appid: appid,
                    },
                });

                // 获取用户数据
                const queryOptions = {
                    where: {
                        appid: appid,
                    },
                    order: order,
                };

                // 只在不返回所有数据时添加分页参数
                if (!returnAll) {
                    queryOptions.limit = limit;
                    queryOptions.offset = offset;
                }

                const users = await User.findAll(queryOptions);

                // 格式化用户数据
                const formattedUsers = users.map((user) => ({
                    ...user.toJSON(),
                    avatar: getAvatar(user.avatar),
                    vip_time: user.vip_time,
                }));

                const response = {
                    code: 200,
                    message: "获取用户成功",
                    data: formattedUsers,
                    sort: {
                        applied: order,
                        available: validSortFields,
                    },
                };

                // 只在不返回所有数据时添加分页信息
                if (!returnAll) {
                    const totalPages = Math.ceil(totalItems / limit);
                    const remainingPages = totalPages - page;
                    response.pagination = {
                        currentPage: page,
                        totalPages: totalPages,
                        remainingPages: remainingPages,
                        totalItems: totalItems,
                        currentPageItems: users.length,
                    };
                } else {
                    response.total = totalItems;
                }

                return res.status(200).json(response);
            } else {
                res.status(404).json({
                    code: 404,
                    message: "应用未找到",
                });
            }
        } catch (error) {
            res.status(500).json({
                code: 500,
                message: "获取用户失败",
                error: error.message,
            });
        }
    }
};

exports.updateUser = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            msg: msg,
        });
    }

    try {
        const appid = req.params.appid || req.body.appid;
        const app = await App.findByPk(appid);

        if (!app) {
            return res.json({
                code: 201,
                msg: "无法找到该应用",
            });
        }

        const user = await User.findOne({
            where: {
                id: req.body.id,
                appid: appid,
            },
        });

        if (!user) {
            return res.json({
                code: 400,
                message: "用户不存在",
            });
        }

        // 收集需要更新的字段
        const updates = {};
        const changes = {};
        const notifications = [];

        console.log('请求体中的邮箱:', req.body.email);
        console.log('数据库中的邮箱:', user.email);

        // 处理密码更新
        if (req.body.password && req.body.password !== user.password) {
            const plainPassword = req.body.password;
            updates.password = await bcrypt.hash(req.body.password, 10);

            // 如果账号为空，生成新账号
            if (!user.account) {
                const newAccount = `${user.id}${stringRandom(5)}`;
                updates.account = newAccount;
            }

            // 只在用户有邮箱时添加密码更新通知
            if (user.email?.trim()) {
                notifications.push(() => sendPasswordUpdateNotification(app, user.email, {
                    account: updates.account || user.account,
                    password: plainPassword
                }));
            }
        }

        // 检查积分变化
        if (req.body.integral && parseInt(req.body.integral) !== user.integral) {
            updates.integral = parseInt(req.body.integral);
            changes.integral = {
                old: user.integral,
                new: updates.integral
            };
        }

        // 检查VIP时间变化
        if (req.body.vip_time && new Date(req.body.vip_time).getTime() !== new Date(user.vip_time).getTime()) {
            updates.vip_time = req.body.vip_time;
            changes.vip_time = {
                old: user.vip_time,
                new: updates.vip_time
            };

            // 只有当新的到期时间不是永久会员时才发送到期通知
            if (user.email?.trim() && updates.vip_time !== 999999999) {
                notifications.push(() => sendVipExpirationNotification(app, user.email, updates.vip_time, user.account || '未设置', user.name || '未设置'));
            }
        }

        // 检查角色变更
        if (req.body.role && req.body.role !== user.role) {
            updates.role = req.body.role;
            changes.role = {
                old: user.role,
                new: updates.role
            };
        }

        // 检查自定义ID变化
        if (req.body.custom_id && req.body.custom_id !== user.custom_id) {
            updates.custom_id = req.body.custom_id;
            if (user.email?.trim()) {
                notifications.push(() => sendCustomIdUpdateNotification(
                    app,
                    user.email,
                    user.custom_id,
                    updates.custom_id,
                    user.custom_id_changes - 1
                ));
            }
        }

        // 检查邮箱变更
        if (req.body.email && req.body.email.trim() !== (user.email || '').trim()) {
            console.log('检测到邮箱变更');
            updates.email = req.body.email.trim();
            changes.email = {
                old: user.email || '无',
                new: updates.email
            };

            // 如果新邮箱有效，添加邮箱变更通知
            if (updates.email) {
                notifications.push(() => sendEmailUpdateNotification(app, updates.email, changes.email, user.account || '未设置'));
            }
        }

        console.log('更新字段:', updates);

        // 如果没有任何更新，直接返回
        if (Object.keys(updates).length === 0) {
            console.log('无更新内容');
            return res.json({
                code: 200,
                msg: '无更新内容'
            });
        }

        try {
            // 更新用户信息
            const updatedUser = await user.update(updates);

            // 并行发送所有通知
            if (notifications.length > 0) {
                await Promise.all(notifications.map(notify => notify()));
            }

            // 如果有其他字段变更，发送统一的更新通知
            if (Object.keys(changes).length > 0 && user.email?.trim()) {
                await sendUpdateNotification(app, user.email, changes);
            }

            // 如果有会员时间或角色变更，发送通知
            if ((changes.vip_time || changes.role) && user.email?.trim()) {
                await sendMembershipUpdateNotification(
                    app,
                    user.email,
                    {
                        vip_time: changes.vip_time,
                        role: changes.role
                    },
                    user.account || '未设置',
                    user.name || '未设置'
                );
            }

            res.json({
                code: 200,
                msg: '更新成功',
                data: updatedUser
            });
        } catch (error) {
            console.error('更新用户信息失败:', error);
            res.json({
                code: 500,
                msg: '更新失败'
            });
        }
    } catch (error) {
        console.error("更新用户失败:", error);
        return res.status(500).json({
            code: 500,
            message: error.message,
        });
    }
};

exports.deleteBanner = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            },
        });

        if (admin) {
            const banner = await Banner.findOne({
                where: {
                    id: id,
                },
            });

            if (banner) {
                await banner.destroy();

                res.status(200).json({
                    code: 200,
                    message: "删除成功",
                });
            } else {
                res.json({
                    code: 404,
                    message: "banner不存在",
                });
            }
        } else {
            res.json({
                code: 404,
                message: "token错误",
            });
        }
    }
};

exports.bannerList = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {appid} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            },
        });

        if (admin) {
            const banners = await Banner.findAll({
                where: {
                    appid: appid,
                },
                order: [["position", "ASC"]],
            });

            res.status(200).json({
                code: 200,
                message: "获取成功",
                data: banners,
            });
        } else {
            res.json({
                code: 404,
                message: "token错误",
            });
        }
    }
};

exports.addBanner = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {appid, title, header, content, type, url, position} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            },
        });

        if (admin) {
            const banner = await Banner.create({
                appid: appid,
                title: title,
                header: header,
                content: content,
                type: type || "url",
                url: url,
                position: position || 0,
            });

            if (banner) {
                res.status(200).json({
                    code: 200,
                    message: "创建成功",
                    data: banner,
                });
            } else {
                res.json({
                    code: 503,
                    message: "数据未就绪",
                });
            }
        } else {
            res.json({
                code: 404,
                message: "token错误",
            });
        }
    }
};

exports.updateBanner = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    }

    const token = getToken(req.headers.authorization);
    const admin = await AdminToken.findOne({
        where: {token: token},
    });

    if (!admin) {
        return res.json({
            code: 404,
            message: "token错误",
        });
    }

    // Check if it's a batch position update
    if (Array.isArray(req.body)) {
        try {
            // Validate the array structure
            const isValidStructure = req.body.every(
                (item) =>
                    typeof item === "object" &&
                    "id" in item &&
                    "position" in item &&
                    Number.isInteger(item.id) &&
                    Number.isInteger(item.position)
            );

            if (!isValidStructure) {
                return res.status(400).json({
                    code: 400,
                    message: "无效的数据格式，每个项目必须包含id和position字段",
                });
            }

            // Update positions in transaction
            await mysql.transaction(async (t) => {
                for (const item of req.body) {
                    const banner = await Banner.findByPk(item.id, {transaction: t});
                    if (banner) {
                        await banner.update(
                            {position: item.position},
                            {transaction: t}
                        );
                    }
                }
            });

            return res.status(200).json({
                code: 200,
                message: "批量更新位置成功",
            });
        } catch (error) {
            console.error("批量更新位置失败:", error);
            return res.status(500).json({
                code: 500,
                message: "批量更新位置失败",
            });
        }
    }

    // Regular single banner update
    const {id, appid, title, header, content, type, url, position} = req.body;
    const banner = await Banner.findOne({
        where: {id: id},
    });

    if (!banner) {
        return res.json({
            code: 404,
            message: "banner不存在",
        });
    }

    try {
        await banner.update({
            appid: appid,
            title: title,
            header: header,
            content: content,
            type: type || banner.type,
            url: url,
            position: position || banner.position,
        });

        res.status(200).json({
            code: 200,
            message: "更新成功",
            data: banner,
        });
    } catch (error) {
        console.error("更新banner失败:", error);
        res.status(500).json({
            code: 500,
            message: "更新banner失败",
        });
    }
};

exports.addUser = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {appid, username, password, email, phone, avatar, status} =
            req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            },
        });

        if (admin) {
            const user = await User.create({
                appid: appid,
                name: username,
                password: hashSync(password, 10),
            });

            if (user) {
                res.status(200).json({
                    code: 200,
                    message: "创建成功",
                    data: user,
                });
            } else {
                res.json({
                    code: 503,
                    message: "数据未就绪",
                });
            }
        } else {
            res.json({
                code: 404,
                message: "token错误",
            });
        }
    }
};

exports.userInfo = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {appid, id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            },
        });

        if (admin) {
            const user = await User.findOne({
                where: {
                    appid: appid,
                    id: id,
                },
            });

            if (user) {
                res.status(200).json({
                    code: 200,
                    message: "获取成功",
                    data: user,
                });
            } else {
                res.json({
                    code: 404,
                    message: "用户不存在",
                });
            }
        } else {
            res.json({
                code: 404,
                message: "token错误",
            });
        }
    }
};

exports.deleteCard = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {appid, id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            },
        });

        if (admin) {
            const card = await Card.findOne({
                where: {
                    appid: appid,
                    id: id,
                },
            });

            if (card) {
                await card.destroy();

                res.status(200).json({
                    code: 200,
                    message: "删除成功",
                });
            } else {
                res.json({
                    code: 404,
                    message: "卡密不存在",
                });
            }
        } else {
            res.json({
                code: 404,
                message: "token错误",
            });
        }
    }
};

exports.deleteUser = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {appid, id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            },
        });

        if (admin) {
            const user = await User.findOne({
                where: {
                    appid: appid,
                    id: id,
                },
            });

            if (user) {
                await user.destroy();

                res.status(200).json({
                    code: 200,
                    message: "删除成功",
                });
            } else {
                res.json({
                    code: 404,
                    message: "用户不存在",
                });
            }
        } else {
            res.json({
                code: 404,
                message: "token错误",
            });
        }
    }
};

exports.cardInfo = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const token = getToken(req.headers.authorization);
        const {appid, id} = req.body;
        const admin = await AdminToken.findOne({
            where: {
                token: token,
            },
        });

        if (admin) {
            const card = await Card.findOne({
                where: {
                    appid: appid,
                    id: id,
                },
            });

            if (card) {
                res.status(200).json({
                    code: 200,
                    message: "获取成功",
                    data: card,
                });
            } else {
                res.json({
                    code: 404,
                    message: "卡密不存在",
                });
            }
        } else {
            res.json({
                code: 404,
                message: "token错误",
            });
        }
    }
};

exports.freezer = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const app = await App.findByPk(req.body.appid);

        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在",
            });
        }

        const user = await User.findByPk(req.body.id);

        if (user) {
            user.enabled = false;
            user.reason = req.body.reason;
            if (!req.body.forever) {
                user.disabledEndTime = dayjs()
                    .add(req.body.years || 0, "years")
                    .add(req.body.months || 0, "months")
                    .add(req.body.days || 0, "days")
                    .add(req.body.hours || 0, "hours")
                    .add(req.body.minutes || 0, "minutes")
                    .add(req.body.seconds || 0, "seconds")
                    .format("YYYY-MM-DD HH:mm:ss");
            }
            await user.save();

            // 记录用户冻结操作
            await AppLogService.userOperation({
                appid: req.body.appid,
                adminId: req.admin.id,
                ip: req.clientIp,
                device: req.headers['user-agent']
            }, {
                type: 'user_freeze',
                count: 1,
                details: {
                    action: 'freeze',
                    userId: user.id,
                    reason: req.body.reason || '管理员冻结'
                }
            }).save();

            return res.status(200).json({
                code: 200,
                message: "冻结成功",
                data: user,
            });
        } else {
            return res.json({
                code: 404,
                message: "用户不存在",
            });
        }
    }
};

exports.unFreezer = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 获取第一个验证错误的信息
        const [{msg}] = err.errors;
        // 返回400错误，附带错误信息
        return res.status(400).json({
            code: 400,
            message: msg,
        });
    } else {
        const user = await User.findOne({
            where: {
                id: req.body.id,
            },
        });

        if (!user) {
            return res.json({
                code: 404,
                message: "用户不存在",
            });
        }
        user.enabled = true;
        user.disabledEndTime = dayjs().format("YYYY-MM-DD HH:mm:ss");
        await user.save();
        res.status(200).json({
            code: 200,
            message: "解冻成功",
            data: user,
        });
    }
};

exports.searchUser = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        // 如果存在验证错误，返回400错误并附带错误信息
        const [{msg}] = err.errors;
        return res.json({
            code: 404,
            msg: msg,
        });
    } else {
        const {appid, keyword, page = 1, pageSize = 50, sort = []} = req.body;
        try {
            const app = await App.findByPk(appid);

            if (!app) {
                return res.json({
                    code: 404,
                    msg: "无法找到该应用",
                });
            }

            // 处理排序参数
            const order = [];
            const validSortFields = ["integral", "custom_id_count", "exp"];

            if (Array.isArray(sort) && sort.length > 0) {
                sort.forEach((sortItem) => {
                    if (sortItem.field && validSortFields.includes(sortItem.field)) {
                        const direction =
                            (sortItem.order || "").toUpperCase() === "ASC" ? "ASC" : "DESC";
                        order.push([sortItem.field, direction]);
                    }
                });
            }

            // 如果没有指定排序，默认按ID降序
            if (order.length === 0) {
                order.push(["id", "DESC"]);
            }

            // 构建搜索条件
            const whereCondition = {
                appid: appid,
                [Op.or]: [
                    {name: {[Op.like]: `%${keyword}%`}},
                    {customId: {[Op.like]: `%${keyword}%`}},
                    {email: {[Op.like]: `%${keyword}%`}},
                    {id: {[Op.like]: `%${keyword}%`}},
                    {account: {[Op.like]: `%${keyword}%`}},
                ],
            };

            // 获取总记录数
            const totalItems = await User.count({
                where: whereCondition,
            });

            // 获取用户数据
            const queryOptions = {
                where: whereCondition,
                order: order,
            };

            // 分页参数
            const offset = (parseInt(page) - 1) * parseInt(pageSize);

            // 只在不返回所有数据时添加分页参数
            queryOptions.limit = parseInt(pageSize);
            queryOptions.offset = offset;

            const users = await User.findAll(queryOptions);

            // 格式化用户数据
            const formattedUsers = users.map((user) => ({
                ...user.toJSON(),
                avatar: getAvatar(user.avatar),
                vip_time: user.vip_time,
            }));

            const response = {
                code: 200,
                message: "搜索成功",
                data: formattedUsers,
                sort: {
                    applied: order,
                    available: validSortFields,
                },
            };

            // 只在不返回所有数据时添加分页信息
            const totalPages = Math.ceil(totalItems / parseInt(pageSize));
            const remainingPages = totalPages - parseInt(page);
            response.pagination = {
                currentPage: parseInt(page),
                totalPages: totalPages,
                remainingPages: remainingPages,
                totalItems: totalItems,
                currentPageItems: users.length,
            };

            return res.status(200).json(response);
        } catch (e) {
            return res.json({
                code: 500,
                msg: "服务器出现错误",
                err: e.message,
            });
        }
    }
};

exports.updatePassword = async function (req, res) {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            msg: msg,
        });
    }

    try {
        const {id, appid, newPassword} = req.body;

        if (!newPassword) {
            return res.json({
                code: 400,
                msg: "新密码不能为空",
            });
        }

        const user = await User.findOne({
            where: {
                id: id,
                appid: appid,
            },
        });

        if (!user) {
            return res.json({
                code: 400,
                msg: "用户不存在",
            });
        }

        // 加密新密码
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 更新密码
        await user.update({
            password: hashedPassword,
        });

        return res.json({
            code: 200,
            message: "密码更新成功",
        });
    } catch (error) {
        return res.status(500).json({
            code: 500,
            message: "服务器错误",
            error: error.message,
        });
    }
};

// 添加白名单
exports.addToWhitelist = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            msg: msg,
        });
    }

    try {
        const {appid, value, type, tags, description, expireAt} = req.body;

        // 检查是否已存在
        const existing = await Whitelist.findOne({
            where: {
                appid,
                value,
                type,
            },
        });

        if (existing) {
            return res.json({
                code: 400,
                msg: "该记录已存在于白名单中",
            });
        }

        const whitelist = await Whitelist.create({
            appid,
            value,
            type,
            tags: Array.isArray(tags) ? tags : [],
            description,
            expireAt: expireAt || null,
        });

        // 记录操作日志
        await logWhitelistOperation({
            whitelistId: whitelist.id,
            appid,
            operationType: "add",
            operatorId: req.user.id,
            operatorType: "admin",
            status: true,
            detail: {
                type,
                value,
                tags,
                description,
                expireAt,
            },
            ip: req.ip,
        });

        res.json({
            code: 200,
            msg: "添加成功",
            data: whitelist,
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            msg: "服务器错误",
            error: error.message,
        });
    }
};

// 从白名单中删除
exports.removeFromWhitelist = async (req, res) => {
    try {
        const {id} = req.params;
        const whitelist = await Whitelist.findByPk(id);

        if (!whitelist) {
            return res.json({
                code: 400,
                msg: "记录不存在",
            });
        }

        await whitelist.destroy();

        // 记录操作日志
        await logWhitelistOperation({
            whitelistId: id,
            appid: whitelist.appid,
            operationType: "delete",
            operatorId: req.user.id,
            operatorType: "admin",
            status: true,
            detail: {
                type: whitelist.type,
                value: whitelist.value,
                tags: whitelist.tags,
            },
            ip: req.ip,
        });

        res.json({
            code: 200,
            msg: "删除成功",
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            msg: "服务器错误",
            error: error.message,
        });
    }
};

// 更新白名单记录
exports.updateWhitelist = async (req, res) => {
    try {
        const {id} = req.params;
        const {tags, description, enabled, expireAt} = req.body;

        const whitelist = await Whitelist.findByPk(id);
        if (!whitelist) {
            return res.json({
                code: 400,
                msg: "记录不存在",
            });
        }

        const oldData = {
            tags: whitelist.tags,
            description: whitelist.description,
            enabled: whitelist.enabled,
            expireAt: whitelist.expireAt,
        };

        await whitelist.update({
            tags: Array.isArray(tags) ? tags : whitelist.tags,
            description: description || whitelist.description,
            enabled: enabled !== undefined ? enabled : whitelist.enabled,
            expireAt: expireAt || whitelist.expireAt,
        });

        // 记录操作日志
        await logWhitelistOperation({
            whitelistId: id,
            appid: whitelist.appid,
            operationType: "update",
            operatorId: req.user.id,
            operatorType: "admin",
            status: true,
            detail: {
                type: whitelist.type,
                value: whitelist.value,
                oldData,
                newData: {
                    tags: whitelist.tags,
                    description: whitelist.description,
                    enabled: whitelist.enabled,
                    expireAt: whitelist.expireAt,
                },
            },
            ip: req.ip,
        });

        res.json({
            code: 200,
            msg: "更新成功",
            data: whitelist,
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            msg: "服务器错误",
            error: error.message,
        });
    }
};

// 查询白名单列表
exports.getWhitelist = async (req, res) => {

    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({code: 400, message: msg});
    }

    try {
        const {appid, type, tag, page = 1, pageSize = 20} = req.params || req.body || req.query;

        const where = {};
        if (appid) where.appid = appid;
        if (type) where.type = type;
        if (tag) {
            where.tags = {
                [Op.contains]: [tag],
            };
        }

        const {count, rows} = await Whitelist.findAndCountAll({
            where,
            limit: parseInt(pageSize),
            offset: (parseInt(page) - 1) * parseInt(pageSize),
            order: [["createdAt", "DESC"]],
        });

        if (rows.length === 0) {
            return res.json({
                code: 201,
                message: "无数据",
            });
        }

        return res.json({
            code: 200,
            message: "查询成功",
            data: {
                total: count,
                list: rows,
                page: parseInt(page),
                pageSize: parseInt(pageSize),
            },
        });
    } catch (error) {
        console.error("查询白名单列表失败:", error);
        res.status(500).json({
            code: 500,
            message: "服务器错误",
            error: error.message,
        });
    }
};
/**
 * # 获取用户详细信息
 * ## 参数
 * 1. userId - 用户ID
 * 2. appid - 应用ID
 *
 * 返回用户配置信息、活动日志和登录设备
 */
exports.getUserDetails = async (req, res) => {
    try {
        const {Op} = require('sequelize');
        const sequelize = require('sequelize')
        const dayjs = require('../function/dayjs');

        // 获取用户信息
        const user = await User.findOne({
            where: {
                id: req.body.userId,
                appid: req.body.appid
            },
            attributes: [
                'id', 'account', 'name', 'avatar', 'email',
                'register_time', 'vip_time', 'integral',
                'enabled', 'customId'
            ]
        });

        if (!user) {
            return res.status(404).json({
                code: 404,
                message: '用户不存在'
            });
        }

        // 获取用户登录设备信息
        const userDevices = await Token.findAll({
            where: {
                account: user.id,
                appid: req.body.appid
            },
            attributes: [
                'id',
                'markcode',
                'device',
                'time'
            ],
            order: [['time', 'DESC']]
        });

        // 获取签到统计信息
        const dailyStats = await Daily.findAndCountAll({
            where: {
                userId: user.id,
                appid: req.body.appid
            },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('date')), 'date'],
                [sequelize.fn('COUNT', '*'), 'count'],
                [sequelize.fn('SUM', sequelize.col('integral')), 'totalIntegral']
            ],
            group: [sequelize.fn('DATE', sequelize.col('date'))],
        });

        // 获取本月签到记录
        const startOfMonth = dayjs().startOf('month').toDate();
        const endOfMonth = dayjs().endOf('month').toDate();
        const monthlySignIns = await Daily.findAll({
            where: {
                userId: user.id,
                appid: req.body.appid,
                date: {
                    [Op.between]: [startOfMonth, endOfMonth]
                }
            },
            order: [['date', 'ASC']],
        });

        // 计算连续签到天数
        let consecutiveDays = 0;
        let lastDate = null;
        const security = await SecurityScoreService.calculateUserScore({appid: req.body.appid, userId: user.id})
        for (const record of monthlySignIns) {
            const currentDate = dayjs(record.date);
            if (!lastDate) {
                consecutiveDays = 1;
            } else {
                const diffDays = currentDate.diff(lastDate, 'days');
                if (diffDays === 1) {
                    consecutiveDays++;
                } else {
                    break;
                }
            }
            lastDate = currentDate;
        }

        // 构建响应数据
        const response = {
            code: 200,
            message: '获取用户详情成功',
            data: {
                userInfo: {
                    ...user.toJSON(),
                    vip_time: user.vip_time ? dayjs.unix(user.vip_time).format('YYYY-MM-DD HH:mm:ss') : null
                },
                devices: userDevices.map(device => ({
                    id: device.id,
                    deviceId: device.markcode,
                    deviceName: device.device || '未知设备',
                    loginTime: dayjs(device.time).format('YYYY-MM-DD HH:mm:ss'),
                    isOnline: global.onlineUsers ? global.onlineUsers.has(device.markcode) : false
                })),
                security: security,
                dailyStats: {
                    totalDays: dailyStats.count.length,
                    totalIntegral: dailyStats.rows.reduce((sum, row) => sum + parseInt(row.totalIntegral || 0), 0),
                    consecutiveDays,
                    monthlyStats: {
                        total: monthlySignIns.length,
                        dates: monthlySignIns.map(record => ({
                            date: dayjs(record.date).format('YYYY-MM-DD'),
                            integral: record.integral
                        }))
                    },
                    recentActivity: dailyStats.rows.slice(0, 7).map(record => ({
                        date: record.date,
                        count: parseInt(record.count),
                        integral: parseInt(record.totalIntegral || 0)
                    }))
                }
            }
        };

        // 添加缓存支持
        await RedisService.set(`user_details:${user.id}:${req.body.appid}`, response);

        return res.json(response);

    } catch (error) {
        console.error('获取用户详情失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取用户详情失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * # 删除用户设备
 * ## 参数
 * 1. userId - 用户ID
 * 2. appid - 应用ID
 * 3. markcode - 设备标识
 * 4. token - 设备token
 *
 * 删除指定用户的设备和token
 */
exports.deleteUserDevice = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({code: 400, msg: msg});
    }

    const {userId, appid, markcode, token} = req.query || req.body;
    if (!userId || !appid || !markcode || !token) {
        return res.json({code: 400, msg: "参数不完整"});
    }

    try {
        // 检查应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({code: 400, msg: "无法找到该应用"});
        }

        // 检查用户是否存在
        const user = await User.findByPk(userId);
        if (!user) {
            return res.json({code: 404, msg: "用户不存在"});
        }

        // 查找并删除设备token
        const deviceToken = await Token.findOne({
            where: {
                account: userId,
                appid: appid,
                markcode: markcode,
                token: token
            }
        });

        if (!deviceToken) {
            return res.json({code: 201, msg: "该登录状态不存在"});
        }

        // 删除token记录
        await deviceToken.destroy();

        // 删除Redis中的token
        await RedisService.del(token);

        // 记录登出日志
        await Log.create({
            log_type: 'logout',
            log_content: '管理员删除设备登录状态',
            log_ip: req.ip,
            log_user_id: userId,
            appid: appid,
            UserId: userId
        });

        return res.json({
            code: 200,
            msg: "设备删除成功",
            data: {
                account: deviceToken.account,
                token: deviceToken.token,
                markcode: deviceToken.markcode
            }
        });

    } catch (error) {
        console.error('Error in deleteUserDevice:', error);
        res.json({code: 500, msg: "删除设备失败", error: error.message});
    }
};

/**
 * 获取应用在线用户统计
 */
exports.getOnlineStats = async (req, res) => {
    try {
        const {appid} = req.params;

        // 获取应用信息
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 获取在线用户
        const onlineUsers = Array.from(global.onlineUsers.entries())
            .filter(([_, data]) => data.appid === parseInt(appid));

        // 按设备类型分组
        const deviceStats = {};
        onlineUsers.forEach(([userId, data]) => {
            const device = data.device || 'unknown';
            deviceStats[device] = (deviceStats[device] || 0) + 1;
        });

        // 获取最近登录的用户
        const recentLogins = await LoginLog.findAll({
            where: {appid},
            order: [['login_time', 'DESC']],
            limit: 10,
            include: [{
                model: User,
                attributes: ['name', 'avatar', 'customId']
            }]
        });

        const response = {
            code: 200,
            message: "获取成功",
            data: {
                total: onlineUsers.length,
                deviceStats,
                recentActivity: recentLogins.map(log => ({
                    userId: log.user_id,
                    username: log.User.name,
                    avatar: log.User.avatar,
                    customId: log.User.customId,
                    loginTime: dayjs(log.login_time).format('YYYY-MM-DD HH:mm:ss'),
                    device: log.login_device,
                    location: log.login_address,
                    ip: log.login_ip
                })),
                users: onlineUsers.map(([userId, data]) => ({
                    userId,
                    lastActive: dayjs(data.lastActive).format('YYYY-MM-DD HH:mm:ss'),
                    device: data.device,
                    ip: data.ip,
                    location: data.location || '未知',
                    duration: dayjs().diff(data.lastActive, 'minutes')
                }))
            }
        };

        // 添加缓存支持
        if (global.redis) {
            const cacheKey = `online_stats:${appid}`;
            await global.redis.setex(cacheKey, 60, JSON.stringify(response)); // 缓存1分钟
        }

        return res.json(response);

    } catch (error) {
        console.error('获取在线用户统计失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取统计失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

// 添加公告
exports.addNotice = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {appid, title, content, startDate, endDate} = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 创建公告
        const notice = await Notice.create({
            title,
            content,
            appid,
            startDate: startDate || dayjs().toDate(),
            endDate: endDate || dayjs().add(30, 'days').toDate()
        });

        return res.json({
            code: 200,
            message: "创建公告成功",
            data: notice
        });

    } catch (error) {
        console.error('创建公告失败:', error);
        return res.status(500).json({
            code: 500,
            message: "创建公告失败",
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

// 获取公告列表
exports.getNotices = async (req, res) => {
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

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 获取有效期内的公告
        const notices = await Notice.findAll({
            where: {
                appid,
            },
            order: [['createdAt', 'DESC']]
        });

        return res.json({
            code: 200,
            message: "获取公告列表成功",
            data: notices
        });

    } catch (error) {
        console.error('获取公告列表失败:', error);
        return res.status(500).json({
            code: 500,
            message: "获取公告列表失败",
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

// 删除公告
exports.deleteNotice = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {appid, noticeId} = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 查找并删除公告
        const notice = await Notice.findOne({
            where: {
                id: noticeId,
                appid
            }
        });

        if (!notice) {
            return res.json({
                code: 404,
                message: "公告不存在"
            });
        }

        await notice.destroy();

        return res.json({
            code: 200,
            message: "删除公告成功"
        });

    } catch (error) {
        console.error('删除公告失败:', error);
        return res.status(500).json({
            code: 500,
            message: "删除公告失败",
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

// 更新公告
exports.updateNotice = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {appid, noticeId, title, content} = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 查找并更新公告
        const notice = await Notice.findOne({
            where: {
                id: noticeId,
                appid
            }
        });

        if (!notice) {
            return res.json({
                code: 404,
                message: "公告不存在"
            });
        }

        await notice.update({
            title: title || notice.title,
            content: content || notice.content,
        });

        return res.json({
            code: 200,
            message: "更新公告成功",
            data: notice
        });

    } catch (error) {
        console.error('更新公告失败:', error);
        return res.status(500).json({
            code: 500,
            message: "更新公告失败",
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 标准化地区名称
 * @param {string} region 原始地区名称
 * @returns {string} 标准化后的地区名称
 */
function normalizeRegion(region) {
    if (!region) return '未知';

    // 移除后缀
    const suffixes = ['省', '市', '自治区', '维吾尔自治区', '壮族自治区', '回族自治区', '特别行政区'];
    let normalized = region;

    for (const suffix of suffixes) {
        if (normalized.endsWith(suffix)) {
            normalized = normalized.slice(0, -suffix.length);
            break;
        }
    }

    return REGION_MAPPINGS[normalized] || normalized;
}

/**
 * 获取临时用户统计信息
 */
exports.getTempUserStats = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg,
            });
        }

        const {appid} = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 尝试从缓存获取统计信息
        const cacheKey = `temp_user_stats:${appid}`;
        try {
            const cachedStats = await RedisService.get(cacheKey);
            if (cachedStats) {
                return res.json({
                    code: 200,
                    message: '获取统计信息成功',
                    data: JSON.parse(cachedStats)
                });
            }
        } catch (cacheError) {
            console.error('Redis cache error:', cacheError);
            // 继续执行，不让缓存错误影响主流程
        }

        // 如果没有缓存，执行统计
        const [tempUsers, totalUsers] = await Promise.all([
            // 统计临时用户
            User.findAndCountAll({
                where: {
                    appid,
                    [Op.or]: [
                        {account: {[Op.or]: [null, '']}},
                        {password: {[Op.or]: [null, '']}}
                    ],
                },
                attributes: [
                    'id', 'register_time', 'register_ip',
                    'register_province', 'register_city',
                    'open_qq', 'open_wechat'
                ],
                order: [['register_time', 'DESC']],
                distinct: true
            }),
            // 统计总用户数
            User.count({
                where: {
                    appid,
                },
                distinct: true,
            })
        ]);

        // 按注册时间分组统计
        const timeGroups = {
            '30天内': 0,
            '31-60天': 0,
            '61-90天': 0,
            '90天以上': 0
        };

        tempUsers.rows.forEach(user => {
            const days = dayjs().diff(dayjs(user.register_time), 'days');
            if (days <= 30) timeGroups['30天内']++;
            else if (days <= 60) timeGroups['31-60天']++;
            else if (days <= 90) timeGroups['61-90天']++;
            else timeGroups['90天以上']++;
        });

        // 按登录方式分组
        const loginTypes = {
            qq: tempUsers.rows.filter(u => u.open_qq).length,
            wechat: tempUsers.rows.filter(u => u.open_wechat).length,
            account: tempUsers.rows.filter(u => !u.open_qq && !u.open_wechat).length
        };

        // 按地区分组（使用标准化的地区名称）
        const regions = {};
        tempUsers.rows.forEach(user => {
            const region = normalizeRegion(user.register_province);
            regions[region] = (regions[region] || 0) + 1;
        });

        // 按城市分组
        const cities = {};
        tempUsers.rows.forEach(user => {
            if (user.register_province && user.register_city) {
                const province = normalizeRegion(user.register_province);
                const city = user.register_city.replace('市', '');
                const key = `${province}-${city}`;
                cities[key] = (cities[key] || 0) + 1;
            }
        });

        const stats = {
            summary: {
                total: totalUsers,
                tempCount: tempUsers.count,
                percentage: ((tempUsers.count / totalUsers) * 100).toFixed(2)
            },
            timeDistribution: timeGroups,
            loginTypes,
            regionDistribution: {
                provinces: Object.entries(regions)
                    .sort((a, b) => b[1] - a[1])
                    .reduce((acc, [key, value]) => {
                        acc[key] = value;
                        return acc;
                    }, {}),
                cities: Object.entries(cities)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 20)  // 只返回前20个城市
                    .reduce((acc, [key, value]) => {
                        acc[key] = value;
                        return acc;
                    }, {})
            },
            recentTempUsers: tempUsers.rows.slice(0, 100).map(user => ({
                id: user.id,
                registerTime: dayjs(user.register_time).format('YYYY-MM-DD HH:mm:ss'),
                region: `${normalizeRegion(user.register_province)} ${user.register_city ? user.register_city.replace('市', '') : ''}`,
                loginType: user.open_qq ? 'QQ' : user.open_wechat ? '微信' : '账号注册',
                daysFromRegister: dayjs().diff(dayjs(user.register_time), 'days')
            })),
            timestamp: dayjs().toISOString()
        };

        // 缓存统计结果
        try {
            await RedisService.set(cacheKey, stats, 3600);
        } catch (cacheError) {
            console.error('Redis cache set error:', cacheError);
        }

        return res.json({
            code: 200,
            message: '获取统计信息成功',
            data: stats
        });

    } catch (error) {
        console.error('获取临时用户统计失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取统计信息失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 获取临时用户列表
 */
exports.getTempUserList = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg,
            });
        }

        const {
            appid,
            page = 1,
            pageSize = 20,
            sortBy = 'register_time',
            sortOrder = 'DESC',
            timeRange, // 可选，格式：7d, 30d, 90d
            loginType, // 可选，qq, wechat, account
            region     // 可选，省份
        } = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 构建查询条件
        const where = {
            appid,
            [Op.or]: [
                {account: {[Op.or]: [null, '']}},
                {password: {[Op.or]: [null, '']}}
            ],
            enabled: true
        };

        // 添加时间范围过滤
        if (timeRange) {
            const days = parseInt(timeRange);
            if (!isNaN(days)) {
                where.register_time = {
                    [Op.gte]: dayjs().subtract(days, 'day').toDate()
                };
            }
        }

        // 添加登录类型过滤
        if (loginType) {
            switch (loginType) {
                case 'qq':
                    where.open_qq = {[Op.not]: null};
                    break;
                case 'wechat':
                    where.open_wechat = {[Op.not]: null};
                    break;
                case 'account':
                    where[Op.and] = [
                        {open_qq: null},
                        {open_wechat: null}
                    ];
                    break;
            }
        }

        // 添加地区过滤
        if (region) {
            where[Op.or] = [
                {register_province: {[Op.like]: `%${region}%`}},
                {register_province: {[Op.like]: `%${region}省%`}}
            ];
        }

        // 尝试从缓存获取总数
        const countCacheKey = `temp_users_count:${appid}:${JSON.stringify(where)}`;
        let total;
        try {
            const cachedCount = await redisClient.get(countCacheKey);
            if (cachedCount) {
                total = parseInt(cachedCount);
            } else {
                total = await User.count({where});
                await redisClient.set(countCacheKey, total, 'EX', 300); // 缓存5分钟
            }
        } catch (error) {
            console.error('Redis cache error:', error);
            total = await User.count({where});
        }

        // 获取用户列表
        const users = await User.findAll({
            where,
            attributes: [
                'id', 'register_time', 'register_ip',
                'register_province', 'register_city',
                'open_qq', 'open_wechat', 'name',
                'avatar', 'email', 'customId'
            ],
            order: [[sortBy, sortOrder]],
            limit: pageSize,
            offset: (page - 1) * pageSize
        });

        // 格式化用户数据
        const formattedUsers = users.map(user => ({
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            customId: user.customId,
            registerTime: dayjs(user.register_time).format('YYYY-MM-DD HH:mm:ss'),
            region: `${user.register_province || '未知'} ${user.register_city || ''}`,
            loginType: user.open_qq ? 'QQ' : user.open_wechat ? '微信' : '账号注册',
            registerIp: user.register_ip,
            email: user.email,
            daysFromRegister: dayjs().diff(dayjs(user.register_time), 'days')
        }));

        // 构建分页信息
        const pagination = {
            current: page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
        };

        return res.json({
            code: 200,
            message: "获取临时用户列表成功",
            data: {
                users: formattedUsers,
                pagination,
                filters: {
                    timeRange,
                    loginType,
                    region
                },
                sort: {
                    field: sortBy,
                    order: sortOrder
                }
            }
        });

    } catch (error) {
        console.error('获取临时用户列表失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取列表失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 获取登录类型统计数据
 */
exports.getLoginTypeStats = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg,
            });
        }

        const {appid} = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 尝试从缓存获取统计数据
        const cacheKey = `login_type_stats:${appid}`;
        try {
            const cachedStats = await redisClient.get(cacheKey);
            if (cachedStats) {
                return res.json({
                    code: 200,
                    message: '获取登录类型统计成功',
                    data: JSON.parse(cachedStats)
                });
            }
        } catch (error) {
            console.error('Redis cache error:', error);
        }

        // 获取各种登录类型的用户数量
        const [qqUsers, wechatUsers, accountUsers, totalUsers] = await Promise.all([
            // QQ登录用户
            User.count({
                where: {
                    appid,
                    open_qq: {[Op.not]: null},
                    enabled: true
                }
            }),
            // 微信登录用户
            User.count({
                where: {
                    appid,
                    open_wechat: {[Op.not]: null},
                    enabled: true
                }
            }),
            // 账号密码登录用户
            User.count({
                where: {
                    appid,
                    [Op.and]: [
                        {open_qq: null},
                        {open_wechat: null},
                        {account: {[Op.not]: null}},
                        {password: {[Op.not]: null}}
                    ],
                    enabled: true
                }
            }),
            // 总用户数
            User.count({
                where: {
                    appid,
                    enabled: true
                }
            })
        ]);

        // 获取最近登录记录
        const recentLogins = await LoginLog.findAll({
            where: {appid},
            order: [['login_time', 'DESC']],
            limit: 100,
            include: [{
                model: User,
                attributes: ['name', 'avatar', 'open_qq', 'open_wechat', 'account']
            }]
        });

        // 按时间段统计
        const timeStats = {
            today: 0,
            week: 0,
            month: 0
        };

        const now = dayjs();
        recentLogins.forEach(log => {
            const loginTime = dayjs(log.login_time);
            if (now.diff(loginTime, 'day') === 0) timeStats.today++;
            if (now.diff(loginTime, 'week') === 0) timeStats.week++;
            if (now.diff(loginTime, 'month') === 0) timeStats.month++;
        });

        // 构建统计数据
        const stats = {
            summary: {
                total: totalUsers,
                qqUsers,
                wechatUsers,
                accountUsers,
                otherUsers: totalUsers - (qqUsers + wechatUsers + accountUsers)
            },
            percentage: {
                qq: ((qqUsers / totalUsers) * 100).toFixed(2),
                wechat: ((wechatUsers / totalUsers) * 100).toFixed(2),
                account: ((accountUsers / totalUsers) * 100).toFixed(2),
                other: (((totalUsers - (qqUsers + wechatUsers + accountUsers)) / totalUsers) * 100).toFixed(2)
            },
            timeStats,
            recentActivity: recentLogins.map(log => ({
                userId: log.user_id,
                username: log.User.name,
                avatar: log.User.avatar,
                loginType: log.User.open_qq ? 'QQ' :
                    log.User.open_wechat ? '微信' :
                        log.User.account ? '账号' : '其他',
                loginTime: dayjs(log.login_time).format('YYYY-MM-DD HH:mm:ss'),
                device: log.login_device,
                location: log.login_address,
                ip: log.login_ip
            })),
            timestamp: dayjs().toISOString()
        };

        // 缓存统计结果
        try {
            await redisClient.set(cacheKey, JSON.stringify(stats), 'EX', 300); // 缓存5分钟
        } catch (error) {
            console.error('Redis cache error:', error);
        }

        return res.json({
            code: 200,
            message: '获取登录类型统计成功',
            data: stats
        });

    } catch (error) {
        console.error('获取登录类型统计失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取统计失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 获取用户绑定统计信息
 */
exports.getBindingStats = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg,
            });
        }

        const {appid} = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 尝试从缓存获取统计数据
        const cacheKey = `binding_stats:${appid}`;
        try {
            const cachedStats = await global.redisClient.get(cacheKey);
            if (cachedStats) {
                return res.json({
                    code: 200,
                    message: '获取绑定统计成功',
                    data: JSON.parse(cachedStats)
                });
            }
        } catch (error) {
            console.error('Redis cache error:', error);
        }

        const {Op} = require('sequelize');

        // 获取各种绑定类型的用户数量
        const [
            totalUsers,
            emailUsers,
            qqUsers,
            wechatUsers,
            twoFactorUsers,
            multiBindUsers,
            recentBindings
        ] = await Promise.all([
            // 总用户数
            User.count({
                where: {appid, enabled: true}
            }),
            // 绑定邮箱的用户数
            User.count({
                where: {
                    appid,
                    email: {[Op.not]: null},
                    enabled: true
                }
            }),
            // 绑定QQ的用户数
            User.count({
                where: {
                    appid,
                    open_qq: {[Op.not]: null},
                    enabled: true
                }
            }),
            // 绑定微信的用户数
            User.count({
                where: {
                    appid,
                    open_wechat: {[Op.not]: null},
                    enabled: true
                }
            }),
            // 开启两步验证的用户数
            User.count({
                where: {
                    appid,
                    twoFactorSecret: {[Op.not]: null},
                    enabled: true
                }
            }),
            // 多重绑定用户数（同时绑定两个及以上）
            User.count({
                where: {
                    appid,
                    enabled: true,
                    [Op.or]: [
                        {
                            [Op.and]: [
                                {email: {[Op.not]: null}},
                                {open_qq: {[Op.not]: null}}
                            ]
                        },
                        {
                            [Op.and]: [
                                {email: {[Op.not]: null}},
                                {open_wechat: {[Op.not]: null}}
                            ]
                        },
                        {
                            [Op.and]: [
                                {open_qq: {[Op.not]: null}},
                                {open_wechat: {[Op.not]: null}}
                            ]
                        }
                    ]
                }
            }),
            // 最近绑定记录
            Log.findAll({
                where: {
                    appid,
                    log_type: {
                        [Op.in]: ['bind_email', 'bind_qq', 'bind_wechat', 'enable_2fa']
                    }
                },
                order: [['log_time', 'DESC']],
                limit: 50,
                include: [{
                    model: User,
                    attributes: ['name', 'avatar']
                }]
            })
        ]);

        // 构建统计数据
        const stats = {
            summary: {
                total: totalUsers,
                emailUsers,
                qqUsers,
                wechatUsers,
                twoFactorUsers,
                multiBindUsers
            },
            percentage: {
                email: ((emailUsers / totalUsers) * 100).toFixed(2),
                qq: ((qqUsers / totalUsers) * 100).toFixed(2),
                wechat: ((wechatUsers / totalUsers) * 100).toFixed(2),
                twoFactor: ((twoFactorUsers / totalUsers) * 100).toFixed(2),
                multiBind: ((multiBindUsers / totalUsers) * 100).toFixed(2)
            },
            securityScore: calculateSecurityScore({
                totalUsers,
                emailUsers,
                twoFactorUsers,
                multiBindUsers
            }),
            recentActivity: recentBindings.map(log => ({
                userId: log.UserId,
                username: log.User?.name || '未知用户',
                avatar: log.User?.avatar,
                type: log.log_type.replace('bind_', '').replace('enable_', ''),
                time: dayjs(log.log_time).format('YYYY-MM-DD HH:mm:ss'),
                ip: log.log_ip
            })),
            timestamp: dayjs().toISOString()
        };

        // 缓存统计结果
        try {
            await global.redisClient.set(cacheKey, JSON.stringify(stats), 'EX', 300); // 缓存5分钟
        } catch (error) {
            console.error('Redis cache error:', error);
        }

        return res.json({
            code: 200,
            message: '获取绑定统计成功',
            data: stats
        });

    } catch (error) {
        console.error('获取绑定统计失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取统计失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 计算安全评分
 * @param {Object} stats - 统计数据
 * @returns {number} 安全评分(0-100)
 */
function calculateSecurityScore({totalUsers, emailUsers, twoFactorUsers, multiBindUsers}) {
    if (totalUsers === 0) return 0;

    const weights = {
        email: 0.3,        // 邮箱绑定权重
        twoFactor: 0.4,    // 两步验证权重
        multiBind: 0.3     // 多重绑定权重
    };

    const scores = {
        email: (emailUsers / totalUsers) * weights.email * 100,
        twoFactor: (twoFactorUsers / totalUsers) * weights.twoFactor * 100,
        multiBind: (multiBindUsers / totalUsers) * weights.multiBind * 100
    };

    return Math.round(scores.email + scores.twoFactor + scores.multiBind);
}

/**
 * 获取开屏页面列表
 */
exports.getSplashList = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {appid, showAll = false} = req.body;
        const now = dayjs().toDate();

        // 构建查询条件
        const where = {appid};
        if (!showAll) {
            where[Op.and] = [
                {startDate: {[Op.lte]: now}},
                {endDate: {[Op.gte]: now}}
            ];
        }

        const splashes = await Splash.findAll({
            where,
            order: [['startDate', 'DESC']],
            attributes: {
                include: [
                    [
                        Sequelize.literal(`CASE 
                            WHEN startDate > NOW() THEN 'upcoming'
                            WHEN endDate < NOW() THEN 'expired'
                            ELSE 'active'
                        END`),
                        'status'
                    ]
                ]
            }
        });

        return res.json({
            code: 200,
            message: '获取开屏页面列表成功',
            data: {
                total: splashes.length,
                active: splashes.filter(s => s.getDataValue('status') === 'active').length,
                upcoming: splashes.filter(s => s.getDataValue('status') === 'upcoming').length,
                expired: splashes.filter(s => s.getDataValue('status') === 'expired').length,
                list: splashes
            }
        });
    } catch (error) {
        console.error('获取开屏页面列表失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取列表失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 创建开屏页面
 */
exports.createSplash = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {appid, title, background, startDate, endDate, skip = false, time = 3000} = req.body;

        const splash = await Splash.create({
            appid,
            title,
            background,
            startDate: dayjs(startDate).toDate(),
            endDate: dayjs(endDate).toDate(),
            skip,
            time
        });

        // 记录开屏页面创建
        await AppLogService.splashOperation({
            appid,
            adminId: req.admin.id,
            ip: req.clientIp,
            device: req.headers['user-agent']
        }, {
            type: 'splash_create',
            title: splash.title,
            details: {
                splashId: splash.id,
                startDate: splash.startDate,
                endDate: splash.endDate,
                config: {skip, time}
            }
        }).save();

        return res.json({
            code: 200,
            message: '创建开屏页面成功',
            data: splash
        });
    } catch (error) {
        console.error('创建开屏页面失败:', error);
        return res.status(500).json({
            code: 500,
            message: '创建失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 更新开屏页面
 */
exports.updateSplash = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {id, appid, title, background, startDate, endDate, skip, time} = req.body;

        const splash = await Splash.findOne({
            where: {id, appid}
        });

        if (!splash) {
            return res.json({
                code: 404,
                message: '开屏页面不存在'
            });
        }

        const updateData = {};
        if (title) updateData.title = title;
        if (background) updateData.background = background;
        if (startDate) updateData.startDate = dayjs(startDate).toDate();
        if (endDate) updateData.endDate = dayjs(endDate).toDate();
        if (typeof skip === 'boolean') updateData.skip = skip;
        if (time) updateData.time = time;

        await splash.update(updateData);

        await AppLogService.splashOperation({
            appid,
            userId: req.admin.id,
            ip: req.clientIp,
            device: req.headers['user-agent']
        }, {
            type: 'splash_update',
            title: splash.title,
            details: {
                splashId: id,
                changes: updateData
            }
        }).save();

        return res.json({
            code: 200,
            message: '更新开屏页面成功',
            data: splash
        });
    } catch (error) {
        console.error('更新开屏页面失败:', error);
        return res.status(500).json({
            code: 500,
            message: '更新失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 删除开屏页面
 */
exports.deleteSplash = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {id, appid} = req.body;

        const splash = await Splash.findOne({
            where: {id, appid}
        });

        if (!splash) {
            return res.json({
                code: 404,
                message: '开屏页面不存在'
            });
        }

        await splash.destroy();

        await AppLogService.splashOperation({
            appid,
            userId: req.admin.id,
            ip: req.clientIp,
            device: req.headers['user-agent']
        }, {
            type: 'splash_delete',
            title: splash.title,
            details: {
                splashId: id
            }
        }).save();

        return res.json({
            code: 200,
            message: '删除开屏页面成功'
        });
    } catch (error) {
        console.error('删除开屏页面失败:', error);
        return res.status(500).json({
            code: 500,
            message: '删除失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 获取用户地区统计
 */
exports.getUserRegionStats = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {
            appid,
            type = 'province',
            keyword,
            page = 1,
            pageSize = 20,
            includeUsers = false
        } = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 构建缓存键
        const cacheKey = `region_stats:${appid}:${type}${keyword ? `:${keyword}` : ''}`;

        // 如果不需要用户列表，尝试从缓存获取
        if (!includeUsers) {
            try {
                const cachedStats = await RedisService.get(cacheKey);
                if (cachedStats) {
                    return res.json({
                        code: 200,
                        message: '获取地区统计成功',
                        data: JSON.parse(cachedStats)
                    });
                }
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        }

        // 构建查询条件
        const where = {appid};
        if (keyword) {
            // 处理地区名称的不同写法
            const normalizedKeyword = keyword
                .replace(/省|市|区|特别行政区|自治区|维吾尔|壮族|回族|藏族/g, '')  // 移除行政区划后缀
                .replace(/内蒙古自治区/g, '内蒙古')  // 特殊地区处理
                .replace(/宁夏回族自治区/g, '宁夏')
                .replace(/广西壮族自治区/g, '广西')
                .replace(/新疆维吾尔自治区/g, '新疆')
                .replace(/西藏自治区/g, '西藏');

            const field = type === 'province' ? 'register_province' : 'register_city';

            // 构建模糊查询条件
            where[Op.or] = [
                {[field]: {[Op.like]: `%${keyword}%`}},
                {[field]: {[Op.like]: `%${normalizedKeyword}%`}}
            ];

            if (REGION_MAPPINGS[normalizedKeyword]) {
                where[Op.or].push({[field]: REGION_MAPPINGS[normalizedKeyword]});
            }
        }

        // 基础统计查询
        const [totalCount, regionStats] = await Promise.all([
            // 总用户数
            User.count({where: {appid}, distinct: true}),
            // 地区统计
            User.findAll({
                where,
                attributes: [
                    [type === 'province' ? 'register_province' : 'register_city', 'region'],
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
                    [
                        Sequelize.literal(`
                            SUM(CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END)
                        `),
                        'emailCount'
                    ],
                    [
                        Sequelize.literal(`
                            SUM(CASE WHEN open_qq IS NOT NULL THEN 1 ELSE 0 END)
                        `),
                        'qqCount'
                    ],
                    [
                        Sequelize.literal(`
                            SUM(CASE WHEN open_wechat IS NOT NULL THEN 1 ELSE 0 END)
                        `),
                        'wechatCount'
                    ]
                ],
                group: [type === 'province' ? 'register_province' : 'register_city'],
                having: Sequelize.literal('COUNT(id) > 0'),
                order: [[Sequelize.literal('count'), 'DESC']],
                distinct: true
            })
        ]);

        // 标准化地区名称
        const normalizeRegionName = (name) => {
            if (!name) return '未知地区';

            // 尝试直接从映射中获取
            if (REGION_MAPPINGS[name]) {
                return REGION_MAPPINGS[name];
            }

            // 移除后缀并再次尝试
            const normalized = name.replace(/省|市|区|特别行政区|自治区|维吾尔|壮族|回族|藏族/g, '');
            if (REGION_MAPPINGS[normalized]) {
                return REGION_MAPPINGS[normalized];
            }

            // 如果没有找到映射，返回原始名称
            return name;
        };

        // 合并相同地区的统计数据
        const regionMap = new Map();
        regionStats.forEach(stat => {
            const normalizedName = normalizeRegionName(stat.get('region'));
            const existing = regionMap.get(normalizedName);

            if (existing) {
                // 合并统计数据
                existing.count += stat.get('count');
                existing.emailCount += stat.get('emailCount');
                existing.qqCount += stat.get('qqCount');
                existing.wechatCount += stat.get('wechatCount');
            } else {
                regionMap.set(normalizedName, {
                    name: normalizedName,
                    count: stat.get('count'),
                    emailCount: stat.get('emailCount'),
                    qqCount: stat.get('qqCount'),
                    wechatCount: stat.get('wechatCount')
                });
            }
        });

        // 构建统计数据
        const stats = {
            total: totalCount,
            regions: Array.from(regionMap.values()).map(region => ({
                name: region.name,
                count: region.count,
                percentage: ((region.count / totalCount) * 100).toFixed(2),
                bindStats: {
                    email: region.emailCount,
                    qq: region.qqCount,
                    wechat: region.wechatCount
                }
            })).sort((a, b) => b.count - a.count),
            summary: {
                topRegions: Array.from(regionMap.values())
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 5)
                    .map(region => ({
                        name: region.name,
                        count: region.count
                    })),
                hasUnknownRegion: regionMap.has('未知地区')
            },
            timestamp: dayjs().toISOString()
        };

        // 如果需要用户列表，单独查询并添加到结果中
        if (includeUsers) {
            const users = await User.findAndCountAll({
                where,
                attributes: [
                    'id', 'name', 'email', 'open_qq', 'open_wechat',
                    'avatar', 'register_time', 'register_province', 'register_city'
                ],
                order: [['register_time', 'DESC']],
                limit: parseInt(pageSize),
                offset: (page - 1) * parseInt(pageSize),
                include: [{
                    model: Token,
                    attributes: ['markcode', 'time'],
                    required: false,
                    order: [['time', 'DESC']],
                    limit: 1
                }]
            });

            if (users.rows?.length > 0) {
                stats.users = {
                    total: users.count,
                    page,
                    pageSize,
                    totalPages: Math.ceil(users.count / pageSize),
                    list: users.rows.map(user => ({
                        id: user.id,
                        name: user.name,
                        avatar: user.avatar,
                        bindInfo: {
                            email: !!user.email,
                            qq: !!user.open_qq,
                            wechat: !!user.open_wechat
                        },
                        location: {
                            province: user.register_province,
                            city: user.register_city
                        },
                        registerTime: dayjs(user.register_time).format('YYYY-MM-DD HH:mm:ss'),
                        lastDevice: user.Tokens?.[0]?.markcode || null
                    }))
                };
            }
        }

        // 只缓存基础统计数据（不包含用户列表）
        if (!includeUsers) {
            await RedisService.set(cacheKey, JSON.stringify(stats), 5, RedisService.TimeUnit.MINUTES);
        }

        return res.json({
            code: 200,
            message: '获取地区统计成功',
            data: stats
        });

    } catch (error) {
        console.error('获取地区统计失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取统计失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

/**
 * 获取用户注册时间段统计
 */
exports.getUserRegisterStats = async (req, res) => {
    try {
        const err = validationResult(req);
        if (!err.isEmpty()) {
            const [{msg}] = err.errors;
            return res.status(400).json({
                code: 400,
                message: msg
            });
        }

        const {
            appid,
            timeRange,
            page = 1,
            pageSize = 20,
            includeUsers = false
        } = req.body;

        // 验证应用是否存在
        const app = await App.findByPk(appid);
        if (!app) {
            return res.json({
                code: 404,
                message: "应用不存在"
            });
        }

        // 如果不需要用户列表，尝试从缓存获取统计数据
        if (!includeUsers) {
            const cacheKey = `register_stats:${appid}:${timeRange || 'all'}`;
            try {
                const cachedStats = await RedisService.get(cacheKey);
                if (cachedStats) {
                    return res.json({
                        code: 200,
                        message: '获取注册统计成功',
                        data: cachedStats
                    });
                }
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        }

        const now = dayjs();
        const timePeriods = {
            today: now.startOf('day'),
            week: now.subtract(1, 'week'),
            month: now.subtract(1, 'month'),
            threeMonths: now.subtract(3, 'months'),
            sixMonths: now.subtract(6, 'months'),
            year: now.subtract(1, 'year')
        };

        // 构建查询条件
        const where = {appid};
        if (timeRange && timePeriods[timeRange]) {
            where.register_time = {
                [Op.gte]: timePeriods[timeRange].toDate()
            };
        }

        // 基础统计查询
        const baseQueries = [
            // 总用户数
            User.count({where: {appid}}),
            // 各时间段用户数
            Promise.all(Object.entries(timePeriods).map(async ([period, date]) => ({
                period,
                count: await User.count({
                    where: {
                        appid,
                        register_time: {[Op.gte]: date.toDate()}
                    }
                })
            }))),
            // 每日注册统计（最近30天）
            User.findAll({
                where: {
                    appid,
                    register_time: {
                        [Op.gte]: now.subtract(30, 'days').startOf('day').toDate()
                    }
                },
                attributes: [
                    [Sequelize.fn('DATE', Sequelize.col('register_time')), 'date'],
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'count'],
                    [
                        Sequelize.literal(`
                            SUM(CASE 
                                WHEN email IS NOT NULL THEN 1 
                                ELSE 0 
                            END)
                        `),
                        'emailCount'
                    ],
                    [
                        Sequelize.literal(`
                            SUM(CASE 
                                WHEN open_qq IS NOT NULL THEN 1 
                                ELSE 0 
                            END)
                        `),
                        'qqCount'
                    ],
                    [
                        Sequelize.literal(`
                            SUM(CASE 
                                WHEN open_wechat IS NOT NULL THEN 1 
                                ELSE 0 
                            END)
                        `),
                        'wechatCount'
                    ]
                ],
                group: [Sequelize.fn('DATE', Sequelize.col('register_time'))],
                order: [[Sequelize.fn('DATE', Sequelize.col('register_time')), 'ASC']]
            }),
            // 绑定方式统计
            User.findAll({
                where,
                attributes: [
                    [
                        Sequelize.literal(`
                            CASE 
                                WHEN email IS NOT NULL AND open_qq IS NULL AND open_wechat IS NULL THEN 'email_only'
                                WHEN email IS NULL AND open_qq IS NOT NULL AND open_wechat IS NULL THEN 'qq_only'
                                WHEN email IS NULL AND open_qq IS NULL AND open_wechat IS NOT NULL THEN 'wechat_only'
                                WHEN email IS NOT NULL OR open_qq IS NOT NULL OR open_wechat IS NOT NULL THEN 'multiple'
                                ELSE 'none'
                            END
                        `),
                        'bindType'
                    ],
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
                ],
                group: [Sequelize.literal('bindType'), 'register_province', 'register_city']
            })
        ];

        let users = {count: 0, rows: []};

        if (includeUsers) {
            // 只在需要用户列表时执行用户查询
            users = await User.findAndCountAll({
                where,
                attributes: [
                    'id', 'name', 'email', 'open_qq', 'open_wechat',
                    'avatar', 'register_time', 'register_province', 'register_city'
                ],
                order: [['register_time', 'DESC']],
                limit: parseInt(pageSize),
                offset: (page - 1) * parseInt(pageSize),
                include: [{
                    model: Token,
                    attributes: ['markcode', 'time'],
                    required: false,
                    order: [['time', 'DESC']],
                    limit: 1
                }]
            });
        }

        // 执行基础统计查询
        const [totalCount, periodCounts, dailyStats, bindingStats] = await Promise.all(baseQueries);

        // 构建基础统计数据（不包含用户列表）
        const stats = {
            total: totalCount,
            periods: Object.fromEntries(
                periodCounts.map(({period, count}) => [
                    period,
                    {
                        count,
                        percentage: ((count / totalCount) * 100).toFixed(2)
                    }
                ])
            ),
            dailyTrend: {
                dates: dailyStats.map(stat => ({
                    date: stat.get('date'),
                    total: stat.get('count'),
                    bindStats: {
                        email: stat.get('emailCount'),
                        qq: stat.get('qqCount'),
                        wechat: stat.get('wechatCount')
                    }
                })),
                averageDaily: Math.round(
                    dailyStats.reduce((sum, stat) => sum + stat.get('count'), 0) / dailyStats.length
                )
            },
            bindingDistribution: bindingStats.reduce((acc, stat) => {
                acc[stat.get('bindType')] = {
                    count: stat.get('count'),
                    percentage: ((stat.get('count') / totalCount) * 100).toFixed(2)
                };
                return acc;
            }, {}),
            timestamp: dayjs().toISOString()
        };

        // 如果需要用户列表，单独查询并添加到结果中
        if (includeUsers) {
            const users = await User.findAndCountAll({
                where,
                attributes: [
                    'id', 'name', 'email', 'open_qq', 'open_wechat',
                    'avatar', 'register_time', 'register_province', 'register_city'
                ],
                order: [['register_time', 'DESC']],
                limit: parseInt(pageSize),
                offset: (page - 1) * parseInt(pageSize),
                include: [{
                    model: Token,
                    attributes: ['markcode', 'time'],
                    required: false,
                    order: [['time', 'DESC']],
                    limit: 1
                }]
            });

            if (users.rows?.length > 0) {
                stats.users = {
                    total: users.count,
                    page,
                    pageSize,
                    totalPages: Math.ceil(users.count / pageSize),
                    list: users.rows.map(user => ({
                        id: user.id,
                        name: user.name,
                        avatar: user.avatar,
                        bindInfo: {
                            email: !!user.email,
                            qq: !!user.open_qq,
                            wechat: !!user.open_wechat
                        },
                        location: {
                            province: user.register_province,
                            city: user.register_city
                        },
                        registerTime: dayjs(user.register_time).format('YYYY-MM-DD HH:mm:ss'),
                        lastDevice: user.Tokens?.[0]?.markcode || null
                    }))
                };
            }
        }

        // 只缓存基础统计数据（不包含用户列表）
        if (!includeUsers) {
            const cacheKey = `register_stats:${appid}:${timeRange || 'all'}`;
            await RedisService.set(cacheKey, stats, 5, RedisService.TimeUnit.MINUTES);
        }

        return res.json({
            code: 200,
            message: '获取注册统计成功',
            data: stats
        });

    } catch (error) {
        console.error('获取注册统计失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取统计失败',
            error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
    }
};

exports.createTask = async (req, res) => {
    // 验证请求体
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({code: 400, message: '输入验证失败', errors: errors.array()});
    }

    try {
        const {name, schedule, executionDate, action, conditions, rewardType, rewardAmount, rewardUnit} = req.body;

        // 创建任务
        const task = await taskService.createTask({
            name,
            schedule,
            executionDate,
            action,
            conditions,
            rewardType,
            rewardAmount,
            rewardUnit
        });

        // 记录成功日志
        await SystemLogService.createLog({
            type: 'info',
            content: `任务创建成功: ${task.name}`,
            details: {taskId: task.id}
        });

        res.json({code: 200, message: '任务创建成功', data: task});
    } catch (error) {
        console.error('任务创建失败:', error);

        // 记录失败日志
        await SystemLogService.createLog({
            type: 'error',
            content: '任务创建失败',
            details: {error: error.message}
        });

        res.status(500).json({code: 500, message: '任务创建失败', error: error.message});
    }
};

exports.updateTask = async (req, res) => {
    try {
        const task = await taskService.updateTask(req.params.id, req.body);
        res.json({code: 200, message: 'Task updated', data: task});
    } catch (error) {
        res.status(500).json({code: 500, message: 'Failed to update task', error: error.message});
    }
};

exports.deleteTask = async (req, res) => {
    try {
        await taskService.deleteTask(req.params.id);
        res.json({code: 200, message: 'Task deleted'});
    } catch (error) {
        res.status(500).json({code: 500, message: 'Failed to delete task', error: error.message});
    }
};

/**
 * 抽奖并分发奖励
 */
exports.drawLottery = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({code: 400, message: '输入验证失败', errors: errors.array()});
    }

    try {
        const {
            appid,              // 应用ID
            count,              // 抽奖人数
            rewardType,         // 奖励类型
            rewardAmount,       // 奖励数量
            rewardUnit,         // 奖励单位（仅会员奖励需要）
            conditions = {},    // 抽奖条件
            isJoinLottery      // true: 满足条件的参与抽奖, false: 满足条件的不参与抽奖
        } = req.body;

        // 构建基础查询条件
        const where = {
            appid,
            enabled: true
        };

        // 注册时间条件
        if (conditions.registerTime) {
            where.register_time = {[Op.gte]: new Date(conditions.registerTime)};
        }

        // 积分范围条件
        if (conditions.minIntegral !== undefined) {
            where.integral = {
                ...where.integral,
                [Op.gte]: conditions.minIntegral
            };
        }

        if (conditions.maxIntegral !== undefined) {
            where.integral = {
                ...where.integral,
                [Op.lte]: conditions.maxIntegral
            };
        }

        // 处理永久会员条件
        // 如果 isJoinLottery 为 true，则永久会员参与抽奖
        // 如果 isJoinLottery 为 false，则永久会员不参与抽奖
        const currentTime = dayjs().unix();
        if (isJoinLottery) {
            // 满足条件的参与抽奖
            where.vip_time = {
                [Op.eq]: 999999999 // 永久会员
            };
        } else {
            // 满足条件的不参与抽奖
            where.vip_time = {
                [Op.or]: [
                    {[Op.lt]: currentTime}, // 已过期的会员
                    {[Op.lt]: 999999999}    // 非永久会员
                ]
            };
        }

        // 排除指定用户
        if (conditions.excludeUsers && Array.isArray(conditions.excludeUsers)) {
            where.id = {[Op.notIn]: conditions.excludeUsers};
        }

        // 仅包含指定用户
        if (conditions.includeUsers && Array.isArray(conditions.includeUsers)) {
            where.id = {[Op.in]: conditions.includeUsers};
        }

        // 排除已中奖用户（从日志中查询）
        if (conditions.excludeWinners) {
            const previousWinners = await SystemLogService.findLogs({
                type: 'lottery_reward',
                startTime: dayjs().subtract(conditions.excludeWinners, 'days').toDate()
            });

            const winnerIds = [...new Set(previousWinners.map(log => log.log_details.userId))];

            if (winnerIds.length > 0) {
                where.id = {
                    ...where.id,
                    [Op.notIn]: winnerIds
                };
            }
        }

        // 随机抽取指定数量的用户
        const users = await User.findAll({
            where,
            order: Sequelize.literal('RAND()'),
            limit: count
        });

        if (!users || users.length === 0) {
            return res.status(404).json({
                code: 404,
                message: '未找到符合条件的用户'
            });
        }

        // 开始事务
        const transaction = await mysql.transaction();

        try {
            // 为中奖用户分发奖励
            for (const user of users) {
                if (rewardType === 'integral') {
                    user.integral += parseInt(rewardAmount);
                } else if (rewardType === 'membership') {
                    let expirationDate = dayjs(user.membershipExpiration || new Date());

                    switch (rewardUnit) {
                        case 'minutes':
                            expirationDate = expirationDate.add(rewardAmount, 'minute');
                            break;
                        case 'hours':
                            expirationDate = expirationDate.add(rewardAmount, 'hour');
                            break;
                        case 'days':
                            expirationDate = expirationDate.add(rewardAmount, 'day');
                            break;
                        case 'months':
                            expirationDate = expirationDate.add(rewardAmount, 'month');
                            break;
                        case 'years':
                            expirationDate = expirationDate.add(rewardAmount, 'year');
                            break;
                        case 'permanent':
                            expirationDate = dayjs().add(100, 'years');
                            break;
                    }
                    user.membershipExpiration = expirationDate.unix();
                }
                await user.save({transaction});

                // 记录奖励日志
                await SystemLogService.createLog({
                    type: 'lottery_reward',
                    content: `抽奖用户 ${user.id} 获得奖励`,
                    details: {
                        userId: user.id,
                        rewardType,
                        rewardAmount,
                        rewardUnit,
                        lotteryTime: new Date()
                    }
                }, {transaction});
            }

            await transaction.commit();

            // 返回中奖用户信息
            const winners = users.map(user => ({
                id: user.id,
                avatar: user.avatar,
                name: user.name,
                account: user.account,
                email: user.email,
                registerTime: dayjs(user.register_time).format('YYYY-MM-DD HH:mm:ss'),
                integral: user.integral,
                membershipLevel: user.membershipLevel,
                reward: {
                    type: rewardType,
                    amount: rewardAmount,
                    unit: rewardUnit
                }
            }));

            // 发送通知
            const app = await App.findByPk(lottery.appid);
            for (const winner of winners) {
                if (winner.email) {
                    try {
                        await sendLotteryWinningNotification(app, winner.email, {
                            name: winner.name || winner.account,
                            lotteryName: lottery.name,
                            drawTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                            reward: {
                                type: lottery.rewardType,
                                amount: lottery.rewardAmount,
                                unit: lottery.rewardUnit,
                                expireTime: lottery.rewardType === 'membership' ? winner.vip_time : null
                            }
                        });

                        // 记录通知发送日志
                        await SystemLogService.createLog({
                            type: 'lottery_notification',
                            content: '中奖通知发送成功',
                            details: {
                                lotteryId: lottery.lotteryId,
                                userId: winner.id,
                                email: winner.email
                            }
                        });
                    } catch (error) {
                        // 记录发送失败日志，但不影响整体流程
                        console.error(`发送中奖通知失败 (用户ID: ${winner.id}):`, error);
                        await SystemLogService.createLog({
                            type: 'error',
                            content: '中奖通知发送失败',
                            details: {
                                lotteryId: lottery.lotteryId,
                                userId: winner.id,
                                error: error.message
                            }
                        });
                    }
                }
            }

            return res.json({
                code: 200,
                message: '抽奖完成',
                data: {
                    totalWinners: winners.length,
                    winners
                }
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('抽奖失败:', error);
        await SystemLogService.createLog({
            type: 'error',
            content: '抽奖失败',
            details: {error: error.message}
        });

        res.status(500).json({
            code: 500,
            message: '抽奖失败',
            error: error.message
        });
    }
};

/**
 * 用户查询接口
 */
exports.searchUsers = async (req, res) => {
    try {
        const {
            appid,
            queryType,
            startTime,
            endTime,
            membershipStatus,
            excludeConditions, // 新增排除条件参数
            page = 1,
            pageSize = 20
        } = req.body;

        // 构建基础查询条件
        const where = {appid, enabled: true};
        const currentTime = dayjs().unix();

        // 处理排除条件
        if (excludeConditions) {
            // 排除指定积分范围的用户
            if (excludeConditions.integral) {
                const {min, max} = excludeConditions.integral;
                where.integral = {
                    [Op.notBetween]: [min, max]
                };
            }

            // 排除指定注册时间范围的用户
            if (excludeConditions.registerTime) {
                where.register_time = {
                    [Op.notBetween]: [
                        new Date(excludeConditions.registerTime.start),
                        new Date(excludeConditions.registerTime.end)
                    ]
                };
            }

            // 排除指定会员状态的用户
            if (excludeConditions.membershipStatus) {
                const excludeStatusConditions = [];
                excludeConditions.membershipStatus.forEach(status => {
                    switch (status) {
                        case 'active':
                            excludeStatusConditions.push({
                                vip_time: {
                                    [Op.gt]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'expired':
                            excludeStatusConditions.push({
                                vip_time: {
                                    [Op.lte]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'permanent':
                            excludeStatusConditions.push({
                                vip_time: 999999999
                            });
                            break;
                    }
                });
                if (excludeStatusConditions.length > 0) {
                    where[Op.not] = excludeStatusConditions;
                }
            }
        }

        // 根据查询类型构建不同的查询条件
        switch (queryType) {
            case 'register':
                // 注册时间范围查询
                if (startTime) {
                    where.register_time = {
                        [Op.gte]: new Date(startTime)
                    };
                }
                if (endTime) {
                    where.register_time = {
                        ...where.register_time,
                        [Op.lte]: new Date(endTime)
                    };
                }
                break;

            case 'checkin':
                // 签到记录查询
                const checkInLogs = await Daily.findAll({
                    where: {
                        date: {
                            [Op.gte]: startTime ? new Date(startTime) : undefined,
                            [Op.lte]: endTime ? new Date(endTime) : undefined
                        }
                    },
                    attributes: ['userId'],
                    distinct: true
                });

                const checkinUserIds = checkInLogs.map(log => log.userId);

                if (checkinUserIds.length > 0) {
                    where.id = {[Op.in]: checkinUserIds};
                } else {
                    console.log('没有签到记录')
                    return res.json({
                        code: 200,
                        message: '查询成功',
                        data: {
                            total: 0,
                            page,
                            pageSize,
                            totalPages: 0,
                            list: []
                        }
                    });
                }
                break;

            case 'membership':
                // 会员状态查询
                if (membershipStatus && membershipStatus.length > 0) {
                    const statusConditions = [];
                    const currentTime = dayjs().unix();

                    membershipStatus.forEach(status => {
                        switch (status) {
                            case 'active':
                                statusConditions.push({
                                    vip_time: {
                                        [Op.gt]: currentTime,
                                        [Op.lt]: 999999999
                                    }
                                });
                                break;
                            case 'expired':
                                statusConditions.push({
                                    vip_time: {
                                        [Op.lt]: currentTime
                                    }
                                });
                                break;
                            case 'permanent':
                                statusConditions.push({
                                    vip_time: 999999999
                                });
                                break;
                        }
                    });

                    if (statusConditions.length > 0) {
                        where[Op.or] = statusConditions;
                    }
                }
                break;
        }

        // 执行查询
        const {count, rows} = await User.findAndCountAll({
            where,
            attributes: [
                'id', 'name', 'account', 'email', 'avatar',
                'register_time', 'vip_time', 'integral',
                'register_province', 'register_city'
            ],
            order: [['register_time', 'DESC']],
            limit: parseInt(pageSize),
            offset: (page - 1) * parseInt(pageSize)
        });

        // 格式化用户数据
        const users = rows.map(user => ({
            id: user.id,
            name: user.name,
            account: user.account,
            email: user.email,
            avatar: user.avatar,
            registerTime: dayjs(user.register_time).format('YYYY-MM-DD HH:mm:ss'),
            location: {
                province: user.register_province,
                city: user.register_city
            },
            membership: {
                status: user.vip_time === 999999999 ? 'permanent' :
                    user.vip_time > currentTime ? 'active' : 'expired',
                expireTime: user.vip_time === 999999999 ? '永久' :
                    dayjs.unix(user.vip_time).format('YYYY-MM-DD HH:mm:ss')
            },
            integral: user.integral
        }));

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
                list: users
            }
        });

    } catch (error) {
        console.error('用户查询失败:', error);
        await SystemLogService.createLog({
            type: 'error',
            content: '用户查询失败',
            details: {error: error.message}
        });

        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 创建定时抽奖任务
 */
exports.createLottery = async (req, res) => {
    const transaction = await mysql.transaction();

    try {
        // 生成唯一的抽奖ID
        const lotteryId = `LT${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;

        const lottery = await Lottery.create({
            ...req.body,
            lotteryId,
            status: 'pending'
        }, {transaction});

        // 创建定时任务
        const job = schedule.scheduleJob(new Date(req.body.drawTime), async () => {
            try {
                await executeLotteryDraw(lottery.id);
            } catch (error) {
                console.error(`抽奖任务 ${lotteryId} 执行失败:`, error);
                await SystemLogService.createLog({
                    type: 'error',
                    content: `抽奖任务执行失败`,
                    details: {lotteryId, error: error.message}
                });
            }
        });

        // 保存定时任务引用
        lotteryJobs.set(lottery.id, job);

        await transaction.commit();

        return res.json({
            code: 200,
            message: '抽奖任务创建成功',
            data: {
                ...lottery.toJSON(),
                lotteryId // 返回生成的抽奖ID
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('创建抽奖任务失败:', error);
        return res.status(500).json({
            code: 500,
            message: '创建失败',
            error: error.message
        });
    }
};

/**
 * 执行抽奖
 */
async function executeLotteryDraw(lotteryId) {
    const transaction = await mysql.transaction();

    try {
        const lottery = await Lottery.findByPk(lotteryId);
        if (!lottery || lottery.status !== 'pending') {
            return;
        }

        // 构建基础查询条件
        const where = {
            appid: lottery.appid,
            enabled: true
        };
        const currentTime = dayjs().unix();

        // 处理参与条件
        if (lottery.conditions) {
            // 注册时间条件
            if (lottery.conditions.registerTime) {
                const {start, end} = lottery.conditions.registerTime;
                if (start) {
                    where.register_time = {
                        ...where.register_time,
                        [Op.gte]: new Date(start)
                    };
                }
                if (end) {
                    where.register_time = {
                        ...where.register_time,
                        [Op.lte]: new Date(end)
                    };
                }
            }

            // 积分范围条件
            if (lottery.conditions.integral) {
                const {min, max} = lottery.conditions.integral;
                if (min !== undefined) {
                    where.integral = {
                        ...where.integral,
                        [Op.gte]: min
                    };
                }
                if (max !== undefined) {
                    where.integral = {
                        ...where.integral,
                        [Op.lte]: max
                    };
                }
            }

            // 会员状态条件
            if (lottery.conditions.membershipStatus?.length > 0) {
                const statusConditions = [];
                lottery.conditions.membershipStatus.forEach(status => {
                    switch (status) {
                        case 'active':
                            statusConditions.push({
                                vip_time: {
                                    [Op.gt]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'expired':
                            statusConditions.push({
                                vip_time: {
                                    [Op.lte]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'permanent':
                            statusConditions.push({
                                vip_time: 999999999
                            });
                            break;
                    }
                });
                if (statusConditions.length > 0) {
                    where[Op.or] = statusConditions;
                }
            }

            // 指定用户条件
            if (lottery.conditions.includeUsers?.length > 0) {
                where.id = {[Op.in]: lottery.conditions.includeUsers};
            }

            // 签到要求
            if (lottery.conditions.checkinDays) {
                const {count, startDate, endDate} = lottery.conditions.checkinDays;

                // 获取指定日期范围内的签到记录
                const checkinLogs = await Daily.findAll({
                    where: {
                        date: {
                            [Op.between]: [
                                startDate ? new Date(startDate) : dayjs().subtract(30, 'days').toDate(),
                                endDate ? new Date(endDate) : new Date()
                            ]
                        }
                    },
                    attributes: ['userId'],
                    group: ['userId'],
                    having: Sequelize.literal(`COUNT(*) >= ${count || 1}`),
                    raw: true
                });

                const qualifiedUserIds = checkinLogs.map(log => log.userId);

                if (qualifiedUserIds.length > 0) {
                    where.id = where.id
                        ? {[Op.and]: [where.id, {[Op.in]: qualifiedUserIds}]}
                        : {[Op.in]: qualifiedUserIds};
                } else {
                    // 如果没有符合签到要求的用户，直接返回
                    console.log('没有符合签到要求的用户');
                    return;
                }
            }
        }

        // 处理排除条件
        if (lottery.excludeConditions) {
            const excludeConditions = [];

            // 注册时间范围
            if (lottery.excludeConditions.registerTime) {
                const {start, end} = lottery.excludeConditions.registerTime;
                if (start && end) {
                    excludeConditions.push({
                        register_time: {
                            [Op.between]: [new Date(start), new Date(end)]
                        }
                    });
                } else if (start) {
                    excludeConditions.push({
                        register_time: {
                            [Op.gte]: new Date(start)
                        }
                    });
                } else if (end) {
                    excludeConditions.push({
                        register_time: {
                            [Op.lte]: new Date(end)
                        }
                    });
                }
            }

            // 积分范围
            if (lottery.excludeConditions.integral) {
                const {min, max} = lottery.excludeConditions.integral;
                if (min !== undefined && max !== undefined) {
                    excludeConditions.push({
                        integral: {
                            [Op.between]: [min, max]
                        }
                    });
                } else if (min !== undefined) {
                    excludeConditions.push({
                        integral: {
                            [Op.gte]: min
                        }
                    });
                } else if (max !== undefined) {
                    excludeConditions.push({
                        integral: {
                            [Op.lte]: max
                        }
                    });
                }
            }

            // 会员状态
            if (lottery.excludeConditions.membershipStatus?.length > 0) {
                const statusConditions = [];
                lottery.excludeConditions.membershipStatus.forEach(status => {
                    switch (status) {
                        case 'active':
                            statusConditions.push({
                                vip_time: {
                                    [Op.gt]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'expired':
                            statusConditions.push({
                                vip_time: {
                                    [Op.lte]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'permanent':
                            statusConditions.push({
                                vip_time: 999999999
                            });
                            break;
                    }
                });
                if (statusConditions.length > 0) {
                    excludeConditions.push({[Op.or]: statusConditions});
                }
            }

            // 排除指定用户
            if (lottery.excludeConditions.excludeUsers?.length > 0) {
                excludeConditions.push({
                    id: {[Op.in]: lottery.excludeConditions.excludeUsers}
                });
            }

            // 排除近期中奖用户
            if (lottery.excludeConditions.excludeWinners) {
                const previousWinners = await SystemLogService.findLogs({
                    type: 'lottery_reward',
                    startTime: dayjs().subtract(lottery.excludeConditions.excludeWinners, 'days').toDate()
                });

                const winnerIds = [...new Set(previousWinners.map(log => log.log_details.userId))];

                if (winnerIds.length > 0) {
                    excludeConditions.push({
                        id: {[Op.in]: winnerIds}
                    });
                }
            }

            // 合并所有排除条件
            if (excludeConditions.length > 0) {
                where[Op.not] = {[Op.or]: excludeConditions};
            }
        }

        // 先获取符合条件的用户总数
        const totalEligible = await User.count({where});

        // 如果符合条件的用户数小于中奖人数，调整中奖人数
        const actualWinnerCount = Math.min(lottery.count, totalEligible);

        // 使用 ORDER BY RAND() 随机选择指定数量的用户
        const winners = await User.findAll({
            where,
            order: mysql.literal('RAND()'),
            limit: actualWinnerCount,
            transaction,
            attributes: ['id', 'name', 'account', 'integral', 'vip_time', 'avatar']
        });

        // 记录实际参与人数
        lottery.participantsCount = totalEligible;

        // 发放奖励
        const winnerDetails = [];
        for (const user of winners) {
            if (lottery.rewardType === 'integral') {
                user.integral += parseInt(lottery.rewardAmount);
                winnerDetails.push({
                    id: user.id,
                    name: user.name,
                    account: user.account,
                    avatar: user.avatar,
                    reward: {
                        type: 'integral',
                        amount: parseInt(lottery.rewardAmount)
                    }
                });
            } else {
                // 处理会员奖励
                const currentTime = Math.max(dayjs().unix(), user.vip_time);
                let expirationDate = dayjs.unix(currentTime);

                switch (lottery.rewardUnit) {
                    case 'permanent':
                        user.vip_time = 999999999;
                        break;
                    default:
                        expirationDate = expirationDate.add(
                            lottery.rewardAmount,
                            lottery.rewardUnit
                        );
                        user.vip_time = expirationDate.unix();
                }

                winnerDetails.push({
                    id: user.id,
                    name: user.name,
                    account: user.account,
                    avatar: user.avatar,
                    reward: {
                        type: 'membership',
                        amount: lottery.rewardAmount,
                        unit: lottery.rewardUnit,
                        expireTime: user.vip_time
                    }
                });
            }
            await user.save({transaction});

            // 记录奖励日志
            await SystemLogService.createLog({
                type: 'lottery_reward',
                content: `抽奖奖励发放`,
                details: {
                    lotteryId: lottery.lotteryId,
                    userId: user.id,
                    rewardType: lottery.rewardType,
                    rewardAmount: lottery.rewardAmount,
                    rewardUnit: lottery.rewardUnit
                }
            }, {transaction});
        }

        // 更新抽奖状态和结果
        lottery.status = 'completed';
        lottery.winners = winnerDetails;
        lottery.completedAt = new Date();
        await lottery.save({transaction});

        await transaction.commit();

        // 发送中奖通知
        try {
            const app = await App.findByPk(lottery.appid);
            for (const winner of winners) {
                // 查询用户完整信息
                const user = await User.findByPk(winner.id, {
                    attributes: ['id', 'name', 'account', 'email']
                });

                if (user?.email) {
                    try {
                        await sendLotteryWinningNotification(app, user.email, {
                            name: user.name || user.account,
                            lotteryName: lottery.name,
                            drawTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                            reward: {
                                type: lottery.rewardType,
                                amount: lottery.rewardAmount,
                                unit: lottery.rewardUnit
                            }
                        });

                        // 记录通知发送日志
                        await SystemLogService.createLog({
                            type: 'lottery_notification',
                            content: '中奖通知发送成功',
                            details: {
                                lotteryId: lottery.lotteryId,
                                userId: user.id,
                                email: user.email,
                                reward: winner.reward
                            }
                        });

                        // 记录用户日志
                        await UserLogService.quickLog({
                            appid: app.id,
                            userId: user.id
                        }, 'lottery_notification', '抽奖中奖通知', {
                            lotteryId: lottery.lotteryId,
                            lotteryName: lottery.name,
                            reward: winner.reward,
                            notificationTime: new Date()
                        });

                    } catch (error) {
                        // 记录发送失败日志，但不影响整体流程
                        console.error(`发送中奖通知失败 (用户ID: ${user.id}):`, error);

                        // 系统日志
                        await SystemLogService.createLog({
                            type: 'error',
                            content: '中奖通知发送失败',
                            details: {
                                lotteryId: lottery.lotteryId,
                                userId: user.id,
                                error: error.message
                            }
                        });

                        // 用户日志
                        await UserLogService.quickError({
                            appid: app.id,
                            userId: user.id
                        }, 'lottery_notification', '抽奖中奖通知发送失败', error);
                    }
                } else {
                    // 记录无邮箱用户日志
                    await UserLogService.quickLog({
                        appid: app.id,
                        userId: winner.id
                    }, 'lottery_notification', '抽奖中奖通知跳过', {
                        lotteryId: lottery.lotteryId,
                        reason: '用户未绑定邮箱',
                        timestamp: new Date()
                    });
                }
            }
        } catch (error) {
            // 记录整体通知过程错误，但不影响抽奖结果
            console.error('处理中奖通知时发生错误:', error);
            await SystemLogService.createLog({
                type: 'error',
                content: '处理中奖通知失败',
                details: {
                    lotteryId: lottery.lotteryId,
                    error: error.message
                }
            });
        }

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

/**
 * 获取抽奖任务列表
 */
exports.getLotteryList = async (req, res) => {
    try {
        const {
            appid,
            status,
            page = 1,
            pageSize = 20
        } = req.query;

        const where = {appid};
        if (status) {
            where.status = status;
        }

        const {count, rows: lotteries} = await Lottery.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: pageSize,
            offset: (page - 1) * pageSize
        });

        if (lotteries.length === 0) {
            return res.json({
                code: 200,
                message: '查询成功',
                data: {
                    total: 0,
                    page: parseInt(page),
                    pageSize: parseInt(pageSize),
                    totalPages: 0,
                    list: []
                }
            });
        }

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                total: count,
                page: parseInt(page),
                pageSize: parseInt(pageSize),
                totalPages: Math.ceil(count / pageSize),
                list: lotteries
            }
        });

    } catch (error) {
        console.error('获取抽奖任务列表失败:', error);
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
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

        const lottery = await Lottery.findOne({
            where: {
                lotteryId,
                appid
            }
        });

        if (!lottery) {
            return res.status(404).json({
                code: 404,
                message: '抽奖任务不存在'
            });
        }

        // 格式化返回数据
        const response = {
            lotteryId: lottery.lotteryId,
            name: lottery.name,
            status: lottery.status,
            drawTime: lottery.drawTime,
            rewardType: lottery.rewardType,
            rewardAmount: lottery.rewardAmount,
            rewardUnit: lottery.rewardUnit,
            winners: []
        };

        // 如果已开奖，返回详细的中奖信息
        if (lottery.status === 'completed' && lottery.winners) {
            response.winners = await Promise.all(lottery.winners.map(async winner => {
                const user = await User.findByPk(winner.id);
                return {
                    id: user.id,
                    name: user.name,
                    account: user.account,
                    avatar: user.avatar,
                    reward: {
                        type: lottery.rewardType,
                        amount: lottery.rewardAmount,
                        unit: lottery.rewardUnit
                    }
                };
            }));
        }

        return res.json({
            code: 200,
            message: '查询成功',
            data: response
        });

    } catch (error) {
        console.error('获取抽奖结果失败:', error);
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 初始化抽奖任务
 */
async function initLotteryTasks() {
    try {
        // 查找所有待执行的抽奖任务
        const pendingLotteries = await Lottery.findAll({
            where: {
                status: 'pending',
                drawTime: {
                    [Op.gt]: new Date() // 只加载未来的任务
                }
            }
        });

        console.log(`Found ${pendingLotteries.length} pending lottery tasks`);

        // 重新创建定时任务
        for (const lottery of pendingLotteries) {
            const drawTime = new Date(lottery.drawTime);

            // 创建定时任务
            const job = schedule.scheduleJob(drawTime, async () => {
                try {
                    await executeLotteryDraw(lottery.id);
                } catch (error) {
                    console.error(`抽奖任务 ${lottery.id} 执行失败:`, error);
                    await SystemLogService.createLog({
                        type: 'error',
                        content: `抽奖任务执行失败`,
                        details: {lotteryId: lottery.id, error: error.message}
                    });
                }
            });

            // 保存定时任务引用
            lotteryJobs.set(lottery.id, job);
        }

        await SystemLogService.createLog({
            type: 'info',
            content: '抽奖任务初始化完成',
            details: {taskCount: pendingLotteries.length}
        });

    } catch (error) {
        console.error('初始化抽奖任务失败:', error);
        await SystemLogService.createLog({
            type: 'error',
            content: '初始化抽奖任务失败',
            details: {error: error.message}
        });
    }
}

/**
 * 取消抽奖任务
 */
exports.cancelLottery = async (req, res) => {
    const transaction = await mysql.transaction();

    try {
        const {lotteryId} = req.params;
        const {appid, reason} = req.body;

        // 查找抽奖任务
        const lottery = await Lottery.findOne({
            where: {
                lotteryId,
                appid
            }
        });

        if (!lottery) {
            return res.status(404).json({
                code: 404,
                message: '抽奖任务不存在'
            });
        }

        // 检查任务状态
        if (lottery.status !== 'pending') {
            return res.status(409).json({
                code: 409,
                message: '只能取消未开奖的任务',
                data: {
                    currentStatus: lottery.status
                }
            });
        }

        // 取消定时任务
        const job = lotteryJobs.get(lottery.id);
        if (job) {
            job.cancel();
            lotteryJobs.delete(lottery.id);
        }

        // 更新任务状态
        lottery.status = 'cancelled';
        lottery.cancelReason = reason || '管理员取消';
        lottery.cancelTime = new Date();
        await lottery.save({transaction});

        // 记录取消日志
        await SystemLogService.createLog({
            type: 'lottery_cancelled',
            content: '抽奖任务已取消',
            details: {
                lotteryId: lottery.lotteryId,
                reason: lottery.cancelReason,
                drawTime: lottery.drawTime,
                cancelTime: lottery.cancelTime
            }
        }, {transaction});

        await transaction.commit();

        return res.json({
            code: 200,
            message: '抽奖任务已取消',
            data: {
                lotteryId: lottery.lotteryId,
                status: 'cancelled',
                cancelReason: lottery.cancelReason,
                cancelTime: lottery.cancelTime
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('取消抽奖任务失败:', error);

        await SystemLogService.createLog({
            type: 'error',
            content: '取消抽奖任务失败',
            details: {error: error.message}
        });

        return res.status(500).json({
            code: 500,
            message: '取消失败',
            error: error.message
        });
    }
};


/**
 * 获取抽奖统计信息
 */
exports.getLotteryStats = async (req, res) => {
    try {
        const {appid, startTime, endTime} = req.query;

        // 构建查询条件
        const where = {
            appid
        };

        if (startTime) {
            where.drawTime = {
                ...where.drawTime,
                [Op.gte]: new Date(startTime)
            };
        }

        if (endTime) {
            where.drawTime = {
                ...where.drawTime,
                [Op.lte]: new Date(endTime)
            };
        }

        // 查询统计信息
        const totalLotteries = await Lottery.count({where});
        const completedLotteries = await Lottery.count({where: {...where, status: 'completed'}});
        const cancelledLotteries = await Lottery.count({where: {...where, status: 'cancelled'}});

        const totalRewards = await Lottery.findAll({
            where: {...where, status: 'completed'},
            attributes: [
                'rewardType',
                [Sequelize.fn('SUM', Sequelize.col('rewardAmount')), 'totalAmount']
            ],
            group: ['rewardType'],
            raw: true
        });

        const rewardSummary = totalRewards.reduce((acc, reward) => {
            acc[reward.rewardType] = reward.totalAmount;
            return acc;
        }, {});

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                totalLotteries,
                completedLotteries,
                cancelledLotteries,
                totalRewards: rewardSummary
            }
        });

    } catch (error) {
        console.error('获取抽奖统计信息失败:', error);
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 获取抽奖参与名单
 */
exports.getLotteryParticipants = async (req, res) => {
    try {
        const {lotteryId} = req.params;
        const {appid} = req.query;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;

        // 查找抽奖任务
        const lottery = await Lottery.findOne({
            where: {
                lotteryId,
                appid
            }
        });

        if (!lottery) {
            return res.status(404).json({
                code: 404,
                message: '抽奖任务不存在'
            });
        }

        // 构建基础查询条件
        const where = {
            appid: lottery.appid,
            enabled: true
        };
        const currentTime = dayjs().unix();

        // 处理参与条件
        if (lottery.conditions) {
            // 注册时间条件
            if (lottery.conditions.registerTime) {
                const {start, end} = lottery.conditions.registerTime;
                if (start) {
                    where.register_time = {
                        ...where.register_time,
                        [Op.gte]: new Date(start)
                    };
                }
                if (end) {
                    where.register_time = {
                        ...where.register_time,
                        [Op.lte]: new Date(end)
                    };
                }
            }

            // 积分范围条件
            if (lottery.conditions.integral) {
                const {min, max} = lottery.conditions.integral;
                if (min !== undefined) {
                    where.integral = {
                        ...where.integral,
                        [Op.gte]: min
                    };
                }
                if (max !== undefined) {
                    where.integral = {
                        ...where.integral,
                        [Op.lte]: max
                    };
                }
            }

            // 会员状态条件
            if (lottery.conditions.membershipStatus?.length > 0) {
                const statusConditions = [];
                lottery.conditions.membershipStatus.forEach(status => {
                    switch (status) {
                        case 'active':
                            statusConditions.push({
                                vip_time: {
                                    [Op.gt]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'expired':
                            statusConditions.push({
                                vip_time: {
                                    [Op.lte]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'permanent':
                            statusConditions.push({
                                vip_time: 999999999
                            });
                            break;
                    }
                });
                if (statusConditions.length > 0) {
                    where[Op.or] = statusConditions;
                }
            }

            // 指定用户条件
            if (lottery.conditions.includeUsers?.length > 0) {
                where.id = {[Op.in]: lottery.conditions.includeUsers};
            }

            // 签到要求
            if (lottery.conditions.checkinDays) {
                const {count, startDate, endDate} = lottery.conditions.checkinDays;

                // 获取指定日期范围内的签到记录
                const checkinLogs = await Daily.findAll({
                    where: {
                        date: {
                            [Op.between]: [
                                startDate ? new Date(startDate) : dayjs().subtract(30, 'days').toDate(),
                                endDate ? new Date(endDate) : new Date()
                            ]
                        }
                    },
                    attributes: ['userId'],
                    group: ['userId'],
                    having: Sequelize.literal(`COUNT(*) >= ${count || 1}`),
                    raw: true
                });

                const qualifiedUserIds = checkinLogs.map(log => log.userId);

                if (qualifiedUserIds.length === 0) {
                    // 记录日志
                    await SystemLogService.createLog({
                        type: 'lottery_query',
                        content: '抽奖参与名单查询',
                        details: {
                            lotteryId,
                            reason: '无符合签到要求的用户',
                            conditions: lottery.conditions
                        }
                    });

                    return res.json({
                        code: 200,
                        message: '暂无符合签到要求的用户',
                        data: {
                            total: 0,
                            page,
                            pageSize,
                            totalPages: 0,
                            list: []
                        }
                    });
                }

                where.id = where.id
                    ? {[Op.and]: [where.id, {[Op.in]: qualifiedUserIds}]}
                    : {[Op.in]: qualifiedUserIds};
            }
        }

        // 处理排除条件
        if (lottery.excludeConditions) {
            const excludeConditions = [];

            // 注册时间范围
            if (lottery.excludeConditions.registerTime) {
                const {start, end} = lottery.excludeConditions.registerTime;
                if (start && end) {
                    excludeConditions.push({
                        register_time: {
                            [Op.between]: [new Date(start), new Date(end)]
                        }
                    });
                } else if (start) {
                    excludeConditions.push({
                        register_time: {
                            [Op.gte]: new Date(start)
                        }
                    });
                } else if (end) {
                    excludeConditions.push({
                        register_time: {
                            [Op.lte]: new Date(end)
                        }
                    });
                }
            }

            // 积分范围
            if (lottery.excludeConditions.integral) {
                const {min, max} = lottery.excludeConditions.integral;
                if (min !== undefined && max !== undefined) {
                    excludeConditions.push({
                        integral: {
                            [Op.between]: [min, max]
                        }
                    });
                } else if (min !== undefined) {
                    excludeConditions.push({
                        integral: {
                            [Op.gte]: min
                        }
                    });
                } else if (max !== undefined) {
                    excludeConditions.push({
                        integral: {
                            [Op.lte]: max
                        }
                    });
                }
            }

            // 会员状态
            if (lottery.excludeConditions.membershipStatus?.length > 0) {
                const statusConditions = [];
                lottery.excludeConditions.membershipStatus.forEach(status => {
                    switch (status) {
                        case 'active':
                            statusConditions.push({
                                vip_time: {
                                    [Op.gt]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'expired':
                            statusConditions.push({
                                vip_time: {
                                    [Op.lte]: currentTime,
                                    [Op.ne]: 999999999
                                }
                            });
                            break;
                        case 'permanent':
                            statusConditions.push({
                                vip_time: 999999999
                            });
                            break;
                    }
                });
                if (statusConditions.length > 0) {
                    excludeConditions.push({[Op.or]: statusConditions});
                }
            }

            // 排除指定用户
            if (lottery.excludeConditions.excludeUsers?.length > 0) {
                excludeConditions.push({
                    id: {[Op.in]: lottery.excludeConditions.excludeUsers}
                });
            }

            // 排除近期中奖用户
            if (lottery.excludeConditions.excludeWinners) {
                const previousWinners = await SystemLogService.findLogs({
                    type: 'lottery_reward',
                    startTime: dayjs().subtract(lottery.excludeConditions.excludeWinners, 'days').toDate()
                });

                const winnerIds = [...new Set(previousWinners.map(log => log.log_details.userId))];

                if (winnerIds.length > 0) {
                    excludeConditions.push({
                        id: {[Op.in]: winnerIds}
                    });
                }
            }

            // 合并所有排除条件
            if (excludeConditions.length > 0) {
                where[Op.not] = {[Op.or]: excludeConditions};
            }
        }

        // 查询符合条件的用户
        const {count, rows} = await User.findAndCountAll({
            where,
            attributes: [
                'id', 'name', 'account', 'avatar', 'register_time',
                'integral', 'vip_time', 'email'
            ],
            order: [['id', 'ASC']],
            limit: pageSize,
            offset: (page - 1) * pageSize
        });

        // 如果没有数据
        if (count === 0) {
            // 记录日志
            await SystemLogService.createLog({
                type: 'lottery_query',
                content: '抽奖参与名单查询',
                details: {
                    lotteryId,
                    reason: '无符合条件的用户',
                    conditions: lottery.conditions,
                    excludeConditions: lottery.excludeConditions
                }
            });

            return res.json({
                code: 200,
                message: '暂无符合条件的用户',
                data: {
                    total: 0,
                    page,
                    pageSize,
                    totalPages: 0,
                    list: []
                }
            });
        }

        // 格式化用户信息
        const participants = rows.map(user => ({
            id: user.id,
            name: user.name,
            account: user.account,
            avatar: user.avatar,
            registerTime: dayjs(user.register_time).format('YYYY-MM-DD HH:mm:ss'),
            integral: user.integral,
            membershipStatus: user.vip_time > currentTime ? 'active' :
                user.vip_time === 999999999 ? 'permanent' : 'expired',
            hasEmail: !!user.email
        }));

        // 记录查询日志
        await SystemLogService.createLog({
            type: 'lottery_query',
            content: '抽奖参与名单查询成功',
            details: {
                lotteryId,
                totalCount: count,
                page,
                pageSize
            }
        });

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
                list: participants
            }
        });

    } catch (error) {
        console.error('获取抽奖参与名单失败:', error);

        // 记录错误日志
        await SystemLogService.createLog({
            type: 'error',
            content: '获取抽奖参与名单失败',
            details: {
                lotteryId: req.params.lotteryId,
                error: error.message
            }
        });

        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

// 导出初始化函数
module.exports = {
    ...exports,
    initLotteryTasks
};

const axios = require('axios');
const FormData = require('form-data');
const NSFWService = require('../function/nsfwService');
const {LoginLog} = require("../models/loginLog");
const {Whitelist} = require("../models/whitelist");
const {logWhitelistOperation} = require("../utils/whitelistLogger");

/**
 * NSFW 图片检测
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
exports.checkNSFW = async (req, res) => {
    try {
        // 验证是否有文件上传
        if (!req.files || !req.files.file) {
            return res.status(400).json({
                status: 'error',
                message: '请选择要检测的图片'
            });
        }

        const file = req.files.file;

        // 使用 NSFWService 检测图片
        const result = await NSFWService.checkImage({
            file: file.data,
            fileName: file.name,
            mimeType: file.mimetype,
            fileSize: file.size,
            onProgress: (progress) => {
                console.log(`Upload Progress: ${progress}%`);
            }
        });

        if (!result.success) {
            return res.status(500).json({
                status: 'error',
                message: result.error
            });
        }

        return res.json({
            status: 'success',
            result: {
                nsfw: result.nsfw,
                normal: result.normal,
                isNSFW: result.isNSFW
            }
        });

    } catch (error) {
        console.error('NSFW检测失败:', error);
        return res.status(500).json({
            status: 'error',
            message: '图片检测失败，请稍后重试'
        });
    }
};

/**
 * 获取应用统计数据
 */
exports.getAppStats = async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
        const [{msg}] = err.errors;
        return res.json({
            code: 400,
            message: msg
        });
    }

    try {
        const appid = parseInt(req.params.appid || req.query.appid);
        if (!appid) {
            throw new Error("应用ID不能为空");
        }

        // 尝试从缓存获取统计数据
        const cacheKey = `app_stats:${appid}`;
        const cachedStats = await RedisService.get(cacheKey);
        if (cachedStats) {
            return res.json({
                code: 200,
                message: "获取统计数据成功",
                data: JSON.parse(cachedStats)
            });
        }

        // 并行执行多个统计查询
        const [
            userStats,
            cardStats,
            activityStats,
            regionStats,
            deviceStats,
            retentionStats
        ] = await Promise.all([
            getUserStats(appid),
            getCardStats(appid),
            getActivityStats(appid),
            getRegionStats(appid),
            getDeviceStats(appid),
            getRetentionStats(appid)
        ]);

        const stats = {
            userStats,
            cardStats,
            activityStats,
            regionStats,
            deviceStats,
            retentionStats,
            timestamp: new Date()
        };

        // 缓存统计结果(5分钟)
        await RedisService.set(cacheKey, JSON.stringify(stats));
        await RedisService.expire(cacheKey, 300);

        res.json({
            code: 200,
            message: "获取统计数据成功",
            data: stats
        });

    } catch (error) {
        res.json({
            code: 500,
            message: error.message
        });
    }
};

/**
 * 用户统计
 */
async function getUserStats(appid) {
    const now = dayjs();
    const periods = {
        today: now.startOf('day'),
        yesterday: now.subtract(1, 'day').startOf('day'),
        thisWeek: now.startOf('week'),
        thisMonth: now.startOf('month'),
        thisYear: now.startOf('year')
    };

    // 用户增长趋势
    const growthTrend = await User.findAll({
        where: {
            appid,
            register_time: {
                [Op.gte]: periods.thisMonth.toDate()
            }
        },
        attributes: [
            [sequelize.fn('DATE', sequelize.col('register_time')), 'date'],
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [sequelize.fn('DATE', sequelize.col('register_time'))],
        order: [[sequelize.fn('DATE', sequelize.col('register_time')), 'ASC']]
    });

    // 用户活跃度分析
    const activeUsers = await LoginLog.findAll({
        where: {
            appid,
            login_time: {
                [Op.gte]: periods.thisMonth.toDate()
            }
        },
        attributes: [
            'user_id',
            [sequelize.fn('COUNT', sequelize.col('id')), 'login_count']
        ],
        group: ['user_id'],
        having: sequelize.literal('COUNT(id) >= 1')
    });

    // 用户行为分析
    const userBehavior = await Log.findAll({
        where: {
            appid,
            created_at: {
                [Op.gte]: periods.thisMonth.toDate()
            }
        },
        attributes: [
            'type',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['type']
    });

    return {
        growthTrend,
        activeUsers: analyzeActiveUsers(activeUsers),
        behavior: analyzeBehavior(userBehavior)
    };
}

/**
 * 卡密统计
 */
async function getCardStats(appid) {
    const now = dayjs();

    // 卡密使用趋势
    const usageTrend = await Card.findAll({
        where: {
            appid,
            usedAt: {
                [Op.not]: null,
                [Op.gte]: now.subtract(30, 'days').toDate()
            }
        },
        attributes: [
            [sequelize.fn('DATE', sequelize.col('usedAt')), 'date'],
            'card_type',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [
            sequelize.fn('DATE', sequelize.col('usedAt')),
            'card_type'
        ],
        order: [[sequelize.fn('DATE', sequelize.col('usedAt')), 'ASC']]
    });

    // 卡密类型分布
    const typeDistribution = await Card.findAll({
        where: {appid},
        attributes: [
            'card_type',
            [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
            [
                sequelize.fn('SUM',
                    sequelize.literal('CASE WHEN usedAt IS NOT NULL THEN 1 ELSE 0 END')
                ),
                'used'
            ]
        ],
        group: ['card_type']
    });

    return {
        usageTrend,
        typeDistribution,
        analysis: analyzeCardStats(usageTrend, typeDistribution)
    };
}

/**
 * 活跃度统计
 */
async function getActivityStats(appid) {
    const now = dayjs();
    const timeRanges = {
        daily: now.subtract(1, 'day'),
        weekly: now.subtract(7, 'days'),
        monthly: now.subtract(30, 'days')
    };

    // 获取各时间段的活跃用户
    const activeUsers = {};
    for (const [range, time] of Object.entries(timeRanges)) {
        activeUsers[range] = await User.count({
            where: {
                appid,
                last_login_time: {
                    [Op.gte]: time.toDate()
                }
            }
        });
    }

    // 获取用户行为数据
    const behaviors = await Log.findAll({
        where: {
            appid,
            created_at: {
                [Op.gte]: timeRanges.monthly.toDate()
            }
        },
        attributes: [
            'type',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))), 'users']
        ],
        group: ['type']
    });

    return {
        activeUsers,
        behaviors,
        analysis: analyzeActivityStats(activeUsers, behaviors)
    };
}

/**
 * 分析活跃用户数据
 */
function analyzeActiveUsers(data) {
    const groups = {
        veryActive: 0,    // >20次登录
        active: 0,        // 10-20次登录
        regular: 0,       // 5-9次登录
        occasional: 0     // <5次登录
    };

    data.forEach(user => {
        const count = user.get('login_count');
        if (count > 20) groups.veryActive++;
        else if (count >= 10) groups.active++;
        else if (count >= 5) groups.regular++;
        else groups.occasional++;
    });

    return {
        groups,
        totalActive: data.length,
        engagementRate: calculateEngagementRate(groups)
    };
}

/**
 * 计算参与度
 */
function calculateEngagementRate(groups) {
    const total = Object.values(groups).reduce((sum, count) => sum + count, 0);
    if (total === 0) return 0;

    const weightedSum =
        groups.veryActive * 1.0 +
        groups.active * 0.7 +
        groups.regular * 0.4 +
        groups.occasional * 0.1;

    return (weightedSum / total).toFixed(2);
}

/**
 * 智能分析用户行为
 */
function analyzeBehavior(data) {
    const behaviorPatterns = {};
    let totalActions = 0;

    data.forEach(record => {
        const type = record.get('type');
        const count = record.get('count');
        totalActions += count;
        behaviorPatterns[type] = count;
    });

    // 计算行为占比和趋势
    const analysis = Object.entries(behaviorPatterns).map(([type, count]) => ({
        type,
        count,
        percentage: ((count / totalActions) * 100).toFixed(2),
        significance: calculateSignificance(count, totalActions)
    }));

    return {
        patterns: behaviorPatterns,
        analysis,
        recommendations: generateRecommendations(analysis)
    };
}

/**
 * 生成智能建议
 */
function generateRecommendations(analysis) {
    const recommendations = [];

    // 基于行为分析生成建议
    analysis.forEach(item => {
        if (item.significance === 'high') {
            recommendations.push({
                type: 'feature',
                priority: 'high',
                suggestion: `考虑优化 ${item.type} 相关功能，因为它占用户行为的 ${item.percentage}%`
            });
        }
        // 添加更多智能建议逻辑...
    });

    return recommendations;
}

/**
 * 计算行为重要性
 * @param {number} count 行为次数
 * @param {number} total 总行为次数
 * @returns {string} 重要性级别
 */
function calculateSignificance(count, total) {
    const percentage = (count / total) * 100;
    if (percentage >= 30) return 'high';
    if (percentage >= 10) return 'medium';
    return 'low';
}

/**
 * 分析卡密统计数据
 */
function analyzeCardStats(usageTrend, typeDistribution) {
    // 计算使用率趋势
    const trends = analyzeTrends(usageTrend);

    // 分析类型分布
    const distribution = analyzeDistribution(typeDistribution);

    // 生成建议
    const recommendations = generateCardRecommendations(trends, distribution);

    return {
        trends,
        distribution,
        recommendations
    };
}

/**
 * 分析趋势数据
 */
function analyzeTrends(data) {
    const trends = {
        overall: 'stable',
        growth: 0,
        peakDay: null,
        peakCount: 0
    };

    if (!data || data.length < 2) return trends;

    // 计算增长率
    const firstDay = data[0];
    const lastDay = data[data.length - 1];
    const daysDiff = dayjs(lastDay.date).diff(dayjs(firstDay.date), 'days') || 1;
    const countDiff = lastDay.count - firstDay.count;
    trends.growth = (countDiff / daysDiff).toFixed(2);

    // 确定趋势方向
    if (trends.growth > 0.1) trends.overall = 'increasing';
    else if (trends.growth < -0.1) trends.overall = 'decreasing';

    // 找出峰值
    data.forEach(day => {
        if (day.count > trends.peakCount) {
            trends.peakCount = day.count;
            trends.peakDay = day.date;
        }
    });

    return trends;
}

/**
 * 分析分布数据
 */
function analyzeDistribution(data) {
    const distribution = {
        mostPopular: null,
        leastPopular: null,
        efficiency: {}
    };

    if (!data || !data.length) return distribution;

    let maxTotal = 0;
    let minTotal = Infinity;

    data.forEach(type => {
        const total = type.get('total');
        const used = type.get('used');
        const efficiency = ((used / total) * 100).toFixed(2);

        distribution.efficiency[type.card_type] = {
            total,
            used,
            efficiency
        };

        if (total > maxTotal) {
            maxTotal = total;
            distribution.mostPopular = type.card_type;
        }
        if (total < minTotal) {
            minTotal = total;
            distribution.leastPopular = type.card_type;
        }
    });

    return distribution;
}

/**
 * 生成卡密相关建议
 */
function generateCardRecommendations(trends, distribution) {
    const recommendations = [];

    // 基于趋势的建议
    if (trends.overall === 'decreasing') {
        recommendations.push({
            type: 'trend',
            priority: 'high',
            suggestion: '卡密使用率呈下降趋势，建议检查卡密价格或促销策略'
        });
    }

    // 基于分布的建议
    if (distribution.mostPopular) {
        const efficiency = distribution.efficiency[distribution.mostPopular];
        if (efficiency && efficiency.efficiency < 50) {
            recommendations.push({
                type: 'distribution',
                priority: 'medium',
                suggestion: `最受欢迎的卡密类型 ${distribution.mostPopular} 使用率较低，建议优化库存管理`
            });
        }
    }

    // 基于效率的建议
    Object.entries(distribution.efficiency).forEach(([type, data]) => {
        if (data.efficiency < 30) {
            recommendations.push({
                type: 'efficiency',
                priority: 'medium',
                suggestion: `${type} 类型卡密使用率过低(${data.efficiency}%)，建议调整策略或下调库存`
            });
        }
    });

    return recommendations;
}

/**
 * 分析活跃度统计
 */
function analyzeActivityStats(activeUsers, behaviors) {
    const analysis = {
        trends: analyzeActivityTrends(activeUsers),
        patterns: analyzeActivityPatterns(behaviors),
        recommendations: []
    };

    // 生成建议
    if (analysis.trends.retention < 0.3) {
        analysis.recommendations.push({
            type: 'retention',
            priority: 'high',
            suggestion: '用户留存率较低，建议加强用户激励机制'
        });
    }

    if (analysis.patterns.diversityIndex < 0.5) {
        analysis.recommendations.push({
            type: 'engagement',
            priority: 'medium',
            suggestion: '用户行为过于单一，建议丰富功能和内容'
        });
    }

    return analysis;
}

/**
 * 分析活跃度趋势
 */
function analyzeActivityTrends(activeUsers) {
    const trends = {
        retention: 0,
        growth: 0,
        weeklyChange: 0
    };

    if (activeUsers.monthly > 0) {
        trends.retention = (activeUsers.daily / activeUsers.monthly).toFixed(2);
        trends.weeklyChange = ((activeUsers.weekly - activeUsers.daily) / activeUsers.daily).toFixed(2);
    }

    return trends;
}

/**
 * 分析活动模式
 */
function analyzeActivityPatterns(behaviors) {
    const patterns = {
        totalActions: 0,
        uniqueUsers: 0,
        diversityIndex: 0,
        peakType: null
    };

    if (!behaviors || !behaviors.length) return patterns;

    let maxCount = 0;
    let typeCount = 0;
    let totalCount = 0;

    behaviors.forEach(behavior => {
        const count = behavior.get('count');
        const users = behavior.get('users');
        totalCount += count;
        typeCount++;

        if (count > maxCount) {
            maxCount = count;
            patterns.peakType = behavior.get('type');
        }

        patterns.uniqueUsers = Math.max(patterns.uniqueUsers, users);
    });

    patterns.totalActions = totalCount;
    patterns.diversityIndex = typeCount > 0 ? (1 - (maxCount / totalCount)).toFixed(2) : 0;

    return patterns;
}

/**
 * 获取地域分布统计
 */
async function getRegionStats(appid) {
    const now = dayjs();
    const startDate = now.subtract(30, 'days').toDate();

    // 用户地域分布
    const regionDistribution = await User.findAll({
        where: {
            appid,
            register_time: {[Op.gte]: startDate}
        },
        attributes: [
            'register_province',
            'register_city',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['register_province', 'register_city']
    });

    // 活跃用户地域分布
    const activeRegions = await LoginLog.findAll({
        where: {
            appid,
            login_time: {[Op.gte]: startDate}
        },
        attributes: [
            'login_province',
            'login_city',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))), 'users']
        ],
        group: ['login_province', 'login_city']
    });

    return {
        distribution: analyzeRegionDistribution(regionDistribution),
        activeRegions: analyzeActiveRegions(activeRegions),
        recommendations: generateRegionRecommendations(regionDistribution, activeRegions)
    };
}

/**
 * 获取设备统计
 */
async function getDeviceStats(appid) {
    const now = dayjs();
    const startDate = now.subtract(30, 'days').toDate();

    // 设备类型分布
    const deviceTypes = await LoginLog.findAll({
        where: {
            appid,
            login_time: {[Op.gte]: startDate}
        },
        attributes: [
            'device_type',
            'device_brand',
            'device_model',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))), 'users']
        ],
        group: ['device_type', 'device_brand', 'device_model']
    });

    // 系统版本分布
    const osVersions = await LoginLog.findAll({
        where: {
            appid,
            login_time: {[Op.gte]: startDate}
        },
        attributes: [
            'os_version',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('user_id'))), 'users']
        ],
        group: ['os_version']
    });

    return {
        devices: analyzeDeviceTypes(deviceTypes),
        systems: analyzeOSVersions(osVersions),
        recommendations: generateDeviceRecommendations(deviceTypes, osVersions)
    };
}

/**
 * 获取留存率统计
 */
async function getRetentionStats(appid) {
    const now = dayjs();
    const periods = {
        daily: {
            start: now.subtract(1, 'day').startOf('day'),
            end: now.subtract(1, 'day').endOf('day')
        },
        weekly: {
            start: now.subtract(7, 'days').startOf('day'),
            end: now.subtract(7, 'days').endOf('day')
        },
        monthly: {
            start: now.subtract(30, 'days').startOf('day'),
            end: now.subtract(30, 'days').endOf('day')
        }
    };

    const retentionData = {};

    // 计算各时间段的留存率
    for (const [period, dates] of Object.entries(periods)) {
        // 获取注册用户
        const newUsers = await User.findAll({
            where: {
                appid,
                register_time: {
                    [Op.between]: [dates.start.toDate(), dates.end.toDate()]
                }
            },
            attributes: ['id']
        });

        const userIds = newUsers.map(user => user.id);

        if (userIds.length === 0) {
            retentionData[period] = {
                total: 0,
                retained: 0,
                rate: 0
            };
            continue;
        }

        // 计算留存用户
        const retainedUsers = await LoginLog.count({
            where: {
                appid,
                user_id: {[Op.in]: userIds},
                login_time: {[Op.gt]: dates.end.toDate()}
            },
            distinct: true,
            col: 'user_id'
        });

        retentionData[period] = {
            total: userIds.length,
            retained: retainedUsers,
            rate: ((retainedUsers / userIds.length) * 100).toFixed(2)
        };
    }

    return {
        retention: retentionData,
        analysis: analyzeRetention(retentionData),
        recommendations: generateRetentionRecommendations(retentionData)
    };
}

/**
 * 分析地域分布
 */
function analyzeRegionDistribution(data) {
    const regions = {};
    let totalUsers = 0;

    data.forEach(record => {
        const province = record.get('register_province') || '未知';
        const city = record.get('register_city') || '未知';
        const count = record.get('count');
        totalUsers += count;

        if (!regions[province]) {
            regions[province] = {
                total: 0,
                cities: {}
            };
        }

        regions[province].total += count;
        regions[province].cities[city] = count;
    });

    // 计算占比
    Object.keys(regions).forEach(province => {
        regions[province].percentage = ((regions[province].total / totalUsers) * 100).toFixed(2);
        Object.keys(regions[province].cities).forEach(city => {
            const cityCount = regions[province].cities[city];
            regions[province].cities[city] = {
                count: cityCount,
                percentage: ((cityCount / regions[province].total) * 100).toFixed(2)
            };
        });
    });

    return {
        regions,
        totalUsers,
        topProvinces: getTopRegions(regions, 5)
    };
}

/**
 * 获取排名靠前的地区
 */
function getTopRegions(regions, limit) {
    return Object.entries(regions)
        .map(([name, data]) => ({
            name,
            count: data.total,
            percentage: data.percentage
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * 生成地域相关建议
 */
function generateRegionRecommendations(distribution, activeRegions) {
    const recommendations = [];

    // 分析地域覆盖
    const coverage = analyzeCoverage(distribution);
    if (coverage.concentration > 0.7) {
        recommendations.push({
            type: 'coverage',
            priority: 'high',
            suggestion: `用户过于集中在${coverage.mainRegions.join('、')}等地区，建议扩大其他地区的市场推广`
        });
    }

    // 分析活跃度差异
    const activityGap = analyzeActivityGap(activeRegions);
    if (activityGap.significant) {
        recommendations.push({
            type: 'activity',
            priority: 'medium',
            suggestion: `${activityGap.lowActivityRegions.join('、')}等地区的用户活跃度较低，建议针对性优化`
        });
    }

    return recommendations;
}

/**
 * 生成留存率相关建议
 */
function generateRetentionRecommendations(retentionData) {
    const recommendations = [];
    const thresholds = {
        daily: 50,
        weekly: 30,
        monthly: 20
    };

    Object.entries(retentionData).forEach(([period, data]) => {
        const threshold = thresholds[period];
        if (data.rate < threshold) {
            recommendations.push({
                type: 'retention',
                priority: data.rate < threshold / 2 ? 'high' : 'medium',
                suggestion: `${period}留存率(${data.rate}%)低于行业平均水平(${threshold}%)，建议：
                    1. 优化新用户引导
                    2. 增加用户激励机制
                    3. 提升产品核心价值`
            });
        }
    });

    return recommendations;
}

/**
 * 获取地区签到排行榜
 */
exports.getRegionDailyRank = async (req, res) => {
    try {
        const {appid} = req.body;
        if (!appid) {
            return res.json({
                code: 400,
                message: '应用ID不能为空'
            });
        }

        // 获取所有用户及其签到记录
        const users = await User.findAll({
            where: {appid},
            attributes: [
                'id', 'name', 'avatar', 'register_province', 'register_city',
                [Sequelize.fn('COUNT', Sequelize.col('Dailies.id')), 'dailyCount']
            ],
            include: [{
                model: Daily,
                attributes: [],
                required: true
            }],
            group: ['User.id', 'User.name', 'User.avatar', 'User.register_province', 'User.register_city'],
            having: Sequelize.literal('COUNT(Dailies.id) > 0'),
            raw: true
        });

        // 标准化地区名称并按地区分组
        const regionGroups = new Map();
        users.forEach(user => {
            // 标准化省份名称
            const province = normalizeRegion(user.register_province);
            if (!province) return;

            // 获取或创建省份分组
            if (!regionGroups.has(province)) {
                regionGroups.set(province, []);
            }

            // 添加用户到对应省份组
            regionGroups.get(province).push({
                id: user.id,
                name: user.name,
                avatar: user.avatar,
                dailyCount: parseInt(user.dailyCount),
                city: normalizeRegion(user.register_city)
            });
        });

        // 处理每个地区的排行榜
        const rankings = Array.from(regionGroups.entries()).map(([region, users]) => {
            // 按签到次数排序，取前10名
            const topUsers = users
                .sort((a, b) => b.dailyCount - a.dailyCount)
                .slice(0, 10);

            // 计算地区总签到次数
            const totalDailyCount = users.reduce((sum, user) => sum + user.dailyCount, 0);

            // 按城市分组统计
            const cityStats = new Map();
            users.forEach(user => {
                if (!user.city) return;
                const city = cityStats.get(user.city) || {count: 0, users: 0};
                city.count += user.dailyCount;
                city.users += 1;
                cityStats.set(user.city, city);
            });

            return {
                region,
                stats: {
                    totalUsers: users.length,
                    totalDailyCount,
                    averageDailyCount: Math.round(totalDailyCount / users.length),
                    cities: Array.from(cityStats.entries())
                        .map(([city, stats]) => ({
                            city,
                            dailyCount: stats.count,
                            userCount: stats.users,
                            average: Math.round(stats.count / stats.users)
                        }))
                        .sort((a, b) => b.dailyCount - a.dailyCount)
                },
                topUsers: topUsers.map((user, index) => ({
                    rank: index + 1,
                    id: user.id,
                    name: user.name,
                    avatar: user.avatar,
                    dailyCount: user.dailyCount,
                    city: user.city
                }))
            };
        });

        // 按地区总签到次数排序
        rankings.sort((a, b) =>
            b.stats.totalDailyCount - a.stats.totalDailyCount
        );

        return res.json({
            code: 200,
            message: '获取成功',
            data: {
                rankings,
                summary: {
                    totalRegions: rankings.length,
                    totalUsers: rankings.reduce((sum, r) => sum + r.stats.totalUsers, 0),
                    totalDailyCount: rankings.reduce((sum, r) => sum + r.stats.totalDailyCount, 0)
                },
                updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
            }
        });

    } catch (error) {
        console.error('获取地区签到排行榜失败:', error);
        return res.status(500).json({
            code: 500,
            message: '获取排行榜失败',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};