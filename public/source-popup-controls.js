import {renderPopupButtonComposer} from './popup-button-composer.js';
import {sourceButtonElement} from './source-popup-button.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sourcePopupOutline(c){return `<label class="source-check"><input id="source-popup-outline" type="checkbox" ${c.outline?'checked':''}>显示轮廓描边</label><div class="source-fields"><label>描边颜色<input id="source-popup-outline-color" type="color" value="${esc(c.outlineColor)}"></label><label>粗细（px）<input id="source-popup-outline-width" type="number" min="1" max="20" value="${c.outlineWidth??2}"></label></div>`;}
export function sourcePopupSize(c,assets){
 const b=sourceButtonElement({...c,buttonVisible:true},new Map(assets.map(a=>[a.name,a])));
 return `<label>按钮宽度 <output id="source-button-width-value">${Math.round(b.width)} px</output><input id="source-button-width" type="range" min="60" max="480" step="1" value="${Math.round(b.width)}"></label><button id="source-select-button" type="button" class="button ghost full-button">选中并调整底板</button>`;
}
export const sourcePopupGeneration=(task,c)=>renderPopupButtonComposer(task,c);
