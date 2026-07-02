'use strict';

// ━━━ CONSTANTS (из единого конфига public/gameconfig.js) ━━━
const RETS = GAME_CONFIG.retIds, SUPS = GAME_CONFIG.supIds, ALL = GAME_CONFIG.allTeams;
const P = GAME_CONFIG;   // экономика и константы — эталон (зеркало server.js)

// ━━━ ДВИЖОК: единый public/engine.js. Лаборатория — режим «песочницы» (sanitize:false):
// без игровых капов (свой шок/спрос), но математика та же, что на сервере. Возвращает supC (не supCoeff).
const calcRound = (r, d, inv) => GAME_ENGINE.calcRound(r, d, { sanitize: false, inv: inv || undefined });

// ━━━ STRATEGIES ━━━
const STRATS = {
  ret:{
    'Агрессивный':    {of:[1.15,1.28],pc:0.65,dr:[0.12,0.20],prc:0,desc:'Низкие цены, перезаказ, промо'},
    'Консервативный': {of:[0.72,0.88],pc:0.06,dr:[0,0.04],   prc:1,desc:'Недозаказ, минимум риска'},
    'Рыночный':       {of:[0.95,1.08],pc:0.28,dr:[0.05,0.11], prc:1,desc:'Баланс объёма и маржи'},
    'Промо-фанат':    {of:[1.08,1.22],pc:0.88,dr:[0.14,0.22], prc:0,desc:'Максимум промо на всех кат.'},
  },
  sup:{
    'Максималист':  {pf:[0.97,1.00],desc:'Всегда на пределе мощностей'},
    'Осторожный':   {pf:[0.60,0.74],desc:'Производит только под твёрдые заказы'},
    'Точный':       {pf:[0.90,1.01],desc:'Планирует близко к ожидаемому спросу'},
    'Реактивный':   {pf:[0.80,0.92],desc:'Умеренно консервативен'},
  },
  dist:{
    'Монополист':   {tr:[1.90,2.50],desc:'Высокий тариф — максимизирует прибыль'},
    'Партнёр':      {tr:[1.10,1.38],desc:'Низкий тариф — поддерживает цепочку'},
    'Оптимизатор':  {tr:[1.48,1.72],desc:'Балансирует тариф и загрузку'},
  },
};

// ━━━ SCENARIOS ━━━
const SCENARIOS = {
  bullwhip:{
    name:'🌊 Эффект хлыста', color:'#3d6cb5',
    desc:'Ритейлеры гонятся за спросом и перезаказывают. Поставщики следуют за заказами. Цепочка раскачивается.',
    strats:{R1:'Агрессивный',R2:'Агрессивный',R3:'Агрессивный',R4:'Агрессивный',S1:'Максималист',S2:'Максималист',S3:'Максималист',S4:'Максималист',D:'Монополист'},
    params:{noise:15,shock:200,boost:15},
    discuss:['Насколько сильнее «раскачались» заказы поставщиков по сравнению с колебаниями спроса?','Кто проиграл больше всего от перезапаса в Туре 3?','Как бы изменилась ситуация, если бы ритейлеры делились прогнозами с поставщиками?'],
  },
  promo:{
    name:'🎪 Промо-хаос', color:'#ff9f0a',
    desc:'Все ритейлеры жмут промо одновременно. Буст в Туре 2 — искусственный. После — запасы, дефицит и убытки.',
    strats:{R1:'Промо-фанат',R2:'Промо-фанат',R3:'Промо-фанат',R4:'Рыночный',S1:'Реактивный',S2:'Максималист',S3:'Максималист',S4:'Точный',D:'Оптимизатор'},
    params:{noise:10,shock:200,boost:20},
    discuss:['В каком туре промо дало наибольший буст? Почему он оказался временным?','Кто заработал на промо-хаосе, а кто потерял?','Что произошло с запасами Молочки и Фреша когда все одновременно заказали под промо?'],
  },
  ideal:{
    name:'🤝 Идеальная координация', color:'#34c759',
    desc:'Команды делятся прогнозами и заказывают точно. Это базовый уровень — используйте для сравнения.',
    strats:{R1:'Рыночный',R2:'Рыночный',R3:'Рыночный',R4:'Рыночный',S1:'Точный',S2:'Точный',S3:'Точный',S4:'Точный',D:'Партнёр'},
    params:{noise:4,shock:200,boost:15},
    discuss:['Насколько выше прибыль цепочки по сравнению со сценарием «Хаос»?','Какая минимальная координация нужна для такого результата?','Что мешает реализовать этот сценарий на практике?'],
  },
  stress:{
    name:'💥 Стресс-тест', color:'#f85149',
    desc:'Максимальный шок в Туре 3: мощность перевозчика 120 ед., квота Импорта — 20 ед. Кто выживает? Кто теряет всё?',
    strats:{R1:'Агрессивный',R2:'Рыночный',R3:'Рыночный',R4:'Консервативный',S1:'Осторожный',S2:'Осторожный',S3:'Реактивный',S4:'Точный',D:'Монополист'},
    params:{noise:20,shock:120,boost:15},
    discuss:['Как дистрибьютор должен был распределить ограниченные 120 ед.? Было ли это справедливо?','Кто принял правильное решение заранее, а кто пострадал от шока?','Какие буферные запасы помогли бы пережить этот шок?'],
  },
  free:{
    name:'🎲 Свободный рынок', color:'#bc8cff',
    desc:'Смешанные стратегии — каждый за себя, переговоры не сложились. Реалистичный сценарий без координации.',
    strats:{R1:'Агрессивный',R2:'Рыночный',R3:'Промо-фанат',R4:'Консервативный',S1:'Реактивный',S2:'Максималист',S3:'Точный',S4:'Осторожный',D:'Оптимизатор'},
    params:{noise:12,shock:200,boost:15},
    discuss:['Чья стратегия оказалась наиболее выигрышной? Почему?','Где стратегии команд конфликтовали друг с другом?','Что нужно согласовать минимально, чтобы улучшить общий результат?'],
  },
  custom:{
    name:'🛠 Свой сценарий', color:'#22d3ee',
    desc:'Задайте собственный спрос по турам, шок перевозчика и промо-буст. Полный контроль над рынком.',
    strats:{R1:'Рыночный',R2:'Рыночный',R3:'Промо-фанат',R4:'Консервативный',S1:'Точный',S2:'Реактивный',S3:'Максималист',S4:'Осторожный',D:'Оптимизатор'},
    params:{noise:10,shock:200,boost:15},
    discuss:['Как заданный вами спрос повлиял на дефицит и эффект хлыста?','Какой уровень шока перевозчика ломает цепочку?','Какая комбинация спроса и стратегий даёт самое здоровое равновесие?'],
  },
};

const TEAM_ICO  = {R1:'🛒',R2:'🛒',R3:'🛒',R4:'🛒',S1:'🏭',S2:'🏭',S3:'🏭',S4:'🏭',D:'🚛'};
const TEAM_TYPE = {R1:'ret',R2:'ret',R3:'ret',R4:'ret',S1:'sup',S2:'sup',S3:'sup',S4:'sup',D:'dist'};
const TEAM_ROLE = {R1:'Дискаунтер',R2:'Супермаркет',R3:'Гипермаркет',R4:'Премиум',
                   S1:'Базовый',S2:'Fresh',S3:'Промо-хиты',S4:'Импорт',D:'Дистрибьютор'};
// Тип бизнеса команды (понятный префикс вместо кодов Р/П/Д)
const TYPE = {R1:'Магазин',R2:'Магазин',R3:'Магазин',R4:'Магазин',
              S1:'Производитель',S2:'Производитель',S3:'Производитель',S4:'Производитель',D:'Перевозчик'};
// LBL = различимое короткое имя для подписей/графиков (без кодов)
const LBL = {...TEAM_ROLE};
const turLabel = i => `Тур ${i+1}`;
const DEMO_NAMES={
  R1:['Близко&Дёшево','ЦенаБит','АльфаМаркет'],R2:['УютМаркет','СвежийГород','МегаФреш'],
  R3:['ГиперКолосс','МаксМолл','КупольТорг'],R4:['ПремиумСити','ЭлитМаркет','ЛюксФуд'],
  S1:['АгроПром','МассФуд','БазисСнаб'],
  S2:['ФрешЛайн','СвежестьПлюс','ЗеленьПро'],S3:['ПромоСила','БустФуд','АктивПром'],
  S4:['ИмпортЭлит','ПремиумФуд','ЕвроТрейд'],D:['ЛогоМакс','ТрансФуд','ЭффектДист'],
};
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
const rnd  = (a,b) => a+Math.random()*(b-a);
const f0   = v => Math.round(v||0);
const f1   = v => parseFloat(v||0).toFixed(1);
// ━━━ СИСТЕМА СЧЁТА (движок — общий public/engine.js, как на сервере) ━━━
const { clamp01, roundProfit, contribOf } = GAME_ENGINE;
const chainHealth = res => GAME_ENGINE.chainHealth(res);   // r-арг не нужен: engine читает res.d
const BONUS_FUND = P.bonusFund; // фонд бонуса здоровья (единый источник — gameconfig.js)

// ━━━ CHARACTERS ━━━
const CHARS = {
  'Жёсткий': {ico:'🦁',clr:'#dc2626',desc:'Диктует условия. Не идёт на уступки.',
    conc:0.08,dmd:1.55,thr:0.88,
    open:[
      '{V} — моё условие. Это не старт переговоров, это финал.',
      'Ценю ваше время, поэтому сразу: {V}. Других вариантов нет.',
      'Рынок на моей стороне. Работаем на {V} или ищите другого.',
      '{V}. Точка. Дальше обсуждать нечего.',
      'Скажу один раз: {V}. Можем сэкономить время.',
    ],
    ctr:[
      'Нет. {V} — это максимум.',
      'Слышу вас. Ответ: нет. Стою на {V}.',
      'Ваш вариант мне неинтересен. {V}, как сказал.',
      'Это не торг. Мой потолок — {V}. Финально.',
    ],
    ok:['Принято. {V}. Работаем.','Фиксируем {V}. Договор в силе.','{V}. Согласен. Двигаемся дальше.'],
    no:['Сделки нет. Советую пересмотреть позицию.','Без взаимопонимания — не работаем. Удачи.','Ваши условия неприемлемы. Разговор окончен.']
  },
  'Кооперативный': {ico:'🤝',clr:'#15a34a',desc:'Ищет взаимную выгоду. Легко уступает.',
    conc:0.60,dmd:1.15,thr:0.50,
    open:[
      'Предлагаю {V} — думаю, это честно для нас обоих.',
      'Хочу найти решение, при котором все выигрывают. Моя стартовая позиция — {V}.',
      'Смотрите: {V} выгодно нам обоим. Вы получаете стабильность, я — предсказуемый поток.',
      'Для меня важна долгосрочная работа с вами. Поэтому {V} — честное предложение.',
    ],
    ctr:[
      'Понимаю вашу логику. Готов сдвинуться до {V} — надеюсь, это снимает вопрос.',
      'Хорошо, давайте {V}. Я иду навстречу — рассчитываю на взаимность.',
      'Могу сделать {V}. Это значительная уступка, но ради партнёрства — стоит.',
      'Слышу вас. {V} — пробую вам навстречу. Устроит?',
    ],
    ok:[
      'Отлично! {V} — договорились. Рад работать с вами.',
      'Принято. {V}. Вот так и строится сильная цепочка!',
      'Супер, {V}. Хорошая сделка для всех звеньев.',
    ],
    no:['Жаль, не договорились. Но я открыт — вернёмся к теме позже.','Не сложилось. Надежды не теряю, давайте думать дальше.']
  },
  'Хитрый': {ico:'🦊',clr:'#b45309',desc:'Завышает запрос. Делает ложные уступки.',
    conc:0.35,dmd:1.80,thr:0.72,
    open:[
      'Знаю, звучит амбициозно, но {V} — это реальная рыночная ставка прямо сейчас.',
      'Между нами: мог бы запросить выше. Специально для вас — {V}.',
      'Начну с {V}. Я понимаю, что много. Но у меня есть данные, которые это обосновывают.',
      'Рынок сейчас позволяет требовать больше. Вам — как партнёру — предлагаю {V}.',
    ],
    ctr:[
      'Хорошо, специально для вас — {V}. Это уже на грани моей рентабельности.',
      'Вижу, что вы серьёзный партнёр. Уступаю до {V} — ниже буквально себе в убыток.',
      'Последняя уступка: {V}. Дальше физически не могу двигаться.',
      'Скрипя сердцем: {V}. Это дно для меня. Всё.',
    ],
    ok:[
      '{V}. Принимаю. Умеете торговаться — уважаю.',
      'Согласен на {V}. Что ж, неплохая работа с вашей стороны.',
      'Ладно, {V}. Вы меня убедили. Фиксируем.',
    ],
    no:['Пока не готов. Подумайте — мои условия разумные.','Жаль. Но я не тороплюсь — рынок на моей стороне.']
  },
  'Упрямый': {ico:'😤',clr:'#ea580c',desc:'Держит позицию. Не реагирует на аргументы.',
    conc:0.05,dmd:1.30,thr:0.92,
    open:[
      '{V}. Это моя позиция.',
      'Говорю один раз: {V}.',
      'Нужно {V}. Точка.',
    ],
    ctr:[
      'Нет. {V}.',
      'Позиция не меняется. {V}.',
      'Уже сказал: {V}. Повторять не стану.',
      'Слышал вас. Ответ прежний: {V}.',
    ],
    ok:['Хорошо. {V}.','Ладно. {V}.','Принято. {V}.'],
    no:['Нет.','Договорённости нет.','Нет смысла продолжать.']
  },
  'Аналитик': {ico:'📊',clr:'#2563eb',desc:'Обосновывает цифрами. Принимает взвешенно.',
    conc:0.42,dmd:1.22,thr:0.68,
    open:[
      'По нашей модели оптимальная точка — {V}. Минимизирует издержки обеих сторон.',
      'Сделал расчёт. При текущей конфигурации рынка справедливое значение — {V}.',
      '{V} — это равновесная точка. Отклонение в любую сторону снижает суммарную маржу цепочки.',
      'Смотрите цифры: при {V} ROI выше у обеих сторон, чем при любом другом варианте.',
    ],
    ctr:[
      'Пересчитал с вашими вводными. Получается {V}. Математика не врёт.',
      'Ваш запрос не сходится экономически. Компромисс: {V} — обоснованно.',
      'С учётом маржи обеих сторон оптимум — {V}. Это не прихоть, это арифметика.',
      'Модель говорит: {V} — единственное устойчивое решение.',
    ],
    ok:[
      'Цифры сошлись: {V}. Принято. Хорошее решение.',
      '{V} — математически верно. Фиксируем.',
      'Данные подтверждают: {V} работает для нас обоих. Принято.',
    ],
    no:['Экономически не обосновано при текущих параметрах. Отказываюсь.','Модель не сходится. Согласиться не могу.']
  },
};
// Иконку и цвет берём из единой палитры (gameconfig.js); локально — только реплики/коэффициенты.
Object.keys(CHARS).forEach(k=>{ const p=GAME_CONFIG.CHARS_PALETTE[k]; if(p){ CHARS[k].ico=p.ico; CHARS[k].clr=p.clr; } });

