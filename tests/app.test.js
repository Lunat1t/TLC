import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import config from '../next.config.mjs';

test('legacy controller links target the editor and the old screen is absent',async()=>{
 const redirects=await config.redirects();
 const project=redirects.find(r=>r.source==='/controller.html'&&r.has);
 assert.equal(project.destination,'/editor?id=:projectId');
 const query=project.has.find(x=>x.key==='project');
 assert.equal(new RegExp(query.value).exec('sample-project').groups.projectId,'sample-project');
 assert.ok(redirects.some(r=>r.source==='/controller.html'&&!r.has&&r.destination==='/'));
 assert.equal(existsSync(new URL('../public/controller.html',import.meta.url)),false);
 const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.ok(manifest.shortcuts.every(shortcut=>!shortcut.url.includes('controller.html')));
});
