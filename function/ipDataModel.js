// ipDataModel.js

class IPDataModel {
    constructor(data) {
        this.area_code = data.area_code;
        this.city = data.city;
        this.city_id = data.city_id;
        this.continent = data.continent;
        this.continent_code = data.continent_code;
        this.country_id = data.country_id;
        this.isp = data.isp;
        this.latitude = data.latitude;
        this.longitude = data.longitude;
        this.nation = data.nation;
        this.nation_code = data.nation_code;
        this.province = data.province;
        this.province_id = data.province_id;
        this.subdivision_1_iso_code = data.subdivision_1_iso_code;
        this.subdivision_1_name = data.subdivision_1_name;
        this.subdivision_2_iso_code = data.subdivision_2_iso_code;
        this.subdivision_2_name = data.subdivision_2_name;
        this.time_zone = data.time_zone;
    }

    toJSON() {
        return JSON.stringify(this, null, 2);
    }
}

module.exports = IPDataModel;