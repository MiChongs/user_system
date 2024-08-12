const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const RegisterLog = mysql.define('RegisterLog', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '注册日志ID'
    }, user_id: {
        type: DataTypes.INTEGER, allowNull: false, comment: '用户ID',references: {
            model: 'User',
            key: 'id'
        }
    }, register_time: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, comment: '注册时间'
    }, register_ip: {
        type: DataTypes.STRING, allowNull: false, comment: '注册IP'
    }, register_address: {
        type: DataTypes.STRING, allowNull: false, comment: '注册地址'
    }, register_device: {
        type: DataTypes.STRING, allowNull: false, comment: '注册设备'
    }, register_isp: {
        type: DataTypes.STRING, allowNull: false, comment: '注册运营商'
    }, appid: {
        type: DataTypes.STRING, allowNull: false, comment: '应用ID'
    }
})

module.exports = {RegisterLog}