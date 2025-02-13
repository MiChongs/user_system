const {mysql} = require("../database");
const {DataTypes} = require("sequelize");

const AppAnalyzer = mysql.define('AppAnalyzer', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '分析器ID'
    }, name: {
        type: DataTypes.STRING, allowNull: false, comment: '分析器名称'
    }, url: {
        type: DataTypes.TEXT, allowNull: false, comment: '分析器URL'
    }, description: {
        type: DataTypes.STRING, allowNull: true, comment: '分析器描述'
    }, analyzerIntegral: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '解析所需积分'
    }, enable: {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否启用'
    }, disabledReason: {
        type: DataTypes.STRING, allowNull: true, defaultValue: '解析功能已关闭', comment: '禁用原因'
    }, normalUserInDayMax: {
        type: DataTypes.INTEGER, allowNull: false, defaultValue: 15, comment: '普通用户每日最大解析次数'
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false, comment: '应用ID',references: {
            model: 'App',
            key: 'id'
        }
    }
});

module.exports = {AppAnalyzer};