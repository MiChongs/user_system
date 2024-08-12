const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const { App } = require("./app");
const {VersionChannel} = require("./versionChannel");



const Version = mysql.define('Version', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '版本 ID'
    }, version: {
        type: DataTypes.STRING, allowNull: false, comment: '版本号'
    }, description: {
        type: DataTypes.STRING, allowNull: true, comment: '版本描述'
    }, bindAppid: {
        type: DataTypes.INTEGER, allowNull: false, comment: '绑定应用id',references: {
            model: App, key: 'id'
        }
    }, bindBand: {
        type: DataTypes.INTEGER, allowNull: false, comment: '绑定版本类型',references: {
            model: VersionChannel,
            key: 'id'
        }
    },
})

module.exports = {Version};