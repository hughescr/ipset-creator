// Fetch a file from the URL https://ipv4.fetus.jp/ipv4bycc-cidr.txt into memory
// and parse it into a list of CIDR blocks.


import fetch from 'node-fetch';
import { merge } from 'cidr-tools';
import { readFile } from 'fs/promises';
import _ from 'lodash';

const contactInfo = 'Fetched for Craig Hughes <craig.fetus@rungie.com>';
const url = 'https://ipv4.fetus.jp/ipv4bycc-cidr.txt';
const cidrList = {};
const africaCodes = [
    'AO',
    'BF',
    'BI',
    'BJ',
    'BW',
    'CD',
    'CF',
    'CG',
    'CI',
    'CM',
    'CV',
    'DJ',
    'DZ',
    'EG',
    'EH',
    'ER',
    'ET',
    'GA',
    'GH',
    'GM',
    'GN',
    'GQ',
    'GW',
    'IO',
    'KE',
    'KM',
    'LR',
    'LS',
    'LY',
    'MA',
    'MG',
    'ML',
    'MR',
    'MU',
    'MW',
    'MZ',
    'NA',
    'NE',
    'NG',
    'RE',
    'RW',
    'SC',
    'SD',
    'SH',
    'SL',
    'SN',
    'SO',
    'SS',
    'ST',
    'SZ',
    'TD',
    'TF',
    'TG',
    'TN',
    'TZ',
    'UG',
    'YT',
    'ZA',
    'ZM',
    'ZW',
];

const asiaCodes = [
    'AE',
    'AF',
    'AM',
    'AZ',
    'BD',
    'BH',
    'BN',
    'BT',
    'CC',
    'CN',
    'CX',
    'CY',
    'EG',
    'GE',
    'HK',
    'ID',
    'IL',
    'IN',
    'IQ',
    'IR',
    'JO',
    'JP',
    'KG',
    'KH',
    'KP',
    'KR',
    'KW',
    'KZ',
    'LA',
    'LB',
    'LK',
    'MM',
    'MN',
    'MO',
    'MV',
    'MY',
    'NP',
    'OM',
    'PH',
    'PK',
    'PS',
    'QA',
    'RU',
    'SA',
    'SG',
    'SY',
    'TH',
    'TJ',
    'TL',
    'TM',
    'TR',
    'TW',
    'UZ',
    'VN',
    'XD',
    'XS',
    'YE',
];

const europeCodes = [
    'AD',
    'AL',
    'AM',
    'AT',
    'AX',
    'AZ',
    'BA',
    'BE',
    'BG',
    'BY',
    'CH',
    'CY',
    'CZ',
    'DE',
    'DK',
    'EE',
    'ES',
    'FI',
    'FO',
    'FR',
    'GB',
    'GE',
    'GG',
    'GI',
    'GR',
    'HR',
    'HU',
    'IE',
    'IM',
    'IS',
    'IT',
    'JE',
    'KZ',
    'LI',
    'LT',
    'LU',
    'LV',
    'MC',
    'MD',
    'ME',
    'MK',
    'MT',
    'NL',
    'NO',
    'PL',
    'PT',
    'RO',
    'RS',
    'RU',
    'SE',
    'SI',
    'SJ',
    'SK',
    'SM',
    'TR',
    'UA',
    'VA',
    'XK',
];

const northAmericaCodes = [
    'AG',
    'AI',
    'AW',
    'BB',
    'BL',
    'BM',
    'BQ',
    'BS',
    'BZ',
    'CA',
    'CR',
    'CU',
    'CW',
    'DM',
    'DO',
    'GD',
    'GL',
    'GP',
    'GT',
    'HN',
    'HT',
    'JM',
    'KN',
    'KY',
    'LC',
    'MF',
    'MQ',
    'MS',
    'MX',
    'NI',
    'PA',
    'PM',
    'PR',
    'SV',
    'SX',
    'TC',
    'TT',
    'UM',
    'US',
    'VC',
    'VG',
    'VI',
];

