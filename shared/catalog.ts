/**
 * Mobile models sold in India, newest first within each brand.
 *
 * This is a typing aid, not a stock list. A customer walks in and says
 * "Samsung ka wala" or reads the model off the back of the phone, and the
 * counter has to type it exactly as the brand spells it. Guessing at "Galaxy
 * A55" versus "A55" versus "SM-A556B" is the slow part of writing a bill, and
 * getting it wrong is why old bills can never be searched again.
 *
 * So: the names are written the way the brand writes them, not the way the shop
 * happens to have typed them before. It is deliberately not exhaustive down to
 * every variant code, and it is not a filter - anything can still be typed in
 * full. It exists so the obvious answer is one tap away instead of a hunt.
 *
 * Brands are listed separately even where one company owns several marks,
 * because that is how a customer asks for the phone: "Redmi" is not "Xiaomi",
 * and iQOO is not Vivo, and searching one must not drag in the other's models.
 */

/** One brand and the models sold under it. */
export interface CatalogBrand {
  brand: string;
  models: string[];
}

const apple: CatalogBrand = {
  brand: 'Apple',
  models: [
    'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17 Plus', 'iPhone 17',
    'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
    'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
    'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
    'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13 Mini', 'iPhone 13',
    'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12 Mini', 'iPhone 12',
    'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
    'iPhone XS Max', 'iPhone XS', 'iPhone XR', 'iPhone X',
    'iPhone 8 Plus', 'iPhone 8', 'iPhone 7 Plus', 'iPhone 7',
    'iPhone 6s Plus', 'iPhone 6s', 'iPhone 6 Plus', 'iPhone 6',
    'iPhone 5s', 'iPhone 5c', 'iPhone 5', 'iPhone 4s', 'iPhone 4',
    'iPhone 3GS', 'iPhone 3G',
    'iPhone SE (4th Gen)', 'iPhone SE (3rd Gen)', 'iPhone SE (2nd Gen)', 'iPhone SE (1st Gen)',
  ],
};

const samsung: CatalogBrand = {
  brand: 'Samsung',
  models: [
    'Galaxy S26 Ultra', 'Galaxy S26+', 'Galaxy S26',
    'Galaxy S25 Ultra', 'Galaxy S25+', 'Galaxy S25',
    'Galaxy S24 Ultra', 'Galaxy S24+', 'Galaxy S24', 'Galaxy S24 FE',
    'Galaxy S23 Ultra', 'Galaxy S23+', 'Galaxy S23', 'Galaxy S23 FE',
    'Galaxy S22 Ultra', 'Galaxy S22+', 'Galaxy S22',
    'Galaxy S21 Ultra', 'Galaxy S21+', 'Galaxy S21', 'Galaxy S21 FE',
    'Galaxy S20 Ultra', 'Galaxy S20+', 'Galaxy S20', 'Galaxy S20 FE',
    'Galaxy S10+', 'Galaxy S10', 'Galaxy S10e', 'Galaxy S10 Lite',
    'Galaxy S9+', 'Galaxy S9', 'Galaxy S8+', 'Galaxy S8',
    'Galaxy S7 Edge', 'Galaxy S7', 'Galaxy S6 Edge+', 'Galaxy S6 Edge', 'Galaxy S6',
    'Galaxy S5', 'Galaxy S4', 'Galaxy S3', 'Galaxy S2', 'Galaxy S',
    'Galaxy Z Fold 8', 'Galaxy Z Flip 8',
    'Galaxy Z Fold 7', 'Galaxy Z Flip 7',
    'Galaxy Z Fold 6', 'Galaxy Z Flip 6',
    'Galaxy Z Fold 5', 'Galaxy Z Flip 5',
    'Galaxy Z Fold 4', 'Galaxy Z Flip 4',
    'Galaxy Z Fold 3', 'Galaxy Z Flip 3',
    'Galaxy Z Fold 2', 'Galaxy Z Flip', 'Galaxy Fold',
    'Galaxy Note 20 Ultra', 'Galaxy Note 20',
    'Galaxy Note 10+', 'Galaxy Note 10', 'Galaxy Note 10 Lite',
    'Galaxy Note 9', 'Galaxy Note 8',
    'Galaxy Note 5', 'Galaxy Note 4', 'Galaxy Note 3', 'Galaxy Note II', 'Galaxy Note',
    'Galaxy A56', 'Galaxy A36', 'Galaxy A26', 'Galaxy A16', 'Galaxy A06',
    'Galaxy A55', 'Galaxy A35', 'Galaxy A25', 'Galaxy A15', 'Galaxy A05',
    'Galaxy A54', 'Galaxy A34', 'Galaxy A24', 'Galaxy A14',
    'Galaxy A73', 'Galaxy A53', 'Galaxy A33', 'Galaxy A23', 'Galaxy A13',
    'Galaxy A72', 'Galaxy A52s', 'Galaxy A52', 'Galaxy A32', 'Galaxy A22',
    'Galaxy A71', 'Galaxy A51', 'Galaxy A31', 'Galaxy A21', 'Galaxy A11',
    'Galaxy M56', 'Galaxy M36', 'Galaxy M15', 'Galaxy F56', 'Galaxy F36', 'Galaxy F15',
    'Galaxy M55', 'Galaxy M35', 'Galaxy M14', 'Galaxy F55', 'Galaxy F35', 'Galaxy F14',
    'Galaxy M54', 'Galaxy M34', 'Galaxy M13', 'Galaxy F54', 'Galaxy F34', 'Galaxy F13',
    'Galaxy M53', 'Galaxy M33', 'Galaxy F23',
    'Galaxy M52', 'Galaxy M32', 'Galaxy M12', 'Galaxy F62', 'Galaxy F41',
  ],
};

