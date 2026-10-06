import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVideo,validVideo} from '../public/src/recipe-video.js';
import {videoFromPage} from '../recipe-video.js';
test('approved embeds are canonical and arbitrary iframe destinations are rejected',()=>{
 assert.deepEqual(normalizeVideo('https://youtu.be/abcdefghijk?foo=bar'),{kind:'embed',url:'https://www.youtube-nocookie.com/embed/abcdefghijk'});assert.equal(normalizeVideo('https://www.instagram.com/reel/ABCdefghijk/').url,'https://www.instagram.com/reel/ABCdefghijk/embed/');assert.equal(normalizeVideo('https://vimeo.com/123456').url,'https://player.vimeo.com/video/123456');
 for(const value of ['javascript:alert(1)','https://127.0.0.1/a.mp4','https://videos.internal/a.mp4','https://evil.com/player','https://youtube.com.evil.com/embed/abcdefghijk'])assert.equal(normalizeVideo(value),null);assert.equal(validVideo({kind:'embed',url:'https://evil.com/player'}),false);assert.equal(validVideo(normalizeVideo('https://cdn.recipes.com/food.mp4?token=abc')),true);
});
test('extracts recipe video from JSON-LD, video sources, OG and approved iframe without copying HTML',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Recipe',video:{'@type':'VideoObject',contentUrl:'https://cdn.recipes.com/a.mp4'}})+'</script>';assert.equal(videoFromPage(html,'https://recipes.com/x').url,'https://cdn.recipes.com/a.mp4');assert.equal(videoFromPage('<video><source src="/b.webm"></video>','https://recipes.com/x').url,'https://recipes.com/b.webm');assert.equal(videoFromPage('<meta property="og:video" content="https://cdn.recipes.com/a.mp4?a=1&amp;b=2">','https://recipes.com').url,'https://cdn.recipes.com/a.mp4?a=1&b=2');assert.equal(videoFromPage('<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>','https://recipes.com').kind,'embed');assert.equal(videoFromPage('<iframe src="https://evil.com/"></iframe>','https://recipes.com'),null);
});
