const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {App} = require("./app");


const VersionChannel = mysql.define('VersionChannel', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '版本 ID'
    }, band: {
        type: DataTypes.STRING, allowNull: false, comment: '版本类型'
    }, description: {
        type: DataTypes.STRING, allowNull: true, comment: '版本描述'
    }, bindAppid: {
        type: DataTypes.INTEGER, allowNull: false, comment: '绑定应用id', references: {
            model: App, key: 'id'
        }
    }
})

module.exports = {VersionChannel}