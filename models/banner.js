const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {App} = require("./app");


const Banner = mysql.define("Banner", {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: "广告位ID"
    }, header: {
        type: DataTypes.TEXT, allowNull: true, comment: "广告图"
    }, title: {
        type: DataTypes.TEXT, allowNull: false, comment: "广告标题"
    }, content: {
        type: DataTypes.TEXT, allowNull: true, comment: "广告内容"
    }, url: {
        type: DataTypes.TEXT, allowNull: true, comment: "广告链接"
    }, type: {
        type: DataTypes.ENUM,
        allowNull: true,
        defaultValue: 'url',
        values: ["url", "qq_group", "qq_person"],
        comment: "广告点击类型"
    }, appid: {
        type: DataTypes.INTEGER, comment: "绑定应用ID", allowNull: false,references: {
            model: App,
            key: 'id'
        }
    }
})

module.exports = {
    Banner
}