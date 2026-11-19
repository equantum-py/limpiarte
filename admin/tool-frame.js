'use strict';
const embedded=new URLSearchParams(location.search).get('embed')==='1'&&parent!==window;
if(!embedded){location.replace('/admin/#'+(location.pathname.endsWith('/catalogo.html')?'catalogo':'cotizador'));}
else{document.documentElement.classList.add('unified-tool','embedded-demo');const report=()=>parent.postMessage({type:'limpiarte-demo-height',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin);new ResizeObserver(report).observe(document.body);window.addEventListener('load',report);report();}