const xiaomi: CatalogBrand = {
  brand: 'Xiaomi',
  models: [
    'Xiaomi 16 Pro', 'Xiaomi 16',
    'Xiaomi 15 Pro', 'Xiaomi 15', 'Xiaomi 15 Ultra',
    'Xiaomi 14 Pro', 'Xiaomi 14', 'Xiaomi 14 Ultra', 'Xiaomi 14 Civi',
    'Xiaomi 13 Pro', 'Xiaomi 13',
    'Xiaomi 12 Pro', 'Xiaomi 12',
    'Mi 11 Ultra', 'Mi 11X Pro', 'Mi 11X',
    'Mi 10', 'Mi 10T Pro', 'Mi 10T', 'Mi 10i',
    'Mi 9', 'Mi 9T', 'Mi 9T Pro', 'Mi 8', 'Mi 6', 'Mi 5', 'Mi 4', 'Mi 3',
  ],
};

const redmi: CatalogBrand = {
  brand: 'Redmi',
  models: [
    'Redmi Note 15 Pro+', 'Redmi Note 15 Pro', 'Redmi Note 15',
    'Redmi Note 14 Pro+', 'Redmi Note 14 Pro', 'Redmi Note 14',
    'Redmi Note 13 Pro+', 'Redmi Note 13 Pro', 'Redmi Note 13',
    'Redmi Note 12 Pro+', 'Redmi Note 12 Pro', 'Redmi Note 12',
    'Redmi Note 11 Pro+', 'Redmi Note 11 Pro', 'Redmi Note 11',
    'Redmi Note 10 Pro Max', 'Redmi Note 10 Pro', 'Redmi Note 10',
    'Redmi Note 9 Pro Max', 'Redmi Note 9 Pro', 'Redmi Note 9',
    'Redmi Note 8 Pro', 'Redmi Note 8',
    'Redmi Note 7 Pro', 'Redmi Note 7', 'Redmi Note 7S',
    'Redmi Note 6 Pro', 'Redmi Note 5 Pro', 'Redmi Note 4', 'Redmi Note 3',
    'Redmi 14C', 'Redmi 14A', 'Redmi 14',
    'Redmi 13C', 'Redmi 13A', 'Redmi 13',
    'Redmi 12C', 'Redmi 12', 'Redmi 11 Prime',
    'Redmi 10', 'Redmi 9', 'Redmi 8', 'Redmi 7', 'Redmi 6',
    'Redmi 5', 'Redmi 4', 'Redmi 3', 'Redmi 2', 'Redmi 1',
  ],
};

