const {Sequelize, DataTypes} = require("sequelize");

const mysql = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_SERVER,
    dialect: "mysql",
    timezone: '+08:00',
})

module.exports = mysql