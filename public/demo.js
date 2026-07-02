/* ════ DATA ════ */
const TEAMS=[
  {id:'R1',name:'Дискаунтер',     type:'Ритейлер',     kind:'ret', ico:'🛒',col:'#2563eb',char:'tough'},
  {id:'R2',name:'Супермаркет',     type:'Ритейлер',     kind:'ret', ico:'🛒',col:'#3b82f6',char:'analyst'},
  {id:'R3',name:'Гипермаркет',     type:'Ритейлер',     kind:'ret', ico:'🛒',col:'#6366f1',char:'cunning'},
  {id:'R4',name:'Премиум-маркет',  type:'Ритейлер',     kind:'ret', ico:'🛒',col:'#8b5cf6',char:'stubborn'},
  {id:'S1',name:'Базовый',         type:'Поставщик',    kind:'sup', ico:'🏭',col:'#15a34a',char:'stubborn'},
  {id:'S2',name:'Молочный завод',  type:'Поставщик',    kind:'sup', ico:'🏭',col:'#10b981',char:'coop'},
  {id:'S3',name:'Промо-поставщик', type:'Поставщик',    kind:'sup', ico:'🏭',col:'#14b8a6',char:'cunning'},
  {id:'S4',name:'Импортёр',        type:'Поставщик',    kind:'sup', ico:'🏭',col:'#0891b2',char:'analyst'},
  {id:'D', name:'Дистрибьютор',    type:'Дистрибьютор', kind:'dist',ico:'🚛',col:'#d97706',char:'coop'},
];
const T={}; TEAMS.forEach(t=>T[t.id]=t);
// Цвета col синхронизированы с единой палитрой CHARS_PALETTE (gameconfig.js);
// demo.html — standalone-объяснялка, поэтому держим копию + свои пастельные фоны.
const CHARS={
  tough:   {ico:'🦁',name:'Жёсткий',     col:'#dc2626',soft:'#fdecec',line:'#f6cccc',q:'Скидку ниже 8% не рассматриваю.'},
  analyst: {ico:'📊',name:'Аналитик',     col:'#2563eb',soft:'#eef3ff',line:'#d7e3ff',q:'По расчётам, 6% — оптимально.'},
  cunning: {ico:'🦊',name:'Хитрый',       col:'#b45309',soft:'#fbf1e6',line:'#f0d9bd',q:'У меня есть альтернативные предложения…'},
  stubborn:{ico:'😤',name:'Упрямый',      col:'#ea580c',soft:'#fdf0e8',line:'#f7d8c2',q:'Моя позиция неизменна.'},
  coop:    {ico:'🤝',name:'Кооперативный',col:'#15a34a',soft:'#ecfaf0',line:'#c9eed5',q:'Давайте найдём взаимовыгодное решение.'},
};
const ROLES={
  ret:[['🎩','Директор сети'],['📈','Аналитик спроса'],['📦','Директор по закупкам'],['🏷️','Категорийный менеджер']],
  sup:[['🎩','Генеральный директор'],['🏭','Директор производства'],['💼','Коммерческий директор'],['📊','Планировщик S&OP']],
  dist:[['🎩','Управляющий директор'],['🚚','Директор логистики'],['🤝','Менеджер по клиентам'],['🧮','Аналитик загрузки']],
};
// Цвета категорий — единый цвет-язык (совпадают с gameconfig.catColor)
const CATS=[['Бакалея','#ca8a04'],['Молочка','#0d9488'],['Снеки','#db2777'],['Деликатесы','#7c3aed']];

const TOURS=[
  {n:'Тур 1',label:'Стартовый рынок',demand:[120,90,70,45],
   evC:'#2563eb',evT:'Базовые условия рынка',evD:'Стабильный старт. Ориентируйтесь на тренды роста 3–8% по всем категориям.',
   trend:'📈 Стабильный рост — держите запасы',
   neg:[{a:'R1',b:'S1',l:'скидка −12%',c:'#2563eb'},{a:'R2',b:'D',l:'тариф 1.5 млн руб',c:'#d97706'},{a:'R3',b:'S4',l:'объём 45 ед.',c:'#9333ea'}],
   res:{health:75,bonus:188,winner:'Супермаркет',sub:{osa:82,def:85,bw:68,waste:80},
        board:[['R2',350],['R3',270],['D',142],['S2',92],['R1',80],['S3',70],['S1',60],['S4',48],['R4',40]],
        insight:'Аналитик Супермаркета точно угадал спрос на бакалею — минимум дефицита и максимум маржи.'}},
  {n:'Тур 2',label:'Промо-снеки',demand:[125,95,110,50],
   evC:'#d97706',evT:'Промо-акция: снеки +57%',evD:'Снеки взлетели с 70 до 110. Кто запасся снеками у Промо-поставщика — поймает волну.',
   trend:'🎪 Промо-хаос: снеки +57%, остальные +4–11%',
   neg:[{a:'R1',b:'S3',l:'промо снеки',c:'#ea580c'},{a:'R2',b:'S2',l:'промо молочка',c:'#2563eb'},{a:'D',b:'R3',l:'надбавка +20%',c:'#d97706'}],
   res:{health:62,bonus:155,winner:'Гипермаркет',sub:{osa:65,def:70,bw:50,waste:68},
        board:[['R3',330],['R2',315],['S3',195],['D',165],['R1',150],['S2',130],['S1',95],['S4',80],['R4',70]],
        insight:'Гипермаркет вовремя заказал снеки у Промо-поставщика — поймал волну спроса. Хлыст начал расти.'}},
  {n:'Тур 3',label:'Шок поставки',demand:[110,130,80,25],
   evC:'#dc2626',evT:'Дефицит мощности!',evD:'Молочка +37%, деликатесы −50%. Мощность Дистрибьютора 200 ед. — дефицит неизбежен.',
   trend:'💥 Шок цепочки — кто не договорился, теряет',
   neg:[{a:'D',b:'R1',l:'приоритет!',c:'#dc2626'},{a:'D',b:'R2',l:'приоритет!',c:'#dc2626'},{a:'S4',b:'R3',l:'квота 25 ед.',c:'#9333ea'}],
   res:{health:38,bonus:95,winner:'Дистрибьютор',sub:{osa:45,def:35,bw:30,waste:48},
        board:[['D',355],['R1',285],['R2',275],['S2',215],['S1',180],['R3',150],['S3',120],['S4',95],['R4',80]],
        insight:'Дистрибьютор — монополист. Здоровье цепочки 38% — антирекорд. Эффект хлыста в полную силу.'}},
  {n:'Тур 4',label:'Стабилизация',demand:[120,115,90,35],
   evC:'#15a34a',evT:'Рынок стабилен',evD:'Шанс восстановить цепочку. Долгосрочные сделки и кооперация дают бонус для всех.',
   trend:'🤝 Кооперация вознаграждается — бонус для всех',
   neg:[{a:'R1',b:'S1',l:'−15% надолго',c:'#2563eb'},{a:'R3',b:'S4',l:'+15 ед. объёма',c:'#9333ea'},{a:'R2',b:'D',l:'тариф 1.2 млн руб',c:'#d97706'}],
   res:{health:75,bonus:188,winner:'Супермаркет',sub:{osa:80,def:82,bw:68,waste:75},
        board:[['R2',432],['R3',392],['D',282],['S1',192],['S2',175],['R1',160],['S3',140],['S4',120],['R4',95]],
        insight:'Супермаркет договорился о тарифе 1.2 — минимум издержек. Пакт стабильности поднял здоровье до 75%.'}},
];
const FINALS=[
  {e:'🏆',t:'Гран-при',s:'Макс. суммарный счёт',id:'R2',sc:1428},
  {e:'🥇',t:'Лучший ритейлер',s:'Прибыль в типе',id:'R3',sc:1392},
  {e:'🥇',t:'Лучший поставщик',s:'Прибыль в типе',id:'S2',sc:1064},
  {e:'🤝',t:'Архитектор цепочки',s:'Вклад в здоровье',id:'D',sc:1184},
  {e:'📉',t:'Антихлыст',s:'Минимум колебаний',id:'S1',sc:980},
  {e:'🚚',t:'Лучший дистрибьютор',s:'Счёт выше среднего',id:'D',sc:1184},
];
const FINAL_BOARD=[['R2',1428],['R3',1392],['D',1184],['R1',1120],['S2',1064],['S3',1010],['S1',980],['S4',910],['R4',870]];

