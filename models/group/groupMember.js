const {DataTypes} = require("sequelize");
const {Group} = require("./group");
const {User} = require("../user");
const {mysql} = require("../../database");

const GroupMember = mysql.define('GroupMember', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    groupId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Group,
            key: 'id',
        },
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id',
        },
    },
    role: {
        type: DataTypes.ENUM,
        allowNull: false,
        values: ['member', 'admin', 'owner'],
        defaultValue: 'member', // member, admin, owner
    },
    title: {
        type: DataTypes.STRING,
        allowNull: true, // 支持自定义头衔
    },
}, {
    timestamps: true,
});

module.exports = {GroupMember};