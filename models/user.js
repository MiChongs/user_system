const {DataTypes} = require('sequelize');
const moment = require("moment/moment");
const {mysql} = require("../database");
const {getAvatar} = require("../function");
const dayjs = require("../function/dayjs");

const User = mysql.define('User', {
    // 定义模型属性
    id: {
        type: DataTypes.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true, comment: '用户ID'
    }, account: {
        type: DataTypes.STRING, comment: '用户账号', allowNull: true
    }, password: {
        type: DataTypes.STRING, allowNull: true, comment: '用户密码',
    }, name: {
        type: DataTypes.STRING, comment: '用户昵称'
    }, avatar: {
        type: DataTypes.STRING,
        comment: '用户头像',
        defaultValue: process.env.BASE_SERVER_URL + '/avatars/0.png',
        get() {
            return getAvatar(this.getDataValue('avatar'));
        }
    }, email: {
        type: DataTypes.STRING, comment: '用户邮箱'
    }, register_ip: {
        type: DataTypes.STRING, comment: '用户注册IP'
    }, register_time: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, comment: '用户注册时间', get() {
            return moment(this.getDataValue('register_time')).format('YYYY-MM-DD HH:mm:ss');
        }
    }, register_province: {
        type: DataTypes.STRING, comment: '用户注册省份'
    }, register_city: {
        type: DataTypes.STRING, comment: '用户注册城市'
    }, register_isp: {
        type: DataTypes.STRING, comment: '用户注册运营商'
    }, vip_time: {
        type: DataTypes.INTEGER, defaultValue: dayjs().unix(), comment: '用户会员到期时间'
    }, integral: {
        type: DataTypes.INTEGER, comment: '用户积分', defaultValue: 0
    }, enabled: {
        type: DataTypes.BOOLEAN, defaultValue: true, comment: '用户账号状态'
    }, disabledEndTime: {
        type: DataTypes.DATE, comment: '用户禁用到期时间', get() {
            return dayjs(this.getDataValue('disabledEndTime')).format('YYYY-MM-DD HH:mm:ss');
        }
    }, reason: {
        type: DataTypes.STRING, comment: '禁用原因', defaultValue: '无'
    }, role: {
        type: DataTypes.ENUM, defaultValue: 'user', values: ['admin', 'user', 'tester', 'auditor'], comment: '用户权限组'
    }, markcode: {
        type: DataTypes.STRING, allowNull: false, comment: 'Markcode (设备ID)'
    }, parent_invite_account: {
        type: DataTypes.STRING, comment: '邀请人'
    }, invite_code: {
        type: DataTypes.STRING, comment: '邀请码',
    }, open_qq: {
        type: DataTypes.STRING, comment: 'QQ Open ID (互联)'
    }, open_wechat: {
        type: DataTypes.STRING, comment: 'QQ Open ID (互联)'
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false, comment: '隶属于应用 (id)'
    }, customIdCount: {
        type: DataTypes.INTEGER, allowNull: false, comment: '用户可自定义ID次数', defaultValue: 1
    }, customId: {
        type: DataTypes.STRING, allowNull: true, comment: '用户自定义ID', defaultValue: ''
    }, twoFactorSecret: {
        type: DataTypes.TEXT, allowNull: true, comment: '用户二次验证密钥'
    }
}, {
    // 这是其他模型参数
    freezeTableName: true, timestamps: false,
});

module.exports.User = User;