/* Совет команды — внутренние роли на примере «Супермаркета» (по турам) */
const COUNCIL=[
  {analyst:'Спрос растёт ровно: бакалея ~120, молочка 90, снеки 70. Резких событий нет — берём базовый прогноз +5%.',
   buyer:'Заказываю близко к спросу: бакалея 125, молочка 92 (скоропорт — не перебираю), снеки 72.',
   cat:'Цены держим стандартные. Промо пока не включаю — спрос и так стабилен.',
   director:'Иду к Базовому за скидкой на бакалею и к Перевозчику за нормальным тарифом. Жёстко не давлю — старт.'},
  {analyst:'Промо-волна: снеки взлетят с 70 до 110 (+57%). Но буст работает ТОЛЬКО при скидке поставщика ≥10%.',
   buyer:'Под снеки добираю объём, но осторожно — если промо не сложится, останусь с перезапасом.',
   cat:'Включаю промо на снеки и договариваюсь о скидке ≥10% — иначе буста не будет, только потеря маржи.',
   director:'Главная цель — Промо-поставщик. Иду первым, пока конкуренты не разобрали объём.'},
  {analyst:'Двойной шок: молочка +37%, деликатесы −50%, мощность Перевозчика урезана. Дефицит неизбежен.',
   buyer:'Молочка — скоропорт: перезакажу — спишу в убыток, недозакажу — пустая полка. Беру с запасом 10%.',
   cat:'Цены вверх по дефицитным позициям — спрос неэластичен, когда товара мало.',
   director:'Бьюсь за приоритет доставки у Перевозчика. Без него мой заказ просто не довезут.'},
  {analyst:'Рынок успокоился. Шанс восстановить сервис и заработать на стабильных, предсказуемых заказах.',
   buyer:'Заказываю ровно под спрос — никаких рывков. Стабильность заказов = здоровье цепочки = бонус всем.',
   cat:'Возвращаю нормальные цены. Долгосрочная скидка важнее разовой выгоды.',
   director:'Заключаю долгосрочные сделки: фиксированная скидка и низкий тариф. Пакт стабильности.'},
];

