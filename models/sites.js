const { DataTypes } = require("sequelize");
const { mysql } = require("../database");
const { App } = require("./app");
const { User } = require("./user");
const { status } = require("express/lib/response");



const Site = mysql.define("Site", {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: "网站ID"
    }, header: {
        type: DataTypes.TEXT, allowNull: true, comment: "网站预览图"
    }, name: {
        type: DataTypes.TEXT, allowNull: false, comment: "网站名称"
    }, url: {
        type: DataTypes.TEXT, allowNull: false, comment: "网站链接"
    }, description: {
        type: DataTypes.TEXT, allowNull: true, comment: "网站描述"
    }, type: {
        type: DataTypes.ENUM,
        allowNull: true,
        defaultValue: 'url',
        values: ["url", "qq_group", "qq_person"],
        comment: "网站点击类型"
    }, appid: {
        type: DataTypes.INTEGER, comment: "绑定应用ID", allowNull: false, references: {
            model: App,
            key: 'id'
        }
    }, userId: {
        type: DataTypes.INTEGER, comment: "用户ID", allowNull: false, references: {
            model: User,
            key: 'id'
        }
    }, createdAt: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW, comment: "创建时间"
    }, updatedAt: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW, comment: "更新时间"
    }, status: {
        type: DataTypes.ENUM,
        allowNull: true,
        defaultValue: 'hidden',
        values: ["normal", "hidden"],
        comment: "网站状态"
    }
}, {
    timestamps: false, tableName: 'site'
})


module.exports = {
    Site
}