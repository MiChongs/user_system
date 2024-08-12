const {DataTypes} = require("sequelize");
const {mysql} = require("../database");
const {User} = require("./user");
const Message = mysql.define('Message', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true,
    }, senderId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: User, key: 'id',
        },
    }, recipientId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: User, key: 'id',
        },
    }, content: {
        type: DataTypes.STRING, allowNull: false,
    }, delivered: {
        type: DataTypes.BOOLEAN, defaultValue: false,
    }, read: {
        type: DataTypes.BOOLEAN, defaultValue: false,
    }, timestamp: {
        type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW,
    },
}, {
    timestamps: true,
});

module.exports = {Message};