import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHeadless,describeBrowserProfile,collectGraphics} from '../../scripts/browser-profile.mjs';
import {parsePerformanceHeadless,parseScenesHeadless} from '../../scripts/verify-maps.mjs';
test('browser mode keeps headless defaults and supports explicit flags and HEADED=1',()=>{
 assert.equal(parseHeadless([],{}),true);
 assert.equal(parseHeadless([],{HEADED:'1'}),false);
 assert.equal(parseHeadless(['--headed'],{}),false);
 assert.equal(parseHeadless(['--headless'],{HEADED:'1'}),true);
 assert.throws(()=>parseHeadless(['--headed','--headless'],{}),/conflict/i);
});
test('release CLI selects only the performance browser mode explicitly',()=>{
 assert.equal(parsePerformanceHeadless([],{}),true);
 assert.equal(parsePerformanceHeadless(['--performance-headed'],{}),false);
 assert.equal(parsePerformanceHeadless(['--performance-headless'],{HEADED:'1'}),true);
 assert.equal(parsePerformanceHeadless([],{HEADED:'1'}),false);
 assert.throws(()=>parsePerformanceHeadless(['--performance-headed','--performance-headless'],{}),/conflict/i);
});
test('browser profile retains actual GPU evidence without equating headed with hardware',()=>{
 const software=describeBrowserProfile({headless:false,graphics:{renderer:'ANGLE (Google, SwiftShader Device)',featureStatus:{webgl:'enabled'}}});
 assert.equal(software.headless,false);assert.equal(software.mode,'headed');assert.equal(software.softwareRenderer,true);assert.match(software.graphics.renderer,/SwiftShader/);
 const metal=describeBrowserProfile({headless:false,graphics:{renderer:'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)'}});
 assert.equal(metal.softwareRenderer,false);assert.deepEqual(metal.launchOptions,{headless:false});
 assert.equal(describeBrowserProfile({headless:true,graphics:{source:'not-exposed-by-browser-api'}}).softwareRenderer,null);
});
test('Chromium GPU evidence is read from the launched browser and session is detached',async()=>{
 let detached=false;const browser={newBrowserCDPSession:async()=>({send:async name=>{assert.equal(name,'SystemInfo.getInfo');return{gpu:{devices:[{vendorString:'Apple'}],auxAttributes:{glRenderer:'Metal',skiaBackendType:'GaneshGL'},featureStatus:{webgl:'enabled'}}};},detach:async()=>{detached=true;}})};
 assert.deepEqual(await collectGraphics(browser,'chromium'),{source:'SystemInfo.getInfo',renderer:'Metal',backend:'GaneshGL',devices:[{vendorString:'Apple'}],featureStatus:{webgl:'enabled'}});assert.equal(detached,true);
});

test('scene mode is explicit and independent of the HEADED performance environment',()=>{
 assert.equal(parseScenesHeadless([]),true);
 assert.equal(parseScenesHeadless(['--performance-headed']),true);
 assert.equal(parseScenesHeadless(['--scenes-headed']),false);
 assert.equal(parseScenesHeadless(['--scenes-headless']),true);
 assert.throws(()=>parseScenesHeadless(['--scenes-headed','--scenes-headless']),/conflict/i);
});
