const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {Admin} = require("./admin");

const AdminToken = mysql.define('AdminToken', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: 'Token ID'
    }, token: {
        type: DataTypes.TEXT, allowNull: false, comment: 'Token'
    }, markcode: {
        type: DataTypes.STRING, allowNull: false, comment: 'Markcode (设备ID)'
    }, account: {
        type: DataTypes.STRING, comment: '管理员账号', allowNull: false,references: {
            model: Admin,
            key: 'account'
        }
    },
})

module.exports = {AdminToken}