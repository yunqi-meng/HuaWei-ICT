import { useEffect, useState } from "react";
type Theme = "light" | "dark";

export function useTheme() {
  const [theme,setTheme]=useState<Theme>(()=>{
    try { return localStorage.getItem("zhixiu-theme")==="dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    try { localStorage.setItem("zhixiu-theme",theme); } catch { /* 存储不可用时仍可临时切换。 */ }
  },[theme]);
  return {theme,toggleTheme:()=>setTheme(value=>value==="light"?"dark":"light")};
}
