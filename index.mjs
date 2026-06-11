#!/usr/bin/env node
// Read CIDR blocks from a local clone of https://github.com/ipverse/country-ip-blocks
// (refreshed via git pull — no HTTP fetching at generation time) and emit ipset save format.

import { mergeCidr as merge } from 'cidr-tools';
import { readdir, readFile } from 'fs/promises';
import _ from 'lodash';
import { Command, Option } from 'commander';
const program = new Command();

const { default: info } = await import("./package.json", {
    with: {
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

// AQ (Antarctica) is intentionally excluded from all continent tables: it has valid IP allocations
// but belongs to no continent geopolitically. Its per-country set is still emitted so operators
// can reference it directly if needed.
//
// A1 (anonymous proxies), A2 (satellite providers), and ZZ (unknown) are not present in the
// ipverse dataset and are therefore not in any continent table.

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
        'SL',
        'SN',
        'SO',
        'SS',
        'ST',
        'SZ',
        'TD',
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
        'AZ',
        'BD',
        'BH',
        'BN',
        'BT',
        'CN',
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
        'SK',
        'SM',
        'TR',
        'UA',
        'VA',
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
        'PW',
        'SB',
        'TK',
        'TO',
        'TV',
        'VU',
        'WF',
        'WS',
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

(async () => {
    // Read the per-country JSON files directly from the ipverse submodule
    const family = options.ipVersion === '6' ? 'ipv6' : 'ipv4';

    let countryDirs;
    try {
        countryDirs = await readdir('country-ip-blocks/country');
    } catch (err) {
        process.stderr.write(
            `Error: cannot read country-ip-blocks/country (${err.code ?? err.message}).\n` +
            `Expected layout: country-ip-blocks/country/<CC>/aggregated.json (ipverse format).\n` +
            `This tool must be run from a directory containing a clone of\n` +
            `https://github.com/ipverse/country-ip-blocks as a subdirectory named country-ip-blocks.\n` +
            `Existing servers must re-clone: cd /var/opt/ipset-creator && rm -rf country-ip-blocks && git clone https://github.com/ipverse/country-ip-blocks\n`
        );
        process.exit(1);
    }

    countryDirs.sort();

    let successCount = 0;
    for (const cc of countryDirs) {
        const jsonPath = `country-ip-blocks/country/${cc}/aggregated.json`;
        let data;
        try {
            data = JSON.parse(await readFile(jsonPath, { encoding: 'utf8' }));
        } catch (err) {
            process.stderr.write(`Warning: failed to read ${jsonPath} (${err.message}) — skipping ${cc.toUpperCase()}\n`);
            continue;
        }
        successCount++;
        const prefixes = (data.prefixes && data.prefixes[family]) || [];
        if (prefixes.length === 0) {
            continue; // skip countries with no data for this IP family
        }
        const countryCode = data.countryCode;
        if (cidrList[countryCode]) {
            cidrList[countryCode].push(...prefixes);
        } else {
            cidrList[countryCode] = [...prefixes];
        }
    }

    if (countryDirs.length > 0 && successCount === 0) {
        process.stderr.write(`Error: every country JSON read failed — aborting.\n`);
        process.exit(1);
    }

    // Drift detection: warn if any loaded country code belongs to no continent table (AQ is expected)
    const allContinentCodes = new Set(Object.values(continents).flat());
    const driftCodes = Object.keys(cidrList).filter(code => code !== 'AQ' && !allContinentCodes.has(code));
    if (driftCodes.length > 0) {
        process.stderr.write(`Notice: the following country codes are in the data but assigned to no continent table: ${driftCodes.sort().join(', ')}\n`);
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