/* Обучающие сцены — объяснение ключевых механик */
const TEACH={
  score:{title:'Как считается успех команды', icon:'🎯',
    sub:'Два слагаемых: личная прибыль + бонус за здоровье всей цепочки',
    rows:[
      ['💰','Прибыль команды','Своя выручка минус затраты. У магазина: продажи × цена − закупка − тариф. У производителя: отгрузка − себестоимость. У перевозчика: тариф × объём.'],
      ['❤️','Бонус здоровья','Фонд 250 млн руб за тур × индекс здоровья H × личный вклад команды. Здоровье — общее: если цепочка здорова, бонус получают ВСЕ.'],
      ['⚖️','Личный вклад','Магазин — полнота полки (OSA), производитель — выполнение заказов, перевозчик — доля довезённого. Ничего не сделал → вклад 0 → бонуса нет.'],
    ],
    formula:'Счёт за тур = <span class="hl" style="background:#eef3ff;color:#2563eb">Прибыль</span> + <span class="hl" style="background:#ecfaf0;color:#15a34a">250 × H × вклад</span>',
    note:'<b>Побеждает умный, а не жадный.</b> Можно урвать прибыль и обрушить цепочку — но тогда H упадёт, и бонус потеряют все, включая вас.'},
  nego:{title:'Переговоры — два раунда, 4 пары одновременно', icon:'🤝',
    sub:'Раунд A: 4 пары «магазин↔поставщик» разом · Раунд B: спотлайт «магазин + дистрибьютор + все поставщики»',
    rows:[
      ['🔄','Раунд A · 4 пары разом','Одновременно работают 4 непересекающиеся пары «магазин↔поставщик»: скидка % и объём — одним предложением. За 4 волны каждый магазин успевает поговорить с каждым поставщиком (круговой турнир, без пересечений).'],
      ['🎯','Раунд B · спотлайт логистики','Один магазин + дистрибьютор + все поставщики за столом; проектор подсвечивает активный магазин. Обсуждают тариф (₽/ед) и приоритет доставки. Магазин в фокусе меняется 4 раза.'],
      ['📦','Договорённость = обязательство','Принятое подставляется в форму решений сразу в оба поля (скидка + объём). Отклонение поставки более чем на 10% штрафуется — слово на переговорах стоит денег.'],
    ],
    note:'В дефицитном Туре 3 приоритет доставки, о котором договорились в Раунде B, решает, чей заказ вообще довезут. Кто договорился заранее — переживёт шок.'},
  inventory:{title:'Перенос запасов — товар не теряется', icon:'📦',
    sub:'Непроданный нескоропорт переходит в следующий тур и продаётся там',
    rows:[
      ['📦','Остаток переходит','Непроданный нескоропорт (бакалея, снеки) переносится в следующий тур как стартовый запас магазина.'],
      ['🛒','Запас продаётся первым','В новом туре доступно к продаже = запас + новая поставка. Можно заказать меньше — часть товара уже на складе.'],
      ['❄️','Скоропорт списывается','Молочка не переносится: что не продано — убыток. Перезаказывать скоропорт по-прежнему опасно.'],
    ],
    note:'Перезаказ нескоропорта больше не «сгорает»: товар лежит и продаётся позже, но <b>хранение стоит −1000 ₽/ед за тур</b>. Считайте на тур вперёд.'},
  health:{title:'Из чего складывается «здоровье цепочки» H', icon:'❤️',
    sub:'Один индекс 0–100% из четырёх частей — общий для всех команд',
    bars:[
      ['Полка (OSA)',35,'Есть ли товар на полках магазинов. Главный вес.','#15a34a'],
      ['Нет дефицита',25,'Сколько спроса осталось неудовлетворённым по всей цепочке.','#2563eb'],
      ['Нет хлыста',25,'Насколько заказы раздулись относительно реального спроса.','#d97706'],
      ['Нет списаний',15,'Сколько скоропорта испортилось из-за перезаказа.','#db2777'],
    ],
    note:'Веса подобраны так, что <b>пустая полка и эффект хлыста</b> бьют по здоровью сильнее всего. Это и есть две главные болезни реальных цепочек поставок.'},
  bullwhip:{title:'Эффект хлыста — почему цепочку «раскачивает»', icon:'🌊',
    sub:'Маленькое колебание спроса → огромные колебания заказов вверх по цепочке',
    rows:[
      ['🛒','Магазин перестраховывается','Видит рост спроса на 10% — заказывает +30% «на всякий случай».'],
      ['🏭','Производитель усиливает','Видит скачок заказов — наращивает выпуск ещё сильнее, копит запас.'],
      ['💥','Цепочку срывает','Реальный спрос не вырос так сильно → перепроизводство, склады, списания, убытки у всех.'],
    ],
    note:'В игре хлыст прямо снижает здоровье цепочки. <b>Лекарство — делиться прогнозом</b> и заказывать близко к реальному спросу, а не к панике соседа.'},
  promo:{title:'Промо-механика — скидка должна быть настоящей', icon:'🎪',
    sub:'Промо даёт всплеск спроса ×1.5 — но только при выполнении условия',
    rows:[
      ['🏷️','Магазин включает промо','Категорийный менеджер ставит флаг «промо» на категорию (обычно снеки).'],
      ['🤝','Поставщик даёт скидку ≥10%','Буст спроса ×1.5 срабатывает ТОЛЬКО если скидка производителя ≥ 10%. Иначе — просто потеря маржи.'],
      ['📈','Всплеск спроса','При выполнении условия спрос на категорию вырастает в 1.5 раза — кто запасся, ловит волну.'],
    ],
    note:'Промо без скидки ≥10% — <b>деньги на ветер</b>: флаг стоит, а буста нет. Это договорённость магазина и поставщика на переговорах.'},
  shock:{title:'Тур 3 — двойной шок цепочки', icon:'💥',
    sub:'Самый напряжённый тур: проверка на кооперацию под давлением',
    rows:[
      ['🚚','Мощность перевозчика урезана','Перевозчик физически не довезёт всё, что заказали. Кому отдать приоритет — решают переговоры.'],
      ['🧀','Квота Импорта обрезана','Поставщик деликатесов не может выпустить столько, сколько хотят. Дефицитный товар — на вес золота.'],
      ['🥛','Молочка скачет','Спрос на скоропорт +37%. Перезакажешь — спишешь, недозакажешь — пустая полка.'],
    ],
    note:'Кто заранее <b>договорился о приоритете</b> с перевозчиком — переживёт шок. Кто действовал в одиночку — потеряет больше всех.'},
};

