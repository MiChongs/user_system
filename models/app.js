const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {Admin} = require("./admin");


const App = mysql.define('App', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: false, comment: '应用ID'
    }, name: {
        type: DataTypes.STRING, allowNull: false, comment: '应用名称'
    }, key: {
        type: DataTypes.STRING, allowNull: false, comment: '应用密钥'
    }, encrypt: {
        type: DataTypes.BOOLEAN, allowNull: true, comment: '加密启用状态', defaultValue: false
    }, status: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '应用状态'
    }, disabledReason: {
        type: DataTypes.STRING, allowNull: true, defaultValue: '', comment: '应用禁用原因'
    }, registerStatus: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '注册启用状态'
    }, disabledRegisterReason: {
        type: DataTypes.STRING, allowNull: true, defaultValue: true, comment: '注册禁用原因'
    }, loginStatus: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '登录启用状态'
    }, disableLoginReason: {
        type: DataTypes.STRING, allowNull: true, defaultValue: '', comment: '登录禁用原因'
    }, loginCheckDevice: {
        type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true, comment: '登录校验设备信息'
    }, loginCheckUser: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '登录校验用户属地与上次是否相符'
    }, loginCheckDeviceTimeOut: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '登录换绑机器码间隔'
    }, loginCheckIp: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '登录校验IP'
    }, registerCheckIp: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '注册校验IP'
    }, multiDeviceLogin: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '多设备登录启用状态'
    }, multiDeviceLoginNum: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, comment: '多设备数量'
    }, register_award: {
        type: DataTypes.ENUM, allowNull: false, values: ['vip', 'integral'], defaultValue: 'integral', comment: '注册奖励'
    }, register_award_num: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: "注册奖励数"
    }, invite_award: {
        type: DataTypes.ENUM, allowNull: false, values: ['vip', 'integral'], defaultValue: 'integral', comment: '邀请奖励'
    }, invite_award_num: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '邀请奖励数'
    }, daily_award: {
        type: DataTypes.ENUM, allowNull: false, values: ['vip', 'integral'], defaultValue: 'integral', comment: '签到奖励'
    }, daily_award_num: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '签到奖励数'
    }, smtpHost: {
        type: DataTypes.STRING, allowNull: true, defaultValue: '', comment: 'SMTP服务器'
    }, smtpPort: {
        type: DataTypes.INTEGER, allowNull: true, comment: 'SMTP端口'
    }, smtpSecure: {
        type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false, comment: 'SMTP是否使用SSL'
    }, smtpUser: {
        type: DataTypes.STRING, allowNull: true, defaultValue: '', comment: 'SMTP用户名'
    }, smtpPassword: {
        type: DataTypes.STRING, allowNull: true, defaultValue: '', comment: 'SMTP密码'
    }, smtpForm: {
        type: DataTypes.STRING, allowNull: true, defaultValue: '', comment: 'SMTP发件人'
    }, bind_admin_account: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '绑定管理员账号', references: {
            model: Admin,
            key: 'id'
        }
    }, registerCaptcha: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '注册验证码'
    }, registerCaptchaTimeOut: {
        type: DataTypes.INTEGER, allowNull: true, defaultValue: 0, comment: '注册验证码超时时间'
    }, normalCustomIdCount: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, comment: '普通用户更改ID次数'
    }, viperCustomIdCount: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 10, comment: '会员用户更改ID次数'
    }, defaultBand: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '默认更新版本渠道'
    }
})

module.exports = {App}