// Whitelisted Hubie PWA appearances. No CSS/url/html is ever stored as a theme.
export const appearanceDefaults=Object.freeze({
 dashboardPreset:'hubie',
 sidebarPreset:'midnight',
 dashboardColor:'#eaf1ff',
 sidebarColor:'#10294b'
});
export const dashboardPresets=Object.freeze(['hubie','pearl','silver','sand','custom']);
export const sidebarPresets=Object.freeze(['midnight','steel','platinum','graphite','custom']);
const fields=Object.keys(appearanceDefaults);
export function normalizeAppearance(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))throw Error('Invalid appearance');
 const theme={...appearanceDefaults,...input};
 if(!dashboardPresets.includes(theme.dashboardPreset)||!sidebarPresets.includes(theme.sidebarPreset))throw Error('Invalid appearance');
 for(const key of ['dashboardColor','sidebarColor']){
  if(typeof theme[key]!=='string'||!/^#[0-9a-fA-F]{6}$/.test(theme[key]))throw Error('Invalid appearance');
  theme[key]=theme[key].toLowerCase();
 }
 return theme;
}
export function mergeAppearance(oldTheme,patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!fields.includes(k)))throw Error('Invalid appearance');
 return normalizeAppearance({...normalizeAppearance(oldTheme),...patch});
}
