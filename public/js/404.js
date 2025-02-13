// Matrix rain effect
const canvas = document.getElementById("matrix");
const ctx = canvas.getContext("2d");

const chars = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789";
const fontSize = 14;
let columns;
let drops;

function initMatrix() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  columns = Math.floor(canvas.width / fontSize);
  drops = [];

  for (let i = 0; i < columns; i++) {
    drops[i] = {
      x: i * fontSize,
      y: Math.random() * canvas.height,
      speed: Math.random() * 2 + 3,
      lastUpdate: 0,
    };
  }
}

function drawMatrix() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#0f0";
  ctx.font = fontSize + "px monospace";

  const now = Date.now();
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];

    const char = chars[Math.floor(Math.random() * chars.length)];
    ctx.fillStyle = "#0f0";
    ctx.fillText(char, drop.x, drop.y);

    ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
    ctx.fillText(char, drop.x, drop.y);

    if (now - drop.lastUpdate > 50) {
      drop.y += drop.speed;
      drop.lastUpdate = now;

      if (drop.y > canvas.height) {
        drop.y = -fontSize;
        drop.speed = Math.random() * 2 + 3;
      }
    }
  }

  if (Math.random() < 0.05 && drops.length < columns) {
    const x = Math.floor(Math.random() * columns) * fontSize;
    drops.push({
      x: x,
      y: -fontSize,
      speed: Math.random() * 2 + 3,
      lastUpdate: now,
    });
  }
}

async function getLocation() {
  // 检查浏览器是否支持地理定位
  if (!navigator.geolocation) {
    document.getElementById("location").textContent =
      "您的浏览器不支持地理定位";
    return;
  }

  try {
    // 获取地理位置
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reject(new Error("请允许获取位置信息以显示天气"));
              break;
            case error.POSITION_UNAVAILABLE:
              reject(new Error("位置信息不可用"));
              break;
            case error.TIMEOUT:
              reject(new Error("获取位置信息超时"));
              break;
            default:
              reject(new Error("获取位置信息失败"));
          }
        },
        {
          enableHighAccuracy: false, // 不需要高精度
          timeout: 5000, // 5秒超时
          maximumAge: 300000, // 5分钟内的缓存位置有效
        }
      );
    });

    // 使用服务器端的 /geocode 接口进行逆地理编码
    const { latitude, longitude } = position.coords;
    const geocodeResponse = await fetch(
      `/geocode?longitude=${longitude}&latitude=${latitude}`
    );
    const geocodeData = await geocodeResponse.json();

    if (
      geocodeData.status === "1" &&
      geocodeData.regeocode &&
      geocodeData.regeocode.addressComponent
    ) {
      const adcode = geocodeData.regeocode.addressComponent.adcode;
      const weatherData = await getWeather(adcode);
      updateWeatherDisplay(
        weatherData,
        geocodeData.regeocode.formatted_address
      );
    } else {
      throw new Error("地理编码失败");
    }
  } catch (error) {
    console.error("Error getting location:", error);
    document.getElementById("location").textContent =
      error.message || "无法获取位置";
    document.getElementById("weather").textContent = "无法获取天气信息";
    document.getElementById("temperature").textContent = "";
  }
}