/* ════ SCENES ════ */
const SC=[
 {step:'— Старт —',type:'start',title:'Ведущий открывает игру',time:'Минута 0',
  hint:'Откройте игру и сообщите код комнаты участникам.',
  desc:'ВЕДУЩИЙ: «Займите места — одна команда за одним экраном. Перед вами цепочка поставок FMCG: 4 тура, в каждом 5 фаз. Цель — заработать максимум прибыли и сохранить здоровье цепочки. Сейчас раздам карточки ролей».'},
 {step:'Подготовка',type:'roles',title:'Распределение ролей и характеров',time:'Минуты 0–3',
  hint:'Раздайте карточки. Характер Директора задаёт переговорный стиль команды.',
  desc:'Ведущий раздаёт карточки ролей (🎩 Директор, 📈 Аналитик, 📦 Директор по закупкам, 📊 Планировщик) и характеров (🦁 / 🤝 / 🦊 / 😤 / 📊). Характер Директора определяет переговорный стиль всей команды. Кнопка «Перетасовать» назначает роли заново.'},

 {step:'Механика · 1 из 2',type:'teach',teach:'score',title:'Как считается успех',time:'Перед игрой',
  hint:'Объясните: важна не только своя прибыль, но и здоровье общей цепочки.',
  desc:'Счёт команды за тур = собственная прибыль + бонус за здоровье цепочки. Здоровье цепочки общее для всех, но бонус каждой команды масштабируется её личным вкладом. Это превращает игру из «каждый за себя» в баланс конкуренции и кооперации.'},
 {step:'Механика · 2 из 2',type:'teach',teach:'health',title:'Индекс здоровья цепочки',time:'Перед игрой',
  hint:'Покажите 4 составляющих здоровья — на них команды влияют решениями.',
  desc:'Здоровье H — это один индекс из четырёх частей: полнота полки, отсутствие дефицита, отсутствие эффекта хлыста, отсутствие списаний. Полка и хлыст весят больше всего.'},

 {step:'Тур 1 · Фаза 1 из 5',type:'briefing',t:0,title:'Брифинг — Стартовый рынок',time:'Минуты 3–10',
  hint:'Дайте командам изучить прогноз. Ритейлеры — главные на этой фазе.',
  desc:'Проектор показывает спрос по 4 категориям: Бакалея 120, Молочка 90, Снеки 70, Деликатесы 45. Аналитик строит прогноз, команда вырабатывает позицию для переговоров — кого просить и на каких условиях.'},
 {step:'Тур 1 · Фаза 2 из 5',type:'council',t:0,title:'Совет команды',time:'Минуты 10–15',
  hint:'Роли совещаются: аналитик — прогноз, директор по закупкам — объём, категорийщик — цена, директор — позиция.',
  desc:'Внутри команды каждая роль вносит свой вклад: аналитик читает рынок, директор по закупкам считает объёмы, категорийщик решает по цене и промо, директор сводит всё в позицию для переговоров. Так роли «оживают».'},
 {step:'Механика',type:'teach',teach:'nego',title:'Как устроены переговоры',time:'Перед переговорами',
  hint:'Два раунда: сначала 4 пары «магазин↔поставщик» одновременно, затем спотлайт с дистрибьютором.',
  desc:'Раунд A — 4 непересекающиеся пары «магазин↔поставщик» работают одновременно; за 4 волны каждый магазин встречается с каждым поставщиком (скидка и объём одним предложением). Раунд B — спотлайт: один магазин + дистрибьютор + все поставщики (тариф ₽/ед и приоритет доставки), магазин в фокусе меняется 4 раза. Принятое подставляется в форму решений.'},
 {step:'Тур 1 · Фаза 3 из 5',type:'pair',t:0,title:'Переговоры',time:'Минуты 15–25',
  hint:'Директора команд договариваются: скидки, тарифы, объёмы. Реплики зависят от характера.',
  desc:'Директора ведут переговоры между командами — скидки, тарифы, объёмы, приоритеты. Реплики зависят от характера Директора. Итоги фиксируются и подставляются в форму решений по умолчанию.'},
 {step:'Тур 1 · Фаза 4 из 5',type:'decisions',t:0,title:'Решения',time:'Минуты 25–32',
  hint:'Ждите, пока все команды сдадут решения. Итоги переговоров уже подставлены.',
  desc:'Команды вводят финальные данные: ритейлеры — заказы, цены, промо; поставщики — выпуск и скидки; Дистрибьютор — тариф и мощность. Статус-бар показывает, кто сдал. Кнопка «Отправить показатели».'},
 {step:'Тур 1 · Фаза 5 из 5',type:'results',t:0,title:'Расчёт — Итоги Тура 1',time:'Минуты 32–45',
  hint:'Объявите результаты. Прокомментируйте здоровье цепочки и разбор счёта лидера.',
  desc:'Супермаркет: прибыль 350 + бонус цепочки 188 = 538 млн руб Здоровье цепочки 75% — хороший старт. Ведущий разбирает, почему Супермаркет выиграл и где цепочка давала сбои.'},

 {step:'Механика',type:'teach',teach:'inventory',title:'Перенос запасов между турами',time:'Разбор после Тура 1',
  hint:'Объясните: непроданный нескоропорт переходит в след. тур, скоропорт списывается.',
  desc:'Что магазин не продал из нескоропорта — переносится в следующий тур как стартовый запас и продаётся там (можно заказать меньше). Скоропорт списывается. За хранение остатка — −1000 ₽/ед за тур. Это заставляет думать на тур вперёд.'},
 {step:'Механика',type:'teach',teach:'bullwhip',title:'Эффект хлыста',time:'Разбор после Тура 1',
  hint:'Главная болезнь цепочек. Покажите, как перестраховка раздувает заказы.',
  desc:'Эффект хлыста — почему цепочку «раскачивает»: маленькое колебание спроса превращается в огромные колебания заказов вверх по цепочке. Это прямо снижает здоровье и бьёт по всем.'},

 {step:'Механика',type:'teach',teach:'promo',title:'Промо-механика',time:'Перед Туром 2',
  hint:'Объясните условие промо-буста: скидка поставщика ≥10%, иначе буста нет.',
  desc:'Промо даёт всплеск спроса ×1.5 — но только если поставщик дал скидку ≥10%. Промо без скидки — просто потеря маржи. Это договорённость магазина и поставщика на переговорах.'},
 {step:'Тур 2 · Фаза 1 из 5',type:'briefing',t:1,title:'Брифинг — Промо-снеки',time:'Минуты 46–53',
  hint:'Промо-акция. Снеки под давлением, аналитик переключает прогноз.',
  desc:'Снеки выросли с 70 до 110 (+57%) — промо-акция. Бакалея и молочка тоже растут. Кто заключил сделку с Промо-поставщиком — получит дефицитный товар.'},
 {step:'Тур 2 · Фаза 2 из 5',type:'council',t:1,title:'Совет команды',time:'Минуты 53–58',
  hint:'Категорийщик решает по промо, аналитик предупреждает про условие скидки ≥10%.',
  desc:'Команда решает, ставить ли промо на снеки. Аналитик напоминает: буст сработает только при скидке поставщика ≥10%. Директор по закупкам считает риск перезапаса, если промо не сложится.'},
 {step:'Тур 2 · Фаза 3 из 5',type:'pair',t:1,title:'Переговоры — фокус на снеки',time:'Минуты 58–68',
  hint:'Конкуренция за Промо-поставщика максимальная.',
  desc:'Все хотят Промо-поставщика. Ключевые сделки: Дискаунтер → Промо снеки, Супермаркет → Молочный завод промо-молочка, Дистрибьютор → Гипермаркет надбавка +20%.'},
 {step:'Тур 2 · Фаза 4 из 5',type:'decisions',t:1,title:'Решения Тура 2',time:'Минуты 68–75',
  hint:'Промо-поставщик вводит увеличенный объём производства.',
  desc:'Форма показывает договорённости по снекам. Команды корректируют цифры. Промо-поставщик вводит увеличенный объём. Кнопка «Отправить показатели».'},
 {step:'Тур 2 · Фаза 5 из 5',type:'results',t:1,title:'Расчёт — Итоги Тура 2',time:'Минуты 75–90',
  hint:'Обратите внимание на эффект хлыста — здоровье начало падать.',
  desc:'Гипермаркет выигрывает тур: 330 + 155 = 485 млн руб Здоровье цепочки упало до 62% — эффект хлыста: Промо-поставщик перепроизвёл снеки.'},

 {step:'Механика',type:'teach',teach:'shock',title:'Двойной шок Тура 3',time:'Перед Туром 3',
  hint:'Самый напряжённый тур. Кто договорился о приоритете — переживёт.',
  desc:'В Туре 3 урезают мощность перевозчика и квоту Импорта, а спрос на скоропорт скачет. Дефицит неизбежен — выигрывает тот, кто заранее договорился о приоритете доставки.'},
 {step:'Тур 3 · Фаза 1 из 5',type:'briefing',t:2,title:'Брифинг — Шок поставки',time:'Минуты 91–98',
  hint:'Дефицит мощности. Кто договорился с Дистрибьютором — получит приоритет.',
  desc:'Двойной шок: молочка +37%, деликатесы −50%. Мощность Дистрибьютора 200 ед. — дефицит неизбежен. Самый напряжённый тур.'},
 {step:'Тур 3 · Фаза 2 из 5',type:'council',t:2,title:'Совет команды',time:'Минуты 98–103',
  hint:'Директор по закупкам балансирует скоропорт, директор готовит борьбу за приоритет.',
  desc:'Команда решает под давлением дефицита: директор по закупкам аккуратно с молочкой-скоропортом, категорийщик поднимает цены на дефицит, директор готовится биться за приоритет доставки.'},
 {step:'Тур 3 · Фаза 3 из 5',type:'pair',t:2,title:'Переговоры — борьба за мощность',time:'Минуты 103–113',
  hint:'Дистрибьютор в позиции монополиста — характеры проявляются полностью.',
  desc:'Дистрибьютор раздаёт приоритеты Дискаунтеру и Супермаркету. Импортёр квотирует Гипермаркет: 25 ед. вместо 40. Самые острые переговоры игры.'},
 {step:'Тур 3 · Фаза 4 из 5',type:'decisions',t:2,title:'Решения Тура 3',time:'Минуты 113–120',
  hint:'Команды вводят решения в условиях неопределённости.',
  desc:'Команды вводят решения, не зная наверняка, получат ли поставку. После отправки — тревожное ожидание расчёта.'},
 {step:'Тур 3 · Фаза 5 из 5',type:'results',t:2,title:'Расчёт — Итоги Тура 3',time:'Минуты 120–135',
  hint:'Покажите, как кооперация могла помочь. Здоровье — антирекорд.',
  desc:'Дистрибьютор выигрывает тур: 355 + 95 = 450 млн руб Здоровье цепочки 38% — антирекорд! Ведущий разбирает ошибки команд.'},

 {step:'Тур 4 · Фаза 1 из 5',type:'briefing',t:3,title:'Брифинг — Стабилизация',time:'Минуты 136–143',
  hint:'Финальный тур. Долгосрочные сделки дают бонус.',
  desc:'Рынок стабилен. Шанс восстановить цепочку. Супермаркет и Гипермаркет идут ноздря в ноздрю — всё решится здесь.'},
 {step:'Тур 4 · Фаза 2 из 5',type:'council',t:3,title:'Совет команды',time:'Минуты 143–148',
  hint:'Команда делает ставку на стабильность — ровные заказы ради бонуса всем.',
  desc:'Команда решает играть на стабильность: ровные заказы под спрос, нормальные цены, долгосрочные сделки. Стабильность заказов = здоровье цепочки = бонус всем командам.'},
 {step:'Тур 4 · Фаза 3 из 5',type:'pair',t:3,title:'Переговоры — долгосрочные сделки',time:'Минуты 148–158',
  hint:'Бонус здоровья получают ВСЕ — стимул к кооперации.',
  desc:'Ключевые сделки: Дискаунтер → Базовый −15% надолго, Гипермаркет → Импортёр +15 ед., Супермаркет → Дистрибьютор тариф 1.2. «Пакт стабильности» — впервые все выигрывают вместе.'},
 {step:'Тур 4 · Фаза 4 из 5',type:'decisions',t:3,title:'Решения Тура 4',time:'Минуты 158–165',
  hint:'Команды максимально точны — ошибка стоит дорого.',
  desc:'Последняя форма ввода. Команды максимально точны. После отправки — подтверждение и обратный отсчёт до расчёта.'},
 {step:'Тур 4 · Фаза 5 из 5',type:'results',t:3,title:'Расчёт — Итоги Тура 4',time:'Минуты 165–180',
  hint:'Здоровье восстановилось. Готовьтесь к финалу.',
  desc:'Супермаркет: 432 + 188 = 620 млн руб — лучший тур за игру. Здоровье восстановилось до 75%. Гипермаркет второй.'},

 {step:'— Финал —',type:'final',title:'Итоговый рейтинг и победители',time:'Минута 180',
  hint:'Поздравьте победителей! Проведите дебриф.',
  desc:'Супермаркет — Гран-при с 1428 млн руб! Победа за счёт точного прогноза, кооперации с Дистрибьютором и стабильных заказов. Дистрибьютор — Архитектор цепочки. Базовый — Антихлыст.'},
];

