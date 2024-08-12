const {DataTypes} = require("sequelize");
const {User} = require("../user");
const {mysql} = require("../../database");
const Group = mysql.define('Group', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true,
    }, name: {
        type: DataTypes.STRING, allowNull: false,
    }, description: {
        type: DataTypes.STRING,
    }, groupNumber: {
        type: DataTypes.STRING, allowNull: false, unique: true,
    }, createdBy: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: User, key: 'id',
        },
    }, avatar: {
        type: DataTypes.STRING, allowNull: true,
    },
}, {
    timestamps: true,
});

module.exports = {Group};