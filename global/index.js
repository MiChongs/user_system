const {Sequelize, DataTypes} = require("sequelize");
const crypto = require("crypto");
const mysql = new Sequelize("testdatabase", "test", "123456", {
    host: "localhost",
    dialect: "mysql",
})
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')
const User = mysql.define('User', {
    // 定义模型属性
    id: {
        type: DataTypes.INTEGER
        , primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        comment: '用户ID'
    },
    account: {
        type: DataTypes.STRING,
        comment: '用户账号',
        allowNull: false
    }, password: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '用户密码',
    },
    name: {
        type: DataTypes.STRING,
        comment: '用户昵称'
    },
    avatar: {
        type: DataTypes.STRING,
        comment: '用户头像'
    },
    register_ip: {
        type: DataTypes.STRING,
        comment: '用户注册IP'
    },
    register_time: {
        type: DataTypes.TIME,
        defaultValue: DataTypes.NOW,
        comment: '用户注册时间'
    },
    vip_time: {
        type: DataTypes.TIME,
        defaultValue: DataTypes.NOW,
        comment: '用户会员到期时间'
    },
    integral: {
        type: DataTypes.INTEGER,
        comment: '用户积分',
        defaultValue: 0
    },
    enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '用户账号状态'
    },
    reason: {
        type: DataTypes.STRING,
        comment: '禁用原因',
        defaultValue: '无'
    }
}, {
    // 这是其他模型参数
    freezeTableName: true,
    timestamps: false,
});
module.exports.User = User;
module.exports.mysql = mysql;
module.exports.sequelize = Sequelize;
module.exports.crypto = crypto;
module.exports.bcrypt = bcrypt;
module.exports.bodyParser = bodyParser;