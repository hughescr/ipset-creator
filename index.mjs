#!/usr/bin/env node
// Fetch a file from the URL https://ipv4.fetus.jp/ipv4bycc-cidr.txt into memory
// and parse it into a list of CIDR blocks.

import { merge } from 'cidr-tools';
import { readFile } from 'fs/promises';
import _ from 'lodash';
import { Command, Option } from 'commander';
const program = new Command();

const { default: info } = await import("./package.json", {
    assert: {
        type: "json",
    },
});

program
    .version(info.version)
    .description('Generate an ipset file from published CIDR lists')
    .option('-r, --replace-existing', 'Replace existing ipsets with new ones with no downtime. This will load into temporary ipsets and then swap them in place.')
    .addOption(new Option('-i, --ip-version <num>', 'Generate an ipset file for which IP protocol version').default('4').choices(['4', '6']));

program.parse(process.argv);
const options = program.opts();

const replaceExistingFlag = options.replaceExisting;
const replaceExistingSuffix = replaceExistingFlag ? '-new' : '';
const ipv6Suffix = options.ipVersion === '6' ? '-ipv6' : '';
const cidrList = {};

// Ignoring country code 'AQ' for antarctica
// Ignoring country code 'A1' for anonymous proxies
// Ignoring country code 'A2' for satellite providers
// Ignoring country code 'ZZ' for unknown

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
    'AP', // Generic "Asia-Pacific" country code for region
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
    'EU', // Generic "Europe" country code for region
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

const directory = `country-ip-blocks/ipv${options.ipVersion}`;

(async () => {
    const text = await readFile(`sorted-from-git-ipv${options.ipVersion}.txt`, { encoding: 'utf8' } );
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
    console.log(`create north-america${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6' : ''} hashsize ${hashSize(northAmericaCidr)} maxelem 65536`);
    makeIpSet(`north-america${ipv6Suffix}${replaceExistingSuffix}`, northAmericaCidr);
    console.log(`create south-america${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6' : ''} hashsize ${hashSize(southAmericaCidr)} maxelem 65536`);
    makeIpSet(`south-america${ipv6Suffix}${replaceExistingSuffix}`, southAmericaCidr);
    console.log(`create europe${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6' : ''} hashsize ${hashSize(europeCidr)} maxelem 65536`);
    makeIpSet(`europe${ipv6Suffix}${replaceExistingSuffix}`, europeCidr);
    console.log(`create asia${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6' : ''} hashsize ${hashSize(asiaCidr)} maxelem 65536`);
    makeIpSet(`asia${ipv6Suffix}${replaceExistingSuffix}`, asiaCidr);
    console.log(`create oceania${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6' : ''} hashsize ${hashSize(oceaniaCidr)} maxelem 65536`);
    makeIpSet(`oceania${ipv6Suffix}${replaceExistingSuffix}`, oceaniaCidr);
    console.log(`create africa${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6' : ''} hashsize ${hashSize(africaCidr)} maxelem 65536`);
    makeIpSet(`africa${ipv6Suffix}${replaceExistingSuffix}`, africaCidr);

    _.forEach(cidrList, (cidr, code) => {
        console.log(`create ${code}${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6': ''} hashsize ${hashSize(cidr) } maxelem 65536`);
        makeIpSet(`${code}${ipv6Suffix}${replaceExistingSuffix}`, cidr);
    });

    if (replaceExistingFlag) {
        console.log(`swap north-america${ipv6Suffix} north-america${ipv6Suffix}-new`);
        console.log(`destroy north-america${ipv6Suffix}-new`);
        console.log(`swap south-america${ipv6Suffix} south-america${ipv6Suffix}-new`);
        console.log(`destroy south-america${ipv6Suffix}-new`);
        console.log(`swap europe${ipv6Suffix} europe${ipv6Suffix}-new`);
        console.log(`destroy europe${ipv6Suffix}-new`);
        console.log(`swap asia${ipv6Suffix} asia${ipv6Suffix}-new`);
        console.log(`destroy asia${ipv6Suffix}-new`);
        console.log(`swap oceania${ipv6Suffix} oceania${ipv6Suffix}-new`);
        console.log(`destroy oceania${ipv6Suffix}-new`);
        console.log(`swap africa${ipv6Suffix} africa${ipv6Suffix}-new`);
        console.log(`destroy africa${ipv6Suffix}-new`);
        _.forEach(cidrList, (cidr, code) => {
            console.log(`swap ${code}${ipv6Suffix} ${code}${ipv6Suffix}-new`);
            console.log(`destroy ${code}${ipv6Suffix}-new`);
        });
    }
})();
