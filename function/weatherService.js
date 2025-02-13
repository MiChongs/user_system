const axios = require('axios');
const dayjs = require('./dayjs');
const { getIpLocation } = require('./ipLocation');
const RedisService = require('./redisService');
const SystemLogService = require('./systemLogService');
const cheerio = require('cheerio');

class WeatherService {
    // 缓存键前缀
    static CACHE_KEY = {
        WEATHER: 'weather:',
        AIR: 'air:',
        LOCATION: 'location:'
    };

    // 缓存时间(秒)
    static CACHE_TTL = {
        WEATHER: 900,   // 15分钟
        AIR: 1800,      // 30分钟
        LOCATION: 86400 // 24小时
    };

    /**
     * 通过IP获取天气数据
     * @param {string} ip IP地址
     * @returns {Promise<Object>} 天气数据
     */
    static async getWeatherByIp(ip) {
        try {
            // 获取IP地理位置
            const location = await getIpLocation(ip);
            if (!location.success) {
                throw new Error('无法获取IP地理位置');
            }

            // 判断是否为国外IP
            const isChina = location.data.country === 'CN';
            
            // 获取天气数据
            if (isChina) {
                const cityCode = await this.getCityCode(location.data.city);
                if (!cityCode) {
                    throw new Error('未找到对应的城市代码');
                }
                return await this.getChineseWeather(cityCode);
            } else {
                return await this.getInternationalWeather({
                    lat: location.data.latitude,
                    lon: location.data.longitude,
                    city: location.data.city,
                    country: location.data.country
                });
            }

        } catch (error) {
            console.error('获取IP天气数据失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * 获取天气数据
     * @param {string} cityCode 城市代码
     * @private
     */
    static async fetchWeatherData(cityCode) {
        try {
            // 抓取中国天气网数据
            const response = await axios.get(`http://www.weather.com.cn/weather/${cityCode}.shtml`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const $ = cheerio.load(response.data);

            // 解析实时天气
            const current = {
                temp: $('.tem').first().text().trim().replace('℃', ''),
                description: $('.wea').first().text().trim(),
                wind: {
                    direction: $('.win span').first().attr('title') || '',
                    power: $('.win span').eq(1).text().trim()
                },
                humidity: $('.shidu').text().trim().split(' ')[0].replace('湿度：', ''),
                updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
            };

            // 解析7天预报
            const forecast = [];
            $('.c7d li').each((i, el) => {
                forecast.push({
                    date: $(el).find('.tor').text().trim(),
                    dayTemp: $(el).find('.tem span').first().text().trim().replace('℃', ''),
                    nightTemp: $(el).find('.tem i').text().trim().replace('℃', ''),
                    weather: $(el).find('.wea').text().trim(),
                    wind: {
                        direction: $(el).find('.win span').first().attr('title') || '',
                        power: $(el).find('.win span').eq(1).text().trim()
                    }
                });
            });

            return {
                current,
                forecast,
                source: '中国天气网'
            };

        } catch (error) {
            console.error('获取天气数据失败:', error);
            throw error;
        }
    }

    /**
     * 获取空气质量数据
     * @param {string} cityCode 城市代码
     * @private
     */
    static async fetchAirQualityData(cityCode) {
        try {
            // 抓取空气质量数据
            const response = await axios.get(`http://www.weather.com.cn/air/?city=${cityCode}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const $ = cheerio.load(response.data);

            // 解析空气质量数据
            const airData = {
                aqi: $('.today .value').first().text().trim(),
                level: $('.today .level').first().text().trim(),
                quality: $('.today .quality').first().text().trim(),
                primary_pollutants: $('.today .primary_pollutant').first().text().trim(),
                pm25: {
                    value: $('.today .pm25 .value').first().text().trim(),
                    desc: $('.today .pm25 .desc').first().text().trim()
                },
                pm10: {
                    value: $('.today .pm10 .value').first().text().trim(),
                    desc: $('.today .pm10 .desc').first().text().trim()
                },
                no2: {
                    value: $('.today .no2 .value').first().text().trim(),
                    desc: $('.today .no2 .desc').first().text().trim()
                },
                so2: {
                    value: $('.today .so2 .value').first().text().trim(),
                    desc: $('.today .so2 .desc').first().text().trim()
                },
                co: {
                    value: $('.today .co .value').first().text().trim(),
                    desc: $('.today .co .desc').first().text().trim()
                },
                o3: {
                    value: $('.today .o3 .value').first().text().trim(),
                    desc: $('.today .o3 .desc').first().text().trim()
                },
                tips: $('.today .tips').text().trim(),
                updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
            };

            // 获取24小时预报
            const hourlyAir = [];
            $('.hourly .item').each((i, el) => {
                hourlyAir.push({
                    time: $(el).find('.time').text().trim(),
                    aqi: $(el).find('.aqi').text().trim(),
                    level: $(el).find('.level').text().trim(),
                    quality: $(el).find('.quality').text().trim()
                });
            });

            return {
                current: airData,
                hourly: hourlyAir,
                source: '中国天气网'
            };

        } catch (error) {
            console.error('获取空气质量数据失败:', error);
            return {
                aqi: '暂无数据',
                quality: '暂无数据',
                updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
            };
        }
    }

    /**
     * 整合天气和空气质量数据
     * @param {Object} weatherData 天气数据
     * @param {Object} airData 空气质量数据
     * @returns {Object} 整合后的数据
     */
    static combineWeatherAndAirData(weatherData, airData) {
        return {
            location: weatherData.location,
            current: {
                ...weatherData.current,
                air: airData.current
            },
            forecast: weatherData.forecast.map(day => ({
                ...day,
                air: airData.hourly.find(h => h.time.includes(day.date.split(' ')[0]))
            })),
            hourly: {
                weather: weatherData.hourly || [],
                air: airData.hourly
            },
            tips: airData.current.tips,
            updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            source: {
                weather: weatherData.source,
                air: airData.source
            }
        };
    }

    /**
     * 通过城市代码获取完整天气数据
     * @param {string} cityCode 城市代码
     * @returns {Promise<Object>} 天气数据
     */
    static async getWeatherByCityCode(cityCode, options = { isChina: true }) {
        try {
            const cacheKey = `${this.CACHE_KEY.WEATHER}${cityCode}`;
            const cached = await RedisService.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            if (options.isChina) {
                return await this.getChineseWeather(cityCode);
            } else {
                return await this.getInternationalWeather({
                    cityId: cityCode
                });
            }
        } catch (error) {
            console.error('获取天气数据失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * 获取城市代码
     * @param {string} cityName 城市名称
     * @returns {Promise<string|null>} 城市代码
     */
    static async getCityCode(cityName) {
        try {
            // 从本地城市代码表中查找
            const cityData = require('../data/city_codes.json');
            const city = cityData.find(item => 
                item.city.includes(cityName) || item.province.includes(cityName)
            );
            return city ? city.code : null;
        } catch (error) {
            console.error('获取城市代码失败:', error);
            return null;
        }
    }

    /**
     * 获取空气质量数据
     * @param {Object} location 位置信息
     * @returns {Promise<Object>} 空气质量数据
     */
    static async getAirQuality(location) {
        try {
            const { latitude, longitude } = location;
            
            // 检查缓存
            const cacheKey = `${this.CACHE_KEY.AIR}${latitude},${longitude}`;
            const cached = await RedisService.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }

            // 调用空气质量API
            const response = await axios.get(process.env.AIR_QUALITY_API_URL, {
                params: {
                    lat: latitude,
                    lon: longitude,
                    key: process.env.AIR_QUALITY_API_KEY
                }
            });

            const airData = {
                success: true,
                data: {
                    aqi: response.data.aqi,
                    pm25: response.data.pm25,
                    pm10: response.data.pm10,
                    o3: response.data.o3,
                    no2: response.data.no2,
                    so2: response.data.so2,
                    co: response.data.co,
                    updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
                }
            };

            // 缓存结果
            await RedisService.set(cacheKey, JSON.stringify(airData), this.CACHE_TTL.AIR);

            return airData;

        } catch (error) {
            console.error('获取空气质量数据失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * 获取指定位置的天气数据
     * @param {Object} location 位置信息
     * @private
     */
    static async getWeatherByLocation(location) {
        try {
            const { latitude, longitude, cityName, countryCode } = location;

            // 获取天气数据
            const response = await axios.get(process.env.WEATHER_API_URL, {
                params: {
                    lat: latitude,
                    lon: longitude,
                    key: process.env.WEATHER_API_KEY,
                    lang: 'zh'  // 支持多语言
                }
            });

            // 获取空气质量数据
            const airQuality = await this.getAirQuality(location);

            // 格式化返回数据
            return {
                success: true,
                data: {
                    location: {
                        city: cityName,
                        country: countryCode,
                        latitude,
                        longitude
                    },
                    current: {
                        temp: response.data.current.temp,
                        feels_like: response.data.current.feels_like,
                        humidity: response.data.current.humidity,
                        wind_speed: response.data.current.wind_speed,
                        wind_direction: response.data.current.wind_deg,
                        pressure: response.data.current.pressure,
                        description: response.data.current.weather[0].description,
                        icon: response.data.current.weather[0].icon
                    },
                    air_quality: airQuality.data,
                    forecast: response.data.daily.map(day => ({
                        date: dayjs.unix(day.dt).format('YYYY-MM-DD'),
                        temp_max: day.temp.max,
                        temp_min: day.temp.min,
                        humidity: day.humidity,
                        wind_speed: day.wind_speed,
                        description: day.weather[0].description,
                        icon: day.weather[0].icon
                    })),
                    hourly: response.data.hourly.slice(0, 24).map(hour => ({
                        time: dayjs.unix(hour.dt).format('HH:mm'),
                        temp: hour.temp,
                        humidity: hour.humidity,
                        description: hour.weather[0].description,
                        icon: hour.weather[0].icon
                    })),
                    updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
                }
            };

        } catch (error) {
            console.error('获取天气数据失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * 获取城市信息
     * @param {string} cityCode 城市代码
     * @private
     */
    static async getCityInfo(cityCode) {
        try {
            const response = await axios.get(process.env.CITY_API_URL, {
                params: {
                    code: cityCode,
                    key: process.env.CITY_API_KEY
                }
            });

            return response.data;
        } catch (error) {
            console.error('获取城市信息失败:', error);
            return null;
        }
    }

    /**
     * 获取国际天气数据
     * @param {Object} params 查询参数
     * @returns {Promise<Object>} 天气数据
     */
    static async getInternationalWeather(params) {
        try {
            const { lat, lon, city, country, cityId } = params;
            
            // 构建API请求参数
            const queryParams = cityId ? 
                { id: cityId } : 
                { lat, lon };

            // 获取天气数据
            const weatherResponse = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
                params: {
                    ...queryParams,
                    appid: process.env.OPENWEATHER_API_KEY,
                    units: 'metric',
                    lang: 'zh_cn'
                }
            });

            // 获取空气质量数据
            const airResponse = await axios.get('https://api.openweathermap.org/data/2.5/air_pollution', {
                params: {
                    lat: lat || weatherResponse.data.coord.lat,
                    lon: lon || weatherResponse.data.coord.lon,
                    appid: process.env.OPENWEATHER_API_KEY
                }
            });

            // 格式化数据
            const result = {
                success: true,
                data: {
                    location: {
                        city: city || weatherResponse.data.name,
                        country: country || weatherResponse.data.sys.country,
                        latitude: lat || weatherResponse.data.coord.lat,
                        longitude: lon || weatherResponse.data.coord.lon
                    },
                    current: {
                        temp: Math.round(weatherResponse.data.main.temp),
                        feels_like: Math.round(weatherResponse.data.main.feels_like),
                        humidity: weatherResponse.data.main.humidity,
                        pressure: weatherResponse.data.main.pressure,
                        wind: {
                            speed: weatherResponse.data.wind.speed,
                            deg: weatherResponse.data.wind.deg
                        },
                        description: weatherResponse.data.weather[0].description,
                        icon: weatherResponse.data.weather[0].icon
                    },
                    air: {
                        aqi: airResponse.data.list[0].main.aqi,
                        components: {
                            pm2_5: airResponse.data.list[0].components.pm2_5,
                            pm10: airResponse.data.list[0].components.pm10,
                            no2: airResponse.data.list[0].components.no2,
                            so2: airResponse.data.list[0].components.so2,
                            co: airResponse.data.list[0].components.co,
                            o3: airResponse.data.list[0].components.o3
                        }
                    },
                    updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                    source: 'OpenWeatherMap'
                }
            };

            // 缓存结果
            const cacheKey = `${this.CACHE_KEY.WEATHER}${cityId || `${lat},${lon}`}`;
            await RedisService.set(cacheKey, JSON.stringify(result), this.CACHE_TTL.WEATHER);

            return result;

        } catch (error) {
            console.error('获取国际天气数据失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * 获取中国天气数据
     * @param {string} cityCode 城市代码
     * @returns {Promise<Object>} 天气数据
     */
    static async getChineseWeather(cityCode) {
        try {
            const [weatherData, airData] = await Promise.all([
                this.fetchWeatherData(cityCode),
                this.fetchAirQualityData(cityCode)
            ]);

            const combinedData = this.combineWeatherAndAirData(weatherData, airData);
            const result = {
                success: true,
                data: combinedData
            };

            await RedisService.set(this.CACHE_KEY.WEATHER + cityCode, JSON.stringify(result), this.CACHE_TTL.WEATHER);
            return result;

        } catch (error) {
            console.error('获取中国天气数据失败:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }
}

module.exports = WeatherService; 