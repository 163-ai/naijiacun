// 奶家村 · 语音朗读适配层
// 默认使用浏览器内置语音（零成本、无需 Key，立即可用）。
// 接入 Breeze TTS 时：把 provider 改成 "breeze"，并填入你自己的代理地址和音色 ID。
//
// 注意：不要把 Breeze 的 API Key 写进这个文件。前端代码是公开的，
// Key 必须放在服务端代理（Cloudflare Worker / Vercel Function / 自己的服务器）里。

(function () {
  "use strict";

  var CONFIG = {
    // "browser" = 浏览器内置语音；"breeze" = 调用 Breeze TTS
    provider: "browser",

    // Breeze 模式下，指向你的服务端代理，例如 https://naijiacun-tts.xxx.workers.dev/api/tts
    endpoint: "",

    // 人物 id → Breeze 音色 ID（音色库里的 voice_id 或克隆得到的 voice_id）
    voices: {},

    // 没有单独配置音色时使用的默认音色
    defaultVoiceId: ""
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
      try { fn(currentId); } catch (e) { /* 忽略单个监听器错误 */ }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    fn(currentId);
  }

  function stop() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl = null;
    }
    currentId = null;
    emit();
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

    // 用 id 生成稳定的小幅差异，让不同人物听起来不完全一样
    if (list.length) u.voice = list[h % list.length];
    u.lang = "zh-CN";
    u.rate = 0.94 + (h % 6) * 0.02;         // 0.94 ~ 1.04
    u.pitch = 0.9 + ((h >> 3) % 6) * 0.04;  // 0.90 ~ 1.10
    u.volume = 1;

    u.onend = function () { currentId = null; emit(); };
    u.onerror = function () { currentId = null; emit(); };

    currentId = id;
    emit();
    window.speechSynthesis.speak(u);
  }

  function speakBreeze(text, id) {
    var voiceId = CONFIG.voices[id] || CONFIG.defaultVoiceId;
    currentId = id;
    emit();

    return fetch(CONFIG.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: text, voiceId: voiceId, format: "mp3" })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("TTS 请求失败：" + res.status);
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
        return audioEl.play();
      })
      .catch(function (err) {
        console.warn("[TTS] Breeze 合成失败，回退到浏览器朗读：", err);
        speakBrowser(text, id);
      });
  }

  function speak(text, id) {
    stop();
    if (!text) return;
    if (CONFIG.provider === "breeze" && CONFIG.endpoint) return speakBreeze(text, id);
    return speakBrowser(text, id);
  }

  window.NaijiacunTTS = {
    speak: speak,
    stop: stop,
    onChange: onChange,
    config: CONFIG,
    getCurrent: function () { return currentId; }
  };
})();