// ━━━ ВНУТРИКОМАНДНЫЕ РОЛИ (до 4 на команду; роль[0] = Директор, ведёт переговоры) ━━━
const ROLE_SETS = {
  ret: [
    {ico:'🎩',title:'Директор сети',       duty:'Финальное решение, переговоры', lead:true},
    {ico:'🏷️',title:'Категорийный менеджер',duty:'Цена и промо'},
    {ico:'📦',title:'Директор по закупкам',  duty:'Объёмы заказов поставщикам'},
    {ico:'📈',title:'Аналитик спроса',      duty:'Прогноз и чтение рынка'},
  ],
  sup: [
    {ico:'🎩',title:'Генеральный директор', duty:'Стратегия, переговоры', lead:true},
    {ico:'🏭',title:'Директор производства',duty:'Объём выпуска'},
    {ico:'💼',title:'Коммерческий директор',duty:'Отпускные цены и скидки'},
    {ico:'📊',title:'Планировщик S&OP',     duty:'Баланс мощности и спроса'},
  ],
  dist: [
    {ico:'🎩',title:'Управляющий директор', duty:'Тариф, переговоры', lead:true},
    {ico:'🚚',title:'Директор логистики',   duty:'Распределение мощностей'},
    {ico:'🤝',title:'Менеджер по клиентам', duty:'Приоритеты при дефиците'},
    {ico:'🧮',title:'Аналитик загрузки',    duty:'Оптимизация тарифа'},
  ],
};
const hexA = (hex,a) => {const h=hex.replace('#','');return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;};

// Default characters per scenario
const SCENARIO_CHARS = {
  bullwhip:{R1:'Жёсткий',R2:'Жёсткий',R3:'Жёсткий',R4:'Упрямый',S1:'Упрямый',S2:'Упрямый',S3:'Упрямый',S4:'Жёсткий',D:'Жёсткий'},
  promo:   {R1:'Хитрый',R2:'Хитрый',R3:'Хитрый',R4:'Аналитик',S1:'Аналитик',S2:'Кооперативный',S3:'Кооперативный',S4:'Аналитик',D:'Упрямый'},
  ideal:   {R1:'Кооперативный',R2:'Кооперативный',R3:'Кооперативный',R4:'Кооперативный',S1:'Кооперативный',S2:'Кооперативный',S3:'Кооперативный',S4:'Кооперативный',D:'Кооперативный'},
  stress:  {R1:'Жёсткий',R2:'Аналитик',R3:'Аналитик',R4:'Кооперативный',S1:'Упрямый',S2:'Упрямый',S3:'Аналитик',S4:'Кооперативный',D:'Жёсткий'},
  free:    {R1:'Жёсткий',R2:'Хитрый',R3:'Кооперативный',R4:'Аналитик',S1:'Аналитик',S2:'Упрямый',S3:'Кооперативный',S4:'Аналитик',D:'Хитрый'},
  custom:  {R1:'Аналитик',R2:'Аналитик',R3:'Хитрый',R4:'Кооперативный',S1:'Аналитик',S2:'Кооперативный',S3:'Хитрый',S4:'Аналитик',D:'Хитрый'},
};

// Negotiation pairs per round
// why = «ставка» сделки: кто чего хочет и почему это важно (режим истории)
const NEG_PAIRS = [
  // R0: Стартовый рынок
  [
    {from:'R1',to:'S1',subj:'скидку на бакалею',        type:'dsc',fromWant:0.15,toWant:0.04,
     why:'Дискаунтер живёт за счёт низких цен и хочет скидку побольше, чтобы давить ценой на полке. Производитель бакалеи бережёт маржу — большая скидка съест его прибыль.'},
    {from:'R2',to:'D', subj:'тариф за доставку',        type:'tar',fromWant:1.2, toWant:2.2,
     why:'Супермаркет хочет платить за доставку поменьше. Перевозчик — единственный в цепочке и хочет тариф повыше: чем дороже доставка, тем больше его прибыль.'},
    {from:'R3',to:'S4',subj:'объём поставки деликатесов',type:'vol',fromWant:'45 ед.',toWant:'30 ед.',
     why:'Гипермаркет хочет забрать побольше деликатесов — на них высокая наценка. Но мощность импортного производителя ограничена, и он не готов обещать так много.'},
  ],
  // R1: Промо-инициатива
  [
    {from:'R1',to:'S3',subj:'промо-скидку на снеки',     type:'dsc',fromWant:0.18,toWant:0.06,promo:true,
     why:'Открылось промо-окно: скидка ≥10% даёт всплеск спроса на снеки. Дискаунтер хочет глубокую скидку, чтобы запустить буст. Производитель снеков боится отдать товар почти даром.'},
    {from:'R2',to:'S2',subj:'промо-скидку на молочку',   type:'dsc',fromWant:0.14,toWant:0.05,promo:true,
     why:'Супермаркет хочет промо на молочку. Опасность: молочка быстро портится — если все закажут под промо, а спрос не выкупит, излишки придётся списать в убыток.'},
    {from:'D', to:'R3',subj:'надбавку за большой объём',  type:'tar',fromWant:2.0, toWant:1.4,
     why:'Перевозчик хочет надбавку с гипермаркета за крупную партию под промо. Гипермаркет упирается: лишняя надбавка убьёт всю выгоду от промо.'},
  ],
  // R2: Внешнее событие (шок)
  [
    {from:'D', to:'R1',subj:'приоритет в доставке при дефиците',type:'pri',fromWant:'60 ед.',toWant:'100 ед.',
     why:'Шок: мощность перевозчика резко урезана, на всех не хватит. Дискаунтер требует, чтобы его заказы везли в первую очередь. Перевозчик решает, кому достанется дефицитная доставка.'},
    {from:'D', to:'R2',subj:'приоритет в доставке при дефиците',type:'pri',fromWant:'50 ед.',toWant:'90 ед.',
     why:'Супермаркет тоже борется за приоритет в доставке. Кого перевозчик поставит в очередь первым — тот наполнит полки, остальные останутся с пустыми.'},
    {from:'S4',to:'R3',subj:'долю в дефицитной квоте деликатесов',type:'vol',fromWant:'10 ед.',toWant:'15 ед.',
     why:'Квоту на импортные деликатесы урезали — товара на всех не хватает. Гипермаркет хочет урвать побольше, импортный производитель готов дать меньше, чем тот просит.'},
  ],
  // R3: Стабилизация
  [
    {from:'R1',to:'S1',subj:'долгосрочную скидку на бакалею',type:'dsc',fromWant:0.12,toWant:0.03,
     why:'Рынок успокоился. Дискаунтер предлагает зафиксировать скидку на бакалею надолго — стабильность в обмен на цену. Производитель взвешивает: предсказуемый поток против меньшей маржи.'},
    {from:'R3',to:'S4',subj:'восстановление объёма деликатесов',type:'vol',fromWant:'50 ед.',toWant:'40 ед.',
     why:'После шока гипермаркет хочет вернуть прежние объёмы деликатесов. Импортный производитель осторожен: восстанавливать мощность быстро рискованно.'},
    {from:'R2',to:'D', subj:'снижение тарифа за доставку',  type:'tar',fromWant:1.3, toWant:1.9,
     why:'Супермаркет давит на перевозчика: кризис прошёл, пора снижать тариф. Перевозчик не спешит расставаться с высокой маржой, которую закрепил во время шока.'},
  ],
];

// Вводная по ситуации тура (режим истории — «что происходит и почему»)
const NEG_INTRO = [
  '<b>Тур 1. Рынок открывается.</b> Команды впервые прощупывают друг друга. Магазины хотят закупать дешевле, производители — держать маржу, перевозчик — задрать тариф. От этих сделок зависят стартовые позиции на весь матч.',
  '<b>Тур 2. Промо-инициатива.</b> Скидка ≥10% даёт всплеск спроса — соблазнительно для всех. Но если все ударят промо одновременно, цепочку захлестнёт перезаказ, а скоропорт пойдёт в списание. Кто сторгует выгодную скидку, не подставив соседей?',
  '<b>Тур 3. Внешний шок.</b> Мощность перевозчика и квота на импорт резко урезаны — товара на всех не хватит. Переговоры идут не про цену, а про выживание: кому достанется дефицитная доставка и квота.',
  '<b>Тур 4. Стабилизация.</b> Кризис позади. Время фиксировать долгосрочные условия и восстанавливать объёмы. Кто закрепит выгодные договорённости на финал — тот и заберёт призовые места.',
];

// ━━━ SIM STATE ━━━
let SIM = {scenarioId:'bullwhip', strats:{...SCENARIOS.bullwhip.strats},
           chars:{...SCENARIO_CHARS.bullwhip}, teamSize:4, rosters:{},
           params:{noise:15,shock:200,boost:15}, names:{}, demand:null,
           decisions:[], results:[], narratives:[], totals:{}, scores:{}, round:-1,
           negSessions:[], negPairs:[], negOutcomes:{}, ab:{A:null,B:null}};
// Эталонный спрос — чтобы переключать P.demand между обычными сценариями и «Своим»
const BASE_DEMAND = JSON.parse(JSON.stringify(P.demand));

