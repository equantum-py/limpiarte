if(new URL(location.href).searchParams.get('embed')==='1'&&parent!==window){
 document.documentElement.classList.add('embedded-demo');
 const report=()=>parent.postMessage({type:'limpiarte-demo-height',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin);
 new ResizeObserver(report).observe(document.body);window.addEventListener('load',report);report();
}