/* ════ HELPERS ════ */
const $=id=>document.getElementById(id);
const hCol=h=>h>=70?'var(--good)':h>=50?'var(--warn)':'var(--bad)';
const hWord=h=>h>=70?'хорошо':h>=50?'удовлетв.':'опасно';
const tag=id=>id.replace('R','Р').replace('S','П');

function sidebar(active,status){
  const grp=(lbl,ids)=>`<div class="sb-h">${lbl}</div>`+ids.map(id=>{
    const t=T[id], on=!active||active.includes(t.kind), st=status&&status[id];
    const right=st?`<span class="sb-fl" style="color:${st.c}">${st.x}</span>`:`<span class="sb-tag">${tag(id)}</span>`;
    return `<div class="sb-t ${active?(on?'on':'dim'):''}"><span class="sb-dot" style="background:${t.col}"></span>
      <span class="sb-ic">${t.ico}</span><span class="sb-n">${t.name}</span>${right}</div>`;
  }).join('');
  const ready=status?Object.values(status).filter(s=>s.x==='✓').length:9;
  $('sb').innerHTML=grp('Ритейлеры',['R1','R2','R3','R4'])+grp('Поставщики',['S1','S2','S3','S4'])+grp('Дистрибьютор',['D'])+
    `<div class="sb-sp"></div>
     <div class="sb-card"><div class="k">Готовы сдать решения</div><div class="v">${ready} <small>/ 9</small></div>
       <div class="sb-prog"><div style="width:${Math.round(ready/9*100)}%"></div></div></div>
     <div class="sb-hint"><div class="k">Подсказка ведущему</div><div class="t" id="sb-hint"></div></div>`;
}

function pStart(){return `<div class="hero"><div class="pill">IBS</div>
  <h1>FMCG-цепочка<br>поставок</h1>
  <div class="lead">Деловая игра · 9 команд · 4 тура · 5 фаз в каждом</div>
  <div class="code"><div class="k">Код комнаты</div><div class="c">47-C9-X2</div><div class="s">Сообщите участникам для входа</div></div></div>`;}

