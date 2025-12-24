const fs = require('fs');
const path = require('path');

console.log('🔨 Начинаем сборку...');

// Генерируем уникальную версию на основе timestamp
const version = Date.now();
console.log('📦 Новая версия:', version);

try {
  // Обновляем index.html
  const htmlPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  // Заменяем версии CSS и JS
  html = html.replace(/styles\.css\?v=\d+/g, `styles.css?v=${version}`);
  html = html.replace(/app\.js\?v=\d+/g, `app.js?v=${version}`);
  
  fs.writeFileSync(htmlPath, html);
  console.log('✅ index.html обновлён');

  // Обновляем sw.js
  const swPath = path.join(__dirname, 'sw.js');
  let sw = fs.readFileSync(swPath, 'utf8');
  
  // Заменяем версию кэша
  sw = sw.replace(/spanish-trainer-v\d+/g, `spanish-trainer-v${version}`);
  
  fs.writeFileSync(swPath, sw);
  console.log('✅ sw.js обновлён');

  console.log('');
  console.log('🎉 Сборка завершена успешно!');
  console.log('📌 Версия:', version);
  console.log('');
  console.log('Теперь можно делать:');
  console.log('  git add .');
  console.log('  git commit -m "update v' + version + '"');
  console.log('  git push');

} catch (error) {
  console.error('❌ Ошибка при сборке:', error);
  process.exit(1);
}