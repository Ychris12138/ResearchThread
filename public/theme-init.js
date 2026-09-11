// public/theme-init.js — 首帧主题恢复（防闪烁）。
// 外置为文件而非内联脚本：生产 CSP 为 script-src 'self'，内联会被拦截。
// 必须同步执行且先于任何渲染。
(function () {
  try {
    var r = localStorage.getItem("rt-settings-v1");
    var s = r ? JSON.parse(r).state || {} : {};
    var t = s.theme || "light";
    if (t === "system")
      t = matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    var e = document.documentElement;
    e.dataset.theme = t;
    e.dataset.canvas = s.canvas || "white";
    e.dataset.density = s.density || "compact";
    e.dataset.radius = s.radius || "md";
    e.dataset.sidebar = s.sidebarContrast || "soft";
    e.dataset.font = s.font || "sans";
    e.dataset.width = s.editorWidth || "medium";
    if (s.fontSize) e.style.setProperty("--text-ui", s.fontSize + "px");
  } catch (e) {}
})();