const poco: CatalogBrand = {
  brand: 'POCO',
  models: [
    'POCO F7', 'POCO F6 Pro', 'POCO F6', 'POCO F5', 'POCO F4', 'POCO F3', 'POCO F1',
    'POCO X7 Pro', 'POCO X7', 'POCO X6 Pro', 'POCO X6',
    'POCO X5 Pro', 'POCO X5', 'POCO X4 Pro', 'POCO X3 Pro', 'POCO X3', 'POCO X2',
    'POCO M7', 'POCO M6 Pro', 'POCO M6', 'POCO M5', 'POCO M4 Pro', 'POCO M3', 'POCO M2',
    'POCO C75', 'POCO C65', 'POCO C55', 'POCO C51', 'POCO C31',
  ],
};

const oneplus: CatalogBrand = {
  brand: 'OnePlus',
  models: [
    'OnePlus 14', 'OnePlus 14R', 'OnePlus 13', 'OnePlus 13R',
    'OnePlus 12', 'OnePlus 12R', 'OnePlus 11', 'OnePlus 11R',
    'OnePlus 10 Pro', 'OnePlus 10T', 'OnePlus 10R',
    'OnePlus 9 Pro', 'OnePlus 9', 'OnePlus 9RT', 'OnePlus 9R',
    'OnePlus 8 Pro', 'OnePlus 8', 'OnePlus 8T',
    'OnePlus 7T Pro', 'OnePlus 7T', 'OnePlus 7 Pro', 'OnePlus 7',
    'OnePlus 6T', 'OnePlus 6', 'OnePlus 5T', 'OnePlus 5', 'OnePlus 3T', 'OnePlus 3',
    'OnePlus 2', 'OnePlus One',
    'OnePlus Nord 5', 'OnePlus Nord 4', 'OnePlus Nord 3', 'OnePlus Nord 2T', 'OnePlus Nord 2', 'OnePlus Nord',
    'OnePlus Nord CE 5', 'OnePlus Nord CE 4', 'OnePlus Nord CE 3', 'OnePlus Nord CE 2', 'OnePlus Nord CE',
    'OnePlus Nord CE 4 Lite', 'OnePlus Nord CE 3 Lite', 'OnePlus Nord CE 2 Lite',
    'OnePlus Open 2', 'OnePlus Open',
  ],
};

const vivo: CatalogBrand = {
  brand: 'Vivo',
  models: [
    'Vivo X200 Pro', 'Vivo X200',
    'Vivo X100 Pro', 'Vivo X100', 'Vivo X100 Ultra',
    'Vivo X90 Pro', 'Vivo X90', 'Vivo X80 Pro', 'Vivo X80',
    'Vivo X70 Pro+', 'Vivo X70 Pro', 'Vivo X60 Pro+', 'Vivo X60 Pro', 'Vivo X60',
    'Vivo X50 Pro', 'Vivo X50',
    'Vivo V50 Pro', 'Vivo V50', 'Vivo V50e',
    'Vivo V40 Pro', 'Vivo V40', 'Vivo V40e',
    'Vivo V30 Pro', 'Vivo V30', 'Vivo V30e',
    'Vivo V29 Pro', 'Vivo V29', 'Vivo V29e',
    'Vivo V27 Pro', 'Vivo V27', 'Vivo V25 Pro', 'Vivo V25',
    'Vivo V23 Pro', 'Vivo V23', 'Vivo V21', 'Vivo V20', 'Vivo V19', 'Vivo V17',
    'Vivo V15', 'Vivo V11', 'Vivo V9',
    'Vivo T4', 'Vivo T3 Pro', 'Vivo T3', 'Vivo T3x', 'Vivo T2 Pro', 'Vivo T2', 'Vivo T2x', 'Vivo T1',
    'Vivo Y300', 'Vivo Y200', 'Vivo Y100',
  ],
};

