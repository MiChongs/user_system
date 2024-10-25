const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {App} = require("./app");


const Notice = mysql.define("Notice", {
    id: {
        type: DataTypes.INTEGER, primaryKey: true,
        autoIncrement: true, comment: "通知ID"
    },
    title: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '通知标题'
    }, content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '通知内容'
    }, appid: {
        type: DataTypes.INTEGER, references: {
            model: App,
            key: 'id'
        }, comment: '绑定应用'
    }
}, {
    tableName: 'notices'
})

module.exports = {
    Notice
}