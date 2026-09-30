// GM 画面の「いま話すこと」メモ。docs/facilitation-guide.md（50分の台本）を画面用に短くしたもの。
// 数値は決めない（表示する文だけ）。進行の段階と月から、話すことを2〜4つ選ぶ。

import type { Phase } from '../../sync/schema';

export interface NoteInput {
  phase: Phase;
  month: number; // 0 = 開始前
  months: number; // 期の月数
  quarterStart: boolean; // バリスタの人数を決める月
  baristaMonthly?: boolean; // バリスタの人数を毎月決める（ソロと同じ）
  seasonal: boolean; // お客さんの数が季節で変わる（市場のパターンが「現実ベース」）
  calendarMonth: number; // 暦の月（1〜12）
}

export interface Note {
  title: string;
  time: string; // 50分の中での目安
  points: string[];
}

export function gmNote(n: NoteInput): Note {
  const last = n.month >= n.months;
  // 2年以上のときも、話すことは1年（12か月）ごとにくり返す
  const monthInYear = ((n.month - 1) % 12) + 1;
  const year = Math.ceil(n.month / 12);
  const yearLast = monthInYear === 12 && !last;

  if (n.phase === 'lobby') {
    return {
      title: 'はじめ：ルール説明と参加', time: '0〜7分',
      points: [
        '全体表示の QR コードから、チームごとに1台で参加してもらう。',
        '目的は「12か月でお金をいちばん増やす」。お客さんは安いお店から順に買う。',
        '毎月決めるのは「レモンと砂糖をいくつ買うか」と「1杯の値段」の2つだけ。',
        '全チームがそろったら「1か月目を始める」。1か月目は練習をかねる。',
      ],
    };
  }

  if (n.phase === 'yearEnd') {
    return {
      title: `第${year}期の決算`, time: '約5分',
      points: [
        '全体表示で、この1年の順位とお金の推移を見せる。',
        '各チームのスマホに第' + year + '期の年次決算レポートが出る。「次の1年の戦略」を一言書いてもらう。',
        'お金・材料・バリスタは次の年へそのまま引き継ぐ。準備ができたら「第' + (year + 1) + '期を始める」。',
      ],
    };
  }

  if (n.phase === 'final') {
    return {
      title: '期末：振り返り', time: '43〜50分',
      points: [
        '全体表示で順位とお金の推移を見せる。1位のチームに「何を決め手にしたか」を聞く。',
        '下の一覧の「平均の値段」で、安く多く売ったチームと高く少なく売ったチームを比べる。',
        '問いかけ：売上がいちばん多いチームと、もうけがいちばん多いチームは同じだった？',
        '各チームのスマホで年次決算レポート（A4）を開き、「次の1年の戦略」を書いてもらう。',
      ],
    };
  }

  if (n.phase === 'input') {
    if (monthInYear === 1 && year > 1) {
      return {
        title: `第${year}期の1か月目`, time: '1か月 約3分',
        points: [
          '前の年の決算で書いた「次の1年の戦略」を、この1年で試してもらう。',
          '入力画面の上の「先月の市場」は、前の年の最後の月の結果。',
        ],
      };
    }
    if (n.month === 1) {
      return {
        title: '1か月目：練習をかねて', time: '7〜10分',
        points: [
          '入力画面の上から順に：仕入れる → 値段を決める → 下の「月末の資金」を見て提出。',
          '「1杯あたりの原価」と「元がとれる数」を指さして、値段の決め方のヒントにする。',
          n.baristaMonthly
            ? 'バリスタの人数も毎月決める。1人で作れる数には上限があり、給料は売れても売れなくても毎月かかる。'
            : 'バリスタの給料は、売れても売れなくても毎月かかることを伝える。',
        ],
      };
    }
    const points = ['入力画面の上の「先月の市場」で、どのお店が売り切れたか・お金が余ったかを見るよう促す。'];
    if (n.quarterStart && !n.baristaMonthly) points.push('今月はバリスタの人数を決める月。人を増やすと作れる数は増えるが、給料も3か月分かかる。');
    if (n.seasonal && [6, 7].includes(n.calendarMonth)) points.push('夏はお客さんが増える。仕入れを増やすか、値上げするか、チームで相談してもらう。');
    if (n.seasonal && [9, 10].includes(n.calendarMonth)) points.push('夏が終わりお客さんが減る。仕入れすぎると売れ残りが出る。');
    if (monthInYear === 6) points.push('折り返し。ここまでの自分の作戦（安く多く／高く少なく）をチームで一言にしてもらう。');
    if (last) points.push('最後の月。売れ残った材料は来月に使えないので、仕入れすぎに注意。');
    if (yearLast) points.push(`第${year}期の最後の月。結果のあとに、この1年の決算を見る。`);
    return { title: `${n.month}か月目：入力中`, time: '1か月 約3分（入力 約90秒）', points };
  }

  // 結果
  const points = [
    '全体表示の帯で「安いお店から順にお金が使われた」ことを指さす。',
    '使われなかったお金（帯の右端）が残っていれば、「もう少し高くても売れたかも」と問いかける。',
  ];
  if (n.month === 1) points.push('赤字のチームには「費用のうち何がいちばん大きかった？」と聞く。');
  if (last) points.push('次は期末の結果。「期末の結果へ」を押す前に、1年を一言でふり返ってもらってもよい。');
  return { title: `${n.month}か月目：結果`, time: '約1分', points };
}
