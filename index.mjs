#!/usr/bin/env node
// Fetch CIDR blocks from https://github.com/herrbischoff/country-ip-blocks
// and parse then inject into ipsets

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
    .addOption(new Option('-4', 'Generate an ipset file for IPv4').default(true).implies({'6': false}).implies({ ipVersion: '4' }))
    .addOption(new Option('-6', 'Generate an ipset file for IPv6').default(false).implies({'4': false}).implies({ipVersion: '6'}))
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

const continents = {
    africa: [
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
    ],
    asia: [
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
    ],
    europe: [
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
    ],
    'north-america': [
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
    ],
    oceania: [
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
    ],
    'south-america': [
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
    ],
};

// calculate power of 2 which is just bigger than the length of an array
const hashSize = (arr) => Math.pow(2, Math.ceil(Math.log2(arr.length)));

// Format an array of CIDRs for a country as a sequence of ipset add commands
const makeIpSet = (name, cidr) => {
    _.forEach(cidr, block => {
        console.log(`add ${name} ${block}`);
    });
};

const directory = `country-ip-blocks/ipv${options.ipVersion}`;

(async () => {
    // Read the files as written by the shell script that merges everything from the git repo
    const text = await readFile(`sorted-from-git-ipv${options.ipVersion}.txt`, { encoding: 'utf8' } );
    const lines = text.split('\n');
    for (const line of lines) {
        // Parse each line and add the CIDR to the country's array of CIDRs
        const [countryCode, cidr] = line.split('\t');
        if (countryCode && cidr) {
            if (cidrList[countryCode]) {
                cidrList[countryCode].push(cidr);
            } else {
                cidrList[countryCode] = [cidr];
            }
        }
    }

    // Merge CIDRs for each continent, possibly combining them when adjacent
    const continentCidrs = _.reduce(continents, (acc, countries, continent) => {
        acc[continent] = merge(_.flatten(_.map(countries, country => cidrList[country] || [])));
        return acc;
    }, {});

    // Export continents in `ipset save` format
    _.forEach(continentCidrs, (CIDRs, continent) => {
        console.log(`create ${continent}${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6' : ''} hashsize ${hashSize(CIDRs)} maxelem 65536`);
        makeIpSet(`${continent}${ipv6Suffix}${replaceExistingSuffix}`, CIDRs);
    });

    // Export each country in `ipset save` format
    _.forEach(cidrList, (cidr, code) => {
        console.log(`create ${code}${ipv6Suffix}${replaceExistingSuffix} hash:net family inet${options.ipVersion == '6' ? '6': ''} hashsize ${hashSize(cidr) } maxelem 65536`);
        makeIpSet(`${code}${ipv6Suffix}${replaceExistingSuffix}`, cidr);
    });

    if (replaceExistingFlag) {
        _.forEach(['north-america', 'south-america', 'europe', 'asia', 'oceania', 'africa'], continent => {
            console.log(`swap ${continent}${ipv6Suffix} ${continent}${ipv6Suffix}-new`);
            console.log(`destroy ${continent}${ipv6Suffix}-new`);
        });
        _.forEach(cidrList, (cidr, code) => {
            console.log(`swap ${code}${ipv6Suffix} ${code}${ipv6Suffix}-new`);
            console.log(`destroy ${code}${ipv6Suffix}-new`);
        });
    }
})();
