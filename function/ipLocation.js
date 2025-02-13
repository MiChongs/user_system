const axios = require("axios");
const RedisService = require("./redisService");
const iconv = require("iconv-lite");

/**
 * 获取IP地理位置信息
 * @param {string} ip IP地址
 * @returns {Promise<Object>} 地理位置信息
 */
async function getIpLocation(ip) {
    // 检查缓存
    const cacheKey = `ip_location:${ip}`;
    const cachedData = await RedisService.get(cacheKey);
    console.log("cachedData:", cachedData);
    if (cachedData) {
        return cachedData;
    }

    // 先检查是否为中国IP
    const isChineseIp = await checkIsChineseIp(ip);

    console.log("isChineseIp:", isChineseIp);
    // 根据IP类型选择不同的API提供商
    const providers = isChineseIp ?
        [
            tryMiRen,         // 米人网络IP地址查询
            tryChunZhenApi,    // 纯真IP库公共API
            tryPconlineApi,    // 太平洋网络IP地址查询
            tryTaobaoApi,      // 淘宝IP地址库
        ] : [
            tryIpApiCom,       // ip-api.com 免费版 (国外IP优先)
            trySpeedCf,        // CloudFlare Speed Test API
            tryIpWhoisApi      // ipwhois.app 免费API
        ];

    for (const provider of providers) {
        try {
            const result = await provider(ip);
            if (result) {
                await RedisService.set(
                    cacheKey,
                    JSON.stringify(result),
                    6,
                    RedisService.TimeUnit.HOURS
                );
                return result;
            }
        } catch (error) {
            console.error(`IP查询失败 (${provider.name}):`, error);
            continue;
        }
    }

    return getDefaultLocation(ip);
}

/**
 * 检查是否为中国IP
 * @param {string} ip IP地址
 * @returns {Promise<boolean>} 是否为中国IP
 */
async function checkIsChineseIp(ip) {
    try {
        // 使用太平洋网络的IP接口
        const response = await axios.get(
            `https://api.mir6.com/api/ip?ip=${ip}&type=json`,
            {
                timeout: 3000,
            }
        );

        const result = response.data.data;

        // 检查响应数据的完整性
        if (!result || !result.countryCode) {
            console.warn('IP查询响应数据不完整:', result);
            return false;
        }

        // 判断是否为中国IP (包含港澳台)
        return result.countryCode.includes('CN') ||
            result.countryCode.includes('HK') ||
            result.countryCode.includes('澳门') ||
            result.countryCode.includes('TW');

    } catch (error) {
        // 详细的错误日志
        console.error('检查中国IP失败:', {
            ip,
            error: error.message,
            response: error.response?.data
        });

        // 发生错误时返回 false
        return false;
    }
}

/**
 * 太平洋网络IP地址查询
 */
async function tryPconlineApi(ip) {
    const response = await axios.get(
        `http://whois.pconline.com.cn/ipJson.jsp?ip=${ip}&json=true`,
        {
            responseType: "arraybuffer",
        }
    );

    // 处理GBK编码
    const data = JSON.parse(iconv.decode(response.data, "gbk"));

    if (data && data.cityCode) {
        return {
            ip: ip,
            country: "中国",
            region: data.pro || "",
            city: data.city || "",
            district: "",
            location: `中国 ${data.pro} ${data.city}`.trim(),
            coordinates: null,
            timezone: "Asia/Shanghai",
            isp: formatChineseIsp(data.addr),
            network: {
                type: detectNetworkType(data.addr),
                organization: data.addr,
                detail: data.addr,
            },
        };
    }
    throw new Error("Pconline API request failed");
}

/**
 * 淘宝IP地址库
 */
async function tryTaobaoApi(ip) {
    const response = await axios.get(
        `http://ip.taobao.com/outGetIpInfo?ip=${ip}&accessKey=alibaba-inc`
    );

    if (response.data && response.data.code === 0) {
        const data = response.data.data;
        return {
            ip: ip,
            country: data.country || "中国",
            region: data.region || "",
            city: data.city || "",
            district: data.area || "",
            location: [data.country, data.region, data.city, data.area]
                .filter(Boolean)
                .join(" "),
            coordinates: null,
            timezone: "Asia/Shanghai",
            isp: formatChineseIsp(data.isp),
            network: {
                type: detectNetworkType(data.isp),
                organization: data.isp,
                detail: data.isp_desc || "",
            },
        };
    }
    throw new Error("Taobao API request failed");
}

/**
 * ip-api.com 免费版
 */
async function tryIpApiCom(ip) {
    const response = await axios.get(
        `http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,message,country,regionName,city,district,lat,lon,timezone,isp,org,as,mobile,proxy,hosting`
    );

    if (response.data && response.data.status === "success") {
        const data = response.data;
        return {
            ip: ip,
            country: data.country || "",
            region: data.regionName || "",
            city: data.city || "",
            district: data.district || "",
            location: formatLocation({
                country: data.country,
                region: data.regionName,
                city: data.city,
                district: data.district,
            }),
            coordinates: {
                latitude: data.lat,
                longitude: data.lon,
            },
            timezone: data.timezone,
            isp: formatChineseIsp(data.isp),
            network: {
                type: detectNetworkType(data.isp),
                asn: data.as,
                organization: data.org,
                mobile: data.mobile,
                proxy: data.proxy,
                hosting: data.hosting,
            },
        };
    }
    throw new Error("IpApi request failed");
}

