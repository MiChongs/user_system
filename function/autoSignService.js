const schedule = require('node-schedule');
const { User } = require('../models/user');
const { Daily } = require('../models/daily');
const { Op } = require('sequelize');
const dayjs = require('./dayjs');
const SystemLogService = require('./systemLogService');
const { mysql } = require('../database');
const {App} = require("../models/app");
const {Log} = require("../models/log");

class AutoSignService {
    constructor() {
        this.job = null;
    }

    /**
     * 启动自动签到服务
     */
    start() {
        // 每天凌晨0点执行
        this.job = schedule.scheduleJob('0 0 * * *', async () => {
            try {
                await this.signForPermanentMembers();
            } catch (error) {
                console.error('永久会员自动签到失败:', error);
                await SystemLogService.error('永久会员自动签到失败', {
                    error: error.message,
                    stack: error.stack
                });
            }
        });

        console.log('永久会员自动签到服务已启动');
    }

    /**
     * 为永久会员执行签到
     */
    async signForPermanentMembers() {
        const transaction = await mysql.transaction();

        try {
            // 查找所有永久会员
            const permanentMembers = await User.findAll({
                where: {
                    vip_time: 999999999, // 永久会员标识
                    enabled: true // 账号正常
                }
            });

            const today = dayjs().format('YYYY-MM-DD');
            let successCount = 0;
            let failCount = 0;

            for (const member of permanentMembers) {
                try {
                    // 检查今天是否已签到
                    const app = await App.findOne({
                        where: {
                            id: member.appid
                        }
                    });

                    const existingSign = await Daily.findOne({
                        where: {
                            userId: member.id,
                            appid: member.appid,
                            date: {
                                [Op.gte]: dayjs(today).startOf('day').toDate(),
                                [Op.lt]: dayjs(today).endOf('day').toDate()
                            }
                        },
                        transaction
                    });

                    if (!existingSign) {
                        // 执行签到

                        
                        let userConfig = {};
                        
                        if (app.daily_award === "integral") {
                            userConfig.integral = member.integral + app.daily_award_num;
                        } else {
                            userConfig.vip_time = dayjs(member.vip_time)
                                .add(app.daily_award_num, "m")
                                .toDate();
                        }

                        await member.update(userConfig);


                        const daily = await Daily.create({
                            userId: member.id,
                            date: dayjs().toDate(),
                            integral: app.daily_award_num,
                            appid: member.appid,
                        });

                        // 创建日志记录
                        const log = await Log.create({
                            log_user_id: member.account,
                            appid: member.appid,
                            log_type: "daily",
                            log_ip: member.register_ip,
                            open_qq: member.open_qq,
                            open_wechat: member.open_wechat,
                            log_content: global.logString(
                                "daily",
                                member.register_ip,
                                member.markcode,
                                dayjs().format("YYYY-MM-DD HH:mm:ss")
                            ),
                            UserId: member.id,
                        });

                        successCount++;
                    }
                } catch (error) {
                    console.error(`用户 ${member.id} 自动签到失败:`, error);
                    failCount++;
                }
            }

            await transaction.commit();

            // 记录日志
            await SystemLogService.info('永久会员自动签到完成', {
                total: permanentMembers.length,
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
            console.log('永久会员自动签到服务已停止');
        }
    }
}

// 创建单例实例
const autoSignService = new AutoSignService();

module.exports = autoSignService; 