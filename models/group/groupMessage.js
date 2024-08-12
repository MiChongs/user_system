const {DataTypes} = require("sequelize");
const {mysql} = require("../../database");
const {User} = require("../user");
const {Group} = require("./group");
const GroupMessage = mysql.define('GroupMessage', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true,
    }, groupId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: Group, key: 'id',
        },
    }, senderId: {
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

module.exports = {
    GroupMessage,
};