async function getWeather(cityCode) {
  try {
    const response = await fetch(`/weather?cityCode=${cityCode}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching weather:", error);
    return null;
  }
}

function updateWeatherDisplay(data, address) {
  if (!data || !data.lives || !data.lives[0]) {
    document.getElementById("weather").textContent = "天气数据获取失败";
    return;
  }

  const weather = data.lives[0];
  document.getElementById("location").textContent = `位置: ${
    address || weather.city
  }`;
  document.getElementById("weather").textContent = `天气: ${weather.weather}`;
  document.getElementById(
    "temperature"
  ).textContent = `温度: ${weather.temperature}°C`;
}

// FingerprintJS initialization and browser info detection
async function initFingerprint() {
  try {
    console.log("FingerprintJS:", typeof FingerprintJS);
    function getLocalIP(callback) {
      var pc = new RTCPeerConnection({
        iceServers: [],
      });
      pc.createDataChannel("");
      pc.createOffer().then((offer) => pc.setLocalDescription(offer));
      pc.onicecandidate = (event) => {
        if (event && event.candidate && event.candidate.candidate) {
          const ipMatch = /([0-9]{1,3}(.[0-9]{1,3}){3})/.exec(
            event.candidate.candidate
          );
          if (ipMatch) {
            callback(ipMatch[1]);
            pc.onicecandidate = null; // prevent multiple callbacks
          }
        }
      };
    }
    getLocalIP((ip) => console.log(`Local IP address is ${ip}`));
    // 获取IP地址
    const ipResponse = await fetch("https://api.ipify.org?format=json");
    const ipData = await ipResponse.json();
    const ipAddress = ipData.ip;
    document.getElementById("ip-address").textContent = `IP: ${ipData.ip}`;

    // 初始化 FingerprintJS
    const fpPromise = FingerprintJS.load();
    fpPromise
      .then((fp) => fp.get())
      .then((result) => {
        // 设置访客ID
        document.getElementById(
          "visitor-id"
        ).textContent = `访客ID: ${result.visitorId}`;

        // 获取系统信息
        const visitorId = result.visitorId;
        const userAgent = navigator.userAgent;
        let os = "未知";
        if (userAgent.indexOf("Win") !== -1) os = "Windows";
        else if (userAgent.indexOf("Mac") !== -1) os = "MacOS";
        else if (userAgent.indexOf("Linux") !== -1) os = "Linux";
        else if (userAgent.indexOf("Android") !== -1) os = "Android";
        else if (userAgent.indexOf("iOS") !== -1) os = "iOS";

        document.getElementById("os-info").textContent = `系统: ${os}`;

        // 获取浏览器信息
        let browser = "未知";
        if (userAgent.indexOf("Chrome") !== -1) browser = "Chrome";
        else if (userAgent.indexOf("Firefox") !== -1) browser = "Firefox";
        else if (userAgent.indexOf("Safari") !== -1) browser = "Safari";
        else if (userAgent.indexOf("Edge") !== -1) browser = "Edge";
        else if (userAgent.indexOf("Opera") !== -1) browser = "Opera";

        const browserVersion = userAgent.match(
          new RegExp(`${browser}\\/([0-9.]+)`)
        );
        const version = browserVersion ? browserVersion[1] : "未知版本";
        document.getElementById(
          "browser-info"
        ).textContent = `浏览器: ${browser} ${version}`;

        // 构建日志数据
        const logData = {
          visitorId,
          ipAddress,
          os,
          browser: `${browser} ${version}`,
        };

        // 发送日志数据到服务器
        fetch("/logVisitorInfo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(logData),
        });
      })
      .catch((error) => {
        console.error("Error getting fingerprint:", error);
        document.getElementById("visitor-id").textContent = "无法获取访客ID";
        document.getElementById("ip-address").textContent = "无法获取IP地址";
        document.getElementById("os-info").textContent = "无法获取系统信息";
        document.getElementById("browser-info").textContent =
          "无法获取浏览器信息";
      });
  } catch (error) {
    console.error("Error getting fingerprint:", error);
    document.getElementById("visitor-id").textContent = "无法获取访客ID";
    document.getElementById("ip-address").textContent = "无法获取IP地址";
    document.getElementById("os-info").textContent = "无法获取系统信息";
    document.getElementById("browser-info").textContent = "无法获取浏览器信息";
  }
}

// Initialize everything
initMatrix();
window.addEventListener("resize", initMatrix);

function animate() {
  drawMatrix();
  requestAnimationFrame(animate);
}
animate();

// Initialize weather display
getLocation();
setInterval(getLocation, 30 * 60 * 1000);

// Initialize FingerprintJS
window.addEventListener("load", () => {
  initFingerprint();
});
