const {Sequelize, DataTypes} = require("sequelize");

/**
 * # Sequelize 数据库配置
 * @type {Sequelize}
 * @return Sequelize
 */

const mysql = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_SERVER, dialect: "mysql", timezone: '+08:00', logging: false, pool: {
        max: 5, min: 0, acquire: 30000, idle: 10000
    }
})

module.exports = {mysql};