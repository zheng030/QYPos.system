import type {
  PosCategoryKey,
  PosMenuCategory,
  PosMenuItem,
  PosMenuMeta,
  PosOwnerAuthMap,
  PosSelectionOption,
  PosSelectionRule,
  PosSingleSelectionRule,
} from './types'

export const firebaseConfig = {
  apiKey: 'AIzaSyBY3ILlBr5N8a8PxMv3IDSScmNZzvtXXVw',
  authDomain: 'pos-system-database.firebaseapp.com',
  databaseURL: 'https://pos-system-database-default-rtdb.firebaseio.com',
  projectId: 'pos-system-database',
  storageBucket: 'pos-system-database.firebasestorage.app',
  messagingSenderId: '302159719042',
  appId: '1:302159719042:web:5efb78fe497cc2f426629b',
  measurementId: 'G-2G680G6GHF',
}

export const SYSTEM_PASSWORD = {
  passwordSalt: 'JfQ2P/jVlbY9HZW2dyJJ8A==',
  passwordHash: 'B4xRSlbbNDSdB/944ssKtHHfi9ckFD6lBhjwPQDvWM8=',
}

export const defaultOwnerPasswords: PosOwnerAuthMap = {
  景偉: {
    passwordSalt: 'c2FsdC1vd25lci0x',
    passwordHash: 'n06NSuWUI7n7xaka9XHmx4z16FRw76ycRb7XyRWIh7o=',
  },
  小飛: {
    passwordSalt: 'c2FsdC1vd25lci0y',
    passwordHash: '0jrdJonzUKPrWUH6gwJEtO6D4bmi2ApEePUFTCZ0m6o=',
  },
  威志: {
    passwordSalt: 'c2FsdC1vd25lci0z',
    passwordHash: 'd9Z8FgD9HmrbiNnNnKKKJ8l5AAs6AUbLnV1cDas2VYk=',
  },
}

export const tables = [
  '外帶1',
  '外帶2',
  '外帶3',
  '外帶4',
  '外帶5',
  '吧檯1',
  '吧檯2',
  '吧檯3',
  '吧檯4',
  '吧檯5',
  '01桌',
  '02桌',
  '03桌',
  '04桌',
  '05桌',
  '06桌',
  '07桌',
  '08桌',
  '09桌',
  '10桌',
]

function inferCategoryKeyFromCatalogKey(value: string): PosCategoryKey {
  const head = String(value || '').split('.')[0]
  return ({
    pasta_risotto: 'pasta_risotto',
    bread_set: 'bread_set',
    salad: 'salad',
    plated_main: 'plated_main',
    a_la_carte: 'a_la_carte',
    soup: 'soup',
    drink: 'drink',
  }[head] || 'other') as PosCategoryKey
}

function option(value: string, label: string, priceDelta = 0, targetItemId?: string): PosSelectionOption {
  const catalogKey = targetItemId || value
  return {
    optionKey: value,
    value,
    label,
    priceDelta,
    targetItemId,
    inventoryKey: targetItemId || catalogKey,
    categoryKey: inferCategoryKeyFromCatalogKey(catalogKey),
    station: 'kitchen',
  }
}

function buildSelectionInventoryKey(itemId: string, ruleId: string, value: string) {
  return `selection.${itemId}.${ruleId}.${value}`
}

function singleRule(
  id: string,
  label: string,
  options: PosSelectionOption[],
  required = true,
  summaryLabel?: string,
  config: Partial<
    Pick<
      PosSingleSelectionRule,
      'defaultValue' | 'tracksInventory' | 'visibleWhenRuleId' | 'builderBlockId' | 'builderRow'
    >
  > = {}
): PosSelectionRule {
  return {
    id,
    kind: 'single',
    label,
    options,
    required,
    summaryLabel,
    defaultValue: config.defaultValue,
    tracksInventory: config.tracksInventory ?? false,
    visibleWhenRuleId: config.visibleWhenRuleId,
    builderBlockId: config.builderBlockId,
    builderRow: config.builderRow,
  }
}

