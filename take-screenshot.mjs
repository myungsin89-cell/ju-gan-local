import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

async function shot(label, setup) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
  if (setup) await p.evaluateOnNewDocument(setup);
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await p.screenshot({ path: path.join(__dirname, `ss-${label}.png`) });
  const debug = await p.evaluate(() => ({
    mode: window._appMode,
    loginVisible: !document.getElementById('login-overlay')?.classList.contains('hide'),
    nav: ['btn-settings','btn-validation','btn-specialist','btn-timetable-all'].map(id =>
      ({ id, hidden: document.getElementById(id)?.classList.contains('hide') })
    )
  })).catch(() => ({}));
  console.log(label, JSON.stringify(debug));
  await p.close();
}

// 1. 첫 방문 (모드 선택)
await shot('1-mode-select', () => localStorage.clear());

// 2. 로컬 모드: 바로 메인 진입
await shot('2-local-main', () => {
  localStorage.clear();
  localStorage.setItem('jugan-app-mode', 'local');
});

// 3. 서버 모드: 로그인 화면
await shot('3-server-login', () => {
  localStorage.clear();
  localStorage.setItem('jugan-app-mode', 'server');
  localStorage.setItem('jugan-firebase-config', JSON.stringify({
    apiKey:'test', projectId:'test', authDomain:'test.firebaseapp.com',
    storageBucket:'test.appspot.com', messagingSenderId:'123', appId:'test'
  }));
});

await browser.close();
console.log('done');
