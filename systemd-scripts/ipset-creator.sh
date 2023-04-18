#!/usr/bin/env bash
IPSET=$(which ipset)
YARN=$(which yarn)
IPSET_CREATOR=$("$YARN" global bin)/ipset-creator

NORTH_AMERICA_EXISTS=$("$IPSET" list -n -q north-america)
if [ "$NORTH_AMERICA_EXISTS" != "north-america" ]; then
    echo Looks like the ipsets did not previously exist, so creating them fresh
    "$IPSET" restore -f <("$IPSET_CREATOR")
else
    echo Looks like the ipsets did exist, so refreshing using swaps
    "$IPSET" restore -f <("$IPSET_CREATOR" -r)
fi
