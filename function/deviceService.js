const UAParser = require('ua-parser-js');
const RedisService = require('./redisService');
const path = require('path');
const fs = require('fs').promises;
const { DeviceBrand, DeviceModel } = require('../models/deviceModel');
const { Op } = require('sequelize');

class DeviceService {
    static DEVICE_CACHE_KEY = 'device_db:';
    static CACHE_DURATION = 7 * 24 * 60 * 60; // 7天缓存
    static deviceDatabase = null;

    /**
     * 初始化设备数据库
     */
    static async initDeviceDatabase() {
        if (this.deviceDatabase) return;

        try {
            const dbPath = path.join(__dirname, '../data/device_db.json');
            const data = await fs.readFile(dbPath, 'utf8');
            this.deviceDatabase = JSON.parse(data);
            console.log('设备数据库加载成功');
        } catch (error) {
            console.error('设备数据库加载失败:', error);
            // 使用基础数据库作为后备
            this.deviceDatabase = {
                brands: {
                    'xiaomi': {
                        name: 'Xiaomi',
                        models: {
                            'mi 10': { marketing_name: 'Mi 10', type: 'smartphone' },
                            'redmi note 10': { marketing_name: 'Redmi Note 10', type: 'smartphone' }
                        }
                    },
                    'huawei': {
                        name: 'Huawei',
                        models: {
                            'p40': { marketing_name: 'P40', type: 'smartphone' },
                            'mate 40': { marketing_name: 'Mate 40', type: 'smartphone' }
                        }
                    }
                    // 添加更多基础品牌和型号...
                }
            };
        }
    }

    /**
     * 解析 User-Agent
     */
    static parseUserAgent(userAgent) {
        if (!userAgent) return this.getDefaultDeviceInfo();
        
        const parser = new UAParser(userAgent);
        return {
            browser: parser.getBrowser(),
            os: parser.getOS(),
            device: parser.getDevice(),
            ua: userAgent
        };
    }

    /**
     * 从数据库获取设备信息
     */
    static async getDeviceFromDB(model) {
        if (!model) return null;

        const normalizedModel = this.normalizeModel(model);
        
        // 先尝试精确匹配
        let deviceModel = await DeviceModel.findByIdentifier(normalizedModel);
        
        if (!deviceModel) {
            // 尝试模糊匹配
            deviceModel = await DeviceModel.findOne({
                where: {
                    [Op.or]: [
                        { name: { [Op.like]: `%${normalizedModel}%` } },
                        { marketing_name: { [Op.like]: `%${normalizedModel}%` } },
                        { model_identifier: { [Op.like]: `%${normalizedModel}%` } }
                    ],
                    status: true
                },
                include: [{
                    model: DeviceBrand,
                    as: 'brand',
                    where: { status: true }
                }]
            });
        }

        if (deviceModel) {
            return {
                brand: deviceModel.brand.name,
                marketing_name: deviceModel.marketing_name || deviceModel.name,
                type: deviceModel.type,
                release_date: deviceModel.release_date
            };
        }

        return null;
    }

    /**
     * 获取设备详细信息
     */
    static async getDeviceInfo(model) {
        if (!model) return null;

        // 先从缓存获取
        const cacheKey = `${this.DEVICE_CACHE_KEY}${model.toLowerCase()}`;
        const cachedData = await RedisService.get(cacheKey);
        if (cachedData) {
            return JSON.parse(cachedData);
        }

        // 从数据库获取
        const deviceInfo = await this.getDeviceFromDB(model);
        if (deviceInfo) {
            // 缓存结果
            await RedisService.set(cacheKey, JSON.stringify(deviceInfo));
            await RedisService.expire(cacheKey, this.CACHE_DURATION);
            return deviceInfo;
        }

        // 如果数据库中没有，回退到本地JSON数据库
        return await super.getDeviceInfo(model);
    }

    /**
     * 规范化设备信息
     */
    static async normalizeDeviceInfo(model, userAgent) {
        const uaInfo = this.parseUserAgent(userAgent);
        const deviceInfo = await this.getDeviceInfo(model);

        return {
            device_type: this.getDeviceType(uaInfo, deviceInfo),
            device_brand: this.normalizeBrand(deviceInfo?.brand || uaInfo.device.vendor),
            device_model: this.normalizeModel(model, deviceInfo),
            os_type: uaInfo.os.name || 'Unknown',
            os_version: uaInfo.os.version || 'Unknown',
            browser_type: uaInfo.browser.name || 'Unknown',
            browser_version: uaInfo.browser.version || 'Unknown'
        };
    }

    /**
     * 获取设备类型
     */
    static getDeviceType(uaInfo, deviceInfo) {
        if (deviceInfo?.type) return deviceInfo.type;
        if (uaInfo.device.type) return uaInfo.device.type;

        const ua = uaInfo.ua?.toLowerCase() || '';
        if (ua.includes('mobile')) return 'smartphone';
        if (ua.includes('tablet')) return 'tablet';
        if (ua.includes('tv')) return 'tv';
        return 'desktop';
    }

    /**
     * 规范化品牌名称
     */
    static normalizeBrand(brand) {
        if (!brand) return 'Unknown';

        const brandMap = {
            'xiaomi': 'Xiaomi',
            'redmi': 'Xiaomi',
            'huawei': 'Huawei',
            'honor': 'Honor',
            'oppo': 'OPPO',
            'vivo': 'vivo',
            'samsung': 'Samsung',
            'apple': 'Apple',
            'iphone': 'Apple',
            'oneplus': 'OnePlus',
            'realme': 'realme',
            'meizu': 'Meizu',
            'zte': 'ZTE',
            'lenovo': 'Lenovo',
            'nokia': 'Nokia',
            'sony': 'Sony',
            'lg': 'LG',
            'asus': 'ASUS',
            'motorola': 'Motorola',
            'google': 'Google'
        };

        const normalizedBrand = brand.toLowerCase();
        return brandMap[normalizedBrand] || brand;
    }

    /**
     * 规范化型号名称
     */
    static normalizeModel(model, deviceInfo) {
        if (deviceInfo?.marketing_name) return deviceInfo.marketing_name;
        if (!model) return 'Unknown';

        return model
            .replace(/^(model|sm-|sph-|gt-|sch-)/i, '')
            .replace(/build.*/i, '')
            .replace(/[_\s]+/g, ' ')
            .trim();
    }

    /**
     * 获取默认设备信息
     */
    static getDefaultDeviceInfo() {
        return {
            browser: { name: 'Unknown', version: 'Unknown' },
            os: { name: 'Unknown', version: 'Unknown' },
            device: { type: 'Unknown', vendor: 'Unknown', model: 'Unknown' },
            ua: ''
        };
    }
}

module.exports = DeviceService; 