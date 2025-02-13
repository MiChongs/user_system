const { Op, Sequelize } = require('sequelize');
const { validationResult } = require('express-validator');
const dayjs = require('../function/dayjs');
const { Lottery } = require('../models/lottery');
const SystemLogService = require('../function/systemLogService');
const { User } = require("../models/user");
const { Daily } = require("../models/daily");
const { getIpLocation } = require('../function/ipLocation');

/**
 * 获取抽奖列表
 */
exports.getLotteryList = async (req, res) => {
    try {
        // 验证请求参数
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                code: 400,
                message: '参数错误',
                errors: errors.array()
            });
        }

        const appid = parseInt(req.query.appid);
        const { status } = req.query;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;

        if (!appid) {
            return res.status(400).json({
                code: 400,
                message: '无效的应用ID'
            });
        }

        // 构建查询条件
        const where = { appid };
        if (status) {
            where.status = status;
        }

        // 查询抽奖列表
        const { count, rows } = await Lottery.findAndCountAll({
            where,
            attributes: [
                'lotteryId', 'name', 'status', 'drawTime',
                'rewardType', 'rewardAmount', 'rewardUnit',
                'participantsCount'
            ],
            order: [['drawTime', 'DESC']],
            limit: pageSize,
            offset: (page - 1) * pageSize
        });

        // 格式化列表数据
        const list = rows.map(lottery => ({
            lotteryId: lottery.lotteryId,
            name: lottery.name,
            status: lottery.status,
            drawTime: dayjs(lottery.drawTime).format('YYYY-MM-DD HH:mm:ss'),
            rewardInfo: {
                type: lottery.rewardType,
                amount: lottery.rewardAmount,
                unit: lottery.rewardUnit
            },
            participantsCount: lottery.participantsCount || 0
        }));

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
                list
            }
        });

    } catch (error) {
        console.error('获取抽奖列表失败:', error);
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 获取抽奖详情
 */
exports.getLotteryDetail = async (req, res) => {
    try {
        // 验证请求参数
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                code: 400,
                message: '参数错误',
                errors: errors.array()
            });
        }

        const { lotteryId } = req.params;
        const appid = parseInt(req.query.appid);

        if (!appid) {
            return res.status(400).json({
                code: 400,
                message: '无效的应用ID'
            });
        }

        console.log("Appid 应用id" + appid)

        // 查询抽奖详情
        const lottery = await Lottery.findOne({
            where: { 
                lotteryId,
                appid
            },
            attributes: [
                'lotteryId', 'name', 'status', 'drawTime',
                'rewardType', 'rewardAmount', 'rewardUnit',
                'conditions', 'excludeConditions','appid'
            ]
        });

        if (!lottery) {
            return res.status(404).json({
                code: 404,
                message: '抽奖任务不存在'
            });
        }

        // 构建用户查询条件
        const where = { 
            appid: lottery.appid, 
            enabled: true 
        };
        const currentTime = dayjs().unix();

        // 处理参与条件
        if (lottery.conditions) {
            // 注册时间条件
            if (lottery.conditions.registerTime) {
                const { start, end } = lottery.conditions.registerTime;
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
                const { min, max } = lottery.conditions.integral;
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
                    where[Op.and] = where[Op.and] || [];
                    where[Op.and].push({ [Op.or]: statusConditions });
                }
            }
        }

        // 处理排除条件
        if (lottery.excludeConditions) {
            const excludeConditions = [];

            // 注册时间范围
            if (lottery.excludeConditions.registerTime) {
                const { start, end } = lottery.excludeConditions.registerTime;
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
                const { min, max } = lottery.excludeConditions.integral;
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
                    excludeConditions.push({ [Op.or]: statusConditions });
                }
            }

            // 排除指定用户
            if (lottery.excludeConditions.excludeUsers?.length > 0) {
                excludeConditions.push({
                    id: { [Op.in]: lottery.excludeConditions.excludeUsers }
                });
            }

            // 排除近期中奖用户
            if (lottery.excludeConditions.excludeWinners) {
                const previousWinners = await SystemLogService.findAll({
                    where: {
                        log_type: 'lottery_reward',
                        log_time: {
                            [Op.gte]: dayjs().subtract(lottery.excludeConditions.excludeWinners, 'days').toDate()
                        }
                    },
                    raw: true
                });
                
                const winnerIds = [...new Set(previousWinners.map(log => {
                    try {
                        const details = typeof log.log_details === 'string' ? JSON.parse(log.log_details) : log.log_details;
                        return details.userId;
                    } catch (e) {
                        console.error('解析日志详情失败:', e);
                        return null;
                    }
                }).filter(id => id !== null))];
                
                if (winnerIds.length > 0) {
                    excludeConditions.push({
                        id: { [Op.in]: winnerIds }
                    });
                }
            }

            // 合并所有排除条件
            if (excludeConditions.length > 0) {
                where[Op.not] = { [Op.or]: excludeConditions };
            }
        }

        // 计算满足条件的用户数
        let participantsCount = await User.count({ where });

        // 如果有签到要求，需要额外处理
        if (lottery.conditions?.checkinDays) {
            const { count, startDate, endDate } = lottery.conditions.checkinDays;
            
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
                    ? { [Op.and]: [where.id, { [Op.in]: qualifiedUserIds }] }
                    : { [Op.in]: qualifiedUserIds };
                
                participantsCount = await User.count({ where });
            } else {
                participantsCount = 0;
            }
        }

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                lotteryId: lottery.lotteryId,
                name: lottery.name,
                status: lottery.status,
                drawTime: dayjs(lottery.drawTime).format('YYYY-MM-DD HH:mm:ss'),
                rewardInfo: {
                    type: lottery.rewardType,
                    amount: lottery.rewardAmount,
                    unit: lottery.rewardUnit
                },
                participantsCount,
                conditions: lottery.conditions,
                excludeConditions: lottery.excludeConditions
            }
        });

    } catch (error) {
        console.error('获取抽奖详情失败:', error);
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 获取中奖名单
 */
exports.getLotteryWinners = async (req, res) => {
    try {
        // 验证请求参数
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                code: 400,
                message: '参数错误',
                errors: errors.array()
            });
        }

        const { lotteryId } = req.params;
        const appid = parseInt(req.query.appid);

        if (!appid) {
            return res.status(400).json({
                code: 400,
                message: '无效的应用ID'
            });
        }

        // 查询抽奖信息
        const lottery = await Lottery.findOne({
            where: { 
                lotteryId,
                appid,
                status: 'completed'
            },
            attributes: [
                'lotteryId', 'name', 'drawTime',
                'rewardType', 'rewardAmount', 'rewardUnit',
                'winners'
            ]
        });

        if (!lottery) {
            return res.status(404).json({
                code: 404,
                message: '未找到已完成的抽奖结果'
            });
        }

        // 格式化中奖名单
        const winners = lottery.winners.map(winner => ({
            name: winner.name || winner.account,
            avatar: winner.avatar,
            reward: {
                type: winner.reward.type,
                amount: winner.reward.amount,
                unit: winner.reward.unit
            }
        }));

        // 计算统计信息
        const totalRewardAmount = lottery.winners.reduce((sum, winner) => 
            sum + winner.reward.amount, 0);

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                lotteryId: lottery.lotteryId,
                name: lottery.name,
                drawTime: dayjs(lottery.drawTime).format('YYYY-MM-DD HH:mm:ss'),
                completedAt: dayjs(lottery.completedAt).format('YYYY-MM-DD HH:mm:ss'),
                rewardInfo: {
                    type: lottery.rewardType,
                    amount: lottery.rewardAmount,
                    unit: lottery.rewardUnit
                },
                winners,
                statistics: {
                    totalParticipants: lottery.participantsCount || 0,
                    totalWinners: lottery.winners.length,
                    totalRewardAmount
                }
            }
        });

    } catch (error) {
        console.error('获取中奖名单失败:', error);
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 获取满足抽奖条件的用户列表
 */
exports.getLotteryParticipants = async (req, res) => {
    try {
        // 验证请求参数
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                code: 400,
                message: '参数错误',
                errors: errors.array()
            });
        }

        const { lotteryId } = req.params;
        const appid = parseInt(req.query.appid);
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;

        if (!appid) {
            return res.status(400).json({
                code: 400,
                message: '无效的应用ID'
            });
        }

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
                const { start, end } = lottery.conditions.registerTime;
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
                const { min, max } = lottery.conditions.integral;
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
                    where[Op.and] = where[Op.and] || [];
                    where[Op.and].push({ [Op.or]: statusConditions });
                }
            }

            // 签到要求
            if (lottery.conditions.checkinDays) {
                const { count, startDate, endDate } = lottery.conditions.checkinDays;
                
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
                    ? { [Op.and]: [where.id, { [Op.in]: qualifiedUserIds }] }
                    : { [Op.in]: qualifiedUserIds };
            }
        }

        // 处理排除条件
        if (lottery.excludeConditions) {
            const excludeConditions = [];

            // 注册时间范围
            if (lottery.excludeConditions.registerTime) {
                const { start, end } = lottery.excludeConditions.registerTime;
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
                const { min, max } = lottery.excludeConditions.integral;
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
                    excludeConditions.push({ [Op.or]: statusConditions });
                }
            }

            // 排除指定用户
            if (lottery.excludeConditions.excludeUsers?.length > 0) {
                excludeConditions.push({
                    id: { [Op.in]: lottery.excludeConditions.excludeUsers }
                });
            }

            // 排除近期中奖用户
            if (lottery.excludeConditions.excludeWinners) {
                const previousWinners = await SystemLogService.findAll({
                    where: {
                        log_type: 'lottery_reward',
                        log_time: {
                            [Op.gte]: dayjs().subtract(lottery.excludeConditions.excludeWinners, 'days').toDate()
                        }
                    },
                    raw: true
                });
                
                const winnerIds = [...new Set(previousWinners.map(log => {
                    try {
                        const details = typeof log.log_details === 'string' ? JSON.parse(log.log_details) : log.log_details;
                        return details.userId;
                    } catch (e) {
                        console.error('解析日志详情失败:', e);
                        return null;
                    }
                }).filter(id => id !== null))];
                
                if (winnerIds.length > 0) {
                    excludeConditions.push({
                        id: { [Op.in]: winnerIds }
                    });
                }
            }

            // 合并所有排除条件
            if (excludeConditions.length > 0) {
                where[Op.not] = { [Op.or]: excludeConditions };
            }
        }

        // 查询符合条件的用户
        const { count, rows } = await User.findAndCountAll({
            where,
            attributes: [
                'id', 'name', 'account', 'avatar', 'register_time', 
                'integral', 'vip_time'
            ],
            order: [['id', 'ASC']],
            limit: pageSize,
            offset: (page - 1) * pageSize
        });

        // 格式化用户信息
        const participants = rows.map(user => ({
            name: user.name || user.account,
            avatar: user.avatar,
            registerTime: dayjs(user.register_time).format('YYYY-MM-DD HH:mm:ss'),
            integral: user.integral,
            membershipStatus: user.vip_time > currentTime ? 'active' : 
                            user.vip_time === 999999999 ? 'permanent' : 'expired'
        }));

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
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
};

