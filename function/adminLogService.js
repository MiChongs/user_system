const { AdminLog } = require('../models/adminLog');
const { lookupAllGeoInfo } = require('../global');
const dayjs = require('./dayjs');

/**
 * 管理员日志构建器类
 */
class AdminLogBuilder {
    constructor(context = {}) {
        this.context = {
            adminId: null,
            ip: null,
            device: null,
            sessionId: null,
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

    // 设置目标管理员
    targetAdmin(adminId) {
        this.logData.targetAdminId = adminId;
        return this;
    }

    // 设置安全等级
    securityLevel(level) {
        this.logData.securityLevel = level;
        return this;
    }

    // 创建日志
    async save() {
        const { adminId, ip, device, sessionId } = this.context;
        if (!adminId || !ip) {
            throw new Error('必须设置adminId和ip');
        }

        return AdminLogService.createLog({
            ...this.logData,
            adminId,
            ip,
            device,
            sessionId
        });
    }
}

/**
 * 管理员日志服务类
 */
class AdminLogService {
    static builder(context = {}) {
        return new AdminLogBuilder(context);
    }

    static async createLog(params) {
        try {
            const geoInfo = await lookupAllGeoInfo(params.ip);
            const location = geoInfo ? `${geoInfo.provinceName} ${geoInfo.cityNameZh}` : null;

            return await AdminLog.create({
                log_type: params.type,
                log_content: params.content,
                log_time: dayjs().toDate(),
                log_ip: params.ip,
                log_user_id: params.adminId,
                log_device: params.device,
                log_location: location,
                log_isp: geoInfo?.autonomousSystemOrganization,
                log_status: params.status || 'success',
                log_details: params.details,
                target_admin_id: params.targetAdminId,
                session_id: params.sessionId,
                security_level: params.securityLevel || 'medium'
            });
        } catch (error) {
            console.error('管理员日志创建失败:', error);
            throw error;
        }
    }

    // 预定义的日志类型快捷方法
    static login(context, success = true) {
        return this.builder(context)
            .type('admin_login')
            .content(`管理员登录${success ? '成功' : '失败'}`)
            .status(success ? 'success' : 'failed')
            .securityLevel('high');
    }

    static logout(context) {
        return this.builder(context)
            .type('admin_logout')
            .content('管理员退出登录');
    }

    static passwordChange(context, success = true) {
        return this.builder(context)
            .type('password_change')
            .content(`修改密码${success ? '成功' : '失败'}`)
            .status(success ? 'success' : 'failed')
            .securityLevel('high');
    }

    static securityConfig(context, changes) {
        return this.builder(context)
            .type('security_config')
            .content('更新安全配置')
            .details(changes)
            .securityLevel('high');
    }

    static adminOperation(context, { type, targetId, action, details }) {
        return this.builder(context)
            .type(type)
            .content(`管理员操作: ${action}`)
            .targetAdmin(targetId)
            .details(details)
            .securityLevel('high');
    }

    static securityAlert(context, { reason, details }) {
        return this.builder(context)
            .type('security_alert')
            .content(`安全警告: ${reason}`)
            .status('warning')
            .details(details)
            .securityLevel('high');
    }
}

module.exports = AdminLogService; 