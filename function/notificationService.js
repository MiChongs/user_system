const { Notification } = require('../models/notification');
const { io } = require('../index');
const RedisService = require('./redisService');
const SystemLogService = require('./systemLogService');

class NotificationService {
    /**
     * 创建通知
     * @param {Object} options 通知选项
     * @returns {Promise<Object>} 创建的通知
     */
    static async create(options) {
        const {
            appid,
            userId,
            type,
            title,
            content,
            level = 'info',
            expireTime,
            data
        } = options;

        try {
            const notification = await Notification.create({
                appid,
                userId,
                type,
                title,
                content,
                level,
                expireTime,
                data
            });

            // 发送实时通知
            await this.sendRealtime(notification);

            // 记录日志
            await SystemLogService.createLog({
                type: 'notification_create',
                content: `创建${type}通知: ${title}`,
                details: { notificationId: notification.id }
            });

            return notification;
        } catch (error) {
            console.error('创建通知失败:', error);
            throw error;
        }
    }

    /**
     * 发送实时通知
     * @private
     * @param {Object} notification 通知对象
     */
    static async sendRealtime(notification) {
        try {
            const room = notification.userId 
                ? `user:${notification.appid}:${notification.userId}`
                : `app:${notification.appid}`;

            io.to(room).emit('notification', {
                type: notification.type,
                title: notification.title,
                content: notification.content,
                level: notification.level,
                data: notification.data,
                time: notification.createdAt
            });

            // 存储到Redis用于离线推送
            if (notification.userId) {
                await RedisService.pushList(
                    `notifications:${notification.appid}:${notification.userId}`,
                    JSON.stringify(notification),
                    100 // 保留最近100条
                );
            }
        } catch (error) {
            console.error('发送实时通知失败:', error);
        }
    }

    /**
     * 标记通知为已读
     * @param {number} notificationId 通知ID
     * @param {number} userId 用户ID
     */
    static async markAsRead(notificationId, userId) {
        try {
            await Notification.update({
                isRead: true,
                readTime: new Date()
            }, {
                where: {
                    id: notificationId,
                    userId
                }
            });
        } catch (error) {
            console.error('标记通知已读失败:', error);
            throw error;
        }
    }

    /**
     * 获取用户未读通知
     * @param {Object} options 查询选项
     * @returns {Promise<Array>} 通知列表
     */
    static async getUnread(options) {
        const {
            appid,
            userId,
            type,
            limit = 20,
            offset = 0
        } = options;

        try {
            const where = {
                appid,
                isRead: false
            };

            if (userId) {
                where.userId = userId;
            }
            if (type) {
                where.type = type;
            }

            return await Notification.findAll({
                where,
                limit,
                offset,
                order: [['createdAt', 'DESC']]
            });
        } catch (error) {
            console.error('获取未读通知失败:', error);
            throw error;
        }
    }

    /**
     * 清理过期通知
     */
    static async cleanExpired() {
        try {
            const result = await Notification.destroy({
                where: {
                    expireTime: {
                        [Op.lt]: new Date()
                    }
                }
            });

            await SystemLogService.createLog({
                type: 'notification_cleanup',
                content: `清理过期通知`,
                details: { count: result }
            });
        } catch (error) {
            console.error('清理过期通知失败:', error);
        }
    }
}

module.exports = NotificationService; 