const {DataTypes} = require("sequelize");
const {mysql} = require("../database");
const {User} = require("./user");
const {App} = require("./app");


const Daily = mysql.define('daily', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true
    }, userId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: User, key: 'id'
        },onUpdate: 'CASCADE', onDelete: 'CASCADE'
    }, date: {
        type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW
    }, integral: {
        type: DataTypes.INTEGER, allowNull: false
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false,references: {
            model: App,
            key: 'id'
        }
    }
})
module.exports = {
    Daily
}