/**
 * 纯真IP库公共API
 */
async function tryChunZhenApi(ip) {
    const response = await axios.get(`https://freeapi.ipip.net/ip/${ip}`);

    if (Array.isArray(response.data)) {
        const [country, region, city, , isp] = response.data;
        return {
            ip: ip,
            country: country || "",
            region: region || "",
            city: city || "",
            district: "",
            location: [country, region, city].filter(Boolean).join(" "),
            coordinates: null,
            timezone: "Asia/Shanghai",
            isp: formatChineseIsp(isp),
            network: {
                type: detectNetworkType(isp),
                organization: isp,
                detail: "",
            },
        };
    }
    throw new Error("ChunZhen API request failed");
}

async function tryMiRen(ip) {
    const response = await axios.get(`https://api.mir6.com/api/ip?ip=${ip}&type=json`);

    if (response.data && response.data.code === 200) {
        const data = response.data.data;
        return {
            ip: ip,
            country: data.country || "中国",
            region: data.province || "",
            city: data.city || "",
            district: data.districts || "",
            location: `中国 ${data.province} ${data.city}`.trim(),
            coordinates: null,
            timezone: "Asia/Shanghai",
            isp: formatChineseIsp(data.isp),
            network: {
                type: detectNetworkType(data.isp),
                organization: data.isp,
                detail: data.isp_desc || "",
            },
        };
    }

    throw new Error("MiRen API request failed");
}

/**
 * CloudFlare Speed Test API
 */
async function trySpeedCf(ip) {
    const response = await axios.get(
        `https://speed.cloudflare.com/locations/ip/${ip}`
    );

    if (response.data) {
        const data = response.data;
        return {
            ip: ip,
            country: data.country || "",
            region: data.region || "",
            city: data.city || "",
            district: "",
            location: formatLocation(data),
            coordinates: {
                latitude: data.latitude,
                longitude: data.longitude,
            },
            timezone: data.timezone,
            isp: data.asOrganization,
            network: {
                type: "OTHER",
                asn: `AS${data.asn}`,
                organization: data.asOrganization,
            },
        };
    }
    throw new Error("CloudFlare API request failed");
}

/**
 * 格式化ISP信息 - 增加更多中国ISP
 */
function formatChineseIsp(isp) {
    if (!isp) return "";

    const ispMap = {
        中国电信: "电信",
        电信: "电信",
        "China Telecom": "电信",
        CHINANET: "电信",
        中国联通: "联通",
        联通: "联通",
        "China Unicom": "联通",
        UNICOM: "联通",
        中国移动: "移动",
        移动: "移动",
        "China Mobile": "移动",
        CMCC: "移动",
        中国广电: "广电",
        广电: "广电",
        CBN: "广电",
        中国铁通: "铁通",
        铁通: "铁通",
        CRTC: "铁通",
        教育网: "教育网",
        CERNET: "教育网",
        科技网: "科技网",
        CSTNET: "科技网",
        鹏博士: "鹏博士",
        "Dr.Peng": "鹏博士",
        广电网: "广电",
        长城宽带: "长城宽带",
        广电网络: "广电",
    };

    for (const [key, value] of Object.entries(ispMap)) {
        if (isp.includes(key)) {
            return value;
        }
    }
    return isp;
}

/**
 * 检测网络类型
 */
function detectNetworkType(isp) {
    if (!isp) return "OTHER";

    if (isp.includes("IDC") || isp.includes("数据中心")) return "IDC";
    if (isp.includes("教育网") || isp.includes("CERNET")) return "EDU";
    if (isp.includes("移动") || isp.includes("Mobile")) return "CMCC";
    if (isp.includes("联通") || isp.includes("Unicom")) return "CUCC";
    if (isp.includes("电信") || isp.includes("Telecom")) return "CTCC";
    if (isp.includes("广电") || isp.includes("Broadcasting")) return "CBN";
    return "OTHER";
}

/**
 * 格式化位置信息
 */
function formatLocation(data) {
    const parts = [data.country, data.region, data.city, data.district].filter(
        Boolean
    );

    return parts.join(" ");
}

/**
 * ipwhois.app API - 免费全球IP数据
 */
async function tryIpWhoisApi(ip) {
    const response = await axios.get(
        `https://ipwhois.app/json/${ip}?lang=zh`
    );

    if (response.data && !response.data.success === false) {
        const data = response.data;
        return {
            ip: ip,
            country: data.country || "",
            region: data.region || "",
            city: data.city || "",
            district: "",
            location: [data.country, data.region, data.city]
                .filter(Boolean)
                .join(" "),
            coordinates: {
                latitude: data.latitude,
                longitude: data.longitude,
            },
            timezone: data.timezone,
            isp: data.isp || "",
            network: {
                type: detectNetworkType(data.isp),
                organization: data.org || data.isp,
                detail: `${data.connection_type || ""} ${data.asn || ""}`.trim(),
            },
        };
    }
    throw new Error("IpWhois API request failed");
}

/**
 * 获取默认位置信息
 */
function getDefaultLocation(ip) {
    return {
        ip: ip,
        country: "",
        region: "",
        city: "",
        district: "",
        location: "",
        coordinates: null,
        timezone: "",
        isp: "",
        network: {
            type: "",
            organization: "",
            detail: "",
        },
    };
}

module.exports = {getIpLocation};
