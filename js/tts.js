// 奶家村 · 语音朗读适配层（支持 BYOK：访客自带 Breeze API Key）
//
// 两种模式：
//   1. provider = "browser" —— 浏览器内置语音，零成本、无需任何配置
//   2. provider = "breeze"  —— 调用 Breeze TTS，Key 由访客在「语音设置」里自己填
//
// 安全说明：
//   - Key 只存在访客自己的浏览器（localStorage / sessionStorage），本站不上传、不记录。
//   - Breeze 未开放 CORS，必须经过 server/tts-worker.js 这个「只转发不存储」的代理。

(function () {
  "use strict";

  var CONFIG = {
    provider: "browser",   // "browser" | "breeze"
    endpoint: "",          // 站长部署的透传代理地址，例如 https://naijiacun-tts.xxx.workers.dev
    apiKey: "",            // 访客自己填的 Key（brz_ 开头）
    voices: {},            // 人物 id → 音色 id
    defaultVoiceId: ""     // 默认音色 id
  };

  var audioEl = null;
  var currentId = null;
  var listeners = [];

  function hash(str) {
    var h = 0;
    for (var i = 0; i < String(str).length; i++) {
      h = (h * 31 + String(str).charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function zhVoices() {
    if (!("speechSynthesis" in window)) return [];
    return window.speechSynthesis.getVoices().filter(function (v) {
      return /^zh/i.test(v.lang) || /Chinese|中文|普通话|Xiaoxiao|Yunxi|Huihui/i.test(v.name);
    });
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(currentId); } catch (e) { /* 忽略 */ }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    fn(currentId);
  }

  function stop() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (audioEl) {
      try { audioEl.pause(); } catch (e) { /* 忽略 */ }
      audioEl = null;
    }
    currentId = null;
    emit();
  }

  function canUseBreeze() {
    return CONFIG.provider === "breeze" && CONFIG.endpoint && CONFIG.apiKey;
  }

  function speakBrowser(text, id) {
    if (!("speechSynthesis" in window)) {
      console.warn("[TTS] 当前浏览器不支持语音朗读");
      return;
    }
    window.speechSynthesis.cancel();

    var u = new SpeechSynthesisUtterance(text);
    var list = zhVoices();
    var h = hash(id || text);

    if (list.length) u.voice = list[h % list.length];
    u.lang = "zh-CN";
    u.rate = 0.94 + (h % 6) * 0.02;
    u.pitch = 0.9 + ((h >> 3) % 6) * 0.04;

    u.onend = function () { currentId = null; emit(); };
    u.onerror = function () { currentId = null; emit(); };

    currentId = id;
    emit();
    window.speechSynthesis.speak(u);
  }

  function describeError(status, payload) {
    if (status === 401) return "API Key 无效或已被禁用，请检查后重新填写";
    if (status === 402) return "这个 Key 的额度已用完";
    if (status === 403) return "这个 Key 没有访问该音色的权限";
    if (status === 404) return "音色 ID 不存在，请先到 Breeze 控制台复制正确的 voice_id";
    if (status === 429) return "请求太频繁，稍等一下再试";
    if (payload && payload.detail) return String(payload.detail).slice(0, 160);
    return "合成失败（HTTP " + status + "）";
  }

  function speakBreeze(text, id) {
    var voiceId = CONFIG.voices[id] || CONFIG.defaultVoiceId;
    if (!voiceId) {
      notify("还没有选择音色，先用浏览器语音顶上");
      return speakBrowser(text, id);
    }

    currentId = id;
    emit();

    return fetch(CONFIG.endpoint.replace(/\/$/, "") + "/api/tts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-breeze-key": CONFIG.apiKey
      },
      body: JSON.stringify({ text: text, voiceId: voiceId })
    })
      .then(function (res) {
        var type = res.headers.get("content-type") || "";
        if (!res.ok || type.indexOf("application/json") !== -1) {
          return res.json()
            .catch(function () { return {}; })
            .then(function (payload) {
              throw new Error(describeError(res.status, payload));
            });
        }
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        audioEl = new Audio(url);
        audioEl.onended = function () {
          URL.revokeObjectURL(url);
          currentId = null;
          emit();
        };
        audioEl.onerror = function () {
          notify("音频播放失败，请重试");
          currentId = null;
          emit();
        };
        return audioEl.play().catch(function () {
          notify("浏览器拦截了自动播放，请再点一次");
          currentId = null;
          emit();
        });
      })
      .catch(function (err) {
        notify(err.message || "语音合成失败");
        currentId = null;
        emit();
        speakBrowser(text, id);
      });
  }

  function notify(msg) {
    if (typeof window !== "undefined" && typeof window.showTTSNotice === "function") {
      window.showTTSNotice(msg);
    } else {
      console.warn("[TTS]", msg);
    }
  }

  function speak(text, id) {
    stop();
    if (!text) return;
    if (canUseBreeze()) return speakBreeze(text, id);
    if (CONFIG.provider === "breeze") {
      notify("未填写 API Key，暂时使用浏览器语音");
    }
    return speakBrowser(text, id);
  }

  // 校验 Key：走代理的 /api/check（内部调用 /v1/api-keys/current）
  function checkKey(endpoint, key) {
    return fetch(endpoint.replace(/\/$/, "") + "/api/check", {
      headers: { "x-breeze-key": key }
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data || data.ok === false) {
          throw new Error(describeError(res.status, data));
        }
        return data;
      });
    });
  }

  // 拉取访客账号下的音色列表
  function listVoices(endpoint, key) {
    return fetch(endpoint.replace(/\/$/, "") + "/api/voices", {
      headers: { "x-breeze-key": key }
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data) throw new Error(describeError(res.status, data));
        var arr = data.voices || data.items || data.data || [];
        return arr.map(function (v) {
          return {
            id: v.voice_id || v.id,
            name: v.name || v.voice_name || "未命名音色",
            category: v.category || ""
          };
        });
      });
    });
  }

  window.NaijiacunTTS = {
    speak: speak,
    stop: stop,
    onChange: onChange,
    checkKey: checkKey,
    listVoices: listVoices,
    canUseBreeze: canUseBreeze,
    config: CONFIG,
    getCurrent: function () { return currentId; }
  };
})();