function textRule(id: string, label: string, required = false, summaryLabel?: string): PosSelectionRule {
  return { id, kind: 'text', label, required, summaryLabel }
}

type MenuItemSeed = Omit<PosMenuItem, 'kind' | 'station' | 'productKey' | 'inventoryKey'>

function bundleItem(input: MenuItemSeed): PosMenuItem {
  return {
    ...input,
    productKey: input.id,
    inventoryKey: input.soldOutKey || input.id,
    kind: 'bundle',
    price: input.basePrice,
    station: 'kitchen',
  }
}

function singleItem(input: MenuItemSeed): PosMenuItem {
  return {
    ...input,
    productKey: input.id,
    inventoryKey: input.soldOutKey || input.id,
    kind: 'single',
    price: input.basePrice,
    station: 'kitchen',
  }
}

const drinkTemperatureRule = singleRule(
  'temperature',
  '冰 / 熱',
  [option('ice', '冰'), option('hot', '熱')],
  true,
  '溫度',
  {
    tracksInventory: false,
  }
)

const pastaBaseRule = singleRule(
  'base',
  '主食',
  [option('pasta', '義大利麵'), option('risotto', '燉飯')],
  true,
  '主食',
  {
    tracksInventory: true,
    builderBlockId: 'main-base',
    builderRow: 1,
  }
)

const pastaTextureRule = singleRule(
  'texture',
  '口感',
  [option('normal', '正常'), option('soft', '偏軟')],
  true,
  '口感',
  {
    defaultValue: 'normal',
    tracksInventory: false,
    visibleWhenRuleId: 'base',
    builderBlockId: 'main-base',
    builderRow: 2,
  }
)

const upgradeDrinkOptions = [
  option('black-tea', '紅茶', 0, 'drink.black-tea'),
  option('green-tea', '綠茶', 0, 'drink.green-tea'),
  option('espresso', '濃縮咖啡', 60, 'drink.espresso'),
  option('americano', '美式咖啡', 60, 'drink.americano'),
  option('latte', '拿鐵咖啡', 60, 'drink.latte'),
  option('chef-soup', '主廚濃湯', 90, 'soup.chef'),
  option('puff-soup', '酥皮濃湯', 120, 'soup.puff'),
] as const

function buildBundleIncludes() {
  return [
    {
      id: 'included-drink',
      label: '附飲',
      itemId: 'drink.black-tea',
      inventoryKey: 'drink.black-tea',
      categoryKey: 'drink',
      upgradeGroupId: 'bundle-drink-upgrade',
      defaultSelections: { temperature: 'ice' },
    },
  ] as const satisfies PosMenuItem['includes']
}

function buildBundleUpgradeGroups() {
  return [
    {
      id: 'bundle-drink-upgrade',
      label: '附飲 / 換購',
      required: true,
      summaryLabel: '附飲',
      options: [...upgradeDrinkOptions],
    },
  ]
}

function buildBundleSelections(extraRules: PosSelectionRule[] = []) {
  return [...extraRules, textRule('note', '備註')]
}

function buildPastaSelections(extraRules: PosSelectionRule[] = []) {
  return buildBundleSelections([pastaBaseRule, pastaTextureRule, ...extraRules])
}

function pastaSauceRule(options: PosSelectionOption[]) {
  return singleRule('sauce', '口味', options, true, '口味', {
    tracksInventory: true,
  })
}

