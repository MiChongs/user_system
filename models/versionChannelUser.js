const {DataTypes} = require("sequelize");
const {mysql} = require("../database");
const {User} = require("./user");
const {VersionChannel} = require("./versionChannel");


const versionChannelUser = mysql.define("versionChannelUser", {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: "版本渠道用户ID"
    }, userId: {
        type: DataTypes.INTEGER, allowNull: false, comment: "用户ID", references: {
            model: User, key: 'id'
        }
    }, channelId: {
        type: DataTypes.INTEGER, allowNull: false, comment: "渠道ID", references: {
            model: VersionChannel, key: 'id'
        }
    }, createdAt: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW, comment: "创建时间"
    }, updatedAt: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW, comment: "更新时间"
    }
}, {
    timestamps: false, tableName: 'version_channel_user'
})


module.exports = {
    versionChannelUser
}