const WhitelistLog = require('../models/whitelistLog');
const { ValidationError } = require('sequelize');

/**
 * 记录白名单操作日志
 * @param {Object} params 日志参数
 * @param {number|null} params.whitelistId 白名单ID，可为空
 * @param {string} params.appid 应用ID
 * @param {('check'|'add'|'update'|'delete'|'enable'|'disable')} params.operationType 操作类型
 * @param {number} params.operatorId 操作者ID，0表示系统或未知用户
 * @param {('user'|'admin'|'system')} params.operatorType 操作者类型
 * @param {boolean} params.status 操作结果
 * @param {Object} params.detail 操作详情
 * @param {Date|string} params.detail.timestamp 操作时间戳
 * @param {string} params.detail.reason 操作原因
 * @param {string|null} params.ip 操作IP
 * @returns {Promise<WhitelistLog>} 创建的日志记录
 * @throws {Error} 当参数验证失败或数据库操作失败时抛出错误
 */
const logWhitelistOperation = async (params) => {
    try {
        // 基本参数验证
        if (!params.appid) {
            throw new Error('appid是必需的');
        }
        if (!params.operationType) {
            throw new Error('operationType是必需的');
        }
        if (typeof params.operatorId !== 'number') {
            throw new Error('operatorId必须是数字');
        }
        if (typeof params.status !== 'boolean') {
            throw new Error('status必须是布尔值');
        }

        // 验证detail对象
        if (!params.detail || typeof params.detail !== 'object') {
            throw new Error('detail必须是一个对象');
        }
        if (!params.detail.timestamp) {
            params.detail.timestamp = new Date();
        }
        if (!params.detail.reason) {
            throw new Error('detail.reason是必需的');
        }

        // 创建日志记录
        const logEntry = await WhitelistLog.create({
            whitelistId: params.whitelistId || null,
            appid: params.appid,
            operationType: params.operationType,
            operatorId: params.operatorId,
            operatorType: params.operatorType || 'user',
            status: params.status,
            detail: {
                ...params.detail,
                timestamp: new Date(params.detail.timestamp)
            },
            ip: params.ip || null
        });

        return logEntry;
    } catch (error) {
        // 处理验证错误
        if (error instanceof ValidationError) {
            console.error('白名单日志验证错误:', {
                message: error.message,
                errors: error.errors.map(e => ({
                    field: e.path,
                    message: e.message
                }))
            });
            throw new Error('白名单日志数据验证失败: ' + error.message);
        }

        // 处理其他错误
        console.error('记录白名单操作日志失败:', {
            error: error.message,
            params: {
                ...params,
                detail: params.detail ? {
                    ...params.detail,
                    timestamp: params.detail.timestamp?.toString()
                } : null
            }
        });
        throw new Error('记录白名单操作日志失败: ' + error.message);
    }
};

module.exports = {
    logWhitelistOperation
};
