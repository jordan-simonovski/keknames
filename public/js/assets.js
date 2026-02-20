window.Assets = (() => {
  const cache = new Map();
  let loaded = false;

  function loadImage(src) {
    if (cache.has(src)) return Promise.resolve(cache.get(src));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { cache.set(src, img); resolve(img); };
      img.onerror = () => {
        const placeholder = createPlaceholder(src);
        cache.set(src, placeholder);
        resolve(placeholder);
      };
      img.src = src;
    });
  }

  function createPlaceholder(label) {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const name = label.split('/').pop().replace(/\.\w+$/, '');
    ctx.fillText(name, 100, 100);
    return c;
  }

  const TYPE_IMAGES = [
    'red_agent', 'red_agent_2', 'red_agent_3',
    'blue_agent', 'blue_agent_2', 'blue_agent_3',
    'bystander', 'bystander_2', 'bystander_3',
    'assassin',
  ];
  const AVATAR_IMAGES = ['avatar_01', 'avatar_02', 'avatar_03', 'avatar_04', 'avatar_05', 'avatar_06', 'avatar_07', 'avatar_08'];

  async function preloadUI() {
    const all = [
      ...TYPE_IMAGES.map((id) => loadImage(`/assets/ui/${id}.png`)),
      ...AVATAR_IMAGES.map((id) => loadImage(`/assets/ui/${id}.png`)),
    ];
    await Promise.all(all);
  }

  async function preloadCards(ids) {
    const promises = ids.map((id) => loadImage(`/assets/cards/${id}.png`));
    await Promise.all(promises);
    loaded = true;
  }

  function getImage(src) {
    return cache.get(src) || null;
  }

  return { loadImage, preloadCards, preloadUI, getImage, cache };
})();