const iqoo: CatalogBrand = {
  brand: 'iQOO',
  models: [
    'iQOO 14', 'iQOO 13', 'iQOO 12', 'iQOO 11',
    'iQOO 9 Pro', 'iQOO 9', 'iQOO 9T', 'iQOO 9 SE',
    'iQOO 7 Legend', 'iQOO 7', 'iQOO 3',
    'iQOO Neo 10 Pro', 'iQOO Neo 10', 'iQOO Neo 9 Pro', 'iQOO Neo 7 Pro', 'iQOO Neo 7', 'iQOO Neo 6',
    'iQOO Z10', 'iQOO Z9s Pro', 'iQOO Z9s', 'iQOO Z9', 'iQOO Z8', 'iQOO Z7', 'iQOO Z6', 'iQOO Z5', 'iQOO Z3',
  ],
};

const oppo: CatalogBrand = {
  brand: 'OPPO',
  models: [
    'OPPO Find X8 Pro', 'OPPO Find X8', 'OPPO Find X',
    'OPPO Find N3 Flip', 'OPPO Find N2 Flip', 'OPPO Find N',
    'OPPO Reno 15 Pro', 'OPPO Reno 15', 'OPPO Reno 14 Pro', 'OPPO Reno 14',
    'OPPO Reno 13 Pro', 'OPPO Reno 13', 'OPPO Reno 12 Pro', 'OPPO Reno 12',
    'OPPO Reno 11 Pro', 'OPPO Reno 11', 'OPPO Reno 10 Pro+', 'OPPO Reno 10 Pro', 'OPPO Reno 10',
    'OPPO Reno 8 Pro', 'OPPO Reno 8', 'OPPO Reno 7', 'OPPO Reno 6', 'OPPO Reno 5', 'OPPO Reno 4',
    'OPPO Reno 3', 'OPPO Reno 2', 'OPPO Reno 10x Zoom',
    'OPPO F29', 'OPPO F27 Pro+', 'OPPO F27', 'OPPO F25 Pro', 'OPPO F23', 'OPPO F21 Pro',
    'OPPO F19', 'OPPO F17', 'OPPO F15', 'OPPO F11',
    'OPPO K12x', 'OPPO K11', 'OPPO K10',
    'OPPO A3 Pro', 'OPPO A79', 'OPPO A78', 'OPPO A58', 'OPPO A38', 'OPPO A18',
  ],
};

const realme: CatalogBrand = {
  brand: 'Realme',
  models: [
    'Realme GT 8 Pro', 'Realme GT 8', 'Realme GT 7 Pro', 'Realme GT 7',
    'Realme GT 6T', 'Realme GT 6', 'Realme GT Neo 3', 'Realme GT 2 Pro', 'Realme GT 2', 'Realme GT Neo 2', 'Realme GT',
    'Realme 14 Pro+', 'Realme 14 Pro', 'Realme 14',
    'Realme 13 Pro+', 'Realme 13 Pro', 'Realme 13',
    'Realme 12 Pro+', 'Realme 12 Pro', 'Realme 12',
    'Realme 11 Pro+', 'Realme 11 Pro', 'Realme 11',
    'Realme 10 Pro+', 'Realme 10 Pro', 'Realme 10',
    'Realme 9 Pro+', 'Realme 9 Pro', 'Realme 9',
    'Realme 8', 'Realme 7', 'Realme 6', 'Realme 5', 'Realme 3', 'Realme 2', 'Realme 1',
    'Realme Narzo 80 Pro', 'Realme Narzo 80', 'Realme Narzo 70 Pro', 'Realme Narzo 70',
    'Realme Narzo 60 Pro', 'Realme Narzo 60', 'Realme Narzo 50', 'Realme Narzo 30',
    'Realme Narzo 20', 'Realme Narzo 10',
    'Realme C75', 'Realme C65', 'Realme C55', 'Realme C53', 'Realme C35',
    'Realme C33', 'Realme C31', 'Realme C11', 'Realme C3', 'Realme C2', 'Realme C1',
  ],
};