function pRoles(){
  const cards=TEAMS.map((t,i)=>{const c=CHARS[t.char];
    const roles=ROLES[t.kind].map(r=>`<div class="tc-r"><span class="e">${r[0]}</span><span>${r[1]}</span></div>`).join('');
    return `<div class="tc" style="--cc:${t.col};--chs:${c.soft};--chl:${c.line};--chc:${c.col};animation-delay:${i*.04}s">
      <div class="tc-top"><span class="tc-ic">${t.ico}</span><div><div class="tc-nm">${t.name}</div><div class="tc-ty" style="--cc:${t.col}">${t.type} · ${tag(t.id)}</div></div></div>
      <div class="tc-ch"><span class="i">${c.ico}</span><span class="n">${c.name}</span></div>
      <div class="tc-rl">${roles}</div></div>`;}).join('');
  return `<div class="ph"><div class="ph-head"><div><div class="ph-h1">Распределение ролей и характеров</div>
    <div class="ph-sub">9 команд · до 4 игроков · роли и характеры розданы случайно</div></div>
    <div class="ph-tag"><div class="k">Команд</div><div class="v" style="color:var(--ibs)">9</div></div></div>
    <div class="ph-body"><div class="roles">${cards}</div></div></div>`;}

function pBrief(ti){
  const tr=TOURS[ti], mx=Math.max(...tr.demand);
  const bars=CATS.map((c,i)=>`<div class="dem-row"><div class="dem-top"><span class="dem-cat">${c[0]}</span>
    <span class="dem-val" style="color:${c[1]}">${tr.demand[i]}</span></div>
    <div class="dem-bar"><div style="width:${Math.round(tr.demand[i]/mx*100)}%;background:${c[1]}"></div></div></div>`).join('');
  return `<div class="ph"><div class="ph-head"><div><div class="ph-h1">Прогноз спроса · ${tr.n}</div>
    <div class="ph-sub">${tr.label} — общий экран для всех команд</div></div>
    <div class="ph-tag"><div class="k">Тур</div><div class="v" style="color:var(--ibs)">${ti+1}<span style="font-size:15px;color:var(--ink3);font-weight:700"> / 4</span></div></div></div>
    <div class="ph-body"><div class="g2">
      <div class="card card-pad"><div class="card-lbl">Ожидаемый спрос по категориям (ед.)</div><div class="dem">${bars}</div></div>
      <div class="rcol">
        <div class="card card-pad ev" style="--ev:${tr.evC}"><div class="l">⚡ Событие тура</div><div class="t">${tr.evT}</div><div class="d">${tr.evD}</div></div>
        <div class="stats">
          <div class="card card-pad stat"><div class="k">Участники</div><div class="v" style="color:var(--ink)">9</div><div class="s">команд онлайн</div></div>
          <div class="card card-pad stat"><div class="k">Категорий</div><div class="v" style="color:var(--ibs)">4</div><div class="s">К1–К4</div></div>
        </div>
        <div class="trend">${tr.trend}</div>
      </div></div></div></div>`;}

function pPair(ti){
  const tr=TOURS[ti], d0=tr.neg[0], a=T[d0.a], b=T[d0.b], ca=CHARS[a.char], cb=CHARS[b.char];
  const party=(t,c,role)=>`<div class="party" style="--pc:${t.col}">
    <div class="party-top"><span class="e">${t.ico}</span><div><div class="nm">${t.name}</div><div class="ty" style="color:${t.col}">${role}</div></div></div>
    <div class="party-ch" style="--chs:${c.soft};--chl:${c.line};--chc:${c.col}"><span class="i">${c.ico}</span><span class="n">Директор: ${c.name}</span></div>
    <div class="bubble" style="--chc:${c.col}">«${c.q}»</div></div>`;
  const chips=tr.neg.map(d=>`<div class="deal-chip"><b>${T[d.a].name}</b><span style="color:var(--ink3)">↔</span><b>${T[d.b].name}</b>
    <span class="bg" style="background:${d.c}1f;color:${d.c}">${d.l}</span></div>`).join('');
  return `<div class="ph"><div class="ph-head"><div><div class="ph-h1">Переговоры · ${tr.n}</div>
    <div class="ph-sub">Раунд A: 4 пары «магазин↔поставщик» идут параллельно — показан один стол. Реплики зависят от характера Директора</div></div>
    <div class="ph-tag"><div class="k">Фаза</div><div class="v" style="color:var(--ibs)">3<span style="font-size:15px;color:var(--ink3);font-weight:700"> / 5</span></div></div></div>
    <div class="ph-body"><div class="pair">
      <div class="duel">
        ${party(a,ca,a.kind==='ret'?'Ритейлер':a.type)}
        <div class="duel-mid"><span class="cap">переговоры</span><span class="arr">↔</span>
          <span class="badge" style="background:${d0.c}1f;color:${d0.c}">${d0.l}</span></div>
        ${party(b,cb,b.type)}
      </div>
      <div class="deals-strip"><div class="l">Пары этого раунда идут одновременно · итоги фиксируются в решениях</div><div class="deals-row">${chips}</div></div>
    </div></div></div>`;}

function pGroup(ti){
  const tr=TOURS[ti];
  const col=(ids,c,soft)=>ids.map(id=>`<div class="fitem" style="background:${soft}"><span>${T[id].ico}</span><span>${T[id].name}</span></div>`).join('');
  return `<div class="ph"><div class="ph-head"><div><div class="ph-h1">Групповые переговоры · ${tr.n}</div>
    <div class="ph-sub">Все команды договариваются через Дистрибьютора</div></div></div>
    <div class="ph-body"><div class="flow">
      <div class="fcol"><div class="h" style="color:var(--ret)">Ритейлеры</div>${col(['R1','R2','R3','R4'],'','var(--ret-soft)')}</div>
      <div class="farr">→</div>
      <div class="fhub"><div class="e">🚛</div><div class="n">Дистрибьютор</div><div class="s">Центр координации</div></div>
      <div class="farr">→</div>
      <div class="fcol"><div class="h" style="color:var(--sup)">Поставщики</div>${col(['S1','S2','S3','S4'],'','var(--sup-soft)')}</div>
    </div></div></div>`;}

function pCouncil(ti){
  const tr=TOURS[ti], c=COUNCIL[ti], team=T['R2'];
  const data=[
    ['📈','Аналитик спроса','#2563eb',c.analyst,'📊','Прогноз готов'],
    ['📦','Директор по закупкам','#15a34a',c.buyer,'📦','Объёмы заказа'],
    ['🏷️','Категорийный менеджер','#d97706',c.cat,'🏷️','Цена и промо'],
    ['🎩','Директор сети','#db2777',c.director,'🎩','Позиция на переговоры'],
  ];
  const cards=data.map((r,i)=>`<div class="rc" style="--rcc:${r[2]};animation-delay:${i*.06}s">
    <div class="rc-top"><span class="rc-ic">${r[0]}</span><div><div class="rc-nm">${r[1]}</div><div class="rc-du" style="color:${r[2]}">${team.name}</div></div></div>
    <div class="rc-say">«${r[3]}»</div>
    <div class="rc-out"><span class="e">${r[4]}</span><span>${r[5]}</span></div></div>`).join('');
  return `<div class="ph"><div class="ph-head"><div><div class="ph-h1">Совет команды · ${tr.n}</div>
    <div class="ph-sub">Внутри команды роли совещаются перед переговорами — на примере «${team.name}»</div></div>
    <div class="ph-tag"><div class="k">Фаза</div><div class="v" style="color:var(--ibs)">2<span style="font-size:15px;color:var(--ink3);font-weight:700"> / 5</span></div></div></div>
    <div class="ph-body"><div class="council">${cards}</div></div></div>`;
}

