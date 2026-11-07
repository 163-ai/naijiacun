// 奶家村 · 形象总表
//
// 直接从 js/data.js 读数据渲染，改了角色这里自动跟着变。

(function () {
  "use strict";

  var list = (typeof PEOPLE !== "undefined" && Array.isArray(PEOPLE)) ? PEOPLE : [];
  var voices = (typeof CHARACTER_VOICES !== "undefined" && CHARACTER_VOICES) ? CHARACTER_VOICES : {};

  var body = document.getElementById("gBody");
  var foot = document.getElementById("gFoot");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 形象：优先角色图，其次内置 SVG，最后首字圆牌
  function figure(p) {
    if (p.image) {
      return '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '">';
    }
    var A = window.NaijiacunAvatars;
    if (A) {
      var s = A.svg(p.id);
      if (s) return s;
      if (p.name) return A.initial(p.name);
    }
    return '<span style="font-size:30px">' + esc(p.emoji || "🙂") + "</span>";
  }

  var GENDER = { female: "女声", male: "男声" };
  var AGE = { child: "童声", young: "少年/青年", middle_aged: "中年", old: "老年" };

  function voiceCell(p) {
    var v = voices[p.id];
    if (!v || !v.style) return '<span style="color:#a9a49a">未设定</span>';

    var tags = [];
    if (v.gender) tags.push(GENDER[v.gender] || v.gender);
    if (v.age) tags.push(AGE[v.age] || v.age);
    if (v.accent) tags.push("带口音");

    return tags.map(function (t) {
      return '<span class="tag">' + esc(t) + "</span>";
    }).join("") + esc(v.style);
  }

  list.forEach(function (p, i) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="g-idx">' + (i + 1) + "</td>" +
      '<td class="g-figure"><div class="fig">' + figure(p) + "</div></td>" +
      '<td class="g-name">' + esc(p.name) + "<small>" + esc(p.id) + "</small></td>" +
      '<td><span class="g-cat" data-cat="' + esc(p.category) + '">' + esc(p.category) + "</span></td>" +
      '<td class="g-quote">' + esc(p.title) + "</td>" +
      '<td class="g-quote">' + esc(p.quote) + "</td>" +
      '<td class="g-voice">' + voiceCell(p) + "</td>" +
      '<td class="g-origin">' + esc(p.origin || "—") + "</td>";
    body.appendChild(tr);
  });

  foot.textContent = "共 " + list.length + " 个角色 · 数据来源：js/data.js · 本站为非官方、非商业的同人图鉴，" +
    "角色名称与形象的权利归各自权利人所有，如权利人认为不妥可联系删除。";

  // ---------- 导出 CSV ----------
  document.getElementById("csvBtn").addEventListener("click", function () {
    var head = ["序号", "名称", "ID", "分类", "一句话称号", "热梗", "音色设定", "权利归属"];
    var rows = list.map(function (p, i) {
      var v = voices[p.id] || {};
      return [
        i + 1,
        p.name,
        p.id,
        p.category,
        p.title,
        p.quote,
        v.style || "",
        p.origin || ""
      ];
    });

    function cell(v) {
      var s = String(v == null ? "" : v).replace(/"/g, '""');
      return '"' + s + '"';
    }

    var csv = [head.map(cell).join(",")]
      .concat(rows.map(function (r) { return r.map(cell).join(","); }))
      .join("\r\n");

    // 加 BOM，Excel 打开中文不乱码
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "奶家村-形象总表.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  document.getElementById("printBtn").addEventListener("click", function () {
    window.print();
  });

  document.getElementById("jumpBtn").addEventListener("click", function () {
    location.href = "pet.html";
  });
})();
