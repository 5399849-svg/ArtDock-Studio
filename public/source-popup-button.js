import {popupButtonRect,popupButtonTextBox} from './community-popup-model.js';
import {popupFontFamily} from './project-fonts.js';
export const SOURCE_BUTTON_ID='source-popup-button-layer';
export const SOURCE_BUTTON_TEXT_ID='source-popup-button-text';
export const sourceButtonDefault={x:95,y:586,width:310,height:44,visible:true};
export function sourceButtonElement(popup,images){
 if(!popup?.buttonVisible)return null;
 return {...popupButtonRect(popup,sourceButtonDefault,images.get(popup.buttonBackingAsset)),id:SOURCE_BUTTON_ID,label:'按钮底板',role:'button',visible:true};
}
export function sourceButtonTextElement(ctx,popup,images){
 if(!popup?.buttonVisible)return null;
 return {...popupButtonTextBox(ctx,popup,sourceButtonDefault,{image:images.get(popup.buttonBackingAsset),fontFamily:popupFontFamily(popup)}),id:SOURCE_BUTTON_TEXT_ID,label:'按钮文字',role:'button-text'};
}
export function constrainSourceButton(box){
 const scale=Math.min(1,480/box.width,630/box.height),width=Math.max(20,box.width*scale),height=Math.max(10,box.height*scale);
 return {x:Math.max(0,Math.min(500-width,box.x)),y:Math.max(0,Math.min(650-height,box.y)),width,height};
}