function pTeach(key){
  const t=TEACH[key];
  let left='';
  if(t.rows){
    left=`<div class="tcard2"><div class="tk">Как это работает</div><div class="tlist">`+
      t.rows.map(r=>`<div class="tli"><span class="e">${r[0]}</span><div><div class="tt">${r[1]}</div><div class="td">${r[2]}</div></div></div>`).join('')+
      `</div></div>`;
  } else if(t.bars){
    left=`<div class="tcard2"><div class="tk">Четыре составляющих · вес в индексе</div><div class="tbars">`+
      t.bars.map(b=>`<div class="tbar"><div class="tbh"><span>${b[0]}</span><span class="w" style="color:${b[3]}">${b[1]}%</span></div>
        <div class="tt2"><div style="width:${Math.round(b[1]/35*100)}%;background:${b[3]}"></div></div>
        <div class="td" style="font-size:12px;color:var(--ink2);margin-top:6px;line-height:1.45">${b[2]}</div></div>`).join('')+
      `</div></div>`;
  }
  let right=`<div class="tcard2">`;
  if(t.formula) right+=`<div class="tk">Формула</div><div class="tformula">${t.formula}</div>`;
  else right+=`<div class="tk">Почему это важно</div>`;
  right+=`<div style="flex:1;min-height:10px"></div><div class="tnote"><span class="i">💡</span><div class="t">${t.note}</div></div></div>`;
  return `<div class="ph"><div class="ph-head"><div><div class="ph-h1">${t.icon} ${t.title}</div>
    <div class="ph-sub">${t.sub}</div></div><div class="ph-tag"><div class="k">Механика</div><div class="v">${t.icon}</div></div></div>
    <div class="ph-body"><div class="teach">${left}${right}</div></div></div>`;
}

function pDecisions(ti){
  const tr=TOURS[ti], done=['R1','R2','R3','S1','S2','S3','S4'];
  const status={}; TEAMS.forEach(t=>status[t.id]=done.includes(t.id)?{x:'✓',c:'var(--good)'}:{x:'…',c:'var(--warn)'});
  const cells=TEAMS.map(t=>{const ok=done.includes(t.id);
    return `<div class="stc ${ok?'ok':'wt'}"><span class="e">${t.ico}</span>
      <div class="info"><div class="nm">${t.name}</div><div class="ty" style="color:${t.col}">${t.type}</div></div>
      <span class="fl" style="color:${ok?'var(--good)':'var(--warn)'}">${ok?'✓':'…'}</span></div>`;}).join('');
  const orders=[tr.demand[0]+5,tr.demand[1]+2,tr.demand[2]-3,tr.demand[3]+2], prices=['16.5','22.0','18.0','35.0'], promo=[true,false,true,false];
  const rows=CATS.map((c,i)=>`<tr><td><div class="fcat"><span class="fdot" style="background:${c[1]}"></span>${c[0]}</div></td>
    <td><span class="ffore">${tr.demand[i]}</span></td><td><input class="finp" value="${orders[i]}"></td>
    <td><input class="finp pr" value="${prices[i]}"></td><td><input type="checkbox" class="fchk" ${promo[i]?'checked':''}></td></tr>`).join('');
  return {status, html:`<div class="ph"><div class="ph-head"><div><div class="ph-h1">Решения · ${tr.n}</div>
    <div class="ph-sub">Так выглядит экран команды. Итоги переговоров уже подставлены</div></div>
    <div class="ph-tag"><div class="k">Сдали</div><div class="v" style="color:var(--good)">7<span style="font-size:15px;color:var(--ink3);font-weight:700"> / 9</span></div></div></div>
    <div class="ph-body"><div class="dec">
      <div><div class="card-lbl" style="margin-bottom:11px">Статус команд</div><div class="stgrid">${cells}</div>
        <div class="decnote"><span class="i">⏳</span><span class="t">Ждём Премиум-маркет и Дистрибьютора. Ведущий следит за таймером (≈2:14) и не запускает расчёт, пока не сдадут все.</span></div></div>
      <div><div class="card-lbl" style="margin-bottom:11px">Интерфейс ввода (команда «Супермаркет»)</div>
        <div class="form"><div class="form-h">💻 Супермаркет · ${tr.n}</div>
          <table class="ftbl"><thead><tr><th>Категория</th><th>Прогноз</th><th>Заказ</th><th>Цена</th><th>Промо</th></tr></thead><tbody>${rows}</tbody></table>
          <div class="form-f"><span class="h">Заполните поля и подтвердите</span><button class="bsub">📤 Отправить показатели</button></div></div></div>
    </div></div></div>`};
}