const categories: PosMenuCategory[] = [
  {
    key: 'pasta_risotto',
    label: '義大利麵 / 燉飯',
    shortLabel: '義大利麵 / 燉飯',
    description: '皆附紅茶 / 綠茶，可加價換購',
    sections: [
      {
        id: 'pasta_risotto-main',
        label: '義大利麵 / 燉飯',
        items: [
          bundleItem({
            id: 'pasta_risotto.bolognese-pork',
            name: '辣番茄肉醬(豬肉)',
            shortName: '辣番茄肉醬',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 300,
            selections: buildPastaSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'pasta_risotto.chicken-breast',
            name: '雞胸',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 250,
            selections: buildPastaSelections([pastaSauceRule([option('cheese', '香濃起司'), option('pesto', '青醬')])]),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'pasta_risotto.chicken-leg',
            name: '雞腿',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 300,
            selections: buildPastaSelections([pastaSauceRule([option('cheese', '香濃起司'), option('pesto', '青醬')])]),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'pasta_risotto.clam',
            name: '蛤蜊',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 330,
            selections: buildPastaSelections([
              pastaSauceRule([option('basil-oil', '清炒塔香'), option('cream', '奶香')]),
            ]),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'pasta_risotto.shrimp',
            name: '鮮蝦',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 280,
            selections: buildPastaSelections([
              pastaSauceRule([option('basil-oil', '清炒塔香'), option('cream', '奶香'), option('pesto', '青醬')]),
            ]),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'pasta_risotto.seabass',
            name: '鱸魚',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 360,
            selections: buildPastaSelections([pastaSauceRule([option('cream', '奶香'), option('pesto', '青醬')])]),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'pasta_risotto.truffle-mushroom-meat',
            name: '野菇松露醬(葷)',
            shortName: '野菇松露醬',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 360,
            selections: buildPastaSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'pasta_risotto.creamy-mushroom-veg',
            name: '奶油野菇醬(素)',
            shortName: '奶油野菇醬',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 360,
            selections: buildPastaSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'pasta_risotto.toscana-pork',
            name: '托斯卡納豬肉',
            categoryKey: 'pasta_risotto',
            courseKind: 'food',
            basePrice: 320,
            selections: buildPastaSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
        ],
      },
    ],
  },
  {
    key: 'bread_set',
    label: '麵包餐',
    shortLabel: '麵包餐',
    description: '皆附紅茶 / 綠茶，可加價換購',
    sections: [
      {
        id: 'bread_set-main',
        label: '麵包餐',
        items: [
          singleItem({
            id: 'bread_set.garlic-bread',
            name: '蒜香義式麵包片',
            categoryKey: 'bread_set',
            courseKind: 'food',
            basePrice: 150,
            selections: [textRule('note', '備註')],
          }),
          bundleItem({
            id: 'bread_set.creamy-chicken-leg',
            name: '奶油燉雞腿 佐 蒜香義式麵包',
            shortName: '奶油燉雞腿',
            categoryKey: 'bread_set',
            courseKind: 'food',
            basePrice: 330,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'bread_set.garlic-lemon-shrimp',
            name: '蒜香檸檬鮮蝦 佐 蒜香義式麵包',
            shortName: '蒜香檸檬鮮蝦',
            categoryKey: 'bread_set',
            courseKind: 'food',
            basePrice: 360,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
        ],
      },
    ],
  },
  {
    key: 'salad',
    label: '沙拉',
    shortLabel: '沙拉',
    description: '皆附紅茶 / 綠茶，可加價換購',
    sections: [
      {
        id: 'salad-main',
        label: '沙拉',
        items: [
          bundleItem({
            id: 'salad.salami-mozzarella',
            name: '義式臘腸 佐 莫札瑞拉起司',
            shortName: '義式臘腸',
            categoryKey: 'salad',
            courseKind: 'food',
            basePrice: 280,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'salad.crispy-bacon',
            name: '香煎脆培根',
            categoryKey: 'salad',
            courseKind: 'food',
            basePrice: 250,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'salad.beef-short-rib',
            name: '香煎牛小排',
            categoryKey: 'salad',
            courseKind: 'food',
            basePrice: 330,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'salad.smoked-salmon',
            name: '煙燻鮭魚',
            categoryKey: 'salad',
            courseKind: 'food',
            basePrice: 360,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
        ],
      },
    ],
  },
  {
    key: 'plated_main',
    label: '排餐',
    shortLabel: '排餐',
    description: '皆附紅茶 / 綠茶，可加價換購',
    sections: [
      {
        id: 'plated_main-main',
        label: '排餐',
        items: [
          bundleItem({
            id: 'plated_main.chicken-leg',
            name: '香煎雞腿 佐 馬鈴薯泥',
            shortName: '香煎雞腿',
            categoryKey: 'plated_main',
            courseKind: 'food',
            basePrice: 360,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'plated_main.red-wine-beef-stew',
            name: '紅酒燉牛肉 佐 馬鈴薯泥',
            shortName: '紅酒燉牛肉',
            categoryKey: 'plated_main',
            courseKind: 'food',
            basePrice: 400,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'plated_main.beef-short-rib',
            name: '牛小排 佐 馬鈴薯泥',
            shortName: '牛小排',
            categoryKey: 'plated_main',
            courseKind: 'food',
            basePrice: 450,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'plated_main.duck-breast',
            name: '法式嫩鴨胸 佐 馬鈴薯泥',
            shortName: '法式嫩鴨胸',
            categoryKey: 'plated_main',
            courseKind: 'food',
            basePrice: 480,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'plated_main.cod-fish',
            name: '香煎鱈魚 佐 奶油菠菜泥',
            shortName: '香煎鱈魚',
            categoryKey: 'plated_main',
            courseKind: 'food',
            basePrice: 420,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'plated_main.filet-mignon',
            name: '菲力牛排 佐 巴薩米可炒蘑菇',
            shortName: '菲力牛排',
            categoryKey: 'plated_main',
            courseKind: 'food',
            basePrice: 450,
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
          bundleItem({
            id: 'plated_main.beef-wellington',
            name: '威靈頓牛排(需預訂)',
            shortName: '威靈頓牛排',
            categoryKey: 'plated_main',
            courseKind: 'food',
            basePrice: 700,
            tags: ['需預訂'],
            selections: buildBundleSelections(),
            includes: buildBundleIncludes(),
            upgradeGroups: buildBundleUpgradeGroups(),
          }),
        ],
      },
    ],
  },
  {
    key: 'a_la_carte',
    label: '單品',
    shortLabel: '單品',
    sections: [
      {
        id: 'a_la_carte-main',
        label: '單品',
        items: [
          singleItem({
            id: 'a_la_carte.mozzarella-stick',
            name: '莫札瑞拉起司棒',
            categoryKey: 'a_la_carte',
            courseKind: 'addon',
            basePrice: 150,
            selections: [textRule('note', '備註')],
          }),
          singleItem({
            id: 'a_la_carte.cheese-fries',
            name: '起司醬薯條',
            categoryKey: 'a_la_carte',
            courseKind: 'addon',
            basePrice: 150,
            selections: [textRule('note', '備註')],
          }),
          singleItem({
            id: 'a_la_carte.truffle-fries',
            name: '松露醬薯條',
            categoryKey: 'a_la_carte',
            courseKind: 'addon',
            basePrice: 180,
            selections: [textRule('note', '備註')],
          }),
          singleItem({
            id: 'a_la_carte.balsamic-mushroom',
            name: '巴薩米可炒蘑菇',
            categoryKey: 'a_la_carte',
            courseKind: 'addon',
            basePrice: 180,
            selections: [textRule('note', '備註')],
          }),
        ],
      },
    ],
  },
  {
    key: 'soup',
    label: '湯品',
    shortLabel: '湯品',
    sections: [
      {
        id: 'soup-main',
        label: '湯品',
        items: [
          singleItem({
            id: 'soup.chef',
            name: '主廚濃湯',
            categoryKey: 'soup',
            courseKind: 'addon',
            basePrice: 150,
            selections: [textRule('note', '備註')],
          }),
          singleItem({
            id: 'soup.puff',
            name: '酥皮濃湯',
            categoryKey: 'soup',
            courseKind: 'addon',
            basePrice: 180,
            selections: [textRule('note', '備註')],
          }),
          singleItem({
            id: 'soup.seafood',
            name: '義式海鮮湯',
            categoryKey: 'soup',
            courseKind: 'addon',
            basePrice: 230,
            selections: [textRule('note', '備註')],
          }),
        ],
      },
    ],
  },
  {
    key: 'drink',
    label: '飲品',
    shortLabel: '飲品',
    description: '可選冰 / 熱',
    sections: [
      {
        id: 'drink-main',
        label: '飲品',
        items: [
          singleItem({
            id: 'drink.espresso',
            name: '濃縮咖啡',
            categoryKey: 'drink',
            courseKind: 'drink',
            basePrice: 100,
            selections: [drinkTemperatureRule, textRule('note', '備註')],
          }),
          singleItem({
            id: 'drink.americano',
            name: '美式咖啡',
            categoryKey: 'drink',
            courseKind: 'drink',
            basePrice: 110,
            selections: [drinkTemperatureRule, textRule('note', '備註')],
          }),
          singleItem({
            id: 'drink.latte',
            name: '拿鐵咖啡',
            categoryKey: 'drink',
            courseKind: 'drink',
            basePrice: 150,
            selections: [drinkTemperatureRule, textRule('note', '備註')],
          }),
          singleItem({
            id: 'drink.black-tea',
            name: '紅茶',
            categoryKey: 'drink',
            courseKind: 'drink',
            basePrice: 0,
            menuModes: ['staff'],
            selections: [drinkTemperatureRule],
          }),
          singleItem({
            id: 'drink.green-tea',
            name: '綠茶',
            categoryKey: 'drink',
            courseKind: 'drink',
            basePrice: 0,
            menuModes: ['staff'],
            selections: [drinkTemperatureRule],
          }),
        ],
      },
    ],
  },
]

export const orderedCategoryKeys = categories.map((category) => category.key)

function normalizeMenuItem(item: PosMenuItem): PosMenuItem {
  return {
    ...item,
    productKey: item.productKey || item.id,
    inventoryKey: item.inventoryKey || item.soldOutKey || item.id,
    selections: item.selections?.map((rule) =>
      rule.kind === 'single'
        ? {
            ...rule,
            defaultValue: rule.defaultValue,
            tracksInventory: rule.tracksInventory ?? false,
            visibleWhenRuleId: rule.visibleWhenRuleId,
            builderBlockId: rule.builderBlockId,
            builderRow: rule.builderRow,
            options: rule.options.map((selectionOption) => ({
              ...selectionOption,
              optionKey: selectionOption.optionKey || selectionOption.value,
              priceDelta: Number(selectionOption.priceDelta || 0),
              inventoryKey: selectionOption.targetItemId
                ? selectionOption.inventoryKey || selectionOption.targetItemId || selectionOption.value
                : buildSelectionInventoryKey(item.id, rule.id, selectionOption.value),
              categoryKey:
                selectionOption.categoryKey ||
                (selectionOption.targetItemId
                  ? inferCategoryKeyFromCatalogKey(selectionOption.targetItemId || selectionOption.value)
                  : item.categoryKey),
              station: 'kitchen',
            })),
          }
        : rule
    ),
    includes: item.includes?.map((includeRule) => ({
      ...includeRule,
      inventoryKey: includeRule.inventoryKey || includeRule.itemId,
      categoryKey: includeRule.categoryKey || inferCategoryKeyFromCatalogKey(includeRule.itemId),
    })),
    upgradeGroups: item.upgradeGroups?.map((group) => ({
      ...group,
      options: group.options.map((selectionOption) => ({
        ...selectionOption,
        optionKey: selectionOption.optionKey || selectionOption.value,
        priceDelta: Number(selectionOption.priceDelta || 0),
        inventoryKey: selectionOption.inventoryKey || selectionOption.targetItemId || selectionOption.value,
        categoryKey:
          selectionOption.categoryKey ||
          inferCategoryKeyFromCatalogKey(selectionOption.targetItemId || selectionOption.value),
        station: 'kitchen',
      })),
    })),
  }
}

const normalizedCategories = categories.map((category) => ({
  ...category,
  sections: category.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => normalizeMenuItem(item)),
  })),
}))

export const menuMeta: PosMenuMeta = {
  orderedCategoryKeys,
  categories: Object.fromEntries(normalizedCategories.map((category) => [category.key, category])) as Record<
    PosCategoryKey,
    PosMenuCategory
  >,
  itemsById: Object.fromEntries(
    normalizedCategories.flatMap((category) =>
      category.sections.flatMap((section) => section.items.map((item) => [item.id, item]))
    )
  ) as Record<string, PosMenuItem>,
}
