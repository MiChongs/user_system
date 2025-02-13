const schedule = require('node-schedule');
const { User } = require('../models/user');
const { Daily } = require('../models/daily');
const { Op } = require('sequelize');
const dayjs = require('./dayjs');
const SystemLogService = require('./systemLogService');
const { mysql } = require('../database');
const {App} = require("../models/app");
const {Log} = require("../models/log");
const {Token} = require("../models/token");
const RedisService = require("./redisService");

class AutoCheckTokenService {
    constructor() {
        this.job = null;
    }

    /**
     * 启动检查过期Token服务
     */
    start() {
        // 每天凌晨0点执行
        this.job = schedule.scheduleJob('0 0 * * *', async () => {
            try {
                await this.checkToken();
            } catch (error) {
                console.error('检查过期Token失败:', error);
                await SystemLogService.error('检查过期Token失败', {
                    error: error.message,
                    stack: error.stack
                });
            }
        });

        console.log('检查过期Token服务已启动');
    }

    /**
     * 检查过期Token
     */
    async checkToken() {
        const transaction = await mysql.transaction();

        try {
            // 查找所有永久会员
            const tokens = await Token.findAll({
                where: {
                    expireTime: {
                        [Op.lt]: dayjs().toDate()
                    }
                },
                transaction
            })

            const today = dayjs().format('YYYY-MM-DD');
            let successCount = 0;
            let failCount = 0;

            for (const token of tokens) {
                try {
                    if (await RedisService.get(token.token)) {
                        await RedisService.del(token.token);
                    }

                    await token.destroy({ transaction });

                    successCount++;
                } catch (error) {
                    console.error(`Token ${token.token} 清理失败`, error);
                    failCount++;
                }
            }

            await transaction.commit();

            // 记录日志
            await SystemLogService.info('过期Token清理完成', {
                total: tokens.length,
                success: successCount,
                fail: failCount,
                date: today
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * 停止自动签到服务
     */
    stop() {
        if (this.job) {
            this.job.cancel();
            this.job = null;
            console.log('检查过期Token服务停止');
        }
    }
}

// 创建单例实例
const autoCheckTokenService = new AutoCheckTokenService();

module.exports = autoCheckTokenService;