const {DataTypes} = require("sequelize");
const {mysql} = require("../database");
const {App} = require("./app");
const {User} = require("./user");


const Counter = mysql.define('Counter', {
    name: {
        type: DataTypes.STRING, primaryKey: true
    }, value: {
        type: DataTypes.INTEGER, defaultValue: 10000 // 起始值
    }, bindAppid: {
        type: DataTypes.INTEGER, defaultValue: 0, references: {  // 绑定应用ID
            model: App, key: "id",
        }, comment: "绑定应用ID"
    }, bindUserid: {
        type: DataTypes.INTEGER, defaultValue: 0, references: {
            model: User, key: "id"
        }, comment: "绑定用户ID"
    }
});

exports.Counter = Counter;