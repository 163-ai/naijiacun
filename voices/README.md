# voices/ 参考音频目录

把每位角色的参考音频放在这里，**文件名必须等于角色 id**：

```
voices/nailong.mp3      → 奶龙
voices/naiwa.mp3        → 奶蛙
voices/baobaolong.mp3   → 暴暴龙
voices/xiaoqi.mp3       → 小七
voices/niulai.mp3       → 牛来
voices/capybara.mp3     → 卡皮巴拉
```

支持 `.mp3` `.wav` `.m4a` `.ogg` `.webm` `.flac`，建议 **10~30 秒、单人、无背景音乐、无明显噪声**。

放好后运行：

```bash
TTS_ENDPOINT=https://你的worker地址 BREEZE_API_KEY=brz_xxx node scripts/clone-voices.mjs
```

脚本会逐个克隆，把返回的 `voice_id` 自动写回 `js/data.js` 的 `CHARACTER_VOICES`，并继续复用已成功的音色（重跑不会重复创建）。

这个目录里的音频默认被 `.gitignore` 排除，不会推到 GitHub——参考音频往往涉及他人声音，不适合公开在仓库里。

## 关于素材来源

- 用自己录制的声音、或已购买/授权的声音素材，最没有争议。
- 克隆真实配音演员的声音，需要本人书面授权，否则可能同时涉及声音权益与著作权。
- 不想碰真人素材，也可以照 `js/data.js` 里每个角色的 `style` 描述（音高、语速、气质）在授权音色库里挑一个接近的，或做「声音设计」生成全新音色。