// ━━━ SETUP UI ━━━
function initSetupUI() {
  // Scenario grid
  const sg = document.getElementById('sc-grid');
  sg.innerHTML = Object.entries(SCENARIOS).map(([id,sc])=>
    `<div class="sc-card ${SIM.scenarioId===id?'sel':''}" id="sc-${id}"
       style="--sc-color:${sc.color};${SIM.scenarioId===id?`border-color:${sc.color}`:''}"
       onclick="selScenario('${id}')">
      <div class="sc-ico">${sc.name.split(' ')[0]}</div>
      <div class="sc-name">${sc.name.split(' ').slice(1).join(' ')}</div>
      <div class="sc-desc">${sc.desc}</div>
    </div>`
  ).join('');
  renderStratGrid();
  renderCharGrid();
  renderCustomDemand();
  renderABPanel();
}

// ── Редактор спроса для сценария «Свой» ──
function renderCustomDemand() {
  const box = document.getElementById('custom-demand');
  if (!box) return;
  if (SIM.scenarioId !== 'custom') { box.style.display = 'none'; return; }
  if (!SIM.demand) SIM.demand = JSON.parse(JSON.stringify(P.demand));   // старт от эталонного спроса
  const cats = P.catIds;
  const rows = SIM.demand.map((row,r)=>`<tr><td>${turLabel(r)}</td>${
    row.map((v,ci)=>`<td><input type="number" id="cd-${r}-${ci}" value="${v}" oninput="updCustomDemand(${r},${ci},this.value)"></td>`).join('')
  }</tr>`).join('');
  box.style.display = 'block';
  box.innerHTML = `<div class="wif"><div class="wlbl" style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--W3);margin-bottom:8px">🛠 Спрос по турам и категориям (ед.) — задайте свой рынок</div>
    <table class="wtbl"><thead><tr><th>Тур</th>${cats.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div style="font-size:11px;color:var(--W3);margin-top:8px">Шок перевозчика и промо-буст настраиваются ниже в «Параметрах рынка». Сброс — кнопкой ниже.</div>
    <div class="wif-actions"><button class="btn btn-S btn-sm" onclick="resetCustomDemand()">⟲ Сбросить спрос к эталону</button></div></div>`;
}
function updCustomDemand(r,ci,val){ SIM.demand[r][ci] = Math.max(0, parseInt(val)||0); }
function resetCustomDemand(){ SIM.demand = JSON.parse(JSON.stringify(P.demand)); renderCustomDemand(); }

function renderCharGrid() {
  const cg = document.getElementById('char-grid');
  if (!cg) return;
  const charNames = Object.keys(CHARS);
  cg.innerHTML = ALL.map(tid => {
    const cur = SIM.chars[tid] || 'Кооперативный';
    const ch = CHARS[cur];
    return `<div class="ch-item" id="cg-${tid}">
      <div class="ts-top">
        <span class="ts-ico">${TEAM_ICO[tid]}</span>
        <div>
          <div class="ts-id">${TYPE[tid]} · ${TEAM_ROLE[tid]}</div>
          <div class="ts-name" id="cg-nm-${tid}" style="color:${ch.clr};font-size:12px;font-weight:700">${ch.ico} ${cur}</div>
        </div>
      </div>
      <select onchange="updChar('${tid}',this.value)" id="csel-${tid}">
        ${charNames.map(cn=>`<option value="${cn}" ${cn===cur?'selected':''}>${CHARS[cn].ico} ${cn}</option>`).join('')}
      </select>
      <div class="ts-desc" id="cdesc-${tid}" style="color:${ch.clr}">${ch.desc}</div>
    </div>`;
  }).join('');
}

function updChar(tid, val) {
  SIM.chars[tid] = val;
  const ch = CHARS[val];
  const nm = document.getElementById(`cg-nm-${tid}`);
  const dc = document.getElementById(`cdesc-${tid}`);
  if (nm) { nm.textContent = `${ch.ico} ${val}`; nm.style.color = ch.clr; }
  if (dc) { dc.textContent = ch.desc; dc.style.color = ch.clr; }
}

function selScenario(id) {
  SIM.scenarioId = id;
  const sc = SCENARIOS[id];
  SIM.strats = {...sc.strats};
  SIM.chars = {...(SCENARIO_CHARS[id] || SCENARIO_CHARS.bullwhip)};
  document.getElementById('p-noise').value = sc.params.noise;
  document.getElementById('p-shock').value = sc.params.shock;
  document.getElementById('p-boost').value = sc.params.boost;
  updParam('noise',sc.params.noise); updParam('shock',sc.params.shock); updParam('boost',sc.params.boost);
  document.querySelectorAll('.sc-card').forEach(el=>{
    const sid=el.id.replace('sc-',''),s=SCENARIOS[sid];
    el.classList.toggle('sel',sid===id);
    el.style.borderColor = sid===id ? s.color : '';
  });
  renderStratGrid();
  renderCharGrid();
  renderCustomDemand();
}

function renderStratGrid() {
  const sg = document.getElementById('strat-grid');
  sg.innerHTML = ALL.map(tid => {
    const type = TEAM_TYPE[tid];
    const opts = Object.keys(STRATS[type]);
    const cur = SIM.strats[tid] || opts[0];
    const desc = STRATS[type][cur]?.desc||'';
    return `<div class="ts-item">
      <div class="ts-top">
        <span class="ts-ico">${TEAM_ICO[tid]}</span>
        <div><div class="ts-id">${TYPE[tid]}</div><div class="ts-name">${TEAM_ROLE[tid]}</div></div>
      </div>
      <select onchange="updStrat('${tid}',this.value)" id="sel-${tid}">
        ${opts.map(o=>`<option value="${o}" ${o===cur?'selected':''}>${o}</option>`).join('')}
      </select>
      <div class="ts-desc" id="desc-${tid}">${desc}</div>
    </div>`;
  }).join('');
}

function updStrat(tid, val) {
  SIM.strats[tid] = val;
  const type = TEAM_TYPE[tid];
  document.getElementById(`desc-${tid}`).textContent = STRATS[type][val]?.desc||'';
}

function updParam(key, val) {
  if(key==='team'){ SIM.teamSize=parseInt(val); document.getElementById('pv-team').textContent=val; return; }
  SIM.params[key] = parseFloat(val);
  if(key==='noise') document.getElementById('pv-noise').textContent = `±${val}%`;
  if(key==='shock') document.getElementById('pv-shock').textContent = `${val} ед.`;
  if(key==='boost') document.getElementById('pv-boost').textContent = `×${(val/10).toFixed(1)}`;
}

// ━━━ DECISION GENERATOR ━━━
function genDecisions(r) {
  const dem = P.demand[r];
  const noise = SIM.params.noise/100;
  const boostVal = SIM.params.boost/10;
  const shockCap = SIM.params.shock;

  // Suppliers
  const totalDem = SUPS.map((_,si)=>RETS.reduce((s,_,ri)=>s+dem[si]*P.fShare[si][ri],0));
  const s4cap = r===2 ? Math.min(30, Math.round(shockCap/6)) : P.maxProd[3];
  const sups = SUPS.map((_,si)=>{
    const st = STRATS.sup[SIM.strats[SUPS[si]]];
    const [lo,hi] = st.pf;
    const cap = si===3 ? s4cap : P.maxProd[si];
    const nz = 1+rnd(-noise, noise);
    return Math.round(Math.min(cap, totalDem[si]*rnd(lo,hi)*nz));
  });

  const dc = r===2 ? shockCap : P.distCap[r];
  const st_d = STRATS.dist[SIM.strats['D']];
  const tariff = parseFloat(rnd(st_d.tr[0], st_d.tr[1]).toFixed(1));

  const rets = RETS.map((rid,ri)=>{
    const st = STRATS.ret[SIM.strats[rid]];
    const [lo,hi] = st.of;
    const nz = 1+rnd(-noise*0.5, noise*0.5);
    return SUPS.map((_,ci)=>{
      const baseDem = dem[ci]*P.fShare[ci][ri];
      const dm = P.price[st.prc].dm;
      const prm = Math.random() < st.pc ? 1 : 0;
      const dsc = prm ? parseFloat(rnd(st.dr[0],st.dr[1]).toFixed(2))
                      : (Math.random()<0.2 ? parseFloat(rnd(0.02,0.06).toFixed(2)) : 0);
      // Заказ планируется под ОЖИДАЕМЫЙ спрос: база × ценовой эффект × промо-буст (если включён)
      const expDem = baseDem*dm*((prm && dsc>=P.pThr) ? boostVal : 1);
      const ord = Math.max(1, Math.round(expDem*rnd(lo,hi)*nz));
      return {asm:1, ord, prc:st.prc, prm, dsc};
    });
  });

  return {tariff, distCap:dc, sups, rets};
}

// ━━━ NARRATIVE GENERATOR ━━━
function genNarrative(tid, dec, res) {
  const lines = [], prcN=['агрессивную','стандартную','премиальную'];
  if (RETS.includes(tid)) {
    const ri=RETS.indexOf(tid), cats=dec.rets[ri];
    const osa=res.retOSA[ri], profit=res.retProfit[ri];
    const totalDef=res.def[ri].reduce((s,v)=>s+v,0);
    const totalOver=res.over[ri].reduce((s,v)=>s+v,0);
    const totalWoff=res.woff[ri].reduce((s,v)=>s+v,0);
    const mainPrc=cats.reduce((a,c)=>c.prc>a?c.prc:a,0);
    const promoCats=cats.map((c,ci)=>c.prm?P.catIds[ci]:null).filter(Boolean);
    const promoOK=cats.some((c)=>c.prm&&c.dsc>=P.pThr);
    const totalOrd=cats.reduce((s,c)=>s+c.ord,0);
    const totalDel=res.del[ri].reduce((s,v)=>s+v,0);
    const dsc=cats.reduce((mx,c)=>c.dsc>mx?c.dsc:mx,0);

    lines.push(`Цена: <b>${prcN[mainPrc]}</b>. Заказ: <b>${f0(totalOrd)} ед.</b> — доставлено <b>${f0(totalDel)} ед.</b>`);

    if (promoCats.length) {
      if(promoOK) lines.push(`🎯 Промо по <b>${promoCats.join(', ')}</b> (скидка ${f0(dsc*100)}%) — буст ×${(SIM.params.boost/10).toFixed(1)} ✅`);
      else lines.push(`📋 Промо по <b>${promoCats.join(', ')}</b>, скидка ${f0(dsc*100)}% < 10% — буст НЕ сработал.`);
    }

    if(totalDef>20) {
      const wc=P.catIds[res.def[ri].indexOf(Math.max(...res.def[ri]))];
      lines.push(`🔴 Дефицит <b>${f0(totalDef)} ед.</b> (пик — ${wc}). Покупатели уходили.`);
    } else if(totalDef>5) lines.push(`🟡 Небольшой дефицит <b>${f0(totalDef)} ед.</b>`);
    else lines.push(`✅ Полки заполнены, дефицит минимален.`);

    if(totalWoff>2) lines.push(`🗑 Молочка/Фреш: <b>${f0(totalWoff)} ед.</b> испортилось и списано — потери ${f0(totalWoff*P.cost[1])} млн руб`);
    else if(totalOver>5) lines.push(`📦 Остаток <b>${f0(totalOver)} ед.</b> нескоропорта перешёл в запас след. тура — хранение −${f0(totalOver*P.hCost)} млн руб`);
    return {lines, osa, profit};

  } else if (SUPS.includes(tid)) {
    const si=SUPS.indexOf(tid);
    const prod=res.prod[si], del=res.totDel[si], ord=res.ordFromSup[si];
    const unsold=res.unsold[si], profit=res.supProfit[si];
    const fr=ord>0?Math.min(1,del/ord):1, isFr=P.fresh[si];
    lines.push(`Производство: <b>${f0(prod)} ед.</b> из ${P.maxProd[si]} макс. Заказано: <b>${f0(ord)} ед.</b>`);
    if(SUPS.indexOf(tid)===3&&SIM.params.shock<100) lines.push(`⚠️ Стресс-квота: ${f0(prod)} ед. — острый дефицит импорта.`);
    if(fr>=0.96) lines.push(`✅ Fill-rate <b>${f0(fr*100)}%</b> — заказы выполнены.`);
    else if(fr>=0.78) lines.push(`🟡 Fill-rate <b>${f0(fr*100)}%</b> — нехватка ${f0(ord-del)} ед.`);
    else lines.push(`🔴 Fill-rate <b>${f0(fr*100)}%</b> — дефицит ${f0(ord-del)} ед. у ритейлеров.`);
    if(isFr&&unsold>3) lines.push(`🗑 <b>${f0(unsold)} ед. Fresh</b> списано — убыток ${f0(unsold*P.cost[si])} млн руб`);
    else if(!isFr&&unsold>12) lines.push(`📦 Остаток <b>${f0(unsold)} ед.</b> на складе.`);
    return {lines, osa:fr, profit};

  } else {
    const profit=res.dProfit, dCoeff=res.dCoeff, delivered=res.totDelivered;
    lines.push(`Тариф <b>${f0(dec.tariff*1000)} ₽/ед</b> Перевезено: <b>${f0(delivered)} ед.</b>`);
    if(dCoeff>=0.96) lines.push(`🔥 Загрузка <b>${f0(dCoeff*100)}%</b> — мощности на пределе.`);
    else if(dCoeff>=0.72) lines.push(`✅ Загрузка <b>${f0(dCoeff*100)}%</b> — штатная работа.`);
    else lines.push(`📉 Загрузка <b>${f0(dCoeff*100)}%</b> — значительный простой мощностей.`);
    if(res.r===2) lines.push(`⚠️ Шок: лимит ${f0(SIM.params.shock)} ед. — приоритизация поставок.`);
    return {lines, osa:dCoeff, profit};
  }
}

