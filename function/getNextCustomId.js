// 获取下一个自增ID
const {User} = require("../models/user");
const {mysql} = require("../database");
const {Counter} = require("../models/counter");
function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// 获取下一个自定义ID的函数
async function getNextCustomId(appId, userId) {
    console.log(`getNextCustomId: appId=${appId}, userId=${userId}`);

    const MAX_ATTEMPTS = 10000; // 设置一个合理的最大尝试次数
    let attempts = 0;
    let nextCustomId = 10000;

    // 使用一个事务来确保原子性
    await mysql.transaction(async (t) => {
        let counter = await Counter.findOne({
            where: { bindAppid: appId, bindUserid: userId },
            lock: true, // 锁定行，防止并发问题
            transaction: t
        });

        if (!counter) {
            // 如果计数器不存在，创建一个新的
            counter = await Counter.create({
                name: `${appId}-${userId}`,
                bindAppid: appId,
                bindUserid: userId,
                value: nextCustomId
            }, { transaction: t });
        } else {
            nextCustomId = counter.value + 1;
            await counter.update({ value: nextCustomId }, { transaction: t });
        }

    });

    // Batch check for unique IDs
    let isUnique = false;
    while (!isUnique && attempts < MAX_ATTEMPTS) {
        const existingUser = await User.findOne({ where: { appid: appId, customId: nextCustomId.toString() } });
        if (!existingUser) {
            isUnique = true;
        } else {
            nextCustomId++;
            attempts++;
        }
    }

    if (attempts >= MAX_ATTEMPTS) {
        let randomString;
        do {
            const length = Math.floor(Math.random() * (11 - 5 + 1)) + 5; // 随机长度在5到11之间
            randomString = generateRandomString(length);
        } while (await User.findOne({ where: { appid: appId, customId: randomString } }));

        return randomString;
    }

    await Counter.update({ value: nextCustomId }, { where: { bindAppid: appId, bindUserid: userId } });
    return nextCustomId.toString();
}


/*

// 生成随机字符串的函数
function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function getNextCustomId() {
    const MAX_ATTEMPTS = 10000; // 设置一个合理的最大尝试次数
    let attempts = 0;

    let lastUser = await User.findOne({ order: [['id', 'DESC']] });
    let nextCustomId = 10000;

    if (lastUser && lastUser.customId.match(/^\d+$/)) {
        const lastCustomId = parseInt(lastUser.customId, 10);
        nextCustomId = (lastCustomId >= 10000) ? lastCustomId + 1 : 10000;
    }

    // 确保生成的ID是唯一的
    while (await User.findOne({ where: { customId: nextCustomId.toString() } })) {
        nextCustomId++;
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
            // 生成一个随机字符串
            let randomString;
            do {
                const length = Math.floor(Math.random() * (11 - 5 + 1)) + 5; // 随机长度在5到11之间
                randomString = generateRandomString(length);
            } while (await User.findOne({ where: { customId: randomString } }));

            return randomString;
        }
    }

    return nextCustomId.toString();
}
*/

module.exports = {
    getNextCustomId,
};