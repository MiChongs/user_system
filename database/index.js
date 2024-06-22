const {Sequelize, DataTypes} = require("sequelize");

const mysql = new Sequelize("testdatabase", "test", "123456", {
    host: "localhost",
    dialect: "mysql",
    timezone: '+08:00',
})

module.exports = mysql