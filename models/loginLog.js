const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {User} = require("./user");
const {App} = require("./app");


const LoginLog = mysql.define('LoginLog', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '登录日志ID'
    }, user_id: {
        type: DataTypes.INTEGER, allowNull: true, comment: '用户ID',references: {
            model: User,
            key: 'id'
        }
    }, login_time: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, comment: '登录时间'
    }, login_ip: {
        type: DataTypes.STRING, allowNull: false, comment: '登录IP'
    }, login_address: {
        type: DataTypes.STRING, allowNull: false, comment: '登录地址'
    }, login_device: {
        type: DataTypes.STRING, allowNull: false, comment: '登录设备'
    }, login_isp: {
        type: DataTypes.STRING, allowNull: false, comment: '登录运营商'
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false, comment: '应用ID',references: {
            model: App,
            key: 'id'
        }
    }
})


module.exports = {LoginLog}