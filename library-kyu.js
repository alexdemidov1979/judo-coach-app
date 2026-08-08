  // ================= АТТЕСТАЦИЯ ПО КЮ (официальная программа ФДР) =================
  // Источник: «Положение о порядке аттестационной деятельности по присвоению
  // квалификационных степеней КЮ и ДАН в дзюдо» (ПО-2025, Приложение №2),
  // Общероссийская общественная организация «Федерация дзюдо России».
  const KYU_DATA = {
    '5': {
      label: '5 кю · жёлтый',
      groups: [
        { title: 'Нагэ-вадза (броски)', items: [
          {jp:'出足払', romaji:'De-ashi-barai', ru:'боковая подсечка под выставленную ногу'},
          {jp:'膝車', romaji:'Hiza-guruma', ru:'подсечка в колено'},
          {jp:'浮腰', romaji:'Uki-goshi', ru:'бросок скручиванием вокруг бедра'},
          {jp:'大腰', romaji:'O-goshi', ru:'бросок через бедро подбивом'},
          {jp:'大外刈', romaji:'O-soto-gari', ru:'отхват'},
          {jp:'大内刈', romaji:'O-uchi-gari', ru:'зацеп изнутри голенью'}
        ]},
        { title: 'Катамэ-вадза (удержания)', items: [
          {jp:'本袈裟固', romaji:'Hon-kesa-gatame', ru:'удержание сбоку'},
          {jp:'崩袈裟固', romaji:'Kuzure-kesa-gatame', ru:'удержание сбоку с захватом руки под плечо'},
          {jp:'横四方固', romaji:'Yoko-shiho-gatame', ru:'удержание поперёк'},
          {jp:'後袈裟固', romaji:'Ushiro-kesa-gatame', ru:'обратное удержание сбоку'}
        ]}
      ]
    },
    '4': {
      label: '4 кю · оранжевый',
      groups: [
        { title: 'Нагэ-вадза (броски)', items: [
          {jp:'送足払', romaji:'Okuri-ashi-barai', ru:'боковая подсечка в темп шагов'},
          {jp:'小内刈', romaji:'Ko-uchi-gari', ru:'подсечка под пятку изнутри'},
          {jp:'小外刈', romaji:'Ko-soto-gari', ru:'подсечка под пятку снаружи'},
          {jp:'釣込腰', romaji:'Tsuri-komi-goshi', ru:'бросок через бедро с захватом рукава и отворота'},
          {jp:'体落', romaji:'Tai-otoshi', ru:'передняя подножка'},
          {jp:'背負投', romaji:'Seoi-nage', ru:'бросок через спину'},
          {jp:'一本背負投', romaji:'Ippon-seoi-nage', ru:'бросок через спину с захватом руки под плечо'}
        ]},
        { title: 'Катамэ-вадза (удержания)', items: [
          {jp:'縦四方固', romaji:'Tate-shiho-gatame', ru:'удержание сверху'},
          {jp:'上四方固', romaji:'Kami-shiho-gatame', ru:'удержание со стороны головы'},
          {jp:'枕袈裟固', romaji:'Makura-kesa-gatame', ru:'удержание сбоку с захватом ноги'},
          {jp:'肩固', romaji:'Kata-gatame', ru:'удержание плечом с захватом головы и руки'}
        ]}
      ]
    },
    '3': {
      label: '3 кю · зелёный',
      groups: [
        { title: 'Нагэ-вадза (броски)', items: [
          {jp:'払腰', romaji:'Harai-goshi', ru:'подхват под две ноги'},
          {jp:'腰車', romaji:'Koshi-guruma', ru:'бросок через бедро с захватом шеи'},
          {jp:'内股', romaji:'Uchi-mata', ru:'подхват изнутри под одну ногу'},
          {jp:'支釣込足', romaji:'Sasae-tsuri-komi-ashi', ru:'передняя подсечка'},
          {jp:'小外掛', romaji:'Ko-soto-gake', ru:'зацеп голенью снаружи'},
          {jp:'巴投', romaji:'Tomoe-nage', ru:'бросок через голову с упором стопы в живот'},
          {jp:'谷落', romaji:'Tani-otoshi', ru:'посадка'},
          {jp:'背負落', romaji:'Seoi-otoshi', ru:'бросок через спину с колен'}
        ]},
        { title: 'Катамэ-вадза (удержания и болевые/удушающие)', items: [
          {jp:'三角固', romaji:'Sankaku-gatame', ru:'удержание ногами (треугольником)'},
          {jp:'浮固', romaji:'Uki-gatame', ru:'удержание'},
          {jp:'送襟絞', romaji:'Okuri-eri-jime', ru:'удушающий приём скрещивая отвороты сзади'},
          {jp:'片羽絞', romaji:'Kata-ha-jime', ru:'удушающий приём отворотом с захватом руки под плечо'},
          {jp:'十字絞', romaji:'Juji-jime', ru:'удушающий приём скрещивая отвороты спереди'},
          {jp:'腕挫十字固', romaji:'Ude-hishigi-juji-gatame', ru:'рычаг локтя с захватом руки между ног'},
          {jp:'腕固', romaji:'Ude-gatame', ru:'рычаг локтя'}
        ]}
      ]
    },
    '2': {
      label: '2 кю · синий',
      groups: [
        { title: 'Нагэ-вадза (броски)', items: [
          {jp:'袖釣込腰', romaji:'Sode-tsurikomi-goshi', ru:'бросок через бедро с захватом рукавов'},
          {jp:'跳腰', romaji:'Hane-goshi', ru:'подхват изнутри под одноимённую ногу'},
          {jp:'外巻込', romaji:'Soto-makikomi', ru:'бросок скручиванием с захватом руки над плечом'},
          {jp:'足車', romaji:'Ashi-guruma', ru:'подхват под две ноги с упором в колено'},
          {jp:'隅返', romaji:'Sumi-gaeshi', ru:'бросок через голову подбивом голенью'},
          {jp:'引込返', romaji:'Hikkomi-gaeshi', ru:'бросок через голову подбивом голенью и захватом пояса сверху'},
          {jp:'後腰', romaji:'Ushiro-goshi', ru:'подбив бедром сзади'},
          {jp:'裏投', romaji:'Ura-nage', ru:'бросок через грудь прогибом'}
        ]},
        { title: 'Катамэ-вадза (удушения и болевые)', items: [
          {jp:'腰絞', romaji:'Koshi-jime', ru:'удушающий приём отворотом с выседом бедром'},
          {jp:'袖車絞', romaji:'Sode-guruma-jime', ru:'удушающий приём с захватом рукава'},
          {jp:'三角絞', romaji:'Sankaku-jime', ru:'удушающий приём ногами (треугольником)'},
          {jp:'腕緘', romaji:'Ude-garami', ru:'узел локтя'},
          {jp:'腕挫脚固', romaji:'Ude-hishigi-ashi-gatame', ru:'рычаг локтя ногами'},
          {jp:'腕挫三角固', romaji:'Ude-hishigi-sankaku-gatame', ru:'рычаг локтя с захватом головы и руки ногами (треугольником)'}
        ]}
      ]
    },
    '1': {
      label: '1 кю · коричневый',
      groups: [
        { title: 'Нагэ-вадза (броски)', items: [
          {jp:'払巻込', romaji:'Harai-makikomi', ru:'подхват под две ноги с захватом руки над плечом'},
          {jp:'大外巻込', romaji:'Osoto-makikomi', ru:'отхват с захватом руки над плечом'},
          {jp:'内股巻込', romaji:'Uchimata-makikomi', ru:'подхват изнутри с захватом руки над плечом'},
          {jp:'横落', romaji:'Yoko-otoshi', ru:'боковая подножка на пятке'},
          {jp:'横車', romaji:'Yoko-guruma', ru:'бросок через грудь скручиванием'},
          {jp:'肩車', romaji:'Kata-guruma', ru:'бросок через плечи («мельница»)'},
          {jp:'手車', romaji:'Te-guruma', ru:'боковой переворот'},
          {jp:'双手刈', romaji:'Morote-gari', ru:'бросок с захватом двух ног'},
          {jp:'朽木倒', romaji:'Kuchiki-taoshi', ru:'бросок с захватом одной ноги'}
        ]},
        { title: 'Катамэ-вадза (удушения и болевые)', items: [
          {jp:'裸絞', romaji:'Hadaka-jime', ru:'удушающий приём руками'},
          {jp:'片手絞', romaji:'Katate-jime', ru:'удушающий приём с захватом отворота одной рукой'},
          {jp:'両手絞', romaji:'Ryote-jime', ru:'удушающий приём с захватом отворота двумя руками'},
          {jp:'突込絞', romaji:'Tsukkomi-jime', ru:'удушающий приём кулаком'},
          {jp:'腕挫手固', romaji:'Ude-hishigi-te-gatame', ru:'рычаг локтя через руку'},
          {jp:'腕挫腋固', romaji:'Ude-hishigi-waki-gatame', ru:'рычаг локтя с захватом руки подмышкой'},
          {jp:'腕挫腹固', romaji:'Ude-hishigi-hara-gatame', ru:'рычаг локтя с упором в живот'},
          {jp:'腕挫膝固', romaji:'Ude-hishigi-hiza-gatame', ru:'рычаг локтя с помощью колена'}
        ]}
      ]
    }
  };
    let kyuFilter = '5';