// ━━━ TEACHING MOMENTS ━━━
const DISCUSS = [
  ['Кто заказал значительно больше спроса? Зачем? Во сколько это обошлось цепочке?',
   'Кто «угадал» с производством? Какую информацию им понадобилось бы знать заранее?'],
  ['Промо дало буст — но кто заплатил за этот буст? (подсказка: скидки съели маржу поставщика)',
   'Если бы все промо шли в разное время — как бы изменился результат?'],
  ['Перевозчик получил ограничение. Чьи заказы он должен был выполнить в первую очередь — и почему?',
   'Кто подготовился к шоку заранее? Что они сделали правильно в Туре 2?'],
  ['Кто быстрее адаптировался к изменившемуся рынку? Какая стратегия доказала устойчивость?',
   'Если бы все знали исход Тура 3 заранее — что изменили бы в Туре 1?'],
];

function genTeachMoment(r, res) {
  const totalDef = res.def.flat().reduce((s,v)=>s+v,0);
  const avgOSA = res.retOSA.reduce((s,v)=>s+v,0)/RETS.length;
  const dCoeff = res.dCoeff;
  const totalOver = res.over.flat().reduce((s,v)=>s+v,0);
  const totalWoff = res.woff.flat().reduce((s,v)=>s+v,0);

  const moments = [];
  if(totalDef>50) moments.push({lvl:'crit',ico:'🔴',t:'Критический дефицит',
    d:`<b>${f0(totalDef)} ед.</b> не дошло до покупателей. OSA ср. ${f0(avgOSA*100)}%. Цепочка не справилась с обеспечением полок.`});
  else if(totalDef>15) moments.push({lvl:'warn',ico:'🟡',t:'Умеренный дефицит',
    d:`Дефицит <b>${f0(totalDef)} ед.</b> — ритейлеры теряли покупателей в пиковые часы.`});
  if(totalOver>30) moments.push({lvl:'warn',ico:'📦',t:'Перезапас в системе',
    d:`<b>${f0(totalOver)} ед.</b> лишнего товара заморозили деньги. Цепочка работала неэффективно.`});
  if(totalWoff>8) moments.push({lvl:'crit',ico:'🗑',t:'Списания скоропорта',
    d:`<b>${f0(totalWoff)} ед.</b> Молочки и Фреша испортилось и выброшено. Стоимость: ${f0(totalWoff*P.cost[1])} млн руб`});
  if(dCoeff<0.65) moments.push({lvl:'warn',ico:'🚛',t:'Узкое место — логистика',
    d:`Перевозчик загружен на <b>${f0(dCoeff*100)}%</b>. Ограничение мощностей стало главной причиной дефицита.`});
  if(moments.length===0) moments.push({lvl:'good',ico:'✅',t:'Тур прошёл без критических проблем',
    d:`OSA ${f0(avgOSA*100)}%, дефицит ${f0(totalDef)} ед. Результат выше среднего для этого сценария.`});

  return moments.slice(0,2);
}

// Пересчёт агрегатов (итоги, здоровье, счёт, бонусы) из текущих SIM.results.
// Вынесено отдельно, чтобы переиспользовать при ручном пересчёте тура («что если»).
function recomputeAggregates() {
  SIM.totals={};
  ALL.forEach(tid=>{ let p=0; SIM.results.forEach(res=>{p+=roundProfit(res,tid);}); SIM.totals[tid]=p; });
  SIM.health=[]; SIM.scoreCum=[]; SIM.scores={}; SIM.bonuses={};
  const running={}, runBonus={}; ALL.forEach(t=>{running[t]=0; runBonus[t]=0;});
  SIM.results.forEach((res,r)=>{
    const h=chainHealth(res,r); SIM.health.push(h);
    const snap={};
    ALL.forEach(tid=>{
      const bn = h.H*BONUS_FUND*contribOf(res,tid);
      running[tid]+= roundProfit(res,tid) + bn; runBonus[tid]+=bn;
      snap[tid]=running[tid];
    });
    SIM.scoreCum.push(snap);
  });
  ALL.forEach(t=>{SIM.scores[t]=running[t]; SIM.bonuses[t]=runBonus[t];});
}

// Пересчёт одного тура после ручного редактирования решений
function recalcRound(r) {
  const origBoost=P.pBoost; P.pBoost=SIM.params.boost/10;
  // Правка тура r меняет перенос запасов → пересчитываем r..3, протягивая запас
  let inv = (r>0 && SIM.results[r-1]) ? SIM.results[r-1].newInv : null;
  for(let k=r;k<4;k++){
    const dec=SIM.decisions[k];
    SIM.results[k]=calcRound(k,dec,inv);
    inv=SIM.results[k].newInv;
    if(!SIM.narratives[k]) SIM.narratives[k]={};
    ALL.forEach(tid=>{ SIM.narratives[k][tid]=genNarrative(tid,dec,SIM.results[k]); });
  }
  P.pBoost=origBoost;
  recomputeAggregates();
}

// ━━━ РУЧНОЕ ПЕРЕОПРЕДЕЛЕНИЕ РЕШЕНИЙ («что если») ━━━
let editorOpen=false;
function toggleEditor(){ editorOpen=!editorOpen; syncEditor(SIM.round); }
function syncEditor(r){
  const ed=document.getElementById('r-editor'), cards=document.getElementById('r-cards'), btn=document.getElementById('edit-toggle');
  if(!ed) return;
  cards.style.display=editorOpen?'none':'';
  ed.style.display=editorOpen?'block':'none';
  if(btn) btn.textContent=editorOpen?'✕ Закрыть редактор':'✏️ Что если…';
  if(editorOpen) renderEditor(r);
}
function wNum(id,v){ return `<input type="number" id="${id}" value="${v}">`; }
function renderEditor(r){
  const dec=SIM.decisions[r], cats=P.catIds;
  const prcNames=['Агрессивная','Стандарт','Высокая','Премиум'];
  const retRows=RETS.map((tid,ri)=>{
    const cells=cats.map((_,ci)=>`<td>${wNum('ord-'+ri+'-'+ci, f0(dec.rets[ri][ci].ord))}</td>`).join('');
    const prc=dec.rets[ri][0].prc, prm=dec.rets[ri].some(c=>c.prm)?'checked':'';
    const prcSel=`<select id="prc-${ri}">${prcNames.map((n,k)=>`<option value="${k}" ${k===prc?'selected':''}>${n}</option>`).join('')}</select>`;
    return `<tr><td>${TEAM_ICO[tid]} ${SIM.names[tid]}</td>${cells}<td>${prcSel}</td><td><input type="checkbox" id="prm-${ri}" ${prm}></td></tr>`;
  }).join('');
  const supRows=SUPS.map((tid,si)=>`<tr><td>${TEAM_ICO[tid]} ${SIM.names[tid]}</td><td colspan="3" style="text-align:left">выпуск ${wNum('sup-'+si, f0(dec.sups[si]))} ед.</td><td style="color:var(--W3)">макс ${P.maxProd[si]}</td></tr>`).join('');
  const edited=SIM.edited&&SIM.edited[r];
  document.getElementById('r-editor').innerHTML=`<div class="wif">
    <div class="wif-grp"><div class="wlbl">🛒 Магазины — заказ по категориям · цена · промо</div>
      <table class="wtbl"><thead><tr><th>Команда</th>${cats.map(c=>`<th>${c}</th>`).join('')}<th>Цена</th><th>Промо</th></tr></thead><tbody>${retRows}</tbody></table></div>
    <div class="wif-grp"><div class="wlbl">🏭 Производители — выпуск</div>
      <table class="wtbl"><tbody>${supRows}</tbody></table></div>
    <div class="wif-grp"><div class="wlbl">🚛 Перевозчик — тариф и мощность</div>
      <table class="wtbl"><tbody><tr><td>${TEAM_ICO.D} ${SIM.names.D}</td><td colspan="2" style="text-align:left">тариф ${wNum('w-tariff',f0(dec.tariff*1000))} ₽/ед</td><td colspan="2" style="text-align:left">мощность ${wNum('w-cap',f0(dec.distCap))}</td></tr></tbody></table></div>
    <div class="wif-actions">
      <button class="btn btn-P btn-sm" onclick="applyEdits(${r})">↻ Пересчитать тур</button>
      <button class="btn btn-S btn-sm" onclick="resetRoundAuto(${r})">⟲ Вернуть авто</button>
      ${edited?'<span class="wif-badge">✏️ изменено вручную</span>':''}
    </div></div>`;
}
function applyEdits(r){
  const dec=SIM.decisions[r], gv=id=>{const e=document.getElementById(id);return e?parseFloat(e.value)||0:0;};
  RETS.forEach((_,ri)=>{
    const prc=parseInt(document.getElementById('prc-'+ri).value)||1;
    const prm=document.getElementById('prm-'+ri).checked?1:0;
    P.catIds.forEach((_,ci)=>{ const c=dec.rets[ri][ci]; c.ord=Math.max(0,gv('ord-'+ri+'-'+ci)); c.prc=prc; c.prm=prm; c.asm=1; });
  });
  SUPS.forEach((_,si)=>{ dec.sups[si]=Math.max(0,gv('sup-'+si)); });
  dec.tariff=Math.max(0,gv('w-tariff')/1000); dec.distCap=Math.max(0,gv('w-cap'));   // ₽/ед → коэф
  if(!SIM.edited) SIM.edited={}; SIM.edited[r]=true;
  recalcRound(r); renderRound(r);
}
function resetRoundAuto(r){
  // Восстанавливаем ТОЧНЫЙ исходный авто-прогон (снимок), а не новый случайный
  if(SIM.autoDecisions&&SIM.autoDecisions[r]) SIM.decisions[r]=JSON.parse(JSON.stringify(SIM.autoDecisions[r]));
  else SIM.decisions[r]=genDecisions(r);
  if(SIM.edited) SIM.edited[r]=false;
  recalcRound(r); renderRound(r);
}

// ━━━ RUN SIMULATION ━━━
// Полный расчёт 4 туров из текущей настройки (без смены экрана) — используется и в A/B.
function computeRun() {
  // Спрос: «Свой» сценарий использует заданный пользователем, остальные — эталонный
  P.demand = (SIM.scenarioId==='custom' && SIM.demand) ? SIM.demand : BASE_DEMAND;
  ALL.forEach(tid=>{ SIM.names[tid]=pick(DEMO_NAMES[tid]); });
  SIM.decisions=[]; SIM.results=[]; SIM.narratives=[];
  let inv=null;   // перенос запасов между турами (нескоропорт)
  for(let r=0;r<4;r++){
    const dec=genDecisions(r);
    const origBoost=P.pBoost; P.pBoost=SIM.params.boost/10;
    const res=calcRound(r,dec,inv);
    P.pBoost=origBoost;
    inv=res.newInv;
    const narr={}; ALL.forEach(tid=>{narr[tid]=genNarrative(tid,dec,res);});
    SIM.decisions.push(dec); SIM.results.push(res); SIM.narratives.push(narr);
  }
  SIM.autoDecisions=JSON.parse(JSON.stringify(SIM.decisions));   // снимок авто-решений для «Вернуть авто»
  SIM.edited={};
  recomputeAggregates();
}
function runSim() {
  computeRun();
  SIM.round=0;
  SIM.negOutcomes={};
  dealRoles();
  const sc=SCENARIOS[SIM.scenarioId];
  document.getElementById('hdr-sc').textContent=sc.name;
  showScr('s-roles');
  renderRosters();
}

