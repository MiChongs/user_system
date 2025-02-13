const { AppLog } = require('../models/appLog');
const { lookupAllGeoInfo } = require('../global');
const dayjs = require('./dayjs');

/**
 * 应用日志构建器类
 */
class AppLogBuilder {
    constructor(context = {}) {
        this.context = {
            appid: null,
            adminId: null,
            ip: null,
            device: null,
            ...context
        };
        this.logData = {};
    }

    // 设置基础上下文
    setContext(context) {
        this.context = { ...this.context, ...context };
        return this;
    }

    // 设置日志类型
    type(type) {
        this.logData.type = type;
        return this;
    }

    // 设置日志内容
    content(content) {
        this.logData.content = content;
        return this;
    }

    // 设置状态
    status(status) {
        this.logData.status = status;
        return this;
    }

    // 设置详细信息
    details(details) {
        this.logData.details = details;
        return this;
    }

    // 设置影响用户数
    affectedUsers(count) {
        this.logData.affectedUsers = count;
        return this;
    }

    // 设置变更摘要
    changeSummary(changes) {
        this.logData.changeSummary = changes;
        return this;
    }

    // 创建日志
    async save() {
        const { appid, adminId, ip, device } = this.context;
        if (!appid || !adminId || !ip) {
            throw new Error('必须设置appid、adminId和ip');
        }

        return AppLogService.createLog({
            ...this.logData,
            appid,
            adminId,
            ip,
            device
        });
    }
}

/**
 * 应用日志服务类
 */
class AppLogService {
    static builder(context = {}) {
        return new AppLogBuilder(context);
    }

    static async createLog(params) {
        try {
            const geoInfo = await lookupAllGeoInfo(params.ip);
            const location = geoInfo ? `${geoInfo.provinceName} ${geoInfo.cityNameZh}` : null;

            return await AppLog.create({
                log_type: params.type,
                log_content: params.content,
                log_time: dayjs().toDate(),
                log_ip: params.ip,
                log_admin_id: params.adminId,
                appid: params.appid,
                log_device: params.device,
                log_location: location,
                log_status: params.status || 'success',
                log_details: params.details,
                affected_users: params.affectedUsers,
                change_summary: params.changeSummary
            });
        } catch (error) {
            console.error('应用日志创建失败:', error);
            throw error;
        }
    }

    // 预定义的日志类型快捷方法
    static appConfig(context, changes) {
        return this.builder(context)
            .type('config_update')
            .content(`更新应用配置`)
            .changeSummary(changes);
    }

    static securityConfig(context, changes) {
        return this.builder(context)
            .type('security_update')
            .content(`更新安全配置`)
            .changeSummary(changes);
    }

    static userOperation(context, { type, count, details }) {
        return this.builder(context)
            .type(type)
            .content(`批量用户操作: ${details.action}`)
            .affectedUsers(count)
            .details(details);
    }

    static splashOperation(context, { type, title, details }) {
        return this.builder(context)
            .type(type)
            .content(`开屏页面操作: ${title}`)
            .details(details);
    }

    static noticeOperation(context, { type, title, details }) {
        return this.builder(context)
            .type(type)
            .content(`公告操作: ${title}`)
            .details(details);
    }

    static bannerOperation(context, { type, title, details }) {
        return this.builder(context)
            .type(type)
            .content(`广告位操作: ${title}`)
            .details(details);
    }
}

module.exports = AppLogService; 