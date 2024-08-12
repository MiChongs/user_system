const {mysql} = require("../database");
const {DataTypes} = require("sequelize");


const Notification = mysql.define('Notification', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '通知ID'
    }, title: {
        type: DataTypes.STRING, allowNull: false, comment: '通知标题',
    }, summary: {
        type: DataTypes.STRING, allowNull: false, comment: '通知内容'
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false, comment: 'App ID'
    }, time: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW
    }
})

module.exports = {Notification}