const oceaniaCodes = [
    'AS',
    'AU',
    'CK',
    'FJ',
    'FM',
    'GU',
    'KI',
    'MH',
    'MP',
    'NC',
    'NF',
    'NR',
    'NU',
    'NZ',
    'PF',
    'PG',
    'PN',
    'PW',
    'SB',
    'TK',
    'TO',
    'TV',
    'UM',
    'VU',
    'WF',
    'WS',
    'XX',
];

const southAmericaCodes = [
    'AR',
    'BO',
    'BR',
    'CL',
    'CO',
    'EC',
    'FK',
    'GF',
    'GY',
    'PE',
    'PY',
    'SR',
    'UY',
    'VE',
];

// calculate power of 2 which is just bigger than the length of an array
const hashSize = (arr) => Math.pow(2, Math.ceil(Math.log2(arr.length)));

const makeIpSet = (name, cidr) => {
    _.forEach(cidr, block => {
        console.log(`add ${name} ${block}`);
    });
};

(async () => {
    const response = await fetch(url, { headers: { 'User-Agent': contactInfo }});
    const text = await response.text();
    // const text = await readFile('ipv4bycc-cidr.txt', { encoding: 'utf8' } );
    const lines = text.split('\n');
    for (const line of lines) {
        const [countryCode, cidr] = line.split('\t');
        if (countryCode && cidr) {
            if (cidrList[countryCode]) {
                cidrList[countryCode].push(cidr);
            } else {
                cidrList[countryCode] = [cidr];
            }
        }
    }

    const northAmericaCidr = merge(_.flatten(_.map(northAmericaCodes, code => cidrList[code] || [])));
    const southAmericaCidr = merge(_.flatten(_.map(southAmericaCodes, code => cidrList[code] || [])));
    const europeCidr = merge(_.flatten(_.map(europeCodes, code => cidrList[code] || [])));
    const asiaCidr = merge(_.flatten(_.map(asiaCodes, code => cidrList[code] || [])));
    const oceaniaCidr = merge(_.flatten(_.map(oceaniaCodes, code => cidrList[code] || [])));
    const africaCidr = merge(_.flatten(_.map(africaCodes, code => cidrList[code] || [])));

    // Export continents in `ipset save` format
    console.log(`create north-america-new hash:net family inet hashsize ${hashSize(northAmericaCidr)} maxelem 65536`);
    makeIpSet('north-america-new', northAmericaCidr);
    console.log('swap north-america north-america-new');
    console.log('destroy north-america-new');
    console.log(`create south-america-new hash:net family inet hashsize ${hashSize(southAmericaCidr)} maxelem 65536`);
    makeIpSet('south-america-new', southAmericaCidr);
    console.log('swap south-america south-america-new');
    console.log('destroy south-america-new');
    console.log(`create europe-new hash:net family inet hashsize ${hashSize(europeCidr)} maxelem 65536`);
    makeIpSet('europe-new', europeCidr);
    console.log('swap europe europe-new');
    console.log('destroy europe-new');
    console.log(`create asia-new hash:net family inet hashsize ${hashSize(asiaCidr)} maxelem 65536`);
    makeIpSet('asia-new', asiaCidr);
    console.log('swap asia asia-new');
    console.log('destroy asia-new');
    console.log(`create oceania-new hash:net family inet hashsize ${hashSize(oceaniaCidr)} maxelem 65536`);
    makeIpSet('oceania-new', oceaniaCidr);
    console.log('swap oceania oceania-new');
    console.log('destroy oceania-new');
    console.log(`create africa-new hash:net family inet hashsize ${hashSize(africaCidr)} maxelem 65536`);
    makeIpSet('africa-new', africaCidr);
    console.log('swap africa africa-new');
    console.log('destroy africa-new');

    _.forEach(cidrList, (cidr, code) => {
        console.log(`create ${code}-new hash:net family inet hashsize ${hashSize(cidr) } maxelem 65536`);
        makeIpSet(`${code}-new`, cidr);
        console.log(`swap ${code} ${code}-new`);
        console.log(`destroy ${code}-new`);
    });
})();