// ━━━ A/B СРАВНЕНИЕ ━━━
function snapAB(slot) {
  computeRun();
  const sc=SCENARIOS[SIM.scenarioId];
  const avgH=SIM.health.reduce((s,h)=>s+h.H,0)/SIM.health.length;
  SIM.ab[slot]={
    label:sc.name, color:sc.color,
    scores:{...SIM.scores}, totals:{...SIM.totals}, bonuses:{...SIM.bonuses},
    health:SIM.health.map(h=>h.H), avgH,
    chainProfit:ALL.reduce((s,t)=>s+SIM.totals[t],0),
    chainScore:ALL.reduce((s,t)=>s+SIM.scores[t],0),
  };
  renderABPanel();
}
function renderABPanel() {
  const box=document.getElementById('ab-panel'); if(!box) return;
  const slot=(k)=>{ const s=SIM.ab[k];
    return `<div class="ab-slot ${s?'filled':''}">
      <div class="ab-k">Слот ${k}</div>
      ${s?`<div class="ab-v" style="color:${s.color}">${s.label}</div>
           <div class="ab-m">Счёт цепочки ${f0(s.chainScore)} · Здоровье ${f0(s.avgH*100)}%</div>`
         :`<div class="ab-empty">пусто</div>`}
      <button class="btn btn-S btn-sm" onclick="snapAB('${k}')" style="margin-top:7px;width:100%">▶ Прогнать текущую настройку в ${k}</button>
    </div>`; };
  const both=SIM.ab.A&&SIM.ab.B;
  box.innerHTML=`<div class="ab-grid">${slot('A')}${slot('B')}</div>
    <button class="btn btn-P" id="ab-compare-btn" onclick="showCompare()" ${both?'':'disabled'} style="margin-top:10px;${both?'':'opacity:.5;cursor:default'}">⚖ Сравнить A ↔ B</button>`;
}
function showCompare() {
  if(!(SIM.ab.A&&SIM.ab.B)) return;
  renderCompare();
  showScr('s-compare');
}
function renderCompare() {
  const A=SIM.ab.A, B=SIM.ab.B;
  document.getElementById('cmp-a-label').textContent=A.label;
  document.getElementById('cmp-a-label').style.color=A.color;
  document.getElementById('cmp-b-label').textContent=B.label;
  document.getElementById('cmp-b-label').style.color=B.color;
  // Сводные метрики
  const metric=(name,a,b,unit,better)=>{
    const da=better==='hi'?(a>=b):(a<=b);
    return `<div class="cmp-metric">
      <div class="cmp-mname">${name}</div>
      <div class="cmp-vals">
        <span class="cmp-va ${da?'win':''}">${a}${unit}</span>
        <span class="cmp-sep">vs</span>
        <span class="cmp-vb ${!da?'win':''}">${b}${unit}</span>
      </div></div>`;
  };
  document.getElementById('cmp-metrics').innerHTML=
    metric('Счёт цепочки (сумма)', f0(A.chainScore), f0(B.chainScore), '', 'hi')+
    metric('Средн. здоровье', f0(A.avgH*100), f0(B.avgH*100), '%', 'hi')+
    metric('Прибыль цепочки', f0(A.chainProfit), f0(B.chainProfit), '', 'hi');
  // Здоровье по турам
  document.getElementById('cmp-health').innerHTML=A.health.map((ha,r)=>{
    const hb=B.health[r];
    return `<div class="cmp-trow"><span class="cmp-tn">${turLabel(r)}</span>
      <div class="cmp-tbar"><div class="cmp-ta" style="width:${f0(ha*100)}%;background:${A.color}"></div></div><span class="cmp-tv">${f0(ha*100)}%</span>
      <div class="cmp-tbar"><div class="cmp-tb" style="width:${f0(hb*100)}%;background:${B.color}"></div></div><span class="cmp-tv">${f0(hb*100)}%</span></div>`;
  }).join('');
  // Счёт по командам
  document.getElementById('cmp-teams').innerHTML=ALL.map(tid=>{
    const a=A.scores[tid], b=B.scores[tid], d=a-b;
    return `<tr><td>${TEAM_ICO[tid]} ${LBL[tid]}</td>
      <td style="color:${A.color}">${f0(a)}</td><td style="color:${B.color}">${f0(b)}</td>
      <td style="color:${d>=0?'var(--OK)':'var(--BD)'};font-weight:700">${d>=0?'+':''}${f0(d)}</td></tr>`;
  }).join('');
}

// ━━━ РАЗДАЧА РОЛЕЙ ━━━
function dealRoles() {
  SIM.rosters={};
  const charNames=Object.keys(CHARS);
  const n=Math.max(1,Math.min(4,SIM.teamSize||4));
  ALL.forEach(tid=>{
    const roleSet=ROLE_SETS[TEAM_TYPE[tid]];
    const slots=[];
    for(let i=0;i<n;i++){
      // Директор (i===0) сохраняет характер из настройки (он ведёт переговоры); прочие — случайно
      const charName = i===0 ? (SIM.chars[tid]||pick(charNames)) : pick(charNames);
      slots.push({role:roleSet[i], char:charName});
    }
    SIM.rosters[tid]=slots;
  });
}

function renderRosters() {
  const sc=SCENARIOS[SIM.scenarioId];
  const pill=document.getElementById('roles-sc-pill');
  pill.textContent=sc.name; pill.style.color=sc.color; pill.style.borderColor=sc.color;
  const grid=document.getElementById('roster-grid');
  grid.innerHTML=ALL.map(tid=>{
    const slots=SIM.rosters[tid];
    return `<div class="roster ${TEAM_TYPE[tid]}" id="roster-${tid}">
      <div class="roster-hdr">
        <span class="rh-ico">${TEAM_ICO[tid]}</span>
        <div>
          <div class="rh-id">${TYPE[tid]} · ${TEAM_ROLE[tid]}</div>
          <div class="rh-nm">${SIM.names[tid]}</div>
        </div>
        <span class="roster-team-size">${slots.length} чел.</span>
      </div>
      ${slots.map(s=>{const ch=CHARS[s.char];
        return `<div class="player-slot">
          <span class="ps-roleico">${s.role.ico}</span>
          <div class="ps-body">
            <div class="ps-role ${s.role.lead?'lead':''}">${s.role.title}</div>
            <div class="ps-duty">${s.role.duty}</div>
            <span class="ps-char" style="background:${hexA(ch.clr,.16)};color:${ch.clr}">${ch.ico} ${s.char}</span>
          </div>
        </div>`;}).join('')}
    </div>`;
  }).join('');
  ALL.forEach((tid,i)=>setTimeout(()=>{
    const el=document.getElementById(`roster-${tid}`); if(el)el.classList.add('vis');
  },i*90));
  updateDots(-1);
}

function reshuffleRoles(){ dealRoles(); renderRosters(); }
function rolesToGame(){ showScr('s-neg'); renderNegScreen(0); }

// ━━━ RENDER ROUND ━━━
function renderRound(r) {
  updateDots(r);
  syncEditor(r);
  const res=SIM.results[r], dec=SIM.decisions[r];
  const sc=SCENARIOS[SIM.scenarioId];

  // Header
  document.getElementById('r-num').textContent=r+1;
  document.getElementById('r-num').style.color=sc.color;
  document.getElementById('r-name').textContent=P.roundNames[r];
  document.getElementById('r-sub').textContent=[
    'Первый тур. Команды обнаруживают рынок и принимают решения.',
    'Промо-окно открыто. Скидка ≥10% + промо → буст спроса.',
    '⚠️ Внешнее событие — шок для перевозчика и квоты Импорта.',
    'Рынок стабилизируется. Кто адаптировался — тот выиграл.',
  ][r];
  const pill=document.getElementById('r-sc-pill');
  pill.textContent=sc.name; pill.style.color=sc.color; pill.style.borderColor=sc.color;

  // Event
  const evts=[null,
    {type:'promo',ico:'📣',t:'Промо-инициатива',d:'Спрос на Снеки → 110 ед. Буст ×'+f1(SIM.params.boost/10)+' при скидке ≥10% и включённом промо.'},
    {type:'shock',ico:'🚨',t:'ДВОЙНОЙ ШОК',d:`Перевозчик ограничен до ${SIM.params.shock} ед. Квота Импорта: ${Math.min(30,Math.round(SIM.params.shock/6))} ед. Спрос на Молочку → 130, на Деликатесы → 25.`},
    {type:'info',ico:'📊',t:'Стабилизация',d:'Молочка = 115, Снеки = 90, Деликатесы = 35. Финальный тур — восстанавливайте маржу.'},
  ];
  const ev=evts[r];
  document.getElementById('r-evt').innerHTML=ev
    ?`<div class="evt ${ev.type}"><div class="eico">${ev.ico}</div>
       <div><h3>${ev.t}</h3><p>${ev.d}</p></div></div>`:'' ;

  // Cards
  const cardsEl=document.getElementById('r-cards');
  const maxPft=Math.max(...ALL.map(t=>Math.abs(SIM.narratives[r][t].profit)),1);
  cardsEl.innerHTML=ALL.map(tid=>{
    const type=TEAM_TYPE[tid], narr=SIM.narratives[r][tid];
    const p=narr.profit, pc=p>=0?'ok':'bad';
    const bw=Math.min(100,Math.abs(p)/maxPft*100);
    const bc=p>=0?'var(--OK)':'var(--BD)';
    return `<div class="tcard ${type}" id="tc-${r}-${tid}">
      <div class="tc-top">
        <span class="tc-ico">${TEAM_ICO[tid]}</span>
        <div><div class="tc-id">${TYPE[tid]} · ${TEAM_ROLE[tid]}</div><div class="tc-nm">${SIM.names[tid]}</div>
        <div class="tc-strat">${SIM.strats[tid]}</div></div>
      </div>
      <div class="tc-lines">${narr.lines.map(l=>`<span>${l}</span>`).join('')}</div>
      <div class="pb-row"><span class="pb-lbl">Прибыль</span>
        <span class="pb-val ${pc}">${p>=0?'+':''}${f0(p)} млн руб</span></div>
      <div class="pb-track"><div class="pb-fill" id="pbf-${r}-${tid}" style="width:0%;background:${bc}"></div></div>
    </div>`;
  }).join('');

  // KPIs
  const totalDef=res.def.flat().reduce((s,v)=>s+v,0);
  const totalWoff=res.woff.flat().reduce((s,v)=>s+v,0);
  const totalSold=res.sold.flat().reduce((s,v)=>s+v,0);
  const avgOSA=res.retOSA.reduce((s,v)=>s+v,0)/3;
  const H=SIM.health[r].H;
  document.getElementById('r-kpi').innerHTML=`
    <div class="ckpi"><div class="cl">Продано</div><div class="cv ok">${f0(totalSold)}</div></div>
    <div class="ckpi"><div class="cl">Дефицит</div><div class="cv ${totalDef>40?'bad':totalDef>10?'wn':'ok'}">${f0(totalDef)}</div></div>
    <div class="ckpi"><div class="cl">OSA ср.</div><div class="cv ${avgOSA>=.9?'ok':avgOSA>=.75?'wn':'bad'}">${f0(avgOSA*100)}%</div></div>
    <div class="ckpi"><div class="cl">Списания</div><div class="cv ${totalWoff>5?'bad':totalWoff>1?'wn':'ok'}">${f0(totalWoff)}</div></div>
    <div class="ckpi"><div class="cl">Дист. загр.</div><div class="cv ${res.dCoeff>=.9?'ok':res.dCoeff>=.65?'wn':'bad'}">${f0(res.dCoeff*100)}%</div></div>
    <div class="ckpi" style="grid-column:1/-1;background:${hexA(sc.color,.12)};border:1px solid ${hexA(sc.color,.4)}">
      <div class="cl">❤️ Здоровье цепочки (фонд ${f0(H*BONUS_FUND)} млн руб × вклад команды)</div>
      <div class="cv ${H>=.75?'ok':H>=.5?'wn':'bad'}">${f0(H*100)}%</div></div>
  `;

  // Teaching moment
  const moments=genTeachMoment(r,res);
  document.getElementById('r-teach').innerHTML=moments.map(m=>
    `<div class="teach ${m.lvl}"><div class="tt">${m.ico} ${m.t}</div><div class="td">${m.d}</div></div>`
  ).join('');

  // Mini leaderboard — по накопленному СЧЁТУ (прибыль + здоровье)
  const cumScore=SIM.scoreCum[r];
  const sorted=[...ALL].sort((a,b)=>cumScore[b]-cumScore[a]);
  const maxAbs=Math.max(...Object.values(cumScore).map(Math.abs),1);
  document.getElementById('r-minilb').innerHTML=`<h3>Рейтинг (∑ счёт = прибыль + здоровье)</h3>`+
    sorted.map((tid,i)=>{const p=cumScore[tid],clr=p>=0?'var(--OK)':'var(--BD)';
      return `<div class="lb-row">
        <div class="lb-pos">${i+1}</div>
        <div class="lb-nm">${LBL[tid]} ${SIM.names[tid]}</div>
        <div class="lb-bar"><div class="lb-barf" style="width:${Math.min(100,Math.abs(p)/maxAbs*100)}%;background:${clr}"></div></div>
        <div class="lb-pft" style="color:${clr}">${p>=0?'+':''}${f0(p)}</div>
      </div>`;
    }).join('');

  // Discussion
  const qs=DISCUSS[r];
  document.getElementById('r-discuss').innerHTML=`
    <div class="discuss-q">
      <div class="dqt">💬 Вопрос для обсуждения</div>
      <div class="dqq">${pick(qs)}</div>
    </div>`;

  // Nav
  document.getElementById('nav-prog').innerHTML=[0,1,2,3].map(i=>
    `<div class="np ${i<r?'done':i===r?'cur':''}"></div>`).join('');
  const nb=document.getElementById('next-btn');
  nb.textContent = r<3 ? `Тур ${r+2} →` : '📊 Финальный разбор →';

  // Animate cards
  ALL.forEach((tid,i)=>setTimeout(()=>{
    const el=document.getElementById(`tc-${r}-${tid}`); if(!el)return;
    el.classList.add('vis');
    setTimeout(()=>{const pb=document.getElementById(`pbf-${r}-${tid}`);
      if(pb) pb.style.width=Math.min(100,Math.abs(SIM.narratives[r][tid].profit)/maxPft*100)+'%';
    },200);
  },i*120));
}

