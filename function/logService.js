const { Log } = require('../models/log');
const { lookupAllGeoInfo } = require('../global');
const dayjs = require('./dayjs');

/**
 * 日志构建器类
 */
class LogBuilder {
    constructor(context = {}) {
        this.context = {
            appid: null,
            userId: null,
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

    // 设置关联日志ID
    relatedTo(logId) {
        this.logData.relatedLogId = logId;
        return this;
    }

    // 设置QQ绑定信息
    withQQ(qqId) {
        this.logData.openQQ = qqId;
        return this;
    }

    // 设置微信绑定信息
    withWechat(wechatId) {
        this.logData.openWechat = wechatId;
        return this;
    }

    // 创建日志
    async save() {
        const { appid, userId, ip, device } = this.context;
        if (!appid || !ip) {
            throw new Error('必须设置appid和ip');
        }

        return LogService.createLog({
            ...this.logData,
            appid,
            userId,
            ip,
            device
        });
    }
}

/**
 * 日志服务类
 */
class LogService {
    static builder(context = {}) {
        return new LogBuilder(context);
    }

    static async createLog(params) {
        try {
            const geoInfo = await lookupAllGeoInfo(params.ip);
            const location = geoInfo ? `${geoInfo.provinceName} ${geoInfo.cityNameZh}` : null;

            return await Log.create({
                log_type: params.type,
                log_content: params.content,
                log_time: dayjs().toDate(),
                log_ip: params.ip,
                log_user_id: params.userId,
                appid: params.appid,
                open_qq: params.openQQ,
                open_wechat: params.openWechat,
                UserId: params.userId,
                log_device: params.device,
                log_location: location,
                log_isp: geoInfo?.autonomousSystemOrganization,
                log_status: params.status || 'success',
                log_details: params.details,
                related_log_id: params.relatedLogId
            });
        } catch (error) {
            console.error('日志创建失败:', error);
            throw error;
        }
    }

    // 预定义的日志类型快捷方法
    static login(context) {
        return this.builder(context)
            .type('login')
            .content(`用户 ${context.userId} 登录`);
    }

    static logout(context) {
        return this.builder(context)
            .type('logout')
            .content(`用户 ${context.userId} 退出登录`);
    }

    static bindEmail(context, email) {
        return this.builder(context)
            .type('bind_email')
            .content(`用户 ${context.userId} 绑定邮箱 ${email}`)
            .details({ email });
    }

    static bindQQ(context, qqId) {
        return this.builder(context)
            .type('bind_qq')
            .content(`用户 ${context.userId} 绑定QQ`)
            .withQQ(qqId)
            .details({ qqId });
    }

    static bindWechat(context, wechatId) {
        return this.builder(context)
            .type('bind_wechat')
            .content(`用户 ${context.userId} 绑定微信`)
            .withWechat(wechatId)
            .details({ wechatId });
    }

    static enable2FA(context) {
        return this.builder(context)
            .type('enable_2fa')
            .content(`用户 ${context.userId} 开启两步验证`);
    }

    static passwordChange(context, success = true) {
        return this.builder(context)
            .type('password_change')
            .content(`用户 ${context.userId} 修改密码${success ? '成功' : '失败'}`)
            .status(success ? 'success' : 'failed');
    }

    static vipAdd(context, { days, reason }) {
        return this.builder(context)
            .type('vip_time_add')
            .content(`用户 ${context.userId} 增加 ${days} 天会员`)
            .details({ days, reason });
    }

    static integralAdd(context, { amount, reason }) {
        return this.builder(context)
            .type('integral_add')
            .content(`用户 ${context.userId} 增加 ${amount} 积分`)
            .details({ amount, reason });
    }

    static customIdChange(context, { oldId, newId }) {
        return this.builder(context)
            .type('custom_id_change')
            .content(`用户 ${context.userId} 修改自定义ID: ${oldId} -> ${newId}`)
            .details({ oldId, newId });
    }
}

module.exports = LogService; 