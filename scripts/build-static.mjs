import { cpSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
rmSync('dist',{recursive:true,force:true});
mkdirSync('dist');
copyFileSync('index.html','dist/index.html');
cpSync('assets','dist/assets',{recursive:true});
cpSync('docs','dist/docs',{recursive:true,filter:path=>!path.endsWith('.md')});
copyFileSync('_routes.json','dist/_routes.json');
copyFileSync('_headers','dist/_headers');
