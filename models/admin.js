const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {AdminRegistrationCode} = require("./adminRegistrationCode");


const Admin = mysql.define('Admin', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '管理员id'
    }, avatar: {
        type: DataTypes.STRING, allowNull: true, comment: '管理员头像'
    }, account: {
        type: DataTypes.STRING, allowNull: false, comment: '管理员账号', unique: true
    }, username: {
        type: DataTypes.STRING, allowNull: false, comment: '管理员昵称'
    }, password: {
        type: DataTypes.STRING, allowNull: false, comment: '管理员密码'
    }, description: {
        type: DataTypes.STRING, allowNull: true, comment: '管理员描述'
    }, email: {
        type: DataTypes.STRING, allowNull: true, comment: '管理员邮箱'
    }, phone: {
        type: DataTypes.STRING, allowNull: true, limit: 11, comment: '管理员手机号'
    }, createTime: {
        type: DataTypes.DATE, comment: '注册时间'
    }, register_ip: {
        type: DataTypes.STRING, allowNull: false, comment: '注册IP'
    }, register_address: {
        type: DataTypes.STRING, allowNull: false, comment: '注册地址'
    }, register_device: {
        type: DataTypes.STRING, allowNull: false, comment: '注册设备'
    }, register_isp: {
        type: DataTypes.STRING, allowNull: false, comment: '注册运营商'
    }, status: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '状态 1正常 0禁用'
    }, bindRegisterCode: {
        type: DataTypes.STRING, allowNull: false, comment: '绑定注册码', references: {
            model: AdminRegistrationCode, key: 'code'
        }
    },
})


module.exports = {Admin}