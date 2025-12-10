/* data.js - 系統設定與菜單資料 */

const firebaseConfig = {
  apiKey: "AIzaSyBY3ILlBr5N8a8PxMv3IDSScmNZzvtXXVw",
  authDomain: "pos-system-database.firebaseapp.com",
  databaseURL: "[https://pos-system-database-default-rtdb.firebaseio.com](https://pos-system-database-default-rtdb.firebaseio.com)",
  projectId: "pos-system-database",
  storageBucket: "pos-system-database.firebasestorage.app",
  messagingSenderId: "302159719042",
  appId: "1:302159719042:web:5efb78fe497cc2f426629b",
  measurementId: "G-2G680G6GHF"
};

const SYSTEM_PASSWORD = "5898"; 
let OWNER_PASSWORDS = { "景偉": "0001", "小飛": "0002", "威志": "0003" };

// 1. 修改：移除 05，保留 16 個座位 (4x4)
const tables = ["吧檯1","吧檯2","吧檯3","吧檯4","吧檯5","圓桌1","圓桌2","六人桌","四人桌1","四人桌2","大理石桌1","備用1","01","02","03","04"];

const categories = ["調酒", "純飲", "shot", "啤酒", "咖啡", "飲料", "燒烤", "主餐", "炸物", "厚片", "甜點", "其他"];

const menuData = {
    "調酒": { 
        "$250 調酒": [{name:"高球",price:250},{name:"琴通寧",price:250},{name:"螺絲起子",price:250},{name:"藍色珊瑚礁",price:250},{name:"龍舌蘭日出",price:250}], 
        "$280 調酒": [{name:"白色俄羅斯",price:280},{name:"性感海灘",price:280},{name:"威士忌酸",price:280},{name:"惡魔",price:280},{name:"梅夢",price:280},{name:"輕浪蘭夢",price:280},{name:"暮色梅影",price:280},{name:"醉椰落日",price:280},{name:"晨曦花露",price:280},{name:"隱藏特調",price:280}], 
        "$320 調酒": [{name:"橙韻旋律",price:320},{name:"莫希托",price:320},{name:"長島冰茶",price:320},{name:"內格羅尼",price:320},{name:"咖啡馬丁尼",price:320},{name:"雅茗",price:320},{name:"幽香琥珀",price:320},{name:"琴盈紅酸",price:320},{name:"微醺榛情",price:320}], 
        "無酒精調酒": [{name:"小熊軟糖",price:300},{name:"桂花晨露",price:300},{name:"玫瑰紅茶",price:300},{name:"珍珠奶茶",price:300},{name:"紅豆牛奶",price:300},{name:"隱藏特調",price:300}] 
    },
    "純飲": { 
        "$200 純飲": [{name:"岩井(紅酒桶)",price:200},{name:"鉑仕曼 12 年",price:200},{name:"百富 12 年",price:200},{name:"拉佛格",price:200},{name:"蘇格登 12 年",price:200},{name:"格蘭利威 12 年",price:200},{name:"凱德漢 7 年",price:200}], 
        "$300 純飲": [{name:"響",price:300},{name:"白州",price:300},{name:"岩井(雪莉桶)",price:300},{name:"大摩 12 年",price:300},{name:"百富 14 年",price:300},{name:"卡爾里拉",price:300}] 
    },
    "shot": [{name:"伏特加",price:100},{name:"蘭姆酒",price:100},{name:"龍舌蘭",price:100},{name:"琴酒",price:100},{name:"威士忌",price:100},{name:"B52",price:150},{name:"薄荷奶糖",price:150},{name:"提拉米蘇",price:150},{name:"小愛爾蘭",price:150}],
    "啤酒": [{name:"百威",price:120},{name:"可樂娜",price:120},{name:"金樽",price:150},{name:"雪山",price:150},{name:"隱藏啤酒",price:0}],
    "咖啡": [{name:"美式",price:100},{name:"青檸美式",price:120},{name:"冰橙美式",price:150},{name:"拿鐵",price:120},{name:"香草拿鐵",price:120},{name:"榛果拿鐵",price:150},{name:"摩卡拿鐵",price:150}],
    "飲料": [{name:"可樂",price:80},{name:"雪碧",price:80},{name:"可爾必思",price:80},{name:"柳橙汁",price:80},{name:"蘋果汁",price:80},{name:"蔓越莓汁",price:80},{name:"紅茶",price:80},{name:"綠茶",price:80},{name:"烏龍茶",price:80}],
    "燒烤": { 
        "Popular": [{name:"米血",price:25},{name:"豆乾",price:25},{name:"雞脖子",price:25},{name:"小肉豆",price:25},{name:"甜不辣",price:25},{name:"鑫鑫腸",price:25},{name:"糯米腸",price:25},{name:"百頁豆腐",price:25},{name:"豆包",price:30},{name:"肥腸",price:30},{name:"鱈魚丸",price:30},{name:"豬捲蔥",price:40},{name:"雞胸肉",price:40},{name:"豬捲金針菇",price:40},{name:"香腸",price:40},{name:"牛肉串",price:45},{name:"雞腿捲",price:45},{name:"孜然羊肉串",price:50},{name:"香蔥雞腿肉串",price:55},{name:"雞腿",price:80}], 
        "Chicken": [{name:"雞胗",price:30},{name:"雞心",price:30},{name:"雞翅",price:30},{name:"雞屁股",price:30},{name:"雞皮",price:35},{name:"大熱狗",price:35},{name:"鹹麻吉",price:35},{name:"花生麻吉",price:35}], 
        "花生糯米腸組合": [{name:"A 糯米腸+香腸",price:80},{name:"B 糯米腸+鹹豬肉",price:100},{name:"C 糯米腸+香腸+鹹豬肉",price:150},{name:"糯米腸",price:100},{name:"鹹豬肉",price:120},{name:"香酥雞胸",price:120}], 
        "隱藏限定": [{name:"碳烤豆腐",price:40},{name:"牛蒡甜不辣",price:40},{name:"沙爹豬",price:45},{name:"手羽先",price:50},{name:"洋蔥牛五花",price:55},{name:"香蔥牛五花",price:55},{name:"碳烤雞排",price:90},{name:"麝香牛五花",price:95},{name:"乾煎虱目魚",price:180},{name:"帶骨牛小排",price:280}] 
    },
    "主餐": [{name:"炒飯",price:90},{name:"蒜漬糖蜜番茄麵包",price:140},{name:"日式炒烏龍麵",price:150},{name:"親子丼",price:160},{name:"酒蒸蛤蠣",price:180},{name:"純酒白蝦",price:200},{name:"唐揚咖哩",price:220},{name:"龍膽石斑魚湯",price:280},{name:"味繒鮭魚",price:0}],
    "炸物": [{name:"嫩炸豆腐",price:80},{name:"脆薯",price:100},{name:"雞塊",price:100},{name:"鑫鑫腸",price:100},{name:"雞米花",price:100},{name:"洋蔥圈",price:100},{name:"酥炸魷魚",price:0},{name:"炸物拼盤",price:400}],
    "厚片": [{name:"花生厚片",price:80},{name:"奶酥厚片",price:80},{name:"蒜香厚片",price:80},{name:"巧克力厚片",price:80},{name:"巧克力棉花糖厚片",price:80}],
    "甜點": [{name:"起司蛋糕",price:120}],
    "其他": [
        {name:"服務費",price:100},
        {name:"清潔費",price:300},
        {name:"碎碎平安",price:500}
    ]
};
