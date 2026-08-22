const fs = require('fs');
let css = fs.readFileSync('src/App.css', 'utf8');

// 1. Remove the old override block entirely
const overrideStart = css.indexOf('/* --- TAHOE BLUR OVERRIDES');
if (overrideStart > -1) {
    const overrideEnd = css.indexOf('}', css.indexOf('.tilderSettingsCard', overrideStart)) + 1;
    css = css.slice(0, overrideStart) + css.slice(overrideEnd);
}

// 2. Reduce the opacity and blur of the main tahoe components
css = css.replace(/backdrop-filter: blur\(60px\) saturate\(200%\)/g, 'backdrop-filter: blur(8px) saturate(130%)');
css = css.replace(/-webkit-backdrop-filter: blur\(60px\) saturate\(200%\)/g, '-webkit-backdrop-filter: blur(8px) saturate(130%)');

css = css.replace(/backdrop-filter: blur\(40px\) saturate\(180%\)/g, 'backdrop-filter: blur(8px) saturate(130%)');
css = css.replace(/-webkit-backdrop-filter: blur\(40px\) saturate\(180%\)/g, '-webkit-backdrop-filter: blur(8px) saturate(130%)');

css = css.replace(/backdrop-filter: blur\(50px\) saturate\(200%\)/g, 'backdrop-filter: blur(8px) saturate(120%)');
css = css.replace(/-webkit-backdrop-filter: blur\(50px\) saturate\(200%\)/g, '-webkit-backdrop-filter: blur(8px) saturate(120%)');

css = css.replace(/backdrop-filter: blur\(20px\) saturate\(150%\)/g, 'backdrop-filter: blur(6px)');
css = css.replace(/-webkit-backdrop-filter: blur\(20px\) saturate\(150%\)/g, '-webkit-backdrop-filter: blur(6px)');

css = css.replace(/backdrop-filter: blur\(30px\) saturate\(180%\)/g, 'backdrop-filter: blur(8px) saturate(120%)');
css = css.replace(/-webkit-backdrop-filter: blur\(30px\) saturate\(180%\)/g, '-webkit-backdrop-filter: blur(8px) saturate(120%)');


// Opacities (lowering to ~0.2)
css = css.replace(/rgba\(38, 38, 42, 0.72\) 0%, rgba\(28, 28, 32, 0.78\)/g, 'rgba(18, 18, 22, 0.22) 0%, rgba(12, 12, 16, 0.25)'); // Sidebar
css = css.replace(/rgba\(32, 32, 36, 0.8\) 0%, rgba\(26, 26, 30, 0.85\)/g, 'rgba(20, 20, 24, 0.28) 0%, rgba(14, 14, 18, 0.30)'); // StatusBar
css = css.replace(/rgba\(22, 22, 26, 0.92\)/g, 'rgba(16, 16, 20, 0.55)'); // Main
css = css.replace(/rgba\(26, 26, 30, 0.7\)/g, 'rgba(18, 18, 22, 0.30)'); // Welcome
css = css.replace(/rgba\(36, 36, 40, 0.65\) 0%, rgba\(30, 30, 34, 0.7\)/g, 'rgba(18, 18, 22, 0.20) 0%, rgba(12, 12, 16, 0.25)'); // Explorer shell
css = css.replace(/rgba\(28, 28, 32, 0.65\)/g, 'rgba(18, 18, 22, 0.25)'); // Tabs

fs.writeFileSync('src/App.css', css);
console.log('App.css Tahoe CSS rewritten successfully!');
