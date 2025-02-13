const dayjs = require('./dayjs');
const { User } = require('../models/user');
const { Token } = require('../models/token');
const { Log } = require('../models/log');
const RedisService = require('./redisService');

// 配置参数
const CLEANUP_CONFIG = {
    HEARTBEAT_INTERVAL: 30000,  // 心跳检查间隔：30秒
    HEARTBEAT_TIMEOUT: 60000,   // 心跳超时时间：60秒
    INACTIVE_USER_TIMEOUT: 1800000, // 不活跃用户超时：30分钟
    TOKEN_CLEANUP_INTERVAL: 3600000, // Token清理间隔：1小时
    BATCH_SIZE: 100 // 批量处理数量
};

/**
 * 用户清理服务类
 */
class UserCleanupService {
    constructor() {
        this.cleanupTasks = new Set();
        this.isRunning = false;
    }

    /**
     * 启动清理服务
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // 启动心跳检查
        this.cleanupTasks.add(
            setInterval(() => this.cleanInactiveUsers(), CLEANUP_CONFIG.HEARTBEAT_INTERVAL)
        );

        // 启动过期Token清理
        this.cleanupTasks.add(
            setInterval(() => this.cleanExpiredTokens(), CLEANUP_CONFIG.TOKEN_CLEANUP_INTERVAL)
        );

        console.log('User cleanup service started');
    }

    /**
     * 停止清理服务
     */
    stop() {
        this.cleanupTasks.forEach(taskId => clearInterval(taskId));
        this.cleanupTasks.clear();
        this.isRunning = false;
        console.log('User cleanup service stopped');
    }

    /**
     * 清理不活跃用户
     */
    async cleanInactiveUsers() {
        try {
            const now = Date.now();
            const inactiveTimeout = now - CLEANUP_CONFIG.INACTIVE_USER_TIMEOUT;

            // 获取所有在线用户
            const onlineUsers = global.onlineUsers || new Map();
            const inactiveUsers = new Set();

            // 检查不活跃用户
            for (const [userId, data] of onlineUsers.entries()) {
                if (data.lastActive < inactiveTimeout) {
                    inactiveUsers.add(userId);
                    onlineUsers.delete(userId);
                }
            }

            // 记录清理日志
            if (inactiveUsers.size > 0) {
                await Log.bulkCreate(Array.from(inactiveUsers).map(userId => ({
                    log_type: 'user_cleanup',
                    log_content: '用户因不活跃被清理',
                    log_time: dayjs().toDate(),
                    log_user_id: userId,
                    log_status: 'success'
                })));

                console.log(`Cleaned up ${inactiveUsers.size} inactive users`);
            }

            // 清理相关缓存
            await this.cleanUserCache(Array.from(inactiveUsers));

        } catch (error) {
            console.error('Error cleaning inactive users:', error);
        }
    }

    /**
     * 清理过期的Token
     */
    async cleanExpiredTokens() {
        try {
            const now = dayjs().toDate();
            let offset = 0;
            let deletedCount = 0;

            while (true) {
                // 批量获取过期token
                const expiredTokens = await Token.findAll({
                    where: {
                        expires: { [Op.lt]: now }
                    },
                    limit: CLEANUP_CONFIG.BATCH_SIZE,
                    offset,
                    attributes: ['id', 'account', 'appid', 'token']
                });

                if (expiredTokens.length === 0) break;

                // 删除token记录
                await Token.destroy({
                    where: {
                        id: expiredTokens.map(t => t.id)
                    }
                });

                // 清理Redis缓存
                await Promise.all(
                    expiredTokens.map(token => 
                        RedisService.del(`token:${token.token}`)
                    )
                );

                deletedCount += expiredTokens.length;
                offset += CLEANUP_CONFIG.BATCH_SIZE;
            }

            if (deletedCount > 0) {
                console.log(`Cleaned up ${deletedCount} expired tokens`);
            }

        } catch (error) {
            console.error('Error cleaning expired tokens:', error);
        }
    }

    /**
     * 清理用户相关缓存
     * @param {string[]} userIds 用户ID列表
     */
    async cleanUserCache(userIds) {
        try {
            const promises = userIds.map(userId => 
                Promise.all([
                    RedisService.del(`user:${userId}`),
                    RedisService.del(`user_details:${userId}`),
                    RedisService.del(`user_stats:${userId}`)
                ])
            );

            await Promise.all(promises);
        } catch (error) {
            console.error('Error cleaning user cache:', error);
        }
    }
}

// 创建单例实例
const userCleanupService = new UserCleanupService();

module.exports = userCleanupService; 