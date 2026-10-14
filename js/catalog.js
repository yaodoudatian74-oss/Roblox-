// ジャンルごとに100ゲームずつ、計500ゲームのカタログを作る。
// 各ゲームは「テーマ（名前・生き物/建物/作物/モンスター）」「難易度（0〜1）」「ルールの variant（0〜4）」「配色」の組み合わせで決まる。
(function (g) {
  const C = g.Common;
  const ORDER = ['brainrot', 'tycoon', 'rpg', 'slowlife', 'athletic'];
  const WORDS = {
    brainrot: {
      adj: ['ふわふわ', 'ピカピカ', 'ねむねむ', 'ドキドキ', 'ぐるぐる', 'ズンズン', 'ちゃっかり', 'もふもふ', 'キラキラ', 'ぷにぷに'],
      nouns: ['ワニワニ', 'ぷりんゴリラ', 'ドキ猫', 'ねむ鳥', 'ビッグ魚', 'ふわ犬', 'ピカ亀', 'ぐるぐる蛇', 'ぴょん蛙', 'ズン牛'],
    },
    tycoon: {
      adj: ['ゆめの', 'キラリ', 'ビッグ', 'ちいさな', 'レトロ', 'ネオン', 'とろける', 'スカイ', 'ふわり', 'ワクワク'],
      nouns: ['ラーメン屋', 'ゲーセン', 'アイス工場', 'ポップコーン店', 'ロボ工房', 'ぬいぐるみ店', 'ドーナツ屋', 'パン工場', 'ペット屋', 'ゲーム会社'],
    },
    rpg: {
      adj: ['はじまりの', 'ふかい', 'もりの', 'きらめく', 'くらい', 'ひかりの', 'さびれた', 'こおった', 'ようがんの', 'そらの'],
      nouns: ['スライム', 'コウモリ', 'ゴーレム', 'オオカミ', 'スケルトン', 'キノコ', 'ドラゴン', 'ゴースト', 'カニ', 'ミミック'],
    },
    slowlife: {
      adj: ['のどかな', 'ふわふわ', 'しずかな', 'あたたかい', 'おひさまの', 'ほっこり', 'やさしい', 'ひだまりの', 'そよかぜの', 'しあわせ'],
      nouns: ['にんじん', 'たまご花', 'キノコ', 'ひまわり', 'ぶどう', 'いちご', 'かぼちゃ', 'ラベンダー', 'はちみつ草', 'とうもろこし'],
    },
    athletic: {
      adj: ['はやい', 'ふしぎな', 'きゅうな', 'しずかな', 'ぐるぐる', 'ジャンプ', 'とげだらけ', 'きらめく', 'そらとぶ', 'ゆれる'],
      nouns: ['コース', 'みち', 'タワー', 'ふゆのやま', 'ジャングル', 'うきしま', 'くもの上', 'ダンジョン', 'ネオン街', 'ようがん'],
    },
  };

  function hash(s) {
    let h = 7;
    for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  const list = [];
  for (const genre of ORDER) {
    const w = WORDS[genre];
    for (let i = 0; i < 100; i++) {
      list.push({
        id: `${genre}-${String(i + 1).padStart(3, '0')}`,
        genre,
        no: i + 1,
        // adj は i%10、noun は i/10 で選ぶため、100個のタイトルは必ず一意になる
        title: `${w.adj[i % 10]} ${w.nouns[Math.floor(i / 10)]}`,
        difficulty: i / 99,
        variant: i % 5,
        palette: C.PALETTES[i % C.PALETTES.length],
        names: w.nouns.map((_, k) => w.nouns[(k + i) % w.nouns.length]),
        seed: (hash(genre) + i * 7919) >>> 0,
      });
    }
  }

  g.CATALOG = list;
  g.CATALOG_ORDER = ORDER;
})(window);
