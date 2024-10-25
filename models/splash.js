const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {App} = require("./app");


const Splash = mysql.define("Splash", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        comment: '开屏ID'
    },
    title: {
        type: DataTypes.TEXT,
        comment: '开屏标题',
    },
    background: {
        type: DataTypes.TEXT,
        comment: '开屏背景'
    },
    startDate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '开始日期'
    },
    endDate: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: "结束日期"
    },
    skip: {
        type: DataTypes.BOOLEAN,
        comment: '是否支持跳过',
        defaultValue: false
    },
    time: {
        type: DataTypes.INTEGER,
        comment: '显示时长 单位:毫秒',
        defaultValue: 3000
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: App,
            key: 'id'
        },
        comment: '绑定ID'
    }
})

module.exports = {
    Splash
}