/**
 * 获取封禁用户列表
 */

exports.getUserBanList = async (req, res) => {
    try {
        const { appid } = req.query;
        const { page, pageSize } = req.query;

        const users = await User.findAndCountAll({
            where: { appid, [Op.or]: [{ enabled: false }, { disabledEndTime: { [Op.lte]: dayjs().toDate() } }] },
            attributes: ['id', 'account', 'name', 'avatar', 'integral', 'vip_time', 'enabled','disabledEndTime','reason'],
            order: [['id', 'DESC']],
            limit: parseInt(pageSize),
            offset: (parseInt(page) - 1) * parseInt(pageSize)
        });

        return res.json({
            code: 200,
            message: '查询成功',
            data: {
                total: users.count,
                page,
                pageSize,
                totalPages: Math.ceil(users.count / pageSize),
                list: users.rows
            }
        });

    } catch (error) {
        console.error('获取封禁用户列表失败:', error);
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
}

exports.getUserIPInfo = async (req, res) => {
    try {
        const ip = req.query.ip || req.clientIp || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const ipInfo = await getIpLocation(ip);

        return res.json({
            code: 200,
            message: '查询成功',
            data: ipInfo
        });

    } catch (error) {
        console.error('获取IP信息失败:', error);
        return res.status(500).json({
            code: 500,
            message: '查询失败',
            error: error.message
        });
    }
}