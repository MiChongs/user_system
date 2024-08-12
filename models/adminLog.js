
const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {Admin} = require("./admin");


const AdminLog = mysql.define('AdminLog', {
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
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, comment: '创建时间'
    }, log_ip: {
        type: DataTypes.STRING, allowNull: false, comment: '日志IP'
    }, log_user_id: {
        type: DataTypes.STRING, allowNull: false, comment: '用户ID',references: {
            model: Admin,
            key: 'account'
        }
    },
}, {
    timestamps: false
})

module.exports = {AdminLog}