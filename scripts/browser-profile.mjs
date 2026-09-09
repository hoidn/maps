/** Explicit launch mode; a headed browser is not proof of hardware acceleration. */
export function parseHeadless(args=[],env=process.env,{prefix=''}={}){
 const headed=args.includes(`--${prefix}headed`),headless=args.includes(`--${prefix}headless`);
 if(headed&&headless)throw new Error(`Conflicting --${prefix}headed and --${prefix}headless options`);
 return headless?true:headed?false:env.HEADED!=='1';
}
export function describeBrowserProfile({headless=true,graphics={}}={}){
 const renderer=graphics.renderer;
 return {mode:headless?'headless':'headed',headless,launchOptions:{headless},graphics,
  softwareRenderer:typeof renderer==='string'?/SwiftShader|llvmpipe|softpipe|software|WARP/i.test(renderer):null};
}
export async function collectGraphics(browser,browserName){
 if(browserName!=='chromium')return {source:'not-exposed-by-browser-api'};
 const session=await browser.newBrowserCDPSession();
 try{const {gpu}=await session.send('SystemInfo.getInfo');return {source:'SystemInfo.getInfo',renderer:gpu.auxAttributes?.glRenderer,backend:gpu.auxAttributes?.skiaBackendType,devices:gpu.devices,featureStatus:gpu.featureStatus};}
 finally{await session.detach();}
}
