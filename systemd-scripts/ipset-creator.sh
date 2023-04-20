#!/usr/bin/env bash
IPSET=$(which ipset)
YARN=$(which yarn)
SCRIPTS_DIR=$("$YARN" global dir)/node_modules/ipset-creator/systemd-scripts
IPSET_CREATOR=$("$YARN" global bin)/ipset-creator
COUNTRIES_DATA_GIT_DIR=/var/opt

cd "$COUNTRIES_DATA_GIT_DIR" || exit
source "$SCRIPTS_DIR/build-list-from-countries.sh"

NORTH_AMERICA_EXISTS=$("$IPSET" list -n -q north-america)
if [ "$NORTH_AMERICA_EXISTS" != "north-america" ]; then
    echo Looks like the ipsets did not previously exist, so creating them fresh
    "$IPSET" restore -f <("$IPSET_CREATOR")
else
    echo Looks like the ipsets did exist, so refreshing using swaps
    "$IPSET" restore -f <("$IPSET_CREATOR" -r)
fi

IPV6_EXISTS=$("$IPSET" list -n -q north-america-ipv6)
if [ "$IPV6_EXISTS" != "north-america-ipv6" ]; then
    echo Looks like the ipv6 ipsets did not previously exist, so creating them fresh
    "$IPSET" restore -f <("$IPSET_CREATOR" -6)
else
    echo Looks like the ipv6 ipsets did exist, so refreshing using swaps
    "$IPSET" restore -f <("$IPSET_CREATOR" -6 -r)
fi