const google: CatalogBrand = {
  brand: 'Google',
  models: [
    'Pixel 11 Pro Fold',
    'Pixel 10 Pro XL', 'Pixel 10 Pro', 'Pixel 10',
    'Pixel 9 Pro Fold', 'Pixel 9 Pro XL', 'Pixel 9 Pro', 'Pixel 9',
    'Pixel 8 Pro', 'Pixel 8', 'Pixel 7 Pro', 'Pixel 7', 'Pixel 6 Pro', 'Pixel 6',
    'Pixel 4a', 'Pixel 3 XL', 'Pixel 3', 'Pixel 2 XL', 'Pixel 2', 'Pixel XL', 'Pixel',
    'Pixel 10a', 'Pixel 9a', 'Pixel 8a', 'Pixel 7a', 'Pixel 6a',
  ],
};

const motorola: CatalogBrand = {
  brand: 'Motorola',
  models: [
    'Motorola Razr 60 Ultra', 'Motorola Razr 60', 'Motorola Razr 50 Ultra', 'Motorola Razr 50', 'Motorola Razr 40 Ultra', 'Motorola Razr 40',
    'Motorola Edge 60 Ultra', 'Motorola Edge 60 Pro', 'Motorola Edge 60',
    'Motorola Edge 50 Ultra', 'Motorola Edge 50 Pro', 'Motorola Edge 50 Fusion',
    'Motorola Edge 40', 'Motorola Edge 30 Ultra', 'Motorola Edge 30 Fusion', 'Motorola Edge 20',
    'Motorola Moto G85', 'Motorola Moto G75', 'Motorola Moto G65', 'Motorola Moto G55',
    'Motorola Moto G45', 'Motorola Moto G35', 'Motorola Moto G05',
    'Motorola Moto G84', 'Motorola Moto G64', 'Motorola Moto G54', 'Motorola Moto G34',
    'Motorola Moto G24', 'Motorola Moto G14',
    'Motorola Moto G82', 'Motorola Moto G72', 'Motorola Moto G62', 'Motorola Moto G52',
    'Motorola Moto G42', 'Motorola Moto G32', 'Motorola Moto G22',
  ],
};

const nothing: CatalogBrand = {
  brand: 'Nothing',
  models: [
    'Nothing Phone (3)', 'Nothing Phone (2a) Plus', 'Nothing Phone (2a)',
    'Nothing Phone (2)', 'Nothing Phone (1)',
  ],
};

const cmf: CatalogBrand = {
  brand: 'CMF',
  models: ['CMF Phone 2', 'CMF Phone 1'],
};

/**
 * Ordered so the brands that actually walk through the door most often lead the
 * list. Samsung, Xiaomi's family and Vivo's family cover most of an Indian
 * counter's day; the rest follow.
 */
export const DEVICE_CATALOG: CatalogBrand[] = [
  samsung, xiaomi, redmi, poco, vivo, iqoo, oneplus, oppo, realme, apple, google, motorola, nothing, cmf,
];

/** Just the brand names, for the brand field's own suggestions. */
export const DEVICE_CATALOG_BRANDS: string[] = DEVICE_CATALOG.map((entry) => entry.brand);

/**
 * Models listed under a brand, matched loosely so "samsung" or "SAMSUNG" or
 * " redmi " all find their list. Returns an empty list for a brand that is not
 * in the catalogue, which is normal: a tablet, a laptop, or a brand that only
 * became a brand after this list was written.
 */
export function catalogModelsFor(brand: string): string[] {
  const wanted = brand.trim().toLowerCase();
  if (!wanted) return [];
  return DEVICE_CATALOG.find((entry) => entry.brand.toLowerCase() === wanted)?.models ?? [];
}
