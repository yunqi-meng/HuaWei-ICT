import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { NavigationItem } from "../navigation";
import Modal from "./Modal";
import Icon from "./Icon";

export default function CommandPalette({items,onClose}:{items:NavigationItem[];onClose:()=>void}) {
  const [query,setQuery]=useState("");
  const [active,setActive]=useState(0);
  const input=useRef<HTMLInputElement>(null);
  const navigate=useNavigate();
  const id=useId();
  const matches=items.filter(item=>`${item.label} ${item.description} ${item.to}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{input.current?.focus();},[]);
  useEffect(()=>{document.getElementById(`${id}-${active}`)?.scrollIntoView?.({block:"nearest"});},[active,id]);
  const go=(to:string)=>{onClose();navigate(to);};
  return <Modal title="快速跳转" onClose={onClose}>
    <div className="command-search"><Icon name="search"/><input ref={input} data-autofocus role="combobox" aria-label="搜索功能与页面" aria-controls={`${id}-results`} aria-expanded="true" aria-autocomplete="list" aria-activedescendant={matches[active]?`${id}-${active}`:undefined} placeholder="搜索功能、页面或关键词" value={query}
      onChange={e=>{setQuery(e.target.value);setActive(0);}}
      onKeyDown={e=>{
        if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();if(matches.length)setActive(value=>(value+(e.key==="ArrowDown"?1:-1)+matches.length)%matches.length);}
        if(e.key==="Enter"&&matches[active]){e.preventDefault();go(matches[active].to);}
      }}/><kbd>Esc</kbd></div>
    <div className="command-results" id={`${id}-results`} role="listbox" aria-label="功能搜索结果">
      {matches.map((item,index)=><button key={item.to} id={`${id}-${index}`} role="option" aria-selected={index===active} tabIndex={-1} className={`command-item ${active===index?"is-active":""}`} onMouseMove={()=>setActive(index)} onClick={()=>go(item.to)}>
        <span className="command-icon"><Icon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="arrow" size={16}/>
      </button>)}
      {!matches.length&&<div className="empty-state"><Icon name="search"/><h3>未找到对应功能</h3><p>试试“排查”“主板”或“我的服务”。</p></div>}
    </div>
    <div className="command-hint"><span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开页面</span></div>
  </Modal>;
}
