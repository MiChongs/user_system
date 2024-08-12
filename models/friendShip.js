const {DataTypes} = require("sequelize");
const {User} = require("./user");
const {mysql} = require("../database");
const Friendship = mysql.define('Friendship', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true,
    }, userId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: User, key: 'id',
        },
    }, friendId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: User, key: 'id',
        },
    }, status: {
        type: DataTypes.ENUM, values: ['pending', 'accepted', 'rejected'], allowNull: false, defaultValue: 'pending', // pending, accepted, rejected
    },
}, {
    timestamps: true,
});

module.exports = {
    Friendship,
};