/* Judo Coach — Google Drive technique video links (robust Android/PWA bridge) */
(function(){
  'use strict';
  const DRIVE_TECHNIQUE_VIDEOS = {
    'Seoi-nage': '1V-KEIpk5YngdVzs4vZyzEkIbJ0Tx5WFl',
    'Ippon-seoi-nage': '1ArrefEppDhpEbvbR_tLUIgT0ljId3jtE',
    'Seoi-otoshi': '1ztSych_GmCtGo2yeepZZ0YQqYZSSBgTQ',
    'Tai-otoshi': '1q8BAP0vXdnYCwDans4Y_wKUH0GDK7RIi',
    'Kata-guruma': '1ZR44wLpLRFOC1R7tcrRafWZWoDnxxjZR',
    'Obi-otoshi': '1QutYrxQvl7TysDSQWJ82PuqUfqWzWZC0',
    'Uki-otoshi': '1lDCrwQIS1cuKPpyLa_gSEx7g8urlD6Hg',
    'Sumi-otoshi': '1PkjMwS5-h0cx7g7Exx_QL4IZHNjHmiyP',
    'Yama-arashi': '1dvPUOxuBZW4qp_y7-ydIXJcwR55c-gzk',
    'Uchi-mata-sukashi': '1uDyiY_73oCJn7A8AQZc74IPBjZw1XUc7',
    'Kouchi-gaeshi': '1UiKgT5XzgihiNkaIMGXGZkhmeyp5lCHn',
    'Hikikomi-gaeshi (Obi-tori-gaeshi)': '1cnbGWUj85X6ai7UzQlwtISyEHcOt9akG',

    'Uki-goshi': '1xL0jA58CNCaWfqtilkAQYsAClsjTtLcU',
    'O-gosi': '1dFimy0LnZfB7hBM_vnhbFxB0nj-OVnxw',
    'Koshi-guruma': '1HkfgF6eoVVkeckBOUfE3ucibkCq-EHIS',
    'Tsurikomi-goshi': '1ox5jwGnkZlEXiNW20r3yhAsbHc1qDERg',
    'Sode-tsurikomi-goshi': '1buMd8qLDoguoRkkbTErc32LsxpOeMpJ6',
    'Harai-goshi': '1AEvautp-ivrPg9qOJ8Z3qw--tPBzuWOC',
    'Tsuri-goshi': '16Ynp-1dEkERBhw9RTYeU8QRhe89K74lx',
    'Hane-goshi': '19avObgqzrHe_f_RATRh81l6cMpUxXqIX',
    'Utsuri-goshi': '1W-rwEHyoqPC3w_kCVh4q0xbArA6pGH_f',
    'Ushiro-goshi': '1TzJZIQdSqj583UNDb7VS_HYdbVqokXJ1',

    'Deashi-harai': '1ELe-Mh0njCrkEJ2Zsjf2GKoPFNnFVkNK',
    'Hiza-guruma': '19qT5nDmSBI2ls-1OTlD8Z9Ye-xdlH0g1',
    'Sasae-tsurikomi-ashi': '1ilIq7om7D-XwNcZV8AxA9zXev5LqpEoa',
    'Osoto-gari': '1Vv9wn1MOPjfNDrUtJ1fiEU1K1lvdpVu3',
    'Ouchi-gari': '17O6KmuXtOETbrdVkxlXzdp7p3SXt7vMp',
    'Kosoto-gari': '1A4JLjd5XGf0iz-hWGkJGkFwk6W6IOTFb',
    'Kouchi-gari': '1IJIy5NFFrWnyXoGiexGTfHRcxRT1Jf65',
    'Okuri-ashi-harai': '1EDLGdL87Sjb_KtA54bCd15kgFmYIcELb',
    'Uchi-mata': '1IKTnQ7qYiQNlU7juX7_-4Jg1DidxzAwJ',
    'Kosoto-gake': '1RPQ3VugjaC_ddDTUEDGbOyxHuc7mD0ZK',
    'Ashi-guruma': '1zBuLE2nCcBsGy8MZ4jaO0qH8HR42v9ML',
    'Harai-tsurikomi-ashi': '1FPB9R8iJF1lErKVxiG4x7iVT8DDKpHij',
    'O-guruma': '1KXWclpRjcGLQLRlXO3_72Pm8Ma8u6Vdv',
    'Osoto-guruma': '1I7IMKSWf6disYFcXIuSjr5vgrqi9ZnkY',
    'Osoto-otoshi': '1pDO7gMaWpYLnq6Y__Nm8J1oDv7J2XTLz',
    'Tsubame-gaeshi': '1D0eyIFGkLvFr3yyY_Ccj_09t1xjmA6eu',
    'Osoto-gaeshi': '1B5uhJquIuFNsazq2zgccJ3tI1xkslbsx',
    'Ouchi-gaeshi': '1LYeLnAokuAT0ZZX84uj6tbllGfL49Jox',
    'Hane-goshi-gaeshi': '1NfE5_NpYS0B_qDiNJrHTpK1hW-6a_MH2',
    'Harai-goshi-gaeshi': '1zmnFfUsB9O8uHN__ysLYvGoHLuh49Wpy',
    'Uchi-mata-gaeshi': '1GTzUBlawDZO26aBKSsnmwMeiiGNacsNo',

    'Tomoe-nage': '1Knp-cH9YrhtUrV0B8CTDbb3ASMA3MXr0',
    'Sumi-gaeshi': '1UUlvdPspK0zD6w7Do46n04PW45WEjKw3',
    'Ura-nage': '1BzFjB0jg658uORGUvVrmFkR-HF5do3YS',

    'Yoko-otoshi': '1PfuYkPSak9l51saHFd2XaDan6Idns2Ai',
    'Tani-otoshi': '1dFt80N1fJ7_q8g978VOjEjCouIn6-fBf',
    'Hane-makikomi': '1H7V5v850iJAhpp7hQXQneLGsru1FkKXg',
    'Soto-makikomi': '1Pi2yBuxw_pSSx2AfHRbeS1lkXTdb4qtK',
    'Uchi-makikomi': '1wZ4IGUTBOYY7UluMgN3T6RSgEXraM0M1',
    'Uki-waza': '1Z3cxUvxv_ZN66mBI5nEHPQmJZPJEa0gZ',
    'Yoko-wakare': '1gJVWUxCEPSxWjphjIizCwCsH-F0Hc6G2',
    'Yoko-guruma': '1kvMt7_hjmTqW4hR-W_etsI-TeL0OEjJC',
    'Yoko-gake': '10pPjNEKZAMXwdUQUgtR2W8OtM3En5V8j',
    'Daki-wakare': '1ikIYTyxEmg3du9AOnxmsLFhw9RvJWapt',
    'Osoto-makikomi': '1neJ3CAwCtFc4HqGulThFVQBbZ_9XLyIC',
    'Uchi-mata-makikomi': '18gG1lx1R1Pm7KWETOOURqdKldeSKpWiV',
    'Harai-makikomi': '1dgmh-UfVhkLf3Zy3vPhHpDUJObDthB2V',

    'Kesa-gatame (Hon-kesa-gatame)': '1GR0LC57GaqTmkgmD3Op6_BWZG8hTaE2W',
    'Kuzure-kesa-gatame (Makura-kesa-gatame, Ushiro-kesa-gatame)': '1hueF66iGWVn47qh6w137h574hYaxZDGm',
    'Kata-gatame': '1cHfzSjBhN2PcYV8h-XFiusp6qJmPgv71',
    'Kami-shiho-gatame': '1fpvLWkfZlZ_ZYPqpHnS2tpXv0Ac3YwhO',
    'Kuzure-kami-shiho-gatame': '1LKkI0XZlP6wTQnzLGQPGketXkHr7Yadn',
    'Yoko-shiho-gatame': '1ksXsDbcKZr_XEB67guF1eGNmBH4PmI25',
    'Tate-shiho-gatame': '1oYeKB2hjcnuaYIQPFFmwWNpKBP1zFKBf',

    'Nami-juji-jime': '1GFXVwKWDM8mA39wZ4d3RVqgKoGmqzrEl',
    'Gyaku-juji-jime': '15-wx8mWAjp1FAetPsSQvBMZdxaaqYpOP',
    'Kata-juji-jime': '18Xs2h_rZukXslxZnuOTt4yZU9yhzwE3A',
    'Hadaka-jime': '1DJD1B8mvVL_km0uaxrB1pBhlMhmFRjpG',
    'Okuri-eri-jime': '1IT1dPuMa8kZ43z_T2feSDRQaI0hKnYQ5',
    'Kata-ha-jime': '1l5x1OKFmFM1r6f4wLMSH9GZNKGw3h1l8',
    'Sode-guruma-jime': '1Szh_pasFq45Sy9nvT_MwF8rymUpNGEHb',
    'Kata-te-jime': '1eP1AbBVoGNdGfqYyQdcD-1IfV2DlF7xb',
    'Ryo-te-jime': '1O3atX0-9WMtdIIAzkOQWKJNQ8Dah03yQ',
    'Tsukkomi-jime': '1IJSuofkBr6SBQApSNYDrxjSexialgwDJ',
    'Sankaku-jime': '1fU2P8d5FuAfWXPhAHSmB1en9yJ_T2UQ-',
    'Do-jime': '1cb93MFJaoNrH6cc3MMUvrY5QjCmS6p26',

    'Ude-garami': '1Ank2WxhuukvzGUjl6LBWe4dc5GJBlygR',
    'Ude-hishigi-juji-gatame': '1ApTbIHNLVk9D44dQ0sYOhtCVnTLtWhwY',
    'Ude-hishigi-ude-gatame': '1jLXZbNTC-bdjhRgucM0GbNnKBo3MDBbp',
    'Ude-hishigi-hiza-gatame': '1-b4vKFRSkU4E0maP-9kFQxY8_3OOyHGz',
    'Ude-hishigi-waki-gatame': '1Mq0rt5-BhjjGQpfOVEX61-Svnwa80dka',
    'Ude-hishigi-hara-gatame': '1FeE1JuMqNCWRwDUIcsK-2Ib7CC1Gpwe0',
    'Ude-hishigi-ashi-gatame': '1s62S4alJFnB6w547GZ_oxchXRGl0eoB1',
    'Ude-hishigi-te-gatame': '1B0qf3YS9sA8yaqNJkKsMH4DrhLnRkUe2',
    'Ude-hishigi-sankaku-gatame': '1RnGWkx3WJDA-tHC9qzL77OrD2NA22Amq'
  }
  function driveUrl(romaji){
    const id = DRIVE_TECHNIQUE_VIDEOS[String(romaji || '')];
    return id ? 'https://drive.google.com/file/d/' + id + '/view' : '';
  }
  // Public read-only mapping used by the player as a second line of defence.
  window.JUDO_DRIVE_VIDEO_URLS = Object.freeze(Object.fromEntries(
    Object.keys(DRIVE_TECHNIQUE_VIDEOS).map(function(k){ return [k, driveUrl(k)]; })
  ));

  function attach(){
    try {
      const data = window.JUDO_TERMINOLOGY_TECHNIQUES || window.TERMINOLOGY_DATA?.techniques;
      if (!Array.isArray(data)) return false;
      let count = 0;
      data.forEach(function(t){
        const url = driveUrl(t && t.romaji);
        if (url) { t.video2 = url; count++; }
      });
      window.JUDO_DRIVE_VIDEO_COUNT = count;
      return count > 0;
    } catch(e) { console.warn('Google Drive technique links:', e); return false; }
  }
  // library-ui.js already contains the source data. This file runs after it and
  // makes the Drive links explicit before video-player.js is initialized.
  if (!attach()) {
    let tries = 0;
    const timer = setInterval(function(){
      tries++;
      if (attach() || tries >= 20) clearInterval(timer);
    }, 100);
  }
})();
