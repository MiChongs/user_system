const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const moment = require("moment/moment");
const {User} = require("./user");
const {App} = require("./app");
const dayjs = require("../function/dayjs");


const Token = mysql.define('Token', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: 'Token ID'
    }, token: {
        type: DataTypes.TEXT, allowNull: false, comment: 'Token'
    }, markcode: {
        type: DataTypes.STRING, allowNull: false, comment: 'Markcode (设备ID)'
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false, comment: 'App ID', references: {
            model: App, key: 'id'
        }
    }, account: {
        type: DataTypes.INTEGER, comment: '用户账号', allowNull: true, references: {
            model: User, key: 'id'
        }
    }, open_qq: {
        type: DataTypes.STRING, comment: 'QQ 互联ID', allowNull: true
    }, open_wechat: {
        type: DataTypes.STRING, comment: '微信 互联ID', allowNull: true
    }, device: {
        type: DataTypes.STRING, comment: '设备名称', allowNull: true
    }, time: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW, comment: '登录时间', get() {
            return dayjs(this.getDataValue('time')).format('YYYY-MM-DD HH:mm:ss');
        }
    },
    expireTime: {
        type: DataTypes.DATE, comment: '过期时间', allowNull: true, get() {
            return dayjs(this.getDataValue('expireTime')).format('YYYY-MM-DD HH:mm:ss');
        }
    }
})


module.exports = {Token}