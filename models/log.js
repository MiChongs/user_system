const {DataTypes} = require("sequelize");
const moment = require("moment/moment");
const {User} = require("./user");
const {mysql} = require("../database");

const Log = mysql.define('Log', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '日志ID'
    }, log_type: {
        type: DataTypes.ENUM,
        allowNull: false,
        comment: '日志类型',
        values: ['login', 'register', 'admin_register', 'vip_time_add', 'integral_add', 'card_use', 'pay_vip', 'card_generate', 'admin_login', 'logout', 'updateAppConfig', 'createApp', 'logoutDevice', 'updateUser', 'daily']
    }, log_content: {
        type: DataTypes.STRING, allowNull: false, comment: '日志内容'
    }, log_time: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, comment: '创建时间', get() {
            return moment(this.getDataValue('log_time')).format('YYYY-MM-DD HH:mm:ss');
        }
    }, log_ip: {
        type: DataTypes.STRING, allowNull: false, comment: '日志IP'
    }, log_user_id: {
        type: DataTypes.STRING, allowNull: true, comment: '用户ID'
    }, appid: {
        type: DataTypes.STRING, allowNull: false, comment: '应用ID'
    }, open_qq: {
        type: DataTypes.STRING, comment: 'QQ 互联ID', allowNull: true
    }, open_wechat: {
        type: DataTypes.STRING, comment: '微信 互联ID', allowNull: true
    }, bindAppid: {
        type: DataTypes.STRING, comment: '绑定应用ID', allowNull: true
    }, UserId: {
        type: DataTypes.INTEGER, references: {
            model: User, key: 'id',
        }, allowNull: true, onUpdate: 'CASCADE', onDelete: 'CASCADE'
    },
}, {
    tableName: 'log', timestamps: false
})


module.exports = {Log}