const { SystemLog } = require('../models/systemLog');
const dayjs = require('./dayjs');
const { Op } = require('sequelize');

/**
 * 系统日志服务类
 */
class SystemLogService {

    /**
     * 查找所有符合条件的日志
     * @param {Object} options 查询选项
     * @param {Object} [options.where] 查询条件
     * @param {Array} [options.order] 排序条件
     * @param {number} [options.limit] 限制数量
     * @param {number} [options.offset] 偏移量
     * @param {boolean} [options.raw] 是否返回原始数据
     * @returns {Promise<Array>} 日志列表
     */
    static async findAll(options = {}) {
        try {
            const {
                where = {},
                order = [['log_time', 'DESC']],
                limit,
                offset,
                raw = true
            } = options;

            const logs = await SystemLog.findAll({
                where,
                order,
                limit,
                offset,
                raw
            });

            return logs;
        } catch (error) {
            console.error('查询系统日志失败:', error);
            throw error;
        }
    }

    /**
     * 查找系统日志
     * @param {Object} options 查询选项
     * @param {string} options.type 日志类型
     * @param {Date} [options.startTime] 开始时间
     * @param {Date} [options.endTime] 结束时间
     * @param {number} [options.limit] 限制数量
     * @param {Object} [options.where] 额外的查询条件
     * @returns {Promise<Array>} 日志列表
     */
    static async findLogs(options) {
        const { type, startTime, endTime, limit, where = {} } = options;

        // 构建查询条件
        const queryWhere = {
            log_type: type,
            ...where
        };

        // 添加时间范围条件
        if (startTime || endTime) {
            queryWhere.log_time = {};
            if (startTime) {
                queryWhere.log_time[Op.gte] = startTime;
            }
            if (endTime) {
                queryWhere.log_time[Op.lte] = endTime;
            }
        }

        return this.findAll({
            where: queryWhere,
            order: [['log_time', 'DESC']],
            limit: limit || undefined,
            raw: true
        });
    }

    /**
     * 创建系统日志
     * @param {Object} params 日志参数
     * @param {string} params.type 日志类型
     * @param {string} params.content 日志内容
     * @param {string} [params.status='success'] 日志状态
     * @param {Object} [params.details] 详细信息
     */
    static async createLog(params) {
        try {
            return await SystemLog.create({
                log_type: params.type,
                log_content: params.content,
                log_time: dayjs().toDate(),
                log_status: params.status || 'success',
                log_details: params.details
            });
        } catch (error) {
            console.error('系统日志创建失败:', error);
            throw error;
        }
    }

    // 预定义的日志类型快捷方法
    static systemStart(details) {
        return this.createLog({
            type: 'system_start',
            content: '系统启动',
            details
        });
    }

    static systemStop(details) {
        return this.createLog({
            type: 'system_stop',
            content: '系统停止',
            details
        });
    }

    static error(content, details) {
        return this.createLog({
            type: 'error',
            content,
            status: 'failed',
            details
        });
    }

    static warning(content, details) {
        return this.createLog({
            type: 'warning',
            content,
            status: 'warning',
            details
        });
    }

    static info(content, details) {
        return this.createLog({
            type: 'info',
            content,
            details
        });
    }

    static maintenance(content, details) {
        return this.createLog({
            type: 'maintenance',
            content,
            details
        });
    }

    /**
     * 记录任务执行日志
     * @param {string} taskName 任务名称
     * @param {string} status 任务状态
     * @param {number} executionTime 执行时间
     * @param {Object} [details] 详细信息
     */
    static async logTaskExecution(taskName, status, executionTime, details = {}) {
        return this.createLog({
            type: 'task_execution',
            content: `任务 ${taskName} 执行${status === 'success' ? '成功' : '失败'}`,
            status,
            details,
            task_name: taskName,
            execution_time: executionTime
        });
    }
}

module.exports = SystemLogService; 