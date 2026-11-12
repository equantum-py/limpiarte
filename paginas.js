'use strict';
// Preserve bookmarks to former home sections after moving them to their own pages.
if(location.pathname==='/'||location.pathname==='/index.html'){
 const pages={'#servicios':'/servicios.html','#nosotros':'/quienes-somos.html','#como-trabajamos':'/como-trabajamos.html','#cotizador':'/cotizador.html','#contacto':'/contacto.html'};
 if(pages[location.hash])location.replace(pages[location.hash]);
}
