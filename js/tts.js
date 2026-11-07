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
    defaultVoiceId: "",    // 默认音色 id
    browserVoice: ""       // 浏览器音色（voiceURI），空 = 自动优选
  };

  // 音色优选策略：优先自然音/在线音色，避开老式机械音
  var PREFER = [/Natural/i, /Online/i, /Xiaoxiao/i, /Yunxi/i, /Yunyang/i,
                /Xiaoyi/i, /Google/i, /Tingting/i, /Meijia/i, /女/i];
  var AVOID = [/Huihui/i, /Kangkang/i, /Yaoyao/i, /Yating/i, /Zhiwei/i, /eSpeak/i];

  // 按名字粗略判断音色性别，只用于给角色配「男声/女声」
  var FEMALE_NAME = [/Xiaoxiao/i, /Xiaoyi/i, /Xiaohan/i, /Xiaomeng/i, /Xiaomo/i,
                     /Xiaorui/i, /Xiaoshuang/i, /Xiaoqiu/i, /Tingting/i,
                     /Huihui/i, /Yaoyao/i, /Meijia/i, /Yaoyao/i, /女/i];
  var MALE_NAME = [/Yunxi/i, /Yunyang/i, /Yunjian/i, /Yunfeng/i, /Yunhao/i,
                   /Yunye/i, /Kangkang/i, /Zhiwei/i, /男/i];

  var audioEl = null;
  var currentId = null;
  var listeners = [];
  var localMap = {};   // 人物 id → { file, text }，来自 audio/manifest.json

  function hash(str) {
    var h = 0;
    for (var i = 0; i < String(str).length; i++) {
      h = (h * 31 + String(str).charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function allVoices() {
    if (!("speechSynthesis" in window)) return [];
    try { return window.speechSynthesis.getVoices() || []; } catch (e) { return []; }
  }

  function isZh(v) {
    return /^zh/i.test(v.lang) ||
      /Chinese|中文|普通话|Xiaoxiao|Yunxi|Huihui|Tingting|Meijia/i.test(v.name);
  }

  function zhVoices() {
    return allVoices().filter(isZh);
  }

  function scoreVoice(v) {
    var s = 0;
    if (PREFER.some(function (re) { return re.test(v.name); })) s += 40;
    if (AVOID.some(function (re) { return re.test(v.name); })) s -= 30;
    if (/^zh[-_]CN/i.test(v.lang)) s += 12;
    else if (isZh(v)) s += 4;
    if (v.localService === false) s += 6;   // 在线音色通常更自然
    if (v.default) s += 2;
    return s;
  }

  // 选定音色：优先用户手动指定的，否则在中文音色里挑分数最高的
  // gender 传入 "male" / "female" 时，会优先挑同性别的音色
  function pickVoice(gender) {
    var list = allVoices();
    if (!list.length) return null;

    if (CONFIG.browserVoice) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].voiceURI === CONFIG.browserVoice || list[i].name === CONFIG.browserVoice) {
          return list[i];
        }
      }
    }

    var zh = list.filter(isZh);
    var pool = zh.length ? zh : list;
    var best = pool[0];
    var bestScore = scoreVoiceFor(pool[0], gender);
    for (var j = 1; j < pool.length; j++) {
      var sc = scoreVoiceFor(pool[j], gender);
      if (sc > bestScore) { best = pool[j]; bestScore = sc; }
    }
    return best;
  }

  function voiceGender(v) {
    if (FEMALE_NAME.some(function (re) { return re.test(v.name); })) return "female";
    if (MALE_NAME.some(function (re) { return re.test(v.name); })) return "male";
    return "";
  }

  function scoreVoiceFor(v, gender) {
    var s = scoreVoice(v);
    if (gender) {
      var g = voiceGender(v);
      if (g === gender) s += 26;
      else if (g) s -= 26;     // 明确是异性音色就压下去
    }
    return s;
  }

  // 角色的浏览器语音参数（没有云端音色时用它来区分角色）
  function characterProfile(id) {
    var map = (typeof window !== "undefined" && window.CHARACTER_VOICES) ||
              (typeof CHARACTER_VOICES !== "undefined" ? CHARACTER_VOICES : null);
    var p = (map && id && map[id]) || null;
    return {
      rate: p && typeof p.rate === "number" ? p.rate : null,
      pitch: p && typeof p.pitch === "number" ? p.pitch : null,
      tempo: p && typeof p.tempo === "number" ? p.tempo : null,
      gender: (p && p.gender) || ""
    };
  }

  // 云端音色返回的是成品音频，没法在合成端调音高，只能改播放速率。
  // 关掉 preservesPitch 后速率会连音高一起压下去（磁带变速），
  // 所以 tempo 既是「低沉程度」也是「放慢程度」：0.9 = 低 10%、慢 10%。
  function applyTempo(el, id) {
    if (!el) return el;
    var p = characterProfile(id);
    var t = p && typeof p.tempo === "number" ? p.tempo : 1;
    if (!t || t === 1) return el;
    try {
      el.preservesPitch = false;
      el.mozPreservesPitch = false;
      el.webkitPreservesPitch = false;
      el.playbackRate = t;
    } catch (e) { /* 老浏览器忽略 */ }
    return el;
  }

  function listBrowserVoices() {
    return zhVoices().map(function (v) {
      return { name: v.name, lang: v.lang, uri: v.voiceURI, local: v.localService };
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
    var h = hash(id || text);
    var prof = characterProfile(id);

    var voice = pickVoice(prof.gender);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang || "zh-CN";
      if (!isZh(voice)) {
        notify("当前浏览器没有中文音色，正用默认音色读中文，听起来会很怪。换 Edge 打开，或在「语音设置」里填 Breeze Key");
      }
    } else {
      u.lang = "zh-CN";
      notify("当前浏览器没有可用音色，可能听不到声音。建议用 Edge 打开");
    }

    // 有角色音色设定就用它（六个角色各不相同），没有就按 id 做个稳定的小幅区分
    u.rate = prof.rate !== null ? prof.rate : 0.96 + (h % 5) * 0.015;
    u.pitch = prof.pitch !== null ? prof.pitch : 0.96 + ((h >> 3) % 5) * 0.02;

    u.onend = function () { currentId = null; emit(); };
    u.onerror = function () { currentId = null; emit(); };

    currentId = id;
    emit();
    window.speechSynthesis.speak(u);
  }

  // 试听：不占用当前播放状态，只发一段样音
  function previewVoice(text, uri) {
    if (!("speechSynthesis" in window)) return false;
    window.speechSynthesis.cancel();

    var u = new SpeechSynthesisUtterance(text || "你好呀，我是奶家村的新村民。");
    var list = allVoices();
    var hit = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].voiceURI === uri || list[i].name === uri) { hit = list[i]; break; }
    }
    if (hit) { u.voice = hit; u.lang = hit.lang || "zh-CN"; }
    else { u.lang = "zh-CN"; u.rate = 0.98; }
    window.speechSynthesis.speak(u);
    return true;
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

  // 人物 → 音色：优先用数据文件里的绑定，其次 CONFIG.voices，最后用默认音色
  function voiceFor(id) {
    var map = (typeof window !== "undefined" && window.CHARACTER_VOICES) ||
              (typeof CHARACTER_VOICES !== "undefined" ? CHARACTER_VOICES : null);
    if (map && map[id] && map[id].voiceId) return map[id].voiceId;
    return CONFIG.voices[id] || CONFIG.defaultVoiceId || "";
  }

  function styleFor(id) {
    var map = (typeof window !== "undefined" && window.CHARACTER_VOICES) ||
              (typeof CHARACTER_VOICES !== "undefined" ? CHARACTER_VOICES : null);
    return (map && map[id] && map[id].style) || "";
  }

  function speakBreeze(text, id) {
    var voiceId = voiceFor(id);
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
        audioEl = applyTempo(new Audio(url), id);
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

  // ---------- 预生成音频（站长用 scripts/pregen-audio.mjs 生成） ----------
  var manifestOK = null;   // null=未加载完，true=读到清单，false=没有清单（例如 file:// 直接打开）

  function loadLocalManifest() {
    return fetch("audio/manifest.json", { cache: "no-cache" })
      .then(function (res) {
        manifestOK = res.ok;
        return res.ok ? res.json() : {};
      })
      .then(function (data) {
        localMap = data || {};
        return localMap;
      })
      .catch(function () {
        manifestOK = false;
        localMap = {};
        return localMap;
      });
  }

  function playLocal(text, id) {
    var entry = localMap[id];

    // 没有清单（比如直接用 file:// 打开，fetch 被拦）：按约定路径盲试 audio/{id}.mp3
    if (!entry || !entry.file) {
      if (manifestOK === false && id) return tryDirectFile(text, id);
      return false;
    }

    // 只有请求的文本与预生成时一致，才用本地文件，避免读错内容
    if (entry.text && String(entry.text).trim() !== String(text).trim()) return false;

    currentId = id;
    emit();

    audioEl = applyTempo(new Audio(entry.file), id);
    audioEl.onended = function () { currentId = null; emit(); };
    audioEl.onerror = function () { currentId = null; emit(); };
    audioEl.play().catch(function () {
      currentId = null;
      emit();
    });
    return true;
  }

  function tryDirectFile(text, id) {
    var probe = applyTempo(new Audio("audio/" + id + ".mp3"), id);
    currentId = id;
    emit();

    probe.onerror = function () {
      // 文件不存在，让调用方继续降级到浏览器语音
      currentId = null;
      emit();
      speakBrowser(text, id);
    };
    probe.onended = function () { currentId = null; emit(); };

    var p = probe.play();
    if (p && p.catch) {
      p.catch(function () {
        currentId = null;
        emit();
      });
    }
    audioEl = probe;
    return true;
  }

  function speak(text, id) {
    stop();
    if (!text) return;

    // 优先级：访客自己的 Key → 站长预生成的真音色 → 浏览器语音
    if (canUseBreeze()) return speakBreeze(text, id);
    if (playLocal(text, id)) return;

    if (CONFIG.provider === "breeze") {
      notify("未填写 API Key，先用浏览器语音顶上");
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
    listBrowserVoices: listBrowserVoices,
    previewVoice: previewVoice,
    setBrowserVoice: function (uri) { CONFIG.browserVoice = uri || ""; },
    pickBrowserVoice: function () {
      var v = pickVoice();
      return v ? { name: v.name, uri: v.voiceURI, lang: v.lang } : null;
    },
    canUseBreeze: canUseBreeze,
    voiceFor: voiceFor,
    styleFor: styleFor,
    loadLocalManifest: loadLocalManifest,
    hasLocal: function (id) { return !!(localMap[id] && localMap[id].file); },
    config: CONFIG,
    getCurrent: function () { return currentId; }
  };

  // 启动时静默加载预生成音频清单（不存在就静默跳过）
  loadLocalManifest();
})();
