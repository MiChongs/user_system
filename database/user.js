const {Sequelize, DataTypes} = require('sequelize');
const sequelize = new Sequelize('sqlite::memory:');

// `sequelize.define` 会返回模型
console.log(User === sequelize.models.User); // true