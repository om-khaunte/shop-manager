export const THEME_KEY = "114shop:theme";

/** Runs before first paint (see app/layout.tsx) so the page never flashes the wrong theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="system"?matchMedia("(prefers-color-scheme: dark)").matches:p!=="light";document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;