function pResults(ti){
  const tr=TOURS[ti], r=tr.res, ranks=['🥇','🥈','🥉'];
  const rows=r.board.map(([id,p],i)=>{const x=T[id], tot=p+r.bonus;
    return `<div class="lbr" style="--rc:${x.col};animation-delay:${i*.04}s">
      <div class="rk">${ranks[i]||(i+1)}</div>
      <div class="lbt"><span class="e">${x.ico}</span><div><div class="n">${x.name}</div><div class="ty" style="color:${x.col}">${x.type}</div></div></div>
      <div class="lbn" style="color:var(--ink2)">${p}</div><div class="lbn" style="color:var(--good)">+${r.bonus}</div>
      <div class="lbn" style="color:var(--ink3)">${x.kind==='dist'?'—':r.sub.osa+'%'}</div><div class="lbtot">${tot}</div></div>`;}).join('');
  const sub=[['OSA',r.sub.osa],['Дефицит',r.sub.def],['Хлыст',r.sub.bw],['Списания',r.sub.waste]];
  const subBars=sub.map(([nm,v])=>`<div class="hs"><span class="nm">${nm}</span><div class="bar"><div style="width:${v}%;background:${hCol(v)}"></div></div><span class="vv" style="color:${hCol(v)}">${v}</span></div>`).join('');
  const win=T[r.board[0][0]], winP=r.board[0][1];
  return `<div class="ph"><div class="ph-head"><div><div class="ph-h1">Итоги ${tr.n}</div>
    <div class="ph-sub">Счёт = Прибыль + Бонус здоровья · бонус = 250 × H × вклад команды</div></div></div>
    <div class="ph-body"><div class="res">
      <div class="card lb"><div class="lbh"><div>#</div><div>Команда</div><div style="text-align:right">Прибыль</div>
        <div style="text-align:right">Бонус</div><div style="text-align:right">OSA</div><div style="text-align:right">Итого</div></div>
        <div class="lbb">${rows}</div></div>
      <div class="hcol">
        <div class="card card-pad hbig"><div class="k">Индекс здоровья цепочки H</div>
          <div class="v" style="color:${hCol(r.health)}">${r.health}%</div><div class="w" style="color:${hCol(r.health)}">${hWord(r.health)}</div>
          <div class="hsub">${subBars}</div></div>
        <div class="card card-pad" style="padding:14px 16px"><div class="k" style="font-size:10px;font-weight:800;color:var(--ink3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:9px">Разбор счёта лидера · ${win.name}</div>
          <div style="display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;font-size:14px">
            <span style="color:var(--ink2)">${winP} прибыль</span><span style="color:var(--ink3)">+</span>
            <span style="color:var(--good)">${r.bonus} бонус</span><span style="color:var(--ink3)">=</span>
            <span style="font-weight:900;font-size:18px">${winP+r.bonus} млн руб</span></div>
          <div style="font-size:12px;color:var(--ink3);margin-top:6px;line-height:1.4">Бонус = 250 × ${(r.health/100).toFixed(2)} H × вклад. Здоровье общее — этот же бонус получают все, кто работал.</div></div>
        <div class="ins"><span class="i">💡</span><div><div class="k">Инсайт тура</div><div class="t">${r.insight}</div></div></div>
      </div></div></div></div>`;}

function pFinal(){
  const aw=FINALS.map((a,i)=>{const x=T[a.id];
    return `<div class="aw" style="animation-delay:${.15+i*.08}s"><div class="e">${a.e}</div><div class="t">${a.t}</div><div class="s">${a.s}</div>
      <div class="win"><div class="we">${x.ico}</div><div class="wn" style="color:${x.col}">${x.name}</div><div class="ws">${a.sc} млн руб</div></div></div>`;}).join('');
  const ranks=['🥇','🥈','🥉'];
  const board=FINAL_BOARD.map(([id,tot],i)=>{const x=T[id];
    return `<div class="lbr" style="--rc:${x.col};grid-template-columns:34px 1fr 110px;animation-delay:${i*.04}s">
      <div class="rk">${ranks[i]||(i+1)}</div>
      <div class="lbt"><span class="e">${x.ico}</span><div><div class="n">${x.name}</div><div class="ty" style="color:${x.col}">${x.type}</div></div></div>
      <div class="lbtot">${tot} <span style="font-size:11px;color:var(--ink3);font-weight:600">млн руб</span></div></div>`;}).join('');
  return `<div class="ph"><div class="ph-body"><div class="fin"><div class="tr">🏆</div><h1>Финал игры</h1>
    <div class="lead">FMCG-цепочка поставок · 4 тура завершены</div>
    <div class="awards">${aw}</div>
    <div class="card finlb"><div class="lbb">${board}</div></div></div></div></div>`;}

/* ════ NAV ════ */
let cur=0, playing=false, timer=null, fillTimer=null, fillStart=0;
const DUR={start:9000,roles:11000,teach:13000,briefing:11000,council:12000,pair:12000,group:9000,decisions:13000,results:13000,final:14000};

function render(){
  const s=SC[cur];
  $('i-step').textContent=s.step; $('i-title').textContent=s.title; $('i-desc').textContent=s.desc; $('i-time').textContent=s.time;
  $('ctrl-lbl').textContent=(cur+1)+' из '+SC.length;
  let html='', status=null, active=null;
  if(s.type==='start')html=pStart();
  else if(s.type==='roles')html=pRoles();
  else if(s.type==='teach')html=pTeach(s.teach);
  else if(s.type==='briefing'){html=pBrief(s.t);active=['ret'];}
  else if(s.type==='council'){html=pCouncil(s.t);active=['ret'];}
  else if(s.type==='pair')html=pPair(s.t);
  else if(s.type==='group'){html=pGroup(s.t);active=['dist'];}
  else if(s.type==='decisions'){const d=pDecisions(s.t);html=d.html;status=d.status;}
  else if(s.type==='results')html=pResults(s.t);
  else if(s.type==='final')html=pFinal();
  $('stage').innerHTML=html;
  sidebar(active,status);
  const h=$('sb-hint'); if(h)h.textContent=s.hint;
  dots(); resetFill();
  if(playing){startFill(DUR[s.type]||11000);schedNext(DUR[s.type]||11000);}
}
function goTo(i){if(i<0||i>=SC.length)return;clearTimeout(timer);cur=i;render();}
function prev(){clearTimeout(timer);stopFill();if(cur>0)goTo(cur-1);}
function next(){clearTimeout(timer);stopFill();if(cur<SC.length-1)goTo(cur+1);}
function schedNext(d){clearTimeout(timer);timer=setTimeout(()=>{if(!playing)return;if(cur<SC.length-1)goTo(cur+1);else{playing=false;updatePP();}},d);}
function togglePlay(){playing=!playing;updatePP();const d=DUR[SC[cur].type]||11000;if(playing){startFill(d);schedNext(d);}else{clearTimeout(timer);stopFill();}}
function updatePP(){$('btn-pp').textContent=playing?'⏸ Пауза':'▶ Играть';}
function startFill(d){clearInterval(fillTimer);fillStart=Date.now();fillTimer=setInterval(()=>{const p=Math.min(100,(Date.now()-fillStart)/d*100);$('tlfill').style.width=p+'%';if(p>=100)clearInterval(fillTimer);},40);}
function stopFill(){clearInterval(fillTimer);}
function resetFill(){$('tlfill').style.width='0%';}
function dots(){$('dots').innerHTML=SC.map((s,i)=>`<div class="dot" id="d${i}" title="${s.step}" onclick="goTo(${i})"></div>`).join('');SC.forEach((_,i)=>{const e=$('d'+i);if(e)e.className='dot'+(i<cur?' done':i===cur?' cur':'');});}

render(); updatePP();
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'){e.preventDefault();next();}
  if(e.key==='ArrowLeft'){e.preventDefault();prev();}
  if(e.key===' '){e.preventDefault();togglePlay();}
});