function negToRound() {
  editorOpen=false;
  showScr('s-round');
  renderRound(SIM.round);
}

function nextRound() {
  SIM.round++;
  if(SIM.round>=4){renderAnalytics();showScr('s-analytics');}
  else{showScr('s-neg');renderNegScreen(SIM.round);}
}

// ━━━ ЭКСПОРТ РЕЗУЛЬТАТОВ ━━━
function exportCSV() {
  if (!SIM.results || !SIM.results.length) return;
  const scName = (SCENARIOS[SIM.scenarioId]?.name || SIM.scenarioId);
  const esc = v => `"${String(v).replace(/"/g,'""')}"`;
  const rows = [];
  rows.push(['FMCG-цепочка · итоги симуляции']);
  rows.push(['Сценарий', scName]);
  rows.push(['Размер команды', SIM.teamSize]);
  rows.push([]);
  rows.push(['Команда','Тип','Стратегия','Прибыль Тур 1','Прибыль Тур 2','Прибыль Тур 3','Прибыль Тур 4','Прибыль всего','Бонус здоровья','Итоговый счёт']);
  ALL.forEach(tid => {
    const perTour = SIM.results.map(res => f0(roundProfit(res, tid)));
    rows.push([SIM.names[tid] || LBL[tid], TYPE[tid], SIM.strats[tid] || '—',
               ...perTour, f0(SIM.totals[tid]), f0(SIM.bonuses[tid]), f0(SIM.scores[tid])]);
  });
  rows.push([]);
  rows.push(['Здоровье цепочки по турам (%)']);
  rows.push(['Тур','Здоровье H','Полка OSA','Нет дефицита','Нет хлыста','Нет списаний']);
  SIM.health.forEach((h,r) => rows.push([turLabel(r),
    f0(h.H*100), f0(h.OSA*100), f0(h.Deficit*100), f0(h.Bullwhip*100), f0(h.Waste*100)]));
  const csv = '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fmcg-${SIM.scenarioId}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

// ━━━ ANALYTICS ━━━
function renderAnalytics() {
  const sc=SCENARIOS[SIM.scenarioId];
  document.getElementById('an-sc-label').textContent=`Сценарий: ${sc.name} · 4 тура завершены`;
  updateDots(4);

  // Winners
  const retWin=RETS.reduce((a,b)=>SIM.totals[a]>SIM.totals[b]?a:b);
  const supWin=SUPS.reduce((a,b)=>SIM.totals[a]>SIM.totals[b]?a:b);
  document.getElementById('an-winners').innerHTML=`
    <div class="wcard"><div class="wt">🛒 Ритейлер</div><div class="wn">${SIM.names[retWin]}</div><div class="ws">${LBL[retWin]} · ${f0(SIM.totals[retWin])} млн руб</div></div>
    <div class="wcard"><div class="wt">🏭 Поставщик</div><div class="wn">${SIM.names[supWin]}</div><div class="ws">${LBL[supWin]} · ${f0(SIM.totals[supWin])} млн руб</div></div>
    <div class="wcard" style="border-color:var(--PU)"><div class="wt">🚛 Дистрибьютор</div><div class="wn">${SIM.names['D']}</div><div class="ws">${LBL['D']} · ${f0(SIM.totals['D'])} млн руб</div></div>
  `;

  // Awards + score
  renderAwards();
  renderScoreChart();
  // Charts
  renderProfitChart();
  renderBullwhipChart();
  renderWaterfallChart();
  renderEffTable();
  renderInsights();
  renderDebrief();
}

// ━━━ НАГРАДЫ ━━━
function renderAwards() {
  // Гран-при — максимальный итоговый счёт
  const grand=ALL.reduce((a,b)=>SIM.scores[a]>=SIM.scores[b]?a:b);
  // Архитектор цепочки — авторитетный вклад в здоровье (та же contribOf, что и в счёте), не отдельная эвристика
  const service={};
  ALL.forEach(tid=>{
    service[tid]=SIM.results.reduce((s,res)=>s+contribOf(res,tid),0)/SIM.results.length;
  });
  const architect=ALL.reduce((a,b)=>service[a]>=service[b]?a:b);
  // Антихлыст — минимальный коэффициент вариации собственного объёма
  const cv={};
  ALL.forEach(tid=>{
    const ri=RETS.indexOf(tid),si=SUPS.indexOf(tid);
    const series=SIM.results.map((res,r)=>{
      if(ri>=0) return SUPS.reduce((s,_,ci)=>s+SIM.decisions[r].rets[ri][ci].ord,0);
      if(si>=0) return res.prod[si];
      return res.totDelivered;
    });
    const m=series.reduce((s,v)=>s+v,0)/series.length;
    const v=series.reduce((s,x)=>s+(x-m)**2,0)/series.length;
    cv[tid]= m>0?Math.sqrt(v)/m:0;
  });
  const antiwhip=ALL.reduce((a,b)=>cv[a]<=cv[b]?a:b);
  // Лучший дистрибьютор — счёт выше среднего по всем командам
  const avg=ALL.reduce((s,t)=>s+SIM.scores[t],0)/ALL.length;
  const distGood=SIM.scores['D']>avg;

  const card=(t,ico,tid,sub,clr)=>`<div class="award" style="border-color:${clr}">
    <span class="aw-ico">${ico}</span>
    <div class="aw-t" style="color:${clr}">${t}</div>
    <div class="aw-nm">${LBL[tid]} · ${SIM.names[tid]}</div>
    <div class="aw-s">${sub}</div></div>`;
  document.getElementById('an-awards').innerHTML=
    card('Гран-при','🏆',grand,`Итоговый счёт ${f0(SIM.scores[grand])} млн руб`,'#ffd700')+
    card('Архитектор цепочки','🤝',architect,`Вклад в здоровье ${f0(service[architect]*100)}%`,'#34c759')+
    card('Антихлыст','📉',antiwhip,`Самый стабильный объём (CV ${f1(cv[antiwhip]*100)}%)`,'#3d6cb5')+
    (distGood?card('Лучший дистрибьютор','🚚','D',`Счёт ${f0(SIM.scores['D'])} — выше среднего ${f0(avg)}`,'#b45309'):'');
}

function renderScoreChart() {
  const sorted=[...ALL].sort((a,b)=>SIM.scores[b]-SIM.scores[a]);
  const maxV=Math.max(...ALL.map(t=>Math.max(SIM.scores[t],SIM.totals[t]+SIM.bonuses[t],Math.abs(SIM.totals[t]))),1);
  document.getElementById('chart-score').innerHTML=
    `<div style="font-size:10px;color:var(--W3);margin-bottom:10px">
       <span style="color:var(--OK)">▰</span> личная прибыль ·
       <span style="color:var(--PU)">▰</span> бонус здоровья (фонд ${BONUS_FUND} млн руб/тур × H × личный вклад) ·
       <span style="color:var(--BD)">▰</span> убыток</div>`+
    sorted.map((tid,i)=>{
      const pf=SIM.totals[tid], bonus=SIM.bonuses[tid];
      const pfW=Math.max(0,pf)/maxV*100, bnW=bonus/maxV*100, negW=pf<0?Math.abs(pf)/maxV*100:0;
      const bars = negW>0
        ? `<div style="width:${negW}%;background:var(--BD)"></div><div style="width:${bnW}%;background:var(--PU)"></div>`
        : `<div style="width:${pfW}%;background:var(--OK)"></div><div style="width:${bnW}%;background:var(--PU)"></div>`;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <div style="width:22px;font-size:11px;font-weight:700;color:${i===0?'#ffd700':'var(--W3)'};text-align:center">${i+1}</div>
        <div style="width:150px;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${LBL[tid]} ${SIM.names[tid]}</div>
        <div style="flex:1;height:16px;background:var(--bg4);border-radius:4px;overflow:hidden;display:flex">${bars}</div>
        <div style="width:72px;text-align:right;font-size:12px;font-weight:700;color:${SIM.scores[tid]>=0?'var(--OK)':'var(--BD)'}">${SIM.scores[tid]>=0?'+':''}${f0(SIM.scores[tid])}</div>
      </div>`;
    }).join('');
}

function renderProfitChart() {
  const W=460,H=160,pad={l:50,r:10,t:10,b:30};
  const iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
  const rounds=[0,1,2,3];
  const teams=[...RETS,...SUPS,'D'];
  const colors={R1:'#3d6cb5',R2:'#bc8cff',R3:'#34c759',R4:'#e879f9',S1:'#ff9f0a',S2:'#fbbf24',S3:'#f85149',S4:'#79c0ff',D:'#56d364'};
  const seriesData=teams.map(tid=>rounds.map(r=>{
    const ri=RETS.indexOf(tid),si=SUPS.indexOf(tid);
    if(ri>=0)return SIM.results[r].retProfit[ri];
    if(si>=0)return SIM.results[r].supProfit[si];
    return SIM.results[r].dProfit;
  }));
  const allVals=seriesData.flat();
  const mn=Math.min(...allVals,0), mx=Math.max(...allVals,1);
  const range=mx-mn||1;
  const toY=v=>pad.t+ih-(v-mn)/range*ih;
  const toX=i=>pad.l+i/(rounds.length-1)*iw;

  let svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">`;
  // Zero line
  if(mn<0&&mx>0){const zy=toY(0);svg+=`<line x1="${pad.l}" y1="${zy}" x2="${W-pad.r}" y2="${zy}" stroke="#484f58" stroke-width="1" stroke-dasharray="3,2"/>`;}
  // Grid
  [0,1,2,3].forEach(i=>{svg+=`<text x="${pad.l-4}" y="${toY(mn+range/3*i)+4}" class="chart-axis" text-anchor="end">${f0(mn+range/3*i)}</text>`;});
  rounds.forEach(i=>{svg+=`<text x="${toX(i)}" y="${H-5}" class="chart-axis" text-anchor="middle">Т${i+1}</text>`;});
  // Lines
  seriesData.forEach((vals,ti)=>{
    const tid=teams[ti],col=colors[tid];
    const pts=rounds.map(i=>`${toX(i)},${toY(vals[i])}`).join(' ');
    svg+=`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" opacity=".85"/>`;
    rounds.forEach(i=>{svg+=`<circle cx="${toX(i)}" cy="${toY(vals[i])}" r="3" fill="${col}"/>`;});
  });
  // Legend
  teams.forEach((tid,i)=>{const x=pad.l+(i%4)*55, y=H-pad.b+18+(Math.floor(i/4)*12);
    svg+=`<line x1="${x}" y1="${y}" x2="${x+10}" y2="${y}" stroke="${colors[tid]}" stroke-width="2"/>
      <text x="${x+13}" y="${y+3}" class="chart-axis" style="font-size:8px">${LBL[tid]}</text>`;});
  svg+='</svg>';
  document.getElementById('chart-profit').innerHTML=svg;
}

function renderBullwhipChart() {
  // K1: show demand, orders, production per round
  const W=460,H=160,pad={l:40,r:10,t:10,b:30};
  const iw=W-pad.l-pad.r, ih=H-pad.t-pad.b;
  const rounds=[0,1,2,3];
  const totalDem=rounds.map(r=>P.demand[r][0]);
  const totalOrd=rounds.map(r=>RETS.reduce((s,_,ri)=>s+SIM.decisions[r].rets[ri][0].ord,0));
  const totalProd=rounds.map(r=>SIM.results[r].prod[0]);
  const mx=Math.max(...totalDem,...totalOrd,...totalProd,1);
  const bw=(iw/rounds.length-8)/3;
  const toH=v=>v/mx*ih;
  const toX=(ri,gi)=>pad.l+ri*(iw/rounds.length)+gi*(bw+2)+4;

  const series=[{vals:totalDem,col:'#484f58',lbl:'Спрос'},
                {vals:totalOrd,col:'#3d6cb5',lbl:'Заказы'},
                {vals:totalProd,col:'#34c759',lbl:'Произв-во'}];
  let svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">`;
  // Y labels
  [0,.5,1].forEach(f=>{const v=Math.round(mx*f);const y=pad.t+ih*(1-f);
    svg+=`<text x="${pad.l-4}" y="${y+4}" class="chart-axis" text-anchor="end">${v}</text>`;});
  // Bars
  rounds.forEach((r,ri)=>{
    svg+=`<text x="${toX(ri,1)}" y="${H-5}" class="chart-axis" text-anchor="middle">Т${r+1}</text>`;
    series.forEach((s,gi)=>{const h=toH(s.vals[ri]),x=toX(ri,gi),y=pad.t+ih-h;
      svg+=`<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${s.col}" opacity=".9" rx="1"/>`;
      if(s.vals[ri]>10) svg+=`<text x="${x+bw/2}" y="${y-2}" class="chart-axis" text-anchor="middle" style="font-size:8px">${f0(s.vals[ri])}</text>`;
    });
  });
  // Legend
  series.forEach((s,i)=>{const x=pad.l+i*80;
    svg+=`<rect x="${x}" y="${H-pad.b+14}" width="10" height="8" fill="${s.col}" rx="1"/>
      <text x="${x+13}" y="${H-pad.b+21}" class="chart-axis">${s.lbl}</text>`;});
  svg+='</svg>';
  document.getElementById('chart-bullwhip').innerHTML=svg;
}

function renderWaterfallChart() {
  // Per round: potential revenue vs losses
  const W=460,H=160,pad={l:45,r:10,t:10,b:30};
  const iw=W-pad.l-pad.r,ih=H-pad.t-pad.b;
  const rounds=[0,1,2,3];
  const bars=rounds.map(r=>{
    const res=SIM.results[r],dec=SIM.decisions[r];
    const potRev=RETS.reduce((s,_,ri)=>s+SUPS.reduce((s2,_,ci)=>{
      const x=dec.rets[ri][ci]; return s2+res.actDem[ri][ci]*P.rosn[ci]*P.price[x.prc||1].pm;
    },0),0);
    const defLoss=res.def.map((row,ri)=>row.map((d,ci)=>{
      const x=dec.rets[ri][ci]; return d*P.rosn[ci]*P.price[x.prc||1].pm;
    })).flat().reduce((s,v)=>s+v,0);
    const ovCost=res.over.flat().reduce((s,v)=>s+v*P.hCost,0);
    const woffCost=res.woff.map((row,ri)=>row.map((w,ci)=>w*P.cost[ci])).flat().reduce((s,v)=>s+v,0);
    const transCost=res.totDelivered*dec.tariff;
    const actual=res.retProfit.reduce((s,v)=>s+v,0)+res.supProfit.reduce((s,v)=>s+v,0)+res.dProfit;
    return {potRev,defLoss,ovCost,woffCost,transCost,actual};
  });
  const mx=Math.max(...bars.map(b=>b.potRev),1);
  const bw=iw/rounds.length-10;
  let svg=`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">`;
  // Y axis
  [0,.5,1].forEach(f=>{const v=Math.round(mx*f);const y=pad.t+ih*(1-f);
    svg+=`<text x="${pad.l-4}" y="${y+4}" class="chart-axis" text-anchor="end">${f0(v)}</text>`;});
  // Stacked bars
  const colors=['#34c759','#f85149','#ff9f0a','#ff9f0a'];
  const labels=['Фактич. прибыль','Потери дефицит','Перезапас','Списания'];
  rounds.forEach((r,ri)=>{
    const b=bars[ri],x=pad.l+ri*(iw/rounds.length)+5;
    // potential outline
    const potH=b.potRev/mx*ih;
    svg+=`<rect x="${x}" y="${pad.t+ih-potH}" width="${bw}" height="${potH}" fill="none" stroke="#3d4852" stroke-width="1" rx="1"/>`;
    // actual (filled)
    const actH=Math.max(0,b.actual)/mx*ih;
    svg+=`<rect x="${x}" y="${pad.t+ih-actH}" width="${bw}" height="${actH}" fill="${colors[0]}" opacity=".8" rx="1"/>`;
    // loss stacked
    let cur=b.actual;
    [b.defLoss,b.ovCost,b.woffCost].forEach((loss,li)=>{if(loss<1)return;
      const lh=loss/mx*ih,ly=pad.t+ih-(cur+loss)/mx*ih;
      svg+=`<rect x="${x+2}" y="${ly}" width="${bw-4}" height="${lh}" fill="${colors[li+1]}" opacity=".75" rx="1"/>`;
      cur+=loss;
    });
    svg+=`<text x="${x+bw/2}" y="${H-5}" class="chart-axis" text-anchor="middle">Т${r+1}</text>`;
  });
  // Legend
  labels.forEach((l,i)=>{const xL=pad.l+i*100; if(xL>W-30)return;
    svg+=`<rect x="${xL}" y="${H-pad.b+14}" width="8" height="8" fill="${colors[i]}" rx="1"/>
      <text x="${xL+11}" y="${H-pad.b+21}" class="chart-axis" style="font-size:8px">${l}</text>`;});
  svg+='</svg>';
  document.getElementById('chart-waterfall').innerHTML=svg;
}

function renderEffTable() {
  const rows=SIM.results.map((res,r)=>{
    const def=res.def.flat().reduce((s,v)=>s+v,0);
    const woff=res.woff.flat().reduce((s,v)=>s+v,0);
    const osa=res.retOSA.reduce((s,v)=>s+v,0)/RETS.length;
    const chainPft=res.retProfit.reduce((s,v)=>s+v,0)+res.supProfit.reduce((s,v)=>s+v,0)+res.dProfit;
    return `<tr>
      <td style="font-weight:700;color:var(--P)">Тур ${r+1}</td>
      <td class="${osa>=.9?'ok':osa>=.75?'wn':'bad'}">${f0(osa*100)}%</td>
      <td class="${def>40?'bad':def>10?'wn':'ok'}">${f0(def)}</td>
      <td class="${woff>8?'bad':woff>2?'wn':'ok'}">${f0(woff)}</td>
      <td class="${res.dCoeff>=.9?'ok':res.dCoeff>=.65?'wn':'bad'}">${f0(res.dCoeff*100)}%</td>
      <td class="${chainPft>=0?'ok':'bad'}">${chainPft>=0?'+':''}${f0(chainPft)}</td>
    </tr>`;
  }).join('');
  document.getElementById('chart-table').innerHTML=`
    <table class="eff-tbl">
      <thead><tr><th>Тур</th><th>OSA ср.</th><th>Дефицит</th><th>Списания</th><th>Дист. загр.</th><th>Прибыль цепочки</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderInsights() {
  const insights=[];
  const sc=SCENARIOS[SIM.scenarioId];
  // Bullwhip detection
  const k1Dem=SIM.results.map((_,r)=>P.demand[r][0]);
  const k1Ord=SIM.results.map((_,r)=>RETS.reduce((s,_,ri)=>s+SIM.decisions[r].rets[ri][0].ord,0));
  const k1Prod=SIM.results.map((_,r)=>SIM.results[r].prod[0]);
  const varOf=arr=>{const m=arr.reduce((s,v)=>s+v,0)/arr.length;return arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length;};
  const bwRatio=varOf(k1Prod)/Math.max(varOf(k1Dem),1);
  if(bwRatio>3.5) insights.push({lvl:'crit',h:'🌊 Эффект хлыста обнаружен',t:`Колебания производства в <b>${f1(bwRatio)}×</b> сильнее колебаний реального спроса на Бакалею. Каждое звено усиливало сигнал — классический «эффект хлыста».`});
  else if(bwRatio>1.5) insights.push({lvl:'warn',h:'🌊 Умеренный эффект хлыста',t:`Дисперсия производства в <b>${f1(bwRatio)}×</b> превысила спрос. Цепочка частично раскачалась.`});
  else insights.push({lvl:'good',h:'✅ Эффект хлыста минимален',t:`Производство синхронизировано со спросом. Коэффициент усиления ${f1(bwRatio)}×.`});

  // Total deficit
  const totDef=SIM.results.reduce((s,r)=>s+r.def.flat().reduce((a,v)=>a+v,0),0);
  const totWoff=SIM.results.reduce((s,r)=>s+r.woff.flat().reduce((a,v)=>a+v,0),0);
  if(totDef>120) insights.push({lvl:'crit',h:'🔴 Критический хронический дефицит',t:`За 4 тура дефицит составил <b>${f0(totDef)} ед.</b> Покупатели регулярно не находили товар. Причина: несинхронизированное планирование.`});
  else if(totDef>40) insights.push({lvl:'warn',h:'🟡 Дефицит в пиковые периоды',t:`Суммарно <b>${f0(totDef)} ед.</b> недоставлено покупателям — преимущественно в турах с шоком или промо.`});
  if(totWoff>20) insights.push({lvl:'crit',h:'🗑 Высокие потери скоропорта',t:`Списано <b>${f0(totWoff)} ед.</b> Молочки и Фреша. Производитель Fresh выпускал больше, чем магазины могли продать на фоне несогласованных заказов.`});

  // Distributor analysis
  const dTariff=SIM.decisions[0].tariff;
  const dProfit=SIM.totals['D'];
  const chainPft=RETS.reduce((s,t)=>s+SIM.totals[t],0)+SUPS.reduce((s,t)=>s+SIM.totals[t],0);
  const distShare=dProfit/(dProfit+chainPft+1);
  if(distShare>0.35) insights.push({lvl:'warn',h:'🚛 Перевозчик забрал слишком большую маржу',t:`Тариф ${f0(dTariff*1000)} ₽/ед дал перевозчику <b>${f0(distShare*100)}%</b> всей прибыли цепочки. Высокий тариф урезал маржу производителей и магазинов.`});

  // Scenario-specific
  if(SIM.scenarioId==='ideal') insights.push({lvl:'good',h:'📐 Эффект координации',t:`В этом сценарии прибыль цепочки на <b>30-50%</b> выше хаотичных сценариев. Это «потенциал координации» — то, что теряется когда каждый оптимизирует себя.`});
  if(SIM.scenarioId==='stress') insights.push({lvl:'crit',h:'💥 Концентрация риска',t:`Шок ударил неравномерно: магазины с большой долей Деликатесов (импорт) пострадали несравнимо сильнее. Диверсификация поставщиков — ключевой механизм защиты.`});

  document.getElementById('an-insights').innerHTML=insights.map(ins=>
    `<div class="insight ${ins.lvl}"><div class="ih">${ins.h}</div><div class="it">${ins.t}</div></div>`
  ).join('');
}

function renderDebrief() {
  const qs=[
    ...SCENARIOS[SIM.scenarioId].discuss,
    'Что бы вы согласовали с другими командами до начала игры, зная её исход?',
    'Как изменился бы результат, если бы производитель Fresh и магазины обменялись прогнозами спроса?',
  ];
  document.getElementById('debrief-list').innerHTML=
    qs.map(q=>`<li>${q}</li>`).join('');
}

// ━━━ NEGOTIATION ENGINE ━━━
function genNegDialogue(pair, r) {
  const fCh = CHARS[SIM.chars[pair.from]] || CHARS['Кооперативный'];
  const tCh = CHARS[SIM.chars[pair.to]]   || CHARS['Кооперативный'];
  const totalConc = fCh.conc + tCh.conc;
  const agreed = totalConc > 0.35 || (totalConc > 0.15 && Math.random() > 0.45);

  // Compute agreed values for quantitative subjects
  let agreedVal = null;
  if (agreed) {
    if (pair.type === 'dsc') {
      const bias = tCh.conc / (totalConc + 0.001);
      agreedVal = pair.toWant + (pair.fromWant - pair.toWant) * Math.min(0.95, bias + fCh.conc * 0.25);
      agreedVal = Math.max(0.02, Math.min(0.24, parseFloat(agreedVal.toFixed(2))));
    } else if (pair.type === 'tar') {
      const bias = fCh.conc / (totalConc + 0.001);
      agreedVal = pair.fromWant + (pair.toWant - pair.fromWant) * Math.min(0.95, bias + tCh.conc * 0.25);
      agreedVal = Math.max(1.0, Math.min(2.5, parseFloat(agreedVal.toFixed(1))));
    }
  }

  // Format helpers
  const fmtV = (v, type) => {
    if (type === 'dsc') return v!=null ? `скидка ${Math.round(v*100)}%` : 'скидка';
    if (type === 'tar') return v!=null ? `тариф ${Math.round(parseFloat(v)*1000)} ₽/ед` : 'тариф';
    return '';
  };

  const askRaw  = pair.type==='dsc' ? pair.fromWant*fCh.dmd :
                  pair.type==='tar' ? pair.fromWant/fCh.dmd : null;
  const askClamp= pair.type==='dsc' ? Math.min(0.25,askRaw||0) :
                  pair.type==='tar' ? Math.max(1.0,askRaw||1.5) : null;
  const ctrRaw  = pair.type==='dsc' ? pair.toWant*(2-tCh.dmd*0.6) :
                  pair.type==='tar' ? pair.toWant*tCh.dmd*0.75 : null;
  const ctrClamp= pair.type==='dsc' ? Math.max(0.01,Math.min(0.13,ctrRaw||0)) :
                  pair.type==='tar' ? Math.max(1.4,Math.min(2.6,ctrRaw||2.0)) : null;

  const fmtAsk  = (pair.type==='dsc'||pair.type==='tar') ? fmtV(askClamp, pair.type) : pair.fromWant;
  const fmtCtr  = (pair.type==='dsc'||pair.type==='tar') ? fmtV(ctrClamp, pair.type) : pair.toWant;

  const msgs = [];

  // Message 1: opening ask
  msgs.push({who:pair.from, side:'left',
    text: pick(fCh.open).replace('{V}', fmtAsk),
    offerTag: (pair.type==='dsc'||pair.type==='tar') ? fmtAsk : null,
  });

  // Message 2: counter
  msgs.push({who:pair.to, side:'right',
    text: pick(tCh.ctr).replace('{V}', fmtCtr),
    offerTag: (pair.type==='dsc'||pair.type==='tar') ? fmtCtr : null,
  });

  // Message 3: second move (if either side willing to concede)
  if (fCh.conc > 0.18 || tCh.conc > 0.18) {
    const midVal = agreed && agreedVal!=null
      ? (pair.type==='dsc' ? agreedVal*1.04 : agreedVal*0.97) : null;
    const midFmt = midVal!=null ? fmtV(midVal, pair.type) : fmtAsk;
    msgs.push({who:pair.from, side:'left',
      text: pick(fCh.ctr).replace('{V}', midFmt),
      offerTag: midVal!=null ? midFmt : null,
    });
  }

  // Final: resolution
  if (agreed) {
    const closer   = tCh.conc >= fCh.conc ? pair.to : pair.from;
    const closerCh = closer === pair.to ? tCh : fCh;
    const closerSide = closer === pair.from ? 'left' : 'right';
    const finalFmt = agreedVal!=null ? fmtV(agreedVal, pair.type) : 'условия приняты';
    msgs.push({who:closer, side:closerSide, final:true,
      text: pick(closerCh.ok).replace('{V}', finalFmt),
    });
  } else {
    msgs.push({who:pair.to, side:'right', final:true, failed:true,
      text: pick(tCh.no),
    });
  }

  return {msgs, outcome:{agreed, val:agreedVal, type:pair.type}};
}

function renderNegScreen(r) {
  updateDots(r);
  document.getElementById('neg-r-num').textContent = r+1;
  document.getElementById('neg-r-num').style.color = SCENARIOS[SIM.scenarioId].color;
  document.getElementById('neg-r-name').textContent = P.roundNames[r];
  const sc = SCENARIOS[SIM.scenarioId];
  const pill = document.getElementById('neg-sc-pill');
  pill.textContent = sc.name; pill.style.color = sc.color; pill.style.borderColor = sc.color;

  const introEl = document.getElementById('neg-intro');
  if (introEl) introEl.innerHTML = NEG_INTRO[r] || '';

  const pairs = NEG_PAIRS[r];
  const sessions = pairs.map(pair => genNegDialogue(pair, r));
  SIM.negSessions = sessions;
  SIM.negPairs = pairs;
  SIM.negOutcomes[r] = sessions.map((s,i)=>({...pairs[i],...s.outcome}));

  const container = document.getElementById('neg-sessions');
  container.innerHTML = sessions.map((sess, si) => {
    const pair = pairs[si];
    const fCh = CHARS[SIM.chars[pair.from]]||CHARS['Кооперативный'];
    const tCh = CHARS[SIM.chars[pair.to]]  ||CHARS['Кооперативный'];
    return `<div class="neg-session" id="neg-s-${si}">
      <div class="neg-session-hdr">
        <div class="ns-combatants">
          <div class="ns-fighter">
            <div class="ns-avatar" style="background:${hexA(fCh.clr,.15)};color:${fCh.clr};border-color:${hexA(fCh.clr,.5)}">${fCh.ico}</div>
            <div>
              <div class="ns-char-name" style="color:${fCh.clr}">${SIM.chars[pair.from]}</div>
              <div class="ns-team-name">${TEAM_ICO[pair.from]} ${SIM.names[pair.from]}</div>
            </div>
          </div>
          <div class="ns-vs">⚡</div>
          <div class="ns-fighter ns-fighter-r">
            <div>
              <div class="ns-char-name" style="color:${tCh.clr};text-align:right">${SIM.chars[pair.to]}</div>
              <div class="ns-team-name" style="text-align:right">${TEAM_ICO[pair.to]} ${SIM.names[pair.to]}</div>
            </div>
            <div class="ns-avatar" style="background:${hexA(tCh.clr,.15)};color:${tCh.clr};border-color:${hexA(tCh.clr,.5)}">${tCh.ico}</div>
          </div>
        </div>
        <div class="ns-subject-row">
          <span class="ns-subj-tag">Предмет:</span>
          <span class="ns-subj-text">${pair.subj}</span>
          <div id="neg-out-${si}" class="neg-outcome-badge">…</div>
        </div>
        ${pair.why ? `<div class="ns-stake"><span class="ns-stake-ico">🎯</span><span>${pair.why}</span></div>` : ''}
      </div>
      <div class="neg-chat" id="neg-chat-${si}"></div>
    </div>`;
  }).join('');

  document.getElementById('neg-next-btn').style.display = 'none';
  animAllSessions(sessions, 0);
}

function animAllSessions(sessions, si) {
  if (si >= sessions.length) {
    document.getElementById('neg-next-btn').style.display = 'inline-flex';
    return;
  }
  animSession(sessions[si], si, () => setTimeout(() => animAllSessions(sessions, si+1), 500));
}

function animSession(sess, si, done) {
  const chatEl = document.getElementById(`neg-chat-${si}`);
  if (!chatEl) { done(); return; }
  let mi = 0;
  function showOutcome() {
    const outEl = document.getElementById(`neg-out-${si}`);
    if (outEl) {
      if (sess.outcome.agreed) {
        outEl.style.background = 'rgba(63,185,80,.18)';
        outEl.style.color = 'var(--OK)';
        outEl.style.borderColor = 'rgba(63,185,80,.4)';
        outEl.style.border = '1px solid';
        let label = '✅ Договорились';
        if (sess.outcome.val != null) {
          if (sess.outcome.type === 'dsc')
            label = `✅ скидка ${Math.round(sess.outcome.val*100)}%`;
          else if (sess.outcome.type === 'tar')
            label = `✅ тариф ${parseFloat(sess.outcome.val).toFixed(1)} млн руб`;
        }
        outEl.textContent = label;
      } else {
        outEl.style.background = 'rgba(248,81,73,.15)';
        outEl.style.color = 'var(--BD)';
        outEl.style.border = '1px solid rgba(248,81,73,.35)';
        outEl.textContent = '❌ Не договорились';
      }
      requestAnimationFrame(() => requestAnimationFrame(() => outEl.classList.add('show')));
    }
    setTimeout(done, 600);
  }
  function nextMsg() {
    if (mi >= sess.msgs.length) { showOutcome(); return; }
    const msg = sess.msgs[mi++];
    const ch = CHARS[SIM.chars[msg.who]] || CHARS['Кооперативный'];
    // Show typing indicator (left side only — right comes from other party)
    const typingEl = document.createElement('div');
    typingEl.className = `neg-msg ${msg.side} typing-indicator`;
    typingEl.innerHTML = msg.side === 'left'
      ? `<div class="msg-ico">${TEAM_ICO[msg.who]}</div><div class="typing-dots"><span></span><span></span><span></span></div>`
      : `<div class="typing-dots" style="border-bottom-left-radius:14px;border-bottom-right-radius:3px;background:var(--PD)">`
        + `<span style="background:rgba(255,255,255,.5)"></span><span style="background:rgba(255,255,255,.5)"></span><span style="background:rgba(255,255,255,.5)"></span></div>`
        + `<div class="msg-ico">${TEAM_ICO[msg.who]}</div>`;
    chatEl.appendChild(typingEl);
    chatEl.scrollTop = chatEl.scrollHeight;
    const delay = 420 + Math.random() * 280;
    setTimeout(() => {
      typingEl.remove();
      const el = document.createElement('div');
      el.className = `neg-msg ${msg.side}`;
      const offerHtml = msg.offerTag
        ? `<div class="msg-offer-tag">${msg.offerTag}</div>` : '';
      el.innerHTML =
        `<div class="msg-ico">${TEAM_ICO[msg.who]}</div>
         <div class="msg-body">
           <div class="msg-who" style="color:${ch.clr}">${ch.ico} ${SIM.chars[msg.who]} · ${SIM.names[msg.who]}</div>
           <div class="msg-bubble${msg.failed?' failed':''}">${msg.text}</div>
           ${offerHtml}
         </div>`;
      chatEl.appendChild(el);
      chatEl.scrollTop = chatEl.scrollHeight;
      setTimeout(nextMsg, 820);
    }, delay);
  }
  nextMsg();
}

// ━━━ NAVIGATION ━━━
function updateDots(r) {
  document.getElementById('hdr-dots').innerHTML=[0,1,2,3].map(i=>
    `<div class="rdot ${r>i?'done':r===i?'cur':''}">${i+1}</div>`).join('');
}
function showScr(id){document.querySelectorAll('.scr').forEach(s=>s.classList.remove('on'));document.getElementById(id).classList.add('on');window.scrollTo(0,0);}
function goSetup(){showScr('s-setup');updateDots(-1);}

// ━━━ INIT ━━━
initSetupUI();
updateDots(-1);