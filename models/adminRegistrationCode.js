const {mysql} = require("../database");
const {DataTypes} = require("sequelize");



const AdminRegistrationCode = mysql.define('AdminRegistrationCode', {
    id: {
        type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true,
    }, code: {
        type: DataTypes.STRING, allowNull: false, unique: true,
    }, createdAt: {
        type: DataTypes.DATE, defaultValue: DataTypes.NOW,
    }, usedTime: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW,
    },
});

module.exports = {AdminRegistrationCode};