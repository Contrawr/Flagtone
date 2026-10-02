// Every sovereign state (UN members + Vatican, Palestine, Kosovo, Taiwan),
// each in exactly one difficulty tier. Codes match flag-icons file names.

export const TIERS = ['easy', 'medium', 'hard', 'impossible'];

const easy = {
  us: 'United States', gb: 'United Kingdom', fr: 'France', de: 'Germany', it: 'Italy',
  es: 'Spain', jp: 'Japan', cn: 'China', br: 'Brazil', ca: 'Canada',
  mx: 'Mexico', ru: 'Russia', in: 'India', au: 'Australia', kr: 'South Korea',
  ch: 'Switzerland', se: 'Sweden', no: 'Norway', dk: 'Denmark', fi: 'Finland',
  nl: 'Netherlands', be: 'Belgium', gr: 'Greece', pt: 'Portugal', ie: 'Ireland',
  at: 'Austria', pl: 'Poland', tr: 'Turkey', ar: 'Argentina', za: 'South Africa',
  eg: 'Egypt', il: 'Israel', ng: 'Nigeria', nz: 'New Zealand', ua: 'Ukraine',
  va: 'Vatican City', jm: 'Jamaica', cu: 'Cuba', sa: 'Saudi Arabia', co: 'Colombia',
};

const medium = {
  is: 'Iceland', ee: 'Estonia', lv: 'Latvia', lt: 'Lithuania', cz: 'Czechia',
  sk: 'Slovakia', hu: 'Hungary', ro: 'Romania', bg: 'Bulgaria', hr: 'Croatia',
  si: 'Slovenia', rs: 'Serbia', ba: 'Bosnia and Herzegovina', me: 'Montenegro', mk: 'North Macedonia',
  al: 'Albania', by: 'Belarus', md: 'Moldova', lu: 'Luxembourg', mc: 'Monaco',
  li: 'Liechtenstein', ad: 'Andorra', sm: 'San Marino', mt: 'Malta', cy: 'Cyprus',
  xk: 'Kosovo', cl: 'Chile', pe: 'Peru', ve: 'Venezuela', ec: 'Ecuador',
  bo: 'Bolivia', py: 'Paraguay', uy: 'Uruguay', gy: 'Guyana', sr: 'Suriname',
  cr: 'Costa Rica', pa: 'Panama', ni: 'Nicaragua', hn: 'Honduras', sv: 'El Salvador',
  gt: 'Guatemala', bz: 'Belize', do: 'Dominican Republic', ht: 'Haiti', bs: 'Bahamas',
  bb: 'Barbados', tt: 'Trinidad and Tobago', id: 'Indonesia', th: 'Thailand', vn: 'Vietnam',
  ph: 'Philippines', my: 'Malaysia', sg: 'Singapore', pk: 'Pakistan', bd: 'Bangladesh',
  ir: 'Iran', iq: 'Iraq', kp: 'North Korea', tw: 'Taiwan', lk: 'Sri Lanka',
  np: 'Nepal',
};

const hard = {
  ma: 'Morocco', dz: 'Algeria', tn: 'Tunisia', ly: 'Libya', sd: 'Sudan',
  et: 'Ethiopia', ke: 'Kenya', tz: 'Tanzania', ug: 'Uganda', rw: 'Rwanda',
  gh: 'Ghana', ci: 'Ivory Coast', sn: 'Senegal', cm: 'Cameroon', cd: 'DR Congo',
  cg: 'Republic of the Congo', ao: 'Angola', mz: 'Mozambique', zw: 'Zimbabwe', zm: 'Zambia',
  bw: 'Botswana', na: 'Namibia', mg: 'Madagascar', ml: 'Mali', ne: 'Niger',
  td: 'Chad', bf: 'Burkina Faso', gn: 'Guinea', so: 'Somalia', ss: 'South Sudan',
  er: 'Eritrea', dj: 'Djibouti', ga: 'Gabon', gq: 'Equatorial Guinea', bj: 'Benin',
  tg: 'Togo', lr: 'Liberia', sl: 'Sierra Leone', gm: 'Gambia', gw: 'Guinea-Bissau',
  mr: 'Mauritania', cf: 'Central African Republic', bi: 'Burundi', mw: 'Malawi', ls: 'Lesotho',
  sz: 'Eswatini', jo: 'Jordan', lb: 'Lebanon', sy: 'Syria', ye: 'Yemen',
  om: 'Oman', ae: 'United Arab Emirates', qa: 'Qatar', kw: 'Kuwait', bh: 'Bahrain',
  ps: 'Palestine', af: 'Afghanistan', kz: 'Kazakhstan', uz: 'Uzbekistan', tm: 'Turkmenistan',
  kg: 'Kyrgyzstan', tj: 'Tajikistan', mn: 'Mongolia', mm: 'Myanmar', kh: 'Cambodia',
  la: 'Laos', ge: 'Georgia', am: 'Armenia', az: 'Azerbaijan',
};

const impossible = {
  bt: 'Bhutan', mv: 'Maldives', bn: 'Brunei', tl: 'Timor-Leste', fj: 'Fiji',
  pg: 'Papua New Guinea', sb: 'Solomon Islands', vu: 'Vanuatu', ws: 'Samoa', to: 'Tonga',
  ki: 'Kiribati', tv: 'Tuvalu', nr: 'Nauru', pw: 'Palau', fm: 'Micronesia',
  mh: 'Marshall Islands', cv: 'Cape Verde', st: 'São Tomé and Príncipe', km: 'Comoros', sc: 'Seychelles',
  mu: 'Mauritius', ag: 'Antigua and Barbuda', dm: 'Dominica', gd: 'Grenada', kn: 'Saint Kitts and Nevis',
  lc: 'Saint Lucia', vc: 'Saint Vincent and the Grenadines',
};

const byTier = { easy, medium, hard, impossible };

export const FLAGS = TIERS.flatMap((tier) =>
  Object.entries(byTier[tier]).map(([code, name]) => ({ code, name, tier })),
);

export function poolFor(tier) {
  return FLAGS.filter((f) => f.tier === tier);
}

export function flagByCode(code) {
  return FLAGS.find((f) => f.